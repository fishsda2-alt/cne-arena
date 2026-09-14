"""
스타크래프트: 리마스터 — 선수 본인 등록(자기 신고)을 랭킹에 반영합니다.

롤·발로란트와 달리 블리자드 공식 API가 없어서 티어를 자동으로 가져올 수 없습니다.
선수가 래더 화면 스크린샷을 고르면 **브라우저 안에서** 숫자를 읽고(scr.html),
선수 본인이 스크린샷과 대조해 확인한 값만 여기로 넘어옵니다.
스크린샷 파일은 사이트 밖으로 나가지 않습니다.

이 값은 검증된 값이 아닙니다. 그래서
  · 화면에 [본인 등록 / MM.DD.] 표시를 붙이고
  · Riot API로 모은 롤 티어와 섞이지 않게 파일을 따로 둡니다 (data/ranking.scr.json)
매일 갱신하지 않습니다 — 선수가 다시 등록할 때만 바뀝니다.

같은 게임 아이디로 다시 등록하면 기존 기록을 새 값으로 바꿉니다(순번은 유지).

사용법:
  python scripts/scr_report.py --scr-id Flash --name 천안테란 --region 천안 --race 테란 \
      --grade B --rating 1856 --wins 120 --losses 98 [--ladder-rank 1234] [--team OO클럽]
  python scripts/scr_report.py --remove s003          # 운영자: 기록 삭제 (순번 또는 게임 아이디)
"""

import argparse
import json
import os
import re
import sys
from datetime import datetime, timedelta, timezone

KST = timezone(timedelta(hours=9))
ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
DATA_FILE = os.path.join(ROOT, "data", "ranking.scr.json")

# js/config.js 와 같은 목록이어야 합니다.
REGIONS = [
    "천안", "공주", "보령", "아산", "서산", "논산", "계룡", "당진",
    "금산", "부여", "서천", "청양", "홍성", "예산", "태안",
]
RACES = ["테란", "저그", "프로토스", "랜덤"]
GRADES = ["S", "A", "B", "C", "D", "E", "F", "U"]  # 높은 순. U = 배치 전

RATING_MIN, RATING_MAX = 0, 5000
COUNT_MAX = 100000
LIMITS = {"scr_id": 24, "name": 20, "team": 30}

# 줄바꿈·제어문자와, 워크플로 로그에서 말썽을 일으키는 문자는 지웁니다.
STRIP = re.compile(r"[\x00-\x1f\x7f\"'`$\\<>]")


class InputError(ValueError):
    pass


def clean(value, field):
    value = STRIP.sub(" ", value or "")
    value = re.sub(r"\s+", " ", value).strip()
    return value[: LIMITS[field]]


def to_int(label, value, lo, hi, required=False):
    raw = (value or "").replace(",", "").strip()
    if not raw:
        if required:
            raise InputError(f"{label}을(를) 입력해 주세요.")
        return None
    if not raw.isdigit():
        raise InputError(f"{label}은(는) 숫자여야 합니다 — {value}")
    n = int(raw)
    if not lo <= n <= hi:
        raise InputError(f"{label}이(가) 범위를 벗어났습니다 ({lo}~{hi}) — {n}")
    return n


def key_of(scr_id):
    return (scr_id or "").strip().lower()


def today():
    return datetime.now(KST).date().isoformat()


def load():
    try:
        with open(DATA_FILE, encoding="utf-8") as f:
            data = json.load(f)
    except (FileNotFoundError, json.JSONDecodeError):
        data = {}
    data.setdefault("players", [])
    return data


def save(data):
    # 롤 랭킹 파일과 같은 순서로 씁니다 (사람이 열어볼 때·커밋 차이를 볼 때 읽기 쉽게)
    ordered = {
        "updatedAt": data.get("updatedAt", ""),
        "playerCount": data.get("playerCount", 0),
        "rankedCount": data.get("rankedCount", 0),
        "players": data.get("players", []),
    }
    os.makedirs(os.path.dirname(DATA_FILE), exist_ok=True)
    with open(DATA_FILE, "w", encoding="utf-8") as f:
        json.dump(ordered, f, ensure_ascii=False, indent=2)
        f.write("\n")


def label_of(grade, rating):
    if grade == "U":
        return "배치 전"
    return f"{grade} · {rating}" if rating is not None else grade


def rebuild(data):
    """정렬·순위·집계를 다시 계산합니다. 레이팅 높은 순, 배치 전은 뒤로."""
    players = data["players"]
    players.sort(key=lambda p: (
        p.get("score") is None,
        -(p.get("score") or 0),
        -(p.get("wins") or 0),
        p.get("name", ""),
    ))
    n = 0
    for p in players:
        if p.get("score") is None:
            p["rank"] = None
        else:
            n += 1
            p["rank"] = n
    data["playerCount"] = len(players)
    data["rankedCount"] = n
    data["updatedAt"] = datetime.now(KST).isoformat(timespec="seconds")
    return data


