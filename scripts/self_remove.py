"""
선수 본인이 신청한 등록 삭제 — 사이트 '정보 수정' 페이지 아래쪽에서 들어옵니다.

되돌릴 수 없습니다. 그래서 인증을 한 겹 더 갈랐습니다 —
삭제용 아이콘 번호는 **수정용과 다릅니다.** 같은 번호를 쓰면, 오늘 정보를 고치려고
아이콘을 바꿔둔 선수를 같은 날 남이 지울 수 있게 됩니다.

  --game 을 주면 그 종목의 등록만 해지합니다 (다른 종목은 남습니다).
  --game 없이 부르면 선수 정보를 통째로 지웁니다.
  종목을 해지해 남은 종목이 없어지면 선수 정보도 함께 지웁니다.

지우는 곳: data/players.json · 모든 종목의 ranking 파일 · data/history 전체.
※ git 커밋 이력에는 남습니다. 완전 파기가 필요하면 저장소 히스토리 정리가 별도로 필요합니다
   (README '개인정보 처리' 참고).

사용법:
  python scripts/self_remove.py --riot-id "홍길동#KR1"
  python scripts/self_remove.py --riot-id "홍길동#KR1" --game val
"""

import argparse
import os
import sys

import players as P
from riot import NotFound, RiotAPI, RiotError, split_riot_id
from verify_common import verify_icon

HISTORY_DIR = os.path.join(P.DATA, "history")


def purge_history(player_id):
    if not os.path.isdir(HISTORY_DIR):
        return 0
    hit = 0
    for name in sorted(os.listdir(HISTORY_DIR)):
        if not name.endswith(".json"):
            continue
        path = os.path.join(HISTORY_DIR, name)
        month = P.read_json(path, {})
        changed = False
        for day in month.values():
            if player_id in day:
                del day[player_id]
                changed = True
                hit += 1
        if changed:
            P.write_json(path, month)
    return hit


def purge_ranking(player_id, games=None):
    """랭킹 파일에서 그 선수를 지웁니다. games 를 주면 그 종목의 파일만."""
    removed = []
    for game, path in P.RANKING_FILES.items():
        if games is not None and game not in games:
            continue
        data = P.read_json(path, None)
        if not data:
            continue
        before = len(data.get("players", []))
        data["players"] = [p for p in data.get("players", []) if p.get("id") != player_id]
        if len(data["players"]) != before:
            data["playerCount"] = len(data["players"])
            P.write_json(path, data)
            removed.append(game)
    return removed


def main():
    ap = argparse.ArgumentParser(description="충남 아마추어 랭킹 - 선수 본인 등록 삭제")
    ap.add_argument("--riot-id", required=True, help='예: "홍길동#KR1"')
    ap.add_argument("--game", default=None, choices=sorted(P.POSITIONS),
                    help="이 종목만 해지 (없으면 전체 삭제)")
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
        print("      이미 삭제되었거나, Riot ID를 잘못 적으셨을 수 있습니다.", file=sys.stderr)
        return 1

    if args.game and not P.has_game(player, args.game):
        print(f"오류: 이 선수는 {P.game_name(args.game)}에 등록돼 있지 않습니다.", file=sys.stderr)
        print(f"      등록된 종목: {', '.join(P.game_name(g) for g in P.games_of(player))}",
              file=sys.stderr)
        return 1

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

        # 같은 이름을 쓰게 된 다른 계정이 남의 등록을 지우지 못하도록,
        # 등록 당시의 puuid와 일치할 때만 진행합니다.
        if account["puuid"] != player["puuid"]:
            print("오류: 등록된 계정과 다른 계정입니다.", file=sys.stderr)
            print("      Riot ID를 바꾸셨다면 운영자에게 문의해 주세요.", file=sys.stderr)
            return 1

        if not verify_icon(api, player["puuid"], game_name, tag_line, "remove", "삭제"):
            return 1

    pid, pname = player["id"], player.get("name")

    if args.game:
        empty = P.drop_game(player, args.game)
        purge_ranking(pid, games=[args.game])
        print(f"등록 해지: {pid} · {pname} · {P.game_name(args.game)}")
        if not empty:
            print(f"      남은 종목: {', '.join(P.game_name(g) for g in P.games_of(player))}")
            print("      (남은 종목의 랭킹과 기록은 그대로입니다)")
            P.save(data)
            return 0
        print("      남은 종목이 없어 선수 정보도 함께 지웁니다.")

    data["players"] = [p for p in data["players"] if p["id"] != pid]
    purge_ranking(pid)
    days = purge_history(pid)
    P.save(data)

    print(f"삭제 완료: {pid} · {pname}")
    print(f"      랭킹·일별 기록({days}건)에서 모두 지웠습니다. 되돌릴 수 없습니다.")
    print("      다시 참여하시려면 등록 페이지에서 처음부터 등록하시면 됩니다.")
    return 0


if __name__ == "__main__":
    sys.exit(main())
