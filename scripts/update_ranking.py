"""
롤에 등록된 선수들의 티어를 갱신해 data/ranking.json 을 다시 씁니다.

**이 스크립트는 리그 오브 레전드 전용입니다.** 발로란트는 티어를 얻는 경로가
완전히 달라서(경기별 competitiveTier), Riot 승인이 나면 별도 스크립트를 만듭니다.
여기서는 롤에 등록한 선수만 골라내고, 포지션도 그 선수의 롤 포지션을 씁니다.

GitHub Actions가 하루 한 번 실행합니다. (수동 실행도 가능)
호출량: 선수 1명당 2콜(리그 + 프로필). 100명이면 200콜 ≈ 4분.
  · 개발용 키는 2분당 100건 제한이 병목이라 "초당 20건"보다 훨씬 느리게 돕니다.
  · 프로필 아이콘/레벨이 필요 없으면 FETCH_PROFILE=0 으로 실행해 호출을 절반으로 줄이세요.
"""

import json
import os
import sys
from datetime import datetime, timedelta, timezone

import players as P
import ranking
from riot import NotFound, RiotAPI, RiotError

KST = timezone(timedelta(hours=9))
ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
DATA = os.path.join(ROOT, "data")
GAME = "lol"
RANKING_FILE = P.ranking_file(GAME)
HISTORY_DIR = os.path.join(DATA, "history")

FETCH_PROFILE = os.environ.get("FETCH_PROFILE", "1") != "0"
SOLO = "RANKED_SOLO_5x5"
FLEX = "RANKED_FLEX_SR"


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


def pick(entries, queue):
    for e in entries or []:
        if e.get("queueType") == queue:
            return e
    return None


def build_entry(player, api, previous):
    """선수 한 명의 최신 랭크 정보를 조회해 랭킹 항목을 만듭니다."""
    entry = {
        "id": player["id"],
        "name": player.get("name") or player["gameName"],
        "team": player.get("team", ""),
        "region": player.get("region", ""),
        "position": P.position_of(player, GAME),
        "gameName": player["gameName"],
        "tagLine": player["tagLine"],
        # 프로 트라이아웃 희망 선수 (랭킹표에 ★ 표시).
        # 실명·연락처·이메일은 저장소에 저장하지 않습니다 — 이 플래그만 공개됩니다.
        "proAspirant": bool(player.get("proAspirant")),
    }

    league = api.league_entries_by_puuid(player["puuid"])
    solo = pick(league, SOLO)
    flex = pick(league, FLEX)

    if solo:
        wins, losses = int(solo.get("wins", 0)), int(solo.get("losses", 0))
        games = wins + losses
        entry.update(
            tier=solo["tier"],
            division=solo.get("rank", ""),
            lp=int(solo.get("leaguePoints", 0)),
            wins=wins,
            losses=losses,
            games=games,
            winRate=round(wins / games * 100, 1) if games else 0.0,
            hotStreak=bool(solo.get("hotStreak")),
            inactive=bool(solo.get("inactive")),
            score=ranking.score(solo["tier"], solo.get("rank"), solo.get("leaguePoints")),
        )
    else:
        entry.update(
            tier=None, division="", lp=0, wins=0, losses=0, games=0,
            winRate=0.0, hotStreak=False, inactive=False, score=None,
        )

    entry["label"] = ranking.label(entry["tier"], entry["division"], entry["lp"])
    entry["flex"] = (
        {
            "tier": flex["tier"],
            "division": flex.get("rank", ""),
            "lp": int(flex.get("leaguePoints", 0)),
            "label": ranking.label(flex["tier"], flex.get("rank"), flex.get("leaguePoints")),
        }
        if flex
        else None
    )

    if FETCH_PROFILE:
        try:
            s = api.summoner_by_puuid(player["puuid"])
            entry["profileIconId"] = s.get("profileIconId")
            entry["summonerLevel"] = s.get("summonerLevel")
        except RiotError as e:
            print(f"    · 프로필 조회 실패({e}) — 이전 값 사용")
            entry["profileIconId"] = previous.get("profileIconId")
            entry["summonerLevel"] = previous.get("summonerLevel")
    else:
        entry["profileIconId"] = previous.get("profileIconId")
        entry["summonerLevel"] = previous.get("summonerLevel")

    return entry


def history_path(date_str):
    return os.path.join(HISTORY_DIR, f"{date_str[:7]}.json")