def next_id(players):
    used = {int(m.group(1)) for p in players if (m := re.fullmatch(r"s(\d+)", p.get("id", "")))}
    return "s{:03d}".format(max(used, default=0) + 1)


def find(players, who):
    who = (who or "").strip()
    for p in players:
        if p.get("id") == who:
            return p
    k = key_of(who)
    for p in players:
        if key_of(p.get("gameName")) == k:
            return p
    return None


def build_entry(args):
    scr_id = clean(args.scr_id, "scr_id")
    if not scr_id:
        raise InputError("게임 아이디를 입력해 주세요.")
    name = clean(args.name, "name") or scr_id
    team = clean(args.team, "team")

    region = (args.region or "").strip()
    if region not in REGIONS:
        raise InputError(f"지역은 {' / '.join(REGIONS)} 중 하나여야 합니다 — {region}")
    race = (args.race or "").strip()
    if race not in RACES:
        raise InputError(f"종족은 {' / '.join(RACES)} 중 하나여야 합니다 — {race}")
    grade = (args.grade or "").strip().upper()
    if grade not in GRADES:
        raise InputError(f"등급은 {' / '.join(GRADES)} 중 하나여야 합니다 — {args.grade}")

    rating = to_int("레이팅", args.rating, RATING_MIN, RATING_MAX, required=(grade != "U"))
    wins = to_int("승", args.wins, 0, COUNT_MAX)
    losses = to_int("패", args.losses, 0, COUNT_MAX)
    ladder_rank = to_int("래더 순위", args.ladder_rank, 1, 10_000_000)

    games = (wins or 0) + (losses or 0)
    return {
        "name": name,
        "gameName": scr_id,
        "tagLine": "",           # 롤 화면 코드와 모양을 맞추기 위한 빈 칸
        "region": region,
        "position": race,        # 종족. 필터·클럽 페이지가 이 이름으로 읽습니다
        "team": team,
        "tier": grade,
        "rating": rating,
        "score": rating if grade != "U" else None,
        "label": label_of(grade, rating),
        "wins": wins or 0,
        "losses": losses or 0,
        "games": games,
        "winRate": round((wins or 0) / games * 100, 1) if games else 0.0,
        "ladderRank": ladder_rank,
        "reportedAt": today(),
        "selfReported": True,
    }


def main():
    ap = argparse.ArgumentParser(description="스타크래프트: 리마스터 본인 등록 반영")
    ap.add_argument("--scr-id", default="", help="스타크래프트 게임 아이디")
    ap.add_argument("--name", default="", help="랭킹에 표시할 닉네임 (비우면 게임 아이디)")
    ap.add_argument("--region", default="")
    ap.add_argument("--race", default="", help="테란 / 저그 / 프로토스 / 랜덤")
    ap.add_argument("--team", default="")
    ap.add_argument("--grade", default="", help="S A B C D E F, 배치 전이면 U")
    ap.add_argument("--rating", default="")
    ap.add_argument("--wins", default="")
    ap.add_argument("--losses", default="")
    ap.add_argument("--ladder-rank", default="")
    ap.add_argument("--remove", default="", help="삭제할 순번(s001) 또는 게임 아이디")
    args = ap.parse_args()

    data = load()

    if args.remove:
        target = find(data["players"], args.remove)
        if not target:
            print(f"오류: 기록을 찾을 수 없습니다 — {args.remove}", file=sys.stderr)
            return 1
        data["players"] = [p for p in data["players"] if p is not target]
        save(rebuild(data))
        print(f"삭제 완료: {target['id']} · {target.get('name')} ({target.get('gameName')})")
        return 0

    try:
        entry = build_entry(args)
    except InputError as e:
        print(f"오류: {e}", file=sys.stderr)
        return 1

    existing = find(data["players"], entry["gameName"])
    if existing:
        # 명단 안의 그 자리를 그대로 고칩니다. 순위는 rebuild 가 이 객체에 매기므로,
        # 결과를 출력할 때도 반드시 이 객체(stored)를 읽어야 합니다.
        stored = existing
        new_values = {"id": existing["id"], **entry}
        stored.clear()
        stored.update(new_values)
        verb = "갱신됨"
    else:
        stored = {"id": next_id(data["players"]), **entry}
        data["players"].append(stored)
        verb = "등록됨"

    save(rebuild(data))

    mmdd = stored["reportedAt"][5:].replace("-", ".") + "."
    rank = f"충남 {stored['rank']}위" if stored.get("rank") else "순위 없음(배치 전)"
    print(f"{verb}: {stored['id']} · {stored['name']} ({stored['gameName']}) · "
          f"{stored['position']} · {stored['label']} · {rank} · 본인 등록 {mmdd}")
    return 0


if __name__ == "__main__":
    sys.exit(main())
