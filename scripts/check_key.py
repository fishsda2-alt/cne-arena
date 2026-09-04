"""
API 키 점검 — Secret에 든 키가 실제로 동작하는지 한 번에 확인합니다.

키 값 자체는 절대 출력하지 않습니다 (실행 기록은 공개됩니다).
- 모양(길이·접두사·공백)
- 지문(앞뒤 3글자)
- 해시(앞 12자리) ← 내 손에 있는 키와 같은 값인지 대조용
"""

import hashlib
import os
import sys

from riot import REGION_HOST, NotFound, RiotAPI, RiotError, split_riot_id


def key_hash(key):
    """키를 복원할 수 없는 대조용 해시 (SHA-256 앞 12자리)"""
    return hashlib.sha256(key.encode("utf-8")).hexdigest()[:12]


def main():
    raw = os.environ.get("RIOT_API_KEY", "")

    if not raw.strip():
        print("결과: 실패")
        print("Secret RIOT_API_KEY 가 비어 있습니다.")
        print("저장소 Settings > Secrets and variables > Actions 에서 등록하세요.")
        return 1

    api = RiotAPI(raw)
    print("── Secret 진단 ─────────────────────────────")
    print(f"모양 : {api.key_shape()}")
    print("       (정상: 길이 42자, RGAPI-로 시작)")
    print(f"지문 : {api.key_fingerprint()}")
    print(f"해시 : {key_hash(api.api_key)}")
    print("       ↑ 내 손에 있는 키와 같은 값인지 대조할 때 씁니다.")

    riot_id = os.environ.get("CHECK_RIOT_ID", "").strip() or "Hide on bush#KR1"
    try:
        game_name, tag_line = split_riot_id(riot_id)
    except ValueError as e:
        print(f"\n결과: 실패 — {e}")
        return 1

    print("\n── 호출 시험 ───────────────────────────────")
    print(f"대상 : {game_name}#{tag_line}  ({REGION_HOST})")

    try:
        account = api.account_by_riot_id(game_name, tag_line)
    except NotFound:
        # 계정이 없다는 응답을 받았다는 것 자체가 키는 통과했다는 뜻입니다.
        print("결과 : 키 정상")
        print("(해당 Riot ID는 없지만, Riot 서버가 키를 받아들였습니다)")
        return 0
    except RiotError as e:
        print("결과 : 실패")
        print(f"{e}")
        return 1

    print("결과 : 키 정상")
    print(f"조회 성공 — {account.get('gameName')}#{account.get('tagLine')}")
    return 0


if __name__ == "__main__":
    sys.exit(main())
