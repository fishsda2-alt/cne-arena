"""
선수 명단(data/players.json) 읽기·쓰기 — 여러 종목을 다루는 부분을 여기 모았습니다.

한 선수가 여러 종목에 등록할 수 있습니다. 계정(Riot ID·puuid)과 표시 정보
(닉네임·지역·소속)는 한 벌이고, **포지션만 종목마다 다릅니다.**

  "games": { "lol": {"position": "정글"}, "val": {"position": "타격대"} }

예전 형식(최상위 "position", "games" 없음)은 읽을 때 위 모양으로 바꿔 줍니다.
그래서 옛 파일을 그대로 둬도 동작합니다.

사이트가 읽는 data/ranking.<종목>.json 에는 그 종목의 포지션만 평평하게 담깁니다.
화면 쪽 코드는 종목이 늘어도 손댈 필요가 없습니다.
"""

import json
import os
from datetime import datetime, timedelta, timezone

from riot import normalize_riot_id

KST = timezone(timedelta(hours=9))
ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
DATA = os.path.join(ROOT, "data")
PLAYERS_FILE = os.path.join(DATA, "players.json")

# 종목 코드와 사람이 읽는 이름. js/config.js 의 GAMES 와 짝을 맞춰 주세요.
GAME_NAMES = {"lol": "리그 오브 레전드", "val": "발로란트"}
DEFAULT_GAME = "lol"

# 종목별 포지션 — 값 검증에 씁니다 (js/config.js 와 같은 목록)
POSITIONS = {
    "lol": ["탑", "정글", "미드", "원딜", "서포터"],
    "val": ["타격대", "척후대", "감시자", "전략가"],
}

# 종목별 랭킹 파일. 롤만 이름에 종목이 없는 것은 이미 돌고 있는 워크플로가
# 쓰는 경로라서입니다 (바꾸면 배포·갱신이 한꺼번에 어긋납니다).
RANKING_FILES = {
    "lol": os.path.join(DATA, "ranking.json"),
    "val": os.path.join(DATA, "ranking.val.json"),
}


def ranking_file(game):
    return RANKING_FILES.get(game, os.path.join(DATA, f"ranking.{game}.json"))


def game_name(game):
    return GAME_NAMES.get(game, game)


def read_json(path, fallback):
    try:
        with open(path, encoding="utf-8") as f:
            return json.load(f)
    except (FileNotFoundError, json.JSONDecodeError):
        return fallback


def write_json(path, obj):
    os.makedirs(os.path.dirname(path), exist_ok=True)
    with open(path, "w", encoding="utf-8", newline="\n") as f:
        json.dump(obj, f, ensure_ascii=False, indent=2)
        f.write("\n")


def migrate(player):
    """옛 형식(최상위 position)을 종목별 형식으로 바꿉니다. 이미 새 형식이면 그대로."""
    if not isinstance(player.get("games"), dict):
        player["games"] = {DEFAULT_GAME: {"position": player.get("position", "")}}
    player.pop("position", None)
    return player


def load():
    data = read_json(PLAYERS_FILE, {})
    data.setdefault("players", [])
    for p in data["players"]:
        migrate(p)
    return data


def save(data):
    data["updatedAt"] = datetime.now(KST).isoformat(timespec="seconds")
    write_json(PLAYERS_FILE, data)


def find(players, who):
    """선수 ID(p001) 또는 Riot ID(홍길동#KR1)로 찾습니다."""
    who = (who or "").strip()
    for p in players:
        if p.get("id") == who:
            return p
    if "#" in who:
        game_name_, tag_line = who.rsplit("#", 1)
        key = normalize_riot_id(game_name_, tag_line)
        for p in players:
            if normalize_riot_id(p["gameName"], p["tagLine"]) == key:
                return p
    return None


def find_by_riot_id(players, game_name_, tag_line):
    key = normalize_riot_id(game_name_, tag_line)
    for p in players:
        if normalize_riot_id(p["gameName"], p["tagLine"]) == key:
            return p
    return None


def games_of(player):
    """이 선수가 등록한 종목 코드 목록"""
    return list((player.get("games") or {}).keys())


def has_game(player, game):
    return game in (player.get("games") or {})


def position_of(player, game):
    return ((player.get("games") or {}).get(game) or {}).get("position", "")


def set_position(player, game, position):
    player.setdefault("games", {}).setdefault(game, {})["position"] = position


def add_game(player, game, position=""):
    """이미 등록된 선수에게 종목을 하나 더 붙입니다."""
    player.setdefault("games", {})[game] = {"position": position}


def drop_game(player, game):
    """종목 하나만 등록 해지. 남은 종목이 없으면 True(=선수 자체를 지워야 함)."""
    (player.get("games") or {}).pop(game, None)
    return not player.get("games")


def valid_position(game, position):
    """빈 값은 '지정 안 함'으로 봅니다."""
    return not position or position in POSITIONS.get(game, [])