def save_history(date_str, entries):
    """월별 파일에 오늘 스냅샷을 기록합니다 (LP 상승폭 계산용)."""
    path = history_path(date_str)
    month = read_json(path, {})
    month[date_str] = {
        e["id"]: {"t": e["tier"], "d": e["division"], "lp": e["lp"], "s": e["score"]}
        for e in entries
        if e["score"] is not None
    }
    write_json(path, month)


def load_snapshot_near(target_date, tolerance=4):
    """target_date에 가장 가까운(±tolerance일) 스냅샷을 찾습니다. 없으면 None."""
    for offset in range(0, tolerance + 1):
        for day in (target_date - timedelta(days=offset), target_date + timedelta(days=offset)):
            key = day.isoformat()
            month = read_json(history_path(key), {})
            if key in month:
                return month[key]
    return None


def main():
    api = RiotAPI(
        os.environ.get("RIOT_API_KEY", ""),
        per_second=int(os.environ.get("RIOT_PER_SEC", "20")),
        per_two_min=int(os.environ.get("RIOT_PER_2MIN", "100")),
    )

    # 승인됐고 이 종목에 등록한 선수만 (발로란트만 등록한 선수는 롤 랭킹에 넣지 않습니다)
    players = [
        p for p in P.load()["players"]
        if p.get("approved") and P.has_game(p, GAME)
    ]
    if not players:
        print(f"{P.game_name(GAME)}에 승인 등록된 선수가 없습니다. data/players.json을 확인하세요.")
        write_json(RANKING_FILE, {
            "updatedAt": datetime.now(KST).isoformat(timespec="seconds"),
            "playerCount": 0, "rankedCount": 0, "errors": [], "players": [],
        })
        return 0

    old = read_json(RANKING_FILE, {})
    prev_by_id = {p["id"]: p for p in old.get("players", [])}

    today = datetime.now(KST).date()
    week_ago = load_snapshot_near(today - timedelta(days=7)) or {}

    entries, errors = [], []
    print(f"선수 {len(players)}명 갱신 시작 (프로필 조회: {'ON' if FETCH_PROFILE else 'OFF'})")

    for i, player in enumerate(players, 1):
        previous = prev_by_id.get(player["id"], {})
        tag = f"{player['gameName']}#{player['tagLine']}"
        try:
            entry = build_entry(player, api, previous)
            entry["stale"] = False
            print(f"  [{i}/{len(players)}] {tag} → {entry['label']}")
        except NotFound:
            # 랭크 조회 404 = 계정은 있으나 정보 없음. 계정 삭제/변경일 수도 있어 이전 값 유지.
            errors.append({"id": player["id"], "riotId": tag, "reason": "조회 실패(404)"})
            if not previous:
                continue
            entry = dict(previous, stale=True)
            print(f"  [{i}/{len(players)}] {tag} → 조회 실패, 이전 값 유지")
        except RiotError as e:
            errors.append({"id": player["id"], "riotId": tag, "reason": str(e)})
            if not previous:
                continue
            entry = dict(previous, stale=True)
            print(f"  [{i}/{len(players)}] {tag} → {e}, 이전 값 유지")
        entries.append(entry)

    entries.sort(key=ranking.sort_key)

    prev_rank = {p["id"]: p.get("rank") for p in old.get("players", [])}
    for i, e in enumerate(entries, 1):
        e["rank"] = i if e["score"] is not None else None
        before = prev_by_id.get(e["id"], {})
        e["lpDelta"] = (
            e["score"] - before["score"]
            if e["score"] is not None and before.get("score") is not None
            else None
        )
        pr = prev_rank.get(e["id"])
        e["rankDelta"] = (pr - e["rank"]) if (pr and e["rank"]) else None
        wk = week_ago.get(e["id"])
        e["weeklyLpDelta"] = (
            e["score"] - wk["s"] if wk and wk.get("s") is not None and e["score"] is not None else None
        )

    result = {
        "updatedAt": datetime.now(KST).isoformat(timespec="seconds"),
        "playerCount": len(entries),
        "rankedCount": sum(1 for e in entries if e["score"] is not None),
        "errors": errors,
        "players": entries,
    }
    write_json(RANKING_FILE, result)
    save_history(today.isoformat(), entries)

    print(f"\n완료: {result['rankedCount']}/{result['playerCount']}명 랭크 반영, 실패 {len(errors)}건")
    # 일부 실패는 정상 종료로 처리 (전원 실패면 키 만료 등 진짜 문제이므로 실패 처리)
    if errors and len(errors) == len(players):
        print("모든 선수 조회에 실패했습니다. API 키가 만료되었을 수 있습니다.", file=sys.stderr)
        return 1
    return 0


if __name__ == "__main__":
    sys.exit(main())
