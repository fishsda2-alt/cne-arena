"""
선수 본인이 신청한 정보 수정 — 사이트 '정보 수정' 페이지에서 들어옵니다.

운영자용 manage_player.py 와 달리 **아이콘 인증을 반드시 거칩니다.**
닉네임·지역·소속은 종목 공통이고, 포지션만 종목마다 따로입니다.

Riot ID 변경은 이 경로에서 받지 않습니다. 계정이 바뀌면 puuid가 달라져 지금까지의
티어 기록과 이어지지 않으므로, 사실상 재등록이라 운영자가 판단해야 합니다.

사용법:
  python scripts/self_edit.py --riot-id "홍길동#KR1" --name 새닉네임
  python scripts/self_edit.py --riot-id "홍길동#KR1" --game val --position 타격대
옵션:
  --clear-team    소속을 비웁니다 (빈 값은 "안 바꿈"이라 지울 때는 이 플래그가 필요)
  --skip-verify   아이콘 인증 없이 수정 (운영자가 오프라인으로 본인 확인을 끝낸 경우)
"""

import argparse
import os
import re
import sys
import time
from datetime import datetime

import players as P
from riot import KST, NotFound, RiotAPI, RiotError, split_riot_id
from verify_common import accepted_icons, verify_icon  # noqa: F401 (accepted_icons 는 자가 점검이 씁니다)

# 랭킹표에 그대로 노출되는 값이므로 길이를 제한합니다 (등록 폼과 같은 기준).
LIMITS = {"name": 20, "team": 30, "region": 10}

# 값에서 지워버릴 글자 — 줄바꿈·탭·따옴표·역슬래시 등 워크플로로 넘어가면 곤란한 것들.
# 역슬래시는 chr(92)로 씁니다. 정규식 문자 클래스 안에 직접 적으면 이스케이프가
# 한 겹 벗겨졌을 때 "[...\]" 가 되어 문자 클래스가 안 닫히고 조용히 깨집니다.
STRIP_CHARS = frozenset("\r\n\t\"'`$" + chr(92))


def sanitize(field, value):
    """줄바꿈·따옴표 등을 지우고 길이를 자릅니다. 반환값이 비면 '바꾸지 않음'입니다."""
    value = "".join(" " if ch in STRIP_CHARS else ch for ch in value)
    value = re.sub(r"\s+", " ", value).strip()
    return value[: LIMITS[field]]


def apply_to_ranking(player_id, shared, game, position):
    """사이트가 읽는 ranking 파일에도 즉시 반영합니다 (API 호출 없음).

    이걸 하지 않으면 다음 갱신 전까지 화면이 그대로라
    '바꿨는데 안 바뀐다'는 문의가 옵니다.
    닉네임·지역·소속은 모든 종목의 파일에, 포지션은 그 종목의 파일에만 반영합니다.
    """
    for g, path in P.RANKING_FILES.items():
        data = P.read_json(path, None)
        if not data:
            continue
        changed = False
        for entry in data.get("players", []):
            if entry.get("id") != player_id:
                continue
            if shared:
                entry.update(shared)
                changed = True
            if position is not None and g == game:
                entry["position"] = position
                changed = True
        if changed:
            P.write_json(path, data)


