"""
발로란트 API 점검 — 지금 키로 발로란트에서 무엇을 할 수 있는지 확인합니다.

설계를 시작하기 전에 이것부터 돌려 보세요. 결과에 따라 만들 것이 완전히 갈립니다.
Riot 키는 앱 승인 용도별로 제품 권한이 나뉘어서, 롤 래더 용도로 승인받은 키가
발로란트까지 열어 준다는 보장이 없습니다.

아무것도 등록하거나 바꾸지 않습니다. 키 값도 출력하지 않습니다.
(check_key.py 와 같은 원칙 — 실행 기록은 공개됩니다)

사용법:
  RIOT_API_KEY=... python scripts/check_val.py
  CHECK_RIOT_ID="홍길동#KR1" 로 조회 대상을 지정할 수 있습니다.
  비우면 data/players.json 의 첫 선수를 씁니다.
"""

import json
import os
import sys

from riot import REGION_HOST, RiotAPI, RiotError, split_riot_id

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
PLAYERS_FILE = os.path.join(ROOT, "data", "players.json")

# 발로란트는 롤과 라우팅 값이 다릅니다 (ap / br / esports / eu / kr / latam / na).
VAL_HOST = os.environ.get("RIOT_VAL_REGION", "kr") + ".api.riotgames.com"
# 롤 플랫폼 라우팅 — 아이콘 인증을 발로란트에도 쓸 수 있는지 확인할 때만 씁니다.
LOL_HOST = os.environ.get("RIOT_PLATFORM", "kr") + ".api.riotgames.com"


def verdict(status):
    """상태 코드를 사람 말로."""
    return {
        200: "사용 가능",
        401: "거부됨 (키가 틀렸거나, 이 제품에 열려 있지 않음)",
        403: "거부됨 (키가 틀렸거나, 이 제품에 열려 있지 않음)",
        404: "경로는 살아 있으나 해당 데이터 없음",
        429: "요청 한도 초과 — 잠시 뒤 다시",
    }.get(status, "확인 필요")


def report(label, status, note):
    mark = "O" if status == 200 else ("-" if status == 404 else "X")
    print(f"  [{mark}] {label}")
    print(f"      HTTP {status} · {verdict(status)}")
    if note:
        print(f"      응답: {note}")


def default_riot_id():
    """조회 대상을 못 받았으면 등록된 첫 선수를 씁니다."""
    try:
        with open(PLAYERS_FILE, encoding="utf-8") as f:
            players = json.load(f).get("players", [])
    except (FileNotFoundError, json.JSONDecodeError):
        return ""
    if not players:
        return ""
    p = players[0]
    return f"{p['gameName']}#{p['tagLine']}"


def active_act_id(contents):
    """content 응답에서 진행 중인 액트 ID를 찾습니다."""
    acts = [a for a in (contents or {}).get("acts", []) if a.get("isActive")]
    if not acts:
        return None
    # 에피소드와 액트가 섞여 오므로 액트를 먼저 고릅니다.
    for a in acts:
        if a.get("type") == "act":
            return a.get("id")
    return acts[-1].get("id")


