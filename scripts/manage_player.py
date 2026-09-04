"""
선수 승인/보류/삭제 (운영자용) — API 호출 없이 data/ 파일만 고칩니다.

사용법:
  python scripts/manage_player.py approve --who "홍길동#KR1"
  python scripts/manage_player.py hold    --who p003
  python scripts/manage_player.py remove  --who p003     # 개인정보 삭제 요청 처리

remove는 players.json / ranking.json / history 전체에서 해당 선수를 지웁니다.
"""

import argparse
import json
import os
import sys
from datetime import datetime, timedelta, timezone

from riot import normalize_riot_id

KST = timezone(timedelta(hours=9))
ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
DATA = os.path.join(ROOT, "data")
PLAYERS_FILE = os.path.join(DATA, "players.json")
RANKING_FILE = os.path.join(DATA, "ranking.json")
HISTORY_DIR = os.path.join(DATA, "history")


def read_json(path, fallback):
    try:
        with open(path, encoding="utf-8") as f:
            return json.load(f)
    except (FileNotFoundError, json.JSONDecodeError):
        return fallback


def write_json(path, obj):
    with open(path, "w", encoding="utf-8") as f:
        json.dump(obj, f, ensure_ascii=False, indent=2)
        f.write("\n")


def find(players, who):
    """선수 ID(p001) 또는 Riot ID(홍길동#KR1)로 찾습니다."""
    who = who.strip()
    for p in players:
        if p.get("id") == who:
            return p
    if "#" in who:
        game_name, tag_line = who.rsplit("#", 1)
        key = normalize_riot_id(game_name, tag_line)
        for p in players:
            if normalize_riot_id(p["gameName"], p["tagLine"]) == key:
                return p
    return None


def purge_history(player_id):
    if not os.path.isdir(HISTORY_DIR):
        return
    for name in os.listdir(HISTORY_DIR):
        if not name.endswith(".json"):
            continue
        path = os.path.join(HISTORY_DIR, name)
        month = read_json(path, {})
        changed = False
        for day in month.values():
            if player_id in day:
                del day[player_id]
                changed = True
        if changed:
            write_json(path, month)


def main():
    ap = argparse.ArgumentParser(description="충남 아마추어 랭킹 - 선수 관리")
    ap.add_argument("action", choices=["approve", "hold", "remove"])
    ap.add_argument("--who", required=True, help="선수 ID(p001) 또는 Riot ID(홍길동#KR1)")
    args = ap.parse_args()

    data = read_json(PLAYERS_FILE, {"players": []})
    player = find(data.get("players", []), args.who)
    if not player:
        print(f"오류: 선수를 찾을 수 없습니다 — {args.who}", file=sys.stderr)
        return 1

    if args.action == "remove":
        data["players"] = [p for p in data["players"] if p["id"] != player["id"]]
        ranking = read_json(RANKING_FILE, None)
        if ranking:
            ranking["players"] = [p for p in ranking.get("players", []) if p["id"] != player["id"]]
            ranking["playerCount"] = len(ranking["players"])
            write_json(RANKING_FILE, ranking)
        purge_history(player["id"])
        print(f"삭제 완료: {player['id']} · {player.get('name')} (기록 전체 파기)")
    else:
        player["approved"] = args.action == "approve"
        print(f"{'승인' if player['approved'] else '보류'}: {player['id']} · {player.get('name')}")

    data["updatedAt"] = datetime.now(KST).isoformat(timespec="seconds")
    write_json(PLAYERS_FILE, data)
    return 0


if __name__ == "__main__":
    sys.exit(main())