def main():
    ap = argparse.ArgumentParser(description="충남 아마추어 랭킹 - 선수 본인 정보 수정")
    ap.add_argument("--riot-id", required=True, help='예: "홍길동#KR1"')
    ap.add_argument("--game", default=None, choices=sorted(P.POSITIONS),
                    help="포지션을 바꿀 종목")
    ap.add_argument("--name", default="", help="표시 닉네임 (비우면 그대로)")
    ap.add_argument("--team", default="", help="소속 (비우면 그대로)")
    ap.add_argument("--region", default="", help="지역 (비우면 그대로)")
    ap.add_argument("--position", default="", help="주 포지션 (--game 과 함께, 비우면 그대로)")
    ap.add_argument("--clear-team", action="store_true", help="소속을 비웁니다")
    ap.add_argument("--skip-verify", action="store_true", help="아이콘 인증 생략 (운영자용)")
    args = ap.parse_args()

    try:
        game_name, tag_line = split_riot_id(args.riot_id)
    except ValueError as e:
        print(f"오류: {e}", file=sys.stderr)
        return 1

    data = P.load()
    player = P.find_by_riot_id(data["players"], game_name, tag_line)
    if not player:
        print(f"오류: 등록되지 않은 Riot ID입니다 — {game_name}#{tag_line}", file=sys.stderr)
        print("      먼저 등록 페이지에서 선수 등록을 마쳐 주세요.", file=sys.stderr)
        return 1

    today = datetime.now(KST).date().isoformat()
    if player.get("lastEditAt") == today and not args.skip_verify:
        print("오류: 정보 수정은 하루 한 번만 가능합니다. 내일 다시 시도해 주세요.", file=sys.stderr)
        return 1

    # 종목 공통 항목 — 현재 값과 같으면 버립니다.
    shared = {}
    for field, raw in (("name", args.name), ("team", args.team), ("region", args.region)):
        value = sanitize(field, raw)
        if not value or value == player.get(field, ""):
            continue
        shared[field] = value

    # 빈 값은 "그대로 둠"이므로, 소속을 지우려면 별도 신호가 필요합니다.
    if args.clear_team and player.get("team"):
        shared["team"] = ""

    # 포지션은 종목별입니다.
    game = args.game or (P.games_of(player) or [P.DEFAULT_GAME])[0]
    position = None
    want = args.position.strip()
    if want:
        if not P.has_game(player, game):
            print(f"오류: 이 선수는 {P.game_name(game)}에 등록돼 있지 않습니다.", file=sys.stderr)
            return 1
        if not P.valid_position(game, want):
            print(f"오류: {P.game_name(game)}의 주 포지션은 "
                  f"{' / '.join(P.POSITIONS[game])} 중 하나여야 합니다.", file=sys.stderr)
            return 1
        if want != P.position_of(player, game):
            position = want

    if not shared and position is None:
        print("바뀐 항목이 없습니다. (입력값이 지금 정보와 같습니다)")
        return 0

    if not args.skip_verify:
        api = RiotAPI(os.environ.get("RIOT_API_KEY", ""))
        try:
            account = api.account_by_riot_id(game_name, tag_line)
        except NotFound:
            print(f"오류: 존재하지 않는 Riot ID입니다 — {game_name}#{tag_line}", file=sys.stderr)
            return 1
        except RiotError as e:
            print(f"오류: 계정 조회 실패 — {e}", file=sys.stderr)
            return 1

        # Riot ID는 반납·변경될 수 있습니다. 같은 이름을 쓰는 다른 계정이 남의 정보를
        # 고치지 못하도록, 등록 당시의 puuid와 일치할 때만 진행합니다.
        if account["puuid"] != player["puuid"]:
            print("오류: 등록된 계정과 다른 계정입니다.", file=sys.stderr)
            print("      Riot ID를 바꾸셨다면 운영자에게 문의해 주세요 (기록 이전이 필요합니다).",
                  file=sys.stderr)
            return 1

        if not verify_icon(api, player["puuid"], game_name, tag_line, "edit", "수정"):
            return 1

    print(f"수정: {player['id']} · {player.get('name')}")
    for field, value in shared.items():
        print(f"  · {field}: {player.get(field, '')!r} → {value!r}")
    if position is not None:
        print(f"  · position({game}): {P.position_of(player, game)!r} → {position!r}")

    player.update(shared)
    if position is not None:
        P.set_position(player, game, position)
    player["lastEditAt"] = today
    P.save(data)
    apply_to_ranking(player["id"], shared, game, position)
    print("완료: 랭킹 화면에 바로 반영됩니다.")
    return 0


if __name__ == "__main__":
    sys.exit(main())
