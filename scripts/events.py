"""
대회 목록(data/events.json) 읽기·쓰기.

사이트에서 들어온 제보는 **approved: false 로 쌓이고 화면에 안 나옵니다.**
선수 등록은 아이콘으로 본인을 확인할 수 있지만 대회 제보는 확인할 대상이 없어서,
아무나 올릴 수 있게 두면 광고가 들어옵니다. 운영자가 승인해야 노출됩니다.

운영자가 GitHub에서 직접 적은 항목은 approved 가 없으므로 바로 보입니다
(없는 것과 false 는 다릅니다 — 손으로 적을 때마다 approved:true 를 쓰게 하면 잊습니다).

사용법:
  python scripts/events.py add --name "OO컵" --game lol --start 2026-10-01 ...
  python scripts/events.py approve --id e001
  python scripts/events.py reject  --id e001
  python scripts/events.py list
"""

import argparse
import re
import sys
from datetime import datetime

import players as P

EVENTS_FILE = P.os.path.join(P.DATA, "events.json")

LIMITS = {"name": 60, "host": 40, "note": 120, "url": 300, "poster": 300}
STRIP_CHARS = frozenset("\r\n\t\"'`$<>" + chr(92))

# 클릭하면 열리는 주소입니다. https 만 받습니다 —
# javascript: 로 시작하는 주소는 눌렀을 때 코드가 실행됩니다.
SAFE_URL = re.compile(r"^https://[^\s]+$", re.I)
DATE = re.compile(r"^\d{4}-\d{2}-\d{2}$")


def load():
    data = P.read_json(EVENTS_FILE, {})
    data.setdefault("events", [])
    return data


def save(data):
    P.write_json(EVENTS_FILE, data)


def next_id(events):
    used = {int(m.group(1)) for e in events if (m := re.fullmatch(r"e(\d+)", str(e.get("id", ""))))}
    return "e{:03d}".format(max(used, default=0) + 1)


def clean(field, value):
    value = "".join(" " if ch in STRIP_CHARS else ch for ch in (value or ""))
    value = re.sub(r"\s+", " ", value).strip()
    return value[: LIMITS.get(field, 120)]


def check_date(label, value):
    if value and not DATE.match(value):
        raise ValueError(f"{label}: YYYY-MM-DD 형식이어야 합니다 — {value}")
    return value


def check_url(label, value):
    if not value:
        return ""
    if not SAFE_URL.match(value):
        raise ValueError(f"{label}: https:// 로 시작하는 주소여야 합니다 — {value[:60]}")
    return value


def cmd_add(args):
    name = clean("name", args.name)
    if not name:
        print("오류: 대회 이름이 비어 있습니다.", file=sys.stderr)
        return 1

    game = (args.game or "").strip()
    if game and game not in P.POSITIONS:
        print(f"오류: 모르는 종목입니다: {game}", file=sys.stderr)
        return 1

    try:
        start = check_date("시작일", (args.start or "").strip())
        end = check_date("종료일", (args.end or "").strip())
        apply_by = check_date("신청 마감", (args.apply_by or "").strip())
        url = check_url("접수 링크", clean("url", args.url))
        poster = check_url("포스터 주소", clean("poster", args.poster))
    except ValueError as e:
        print(f"오류: {e}", file=sys.stderr)
        return 1

    if start and end and end < start:
        print("오류: 종료일이 시작일보다 빠릅니다.", file=sys.stderr)
        return 1

    data = load()
    event = {
        "id": next_id(data["events"]),
        "name": name,
        "host": clean("host", args.host),
        "start": start,
        "end": end,
        "applyBy": apply_by,
        "game": game,
        "url": url,
        "poster": poster,
        "note": clean("note", args.note),
        # 사이트에서 들어온 제보는 승인 전까지 화면에 나오지 않습니다.
        "approved": False,
        "submittedAt": datetime.now(P.KST).isoformat(timespec="seconds"),
    }
    data["events"].append(event)
    save(data)

    print(f"제보 접수: {event['id']} · {name}")
    print(f"      종목 {game or '(미지정)'} · 기간 {start or '?'} ~ {end or '?'}")
    if url:
        print(f"      접수 링크 {url}")
    if poster:
        print(f"      포스터 {poster}")
    print("      운영 현황에서 승인해야 사이트에 나옵니다.")
    return 0


def cmd_approve(args):
    data = load()
    ev = next((e for e in data["events"] if e.get("id") == args.id), None)
    if not ev:
        print(f"오류: 그런 대회가 없습니다 — {args.id}", file=sys.stderr)
        return 1
    ev["approved"] = True
    save(data)
    print(f"승인: {ev['id']} · {ev.get('name')}")
    return 0


def cmd_reject(args):
    data = load()
    before = len(data["events"])
    ev = next((e for e in data["events"] if e.get("id") == args.id), None)
    if not ev:
        print(f"오류: 그런 대회가 없습니다 — {args.id}", file=sys.stderr)
        return 1
    data["events"] = [e for e in data["events"] if e.get("id") != args.id]
    save(data)
    print(f"거절·삭제: {args.id} · {ev.get('name')} ({before} → {len(data['events'])}건)")
    return 0


def cmd_list(args):
    data = load()
    if not data["events"]:
        print("등록된 대회가 없습니다.")
        return 0
    for e in data["events"]:
        state = "대기" if e.get("approved") is False else "노출"
        print(f"  [{state}] {e.get('id')}  {e.get('name')}  "
              f"{e.get('game') or '-'}  {e.get('start') or '?'}~{e.get('end') or '?'}")
    return 0


def main():
    ap = argparse.ArgumentParser(description="충남 아마추어 랭킹 - 대회 관리")
    sub = ap.add_subparsers(dest="cmd", required=True)

    a = sub.add_parser("add", help="대회 제보 추가 (승인 대기 상태)")
    a.add_argument("--name", required=True)
    a.add_argument("--host", default="")
    a.add_argument("--game", default="")
    a.add_argument("--start", default="")
    a.add_argument("--end", default="")
    a.add_argument("--apply-by", default="")
    a.add_argument("--url", default="")
    a.add_argument("--poster", default="")
    a.add_argument("--note", default="")
    a.set_defaults(fn=cmd_add)

    for name, fn, help_ in (("approve", cmd_approve, "승인해 화면에 띄웁니다"),
                            ("reject", cmd_reject, "거절하고 지웁니다")):
        s = sub.add_parser(name, help=help_)
        s.add_argument("--id", required=True)
        s.set_defaults(fn=fn)

    s = sub.add_parser("list", help="전체 목록")
    s.set_defaults(fn=cmd_list)

    args = ap.parse_args()
    return args.fn(args)


if __name__ == "__main__":
    sys.exit(main())