def main():
    raw = os.environ.get("RIOT_API_KEY", "")
    if not raw.strip():
        print("결과: 실패 — Secret RIOT_API_KEY 가 비어 있습니다.")
        return 1

    api = RiotAPI(raw)
    print("── 사용하는 키 ─────────────────────────────")
    print(f"모양 : {api.key_shape()}")
    print(f"지문 : {api.key_fingerprint()}")
    print(f"계정 라우팅     : {REGION_HOST}")
    print(f"발로란트 라우팅 : {VAL_HOST}")
    print()

    results = {}

    print("── 계정 (게임 공용) ────────────────────────")
    riot_id = os.environ.get("CHECK_RIOT_ID", "").strip() or default_riot_id()
    puuid = None
    if not riot_id:
        print("  조회할 Riot ID가 없습니다. 워크플로 입력칸에 하나 적어 주세요.")
    else:
        try:
            game_name, tag_line = split_riot_id(riot_id)
        except ValueError as e:
            print(f"  Riot ID 형식 오류: {e}")
            return 1
        try:
            account = api.account_by_riot_id(game_name, tag_line)
            puuid = account["puuid"]
            results["account"] = 200
            print(f"  [O] account-v1 · {game_name}#{tag_line}")
            print("      HTTP 200 · 사용 가능 (puuid는 롤·발로란트 공용입니다)")
        except RiotError as e:
            results["account"] = e.status
            report(f"account-v1 · {riot_id}", e.status, "")

    print()
    print("── 발로란트 제품별 권한 ────────────────────")

    status, _, note = api.probe(VAL_HOST, "/val/status/v1/platform-data")
    results["status"] = status
    report("VAL-STATUS-V1  서버 상태", status, note)

    status, contents, note = api.probe(VAL_HOST, "/val/content/v1/contents?locale=ko-KR")
    results["content"] = status
    report("VAL-CONTENT-V1 게임 콘텐츠(액트 목록)", status, note)

    act_id = active_act_id(contents)
    if act_id:
        print(f"      진행 중인 액트: {act_id}")

    if act_id:
        status, board, note = api.probe(
            VAL_HOST, f"/val/ranked/v1/leaderboards/by-act/{act_id}?size=1"
        )
        results["ranked"] = status
        report("VAL-RANKED-V1  액트 리더보드", status, note)
        if status == 200 and board:
            total = board.get("totalPlayers")
            if total is not None:
                print(f"      리더보드 등재 인원: {total}명 (상위권만 들어갑니다)")
    else:
        results["ranked"] = None
        print("  [ ] VAL-RANKED-V1  액트 ID를 못 구해 건너뜁니다")

    if puuid:
        status, _, note = api.probe(VAL_HOST, f"/val/match/v1/matchlists/by-puuid/{puuid}")
        results["match"] = status
        report("VAL-MATCH-V1   경기 목록 (개인 티어의 유일한 통로)", status, note)
    else:
        results["match"] = None
        print("  [ ] VAL-MATCH-V1   puuid가 없어 건너뜁니다")

    print()
    print("── 본인 인증을 재사용할 수 있는가 ──────────")
    if puuid:
        status, _, note = api.probe(LOL_HOST, f"/lol/summoner/v4/summoners/by-puuid/{puuid}")
        results["lol_summoner"] = status
        report("summoner-v4 (같은 puuid의 롤 기록)", status, note)
        if status == 200:
            print("      → 이 계정은 롤 아이콘 인증을 그대로 쓸 수 있습니다.")
        elif status == 404:
            print("      → 롤을 하지 않은 계정입니다. 이런 선수는 아이콘 인증이 불가능하니")
            print("        발로란트 전용 인증 수단을 따로 정해야 합니다.")
    else:
        results["lol_summoner"] = None
        print("  [ ] puuid를 못 구해 건너뜁니다 (위 계정 조회부터 실패했습니다)")

    print()
    print("── 결론 ────────────────────────────────────")
    # account-v1 은 롤 랭킹이 매일 쓰는 경로라, 여기가 막히면 발로란트 권한 이전의
    # 문제입니다. 이걸 먼저 갈라야 401을 "제품 권한 없음"으로 오해하지 않습니다.
    if results.get("account") not in (200, None):
        print("키 자체가 거부되었습니다 — account-v1 부터 실패했습니다.")
        print("발로란트 권한 이야기 이전의 문제입니다.")
        print("Actions → API 키 점검 → Run workflow 로 키부터 확인하세요.")
    elif results.get("match") == 200:
        print("발로란트 자동 랭킹이 가능합니다.")
        print("경기 목록 → 각 경기의 competitiveTier 를 읽어 티어를 채우는 설계로 갑니다.")
        print("호출량이 롤보다 크므로 하루에 나눠 도는 구조를 함께 설계하세요.")
    elif results.get("ranked") == 200:
        print("리더보드만 열려 있습니다. 불멸·레디언트 상위권만 조회되므로")
        print("아마추어 선수 랭킹에는 쓸 수 없습니다. 개인 티어를 얻으려면")
        print("VAL-MATCH-V1 권한이 필요합니다 — Riot에 별도 승인을 신청하세요.")
    elif any(results.get(k) in (401, 403) for k in ("status", "content", "ranked", "match")):
        print("이 키에는 발로란트 권한이 없습니다. 키가 잘못된 것이 아니라,")
        print("앱 승인 용도에 발로란트가 포함돼 있지 않은 것입니다.")
        print("developer.riotgames.com 에서 발로란트 용도로 별도 신청하세요.")
    else:
        print("판단하기 어려운 결과입니다. 위의 상태 코드를 그대로 알려주세요.")

    print()
    print("(이 점검은 아무것도 바꾸지 않습니다. 몇 번이든 다시 눌러도 됩니다)")
    return 0


if __name__ == "__main__":
    sys.exit(main())
