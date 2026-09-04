"""
API 키 점검 — Secret에 든 키가 실제로 동작하는지 한 번에 확인합니다.

키 값 자체는 절대 출력하지 않습니다 (실행 기록은 공개됩니다).
길이·접두사·공백 여부만 보여줘 붙여넣기 실수를 구분할 수 있게 합니다.
"""

import os
import sys

from riot import NotFound, RiotAPI, RiotError, split_riot_id


def main():
    raw = os.environ.get("RIOT_API_KEY", "")

    if not raw.strip():
        print("결과: 실패")
        print("Secret RIOT_API_KEY 가 비어 있습니다.")
        print("저장소 Settings > Secrets and variables > Actions 에서 등록하세요.")
        return 1

    api = RiotAPI(raw)
    print(f"Secret 상태 : {api.key_shape()}")
    print("정상 형태   : 길이 42자, RGAPI-로 시작")
    print(f"Secret 지문 : {api.key_fingerprint()}")
    print("             ↑ developer.riotgames.com 앱 화면의 API Key 앞뒤와 비교해 보세요.")
    print("               다르면 Secret에 옛날 키(또는 만료된 개발용 키)가 들어 있는 것입니다.")

    looks_ok = len(api.api_key) == 42 and api.api_key.startswith("RGAPI-")
    if not looks_ok:
        print("")
        print("→ 값의 모양이 정상 키와 다릅니다. 붙여넣기가 잘못됐을 가능성이 큽니다.")
        print("  developer.riotgames.com 의 앱 화면(GENERAL INFO)에 있는 API Key 칸 값을")
        print("  통째로 복사해 Secret을 교체하세요. 메인 화면의 DEVELOPMENT API KEY가 아닙니다.")

    riot_id = os.environ.get("CHECK_RIOT_ID", "").strip() or "Hide on bush#KR1"
    try:
        game_name, tag_line = split_riot_id(riot_id)
    except ValueError as e:
        print(f"\n결과: 실패 — {e}")
        return 1

    print(f"\n조회 시도  : {game_name}#{tag_line}")
    try:
        account = api.account_by_riot_id(game_name, tag_line)
    except NotFound:
        # 계정이 없다는 응답을 받았다는 것 자체가 키는 통과했다는 뜻입니다.
        print("결과: 키 정상")
        print("(해당 Riot ID는 없지만, Riot 서버가 키를 받아들였습니다)")
        return 0
    except RiotError as e:
        print("결과: 실패")
        print(f"{e}")
        return 1

    print("결과: 키 정상")
    print(f"조회 성공 — {account.get('gameName')}#{account.get('tagLine')}")
    return 0


if __name__ == "__main__":
    sys.exit(main())
