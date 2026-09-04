"""
API 키 점검 — Secret에 든 키가 실제로 동작하는지 한 번에 확인합니다.

키 값 자체는 절대 출력하지 않습니다 (실행 기록은 공개됩니다).
- 모양(길이·접두사·공백)
- 지문(앞뒤 3글자)
- 해시(앞 12자리) ← 내 손에 있는 키와 같은 값인지 대조용
- 헤더 대소문자를 다르게 보내는 두 방식으로 각각 호출해 원인을 좁힙니다
"""

import hashlib
import http.client
import json
import os
import sys
import urllib.parse

from riot import REGION_HOST, RiotAPI, RiotError, split_riot_id


def key_hash(key):
    """키를 복원할 수 없는 대조용 해시 (SHA-256 앞 12자리)"""
    return hashlib.sha256(key.encode("utf-8")).hexdigest()[:12]


def call_exact_case(key, path):
    """
    http.client는 헤더 이름을 그대로 보냅니다 (X-Riot-Token).
    urllib은 X-riot-token 으로 바꿔 보내기 때문에, 둘을 비교하면
    "키 문제"인지 "헤더 표기 문제"인지 구분할 수 있습니다.
    """
    conn = http.client.HTTPSConnection(REGION_HOST, timeout=15)
    try:
        conn.request("GET", path, headers={"X-Riot-Token": key})
        res = conn.getresponse()
        body = res.read().decode("utf-8", "replace")
        return res.status, body
    finally:
        conn.close()


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
    print("       ↑ 내 손에 있는 키의 해시와 같은지 확인하세요.")
    print("         PowerShell에서 키를 복사한 뒤 아래를 실행하면 같은 값이 나옵니다.")
    print('         $k=(Get-Clipboard -Raw).Trim(); '
          '[BitConverter]::ToString([Security.Cryptography.SHA256]::Create()'
          '.ComputeHash([Text.Encoding]::UTF8.GetBytes($k))).Replace("-","").'
          'ToLower().Substring(0,12)')

    riot_id = os.environ.get("CHECK_RIOT_ID", "").strip() or "Hide on bush#KR1"
    try:
        game_name, tag_line = split_riot_id(riot_id)
    except ValueError as e:
        print(f"\n결과: 실패 — {e}")
        return 1

    path = (
        "/riot/account/v1/accounts/by-riot-id/"
        f"{urllib.parse.quote(game_name)}/{urllib.parse.quote(tag_line)}"
    )

    print("\n── 호출 시험 ───────────────────────────────")
    print(f"대상 : {game_name}#{tag_line}  ({REGION_HOST})")

    # 방식 A — 스크립트가 실제로 쓰는 경로 (urllib)
    try:
        api.account_by_riot_id(game_name, tag_line)
        a_result = "200 성공"
    except RiotError as e:
        a_result = f"실패 — {e}"
    print(f"방식 A (urllib, 헤더 X-riot-token) : {a_result}")

    # 방식 B — 헤더 이름을 대문자 표기 그대로 보내는 경로
    try:
        status, body = call_exact_case(api.api_key, path)
        b_result = f"{status}"
        if status != 200:
            try:
                b_result += " — " + json.dumps(
                    json.loads(body).get("status", {}), ensure_ascii=False
                )
            except (ValueError, AttributeError):
                b_result += f" — {body[:120]}"
    except Exception as e:  # 네트워크 오류 등
        b_result = f"호출 실패 — {e}"
    print(f"방식 B (http.client, 헤더 X-Riot-Token) : {b_result}")

    print("\n── 판정 ───────────────────────────────────")
    a_ok = a_result.startswith("200")
    b_ok = b_result.startswith("200")

    if a_ok:
        print("키 정상. 자동 등록이 실패한다면 다른 원인입니다.")
        return 0
    if b_ok:
        print("키는 정상인데 urllib이 보내는 헤더 표기를 Riot이 거부하고 있습니다.")
        print("→ riot.py의 요청 방식을 고쳐야 합니다. 이 결과를 알려주세요.")
        return 1

    print("두 방식 모두 거부되었습니다. Secret의 키 값이 유효하지 않습니다.")
    print("→ 위 '해시'를 내 손에 있는 키의 해시와 비교하세요.")
    print("   다르면 Secret에 다른 키가 들어 있는 것이고,")
    print("   같다면 그 키 자체가 Riot에서 무효화된 상태입니다 (재발급 필요).")
    return 1


if __name__ == "__main__":
    sys.exit(main())
