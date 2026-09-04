"""
선수 승인/보류/수정/삭제 (운영자용) — API 호출 없이 data/ 파일만 고칩니다.

사용법:
  python scripts/manage_player.py approve --who "홍길동#KR1"
  python scripts/manage_player.py hold    --who p003
  python scripts/manage_player.py pro     --who p003              # ★ 프로 지망 표시 켜기
  python scripts/manage_player.py unpro   --who p003              # ★ 끄기
  python scripts/manage_player.py edit    --who p003 --name 새닉네임
  python scripts/manage_player.py edit    --who p003 --game val --position 타격대
  python scripts/manage_player.py drop    --who p003 --game val   # 그 종목만 등록 해지
  python scripts/manage_player.py remove  --who p003              # 개인정보 삭제 요청 처리

drop 은 종목 하나만 뺍니다. 남은 종목이 없으면 선수 자체를 지웁니다.
remove 는 players.json / 모든 종목의 ranking / history 에서 그 선수를 전부 지웁니다.
티어·전적은 이 스크립트로 바꿀 수 없습니다 (Riot API가 매일 자동으로 채웁니다).
"""

import argparse
import os
import sys

import players as P

HISTORY_DIR = os.path.join(P.DATA, "history")


def purge_history(player_id):
    if not os.path.isdir(HISTORY_DIR):
        return
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
        if changed:
            P.write_json(path, month)


def purge_ranking(player_id, games=None):
    """랭킹 파일에서 그 선수를 지웁니다. games 를 주면 그 종목의 파일만."""
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


def main():
    ap = argparse.ArgumentParser(description="충남 아마추어 랭킹 - 선수 관리")
    ap.add_argument("action",
                    choices=["approve", "hold", "pro", "unpro", "edit", "drop", "remove"])
    ap.add_argument("--who", required=True, help="선수 ID(p001) 또는 Riot ID(홍길동#KR1)")
    ap.add_argument("--game", default=None, choices=sorted(P.POSITIONS),
                    help="[edit/drop] 대상 종목")
    # edit 전용 — 비워두면 그 항목은 그대로 둡니다
    ap.add_argument("--name", default=None, help="[edit] 표시 닉네임")
    ap.add_argument("--team", default=None, help="[edit] 소속")
    ap.add_argument("--region", default=None, help="[edit] 지역")
    ap.add_argument("--position", default=None, help="[edit] 주 포지션 (--game 과 함께)")
    args = ap.parse_args()

    data = P.load()
    player = P.find(data["players"], args.who)
    if not player:
        print(f"오류: 선수를 찾을 수 없습니다 — {args.who}", file=sys.stderr)
        return 1

    if args.action == "remove":
        data["players"] = [p for p in data["players"] if p["id"] != player["id"]]
        purge_ranking(player["id"])
        purge_history(player["id"])
        print(f"삭제 완료: {player['id']} · {player.get('name')} (기록 전체 파기)")

    elif args.action == "drop":
        if not args.game:
            print("오류: --game 으로 해지할 종목을 지정하세요.", file=sys.stderr)
            return 1
        if not P.has_game(player, args.game):
            print(f"오류: 이 선수는 {P.game_name(args.game)}에 등록돼 있지 않습니다.", file=sys.stderr)
            return 1
        empty = P.drop_game(player, args.game)
        purge_ranking(player["id"], games=[args.game])
        print(f"등록 해지: {player['id']} · {player.get('name')} · {P.game_name(args.game)}")
        if empty:
            data["players"] = [p for p in data["players"] if p["id"] != player["id"]]
            purge_history(player["id"])
            print("      남은 종목이 없어 선수 정보도 함께 지웠습니다.")
        else:
            print(f"      남은 종목: {', '.join(P.game_name(g) for g in P.games_of(player))}")

    elif args.action in ("pro", "unpro"):
        player["proAspirant"] = args.action == "pro"
        mark = "★ 프로 지망 표시" if player["proAspirant"] else "프로 지망 표시 해제"
        print(f"{mark}: {player['id']} · {player.get('name')}")

    elif args.action == "edit":
        changes = []
        for field, value in (("name", args.name), ("team", args.team), ("region", args.region)):
            if value is None or not value.strip():
                continue
            changes.append(f"{field}: {player.get(field, '')!r} → {value.strip()!r}")
            player[field] = value.strip()

        if args.position is not None and args.position.strip():
            game = args.game or (P.games_of(player) or [P.DEFAULT_GAME])[0]
            pos = args.position.strip()
            if not P.valid_position(game, pos):
                print(f"오류: {P.game_name(game)}의 포지션은 "
                      f"{' / '.join(P.POSITIONS[game])} 중 하나여야 합니다.", file=sys.stderr)
                return 1
            if not P.has_game(player, game):
                print(f"오류: 이 선수는 {P.game_name(game)}에 등록돼 있지 않습니다.", file=sys.stderr)
                return 1
            changes.append(f"position({game}): {P.position_of(player, game)!r} → {pos!r}")
            P.set_position(player, game, pos)

        if not changes:
            print("바꿀 항목이 없습니다. --name/--team/--region/--position 중 하나를 지정하세요.",
                  file=sys.stderr)
            return 1
        print(f"수정: {player['id']}")
        for c in changes:
            print(f"  · {c}")

    else:
        player["approved"] = args.action == "approve"
        print(f"{'승인' if player['approved'] else '보류'}: {player['id']} · {player.get('name')}")

    P.save(data)
    return 0


if __name__ == "__main__":
    sys.exit(main())
