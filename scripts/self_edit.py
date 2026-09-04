"""
선수 본인이 신청한 정보 수정 — 사이트 '정보 수정' 페이지에서 들어옵니다.

운영자용 manage_player.py 와 달리 **아이콘 인증을 반드시 거칩니다.**
바꿀 수 있는 항목은 표시 닉네임·지역·주 포지션·소속뿐입니다.

Riot ID 변경은 이 경로에서 받지 않습니다. 계정이 바뀌면 puuid가 달라져 지금까지의
티어 기록과 이어지지 않으므로, 사실상 재등록이라 운영자가 판단해야 합니다.

사용법:
  python scripts/self_edit.py --riot-id "홍길동#KR1" --name 새닉네임 --position 정글
옵션:
  --clear-team    소속을 비웁니다 (빈 값은 "안 바꿈"이라 지울 때는 이 플래그가 필요)
  --skip-verify   아이콘 인증 없이 수정 (운영자가 오프라인으로 본인 확인을 끝낸 경우)
"""

import argparse
import json
import os
import re
import sys
import time
from datetime import datetime, timedelta, timezone

from riot import (
    NotFound, RiotAPI, RiotError,
    edit_icon_id, normalize_riot_id, split_riot_id,
)

KST = timezone(timedelta(hours=9))
ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
DATA = os.path.join(ROOT, "data")
PLAYERS_FILE = os.path.join(DATA, "players.json")
RANKING_FILE = os.path.join(DATA, "ranking.json")

# 랭킹표에 그대로 노출되는 값이므로 길이를 제한합니다 (등록 폼과 같은 기준).
LIMITS = {"name": 20, "team": 30, "region": 10, "position": 6}
POSITIONS = ["탑", "정글", "미드", "원딜", "서포터"]

# 자정 직전에 페이지를 열고 자정 직후에 제출하면 안내받은 번호가 '어제 번호'가 됩니다.
# 그 시간대에 한해 어제 번호도 인정합니다 (통과 가능한 번호가 늘어나므로 새벽에만).
GRACE_UNTIL_HOUR = 3

# 값에서 지워버릴 글자 — 줄바꿈·탭·따옴표·역슬래시 등 워크플로로 넘어가면 곤란한 것들.
# 역슬래시는 chr(92)로 씁니다. 정규식 문자 클래스 안에 직접 적으면 이스케이프가
# 한 겹 벗겨졌을 때 "[...\]" 가 되어 문자 클래스가 안 닫히고 조용히 깨집니다.
STRIP_CHARS = frozenset("\r\n\t\"'`$" + chr(92))


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


def sanitize(field, value):
    """줄바꿈·따옴표 등을 지우고 길이를 자릅니다. 반환값이 비면 '바꾸지 않음'입니다."""
    value = "".join(" " if ch in STRIP_CHARS else ch for ch in value)
    value = re.sub(r"\s+", " ", value).strip()
    return value[: LIMITS[field]]


def accepted_icons(game_name, tag_line, now):
    """지금 인정되는 인증 아이콘 번호들 (보통 1개, 새벽에는 어제 것도 함께)"""
    today = now.date()
    days = [today.isoformat()]
    if now.hour < GRACE_UNTIL_HOUR:
        days.append((today - timedelta(days=1)).isoformat())
    return {edit_icon_id(game_name, tag_line, d) for d in days}


def verify_icon(api, player, game_name, tag_line):
    """프로필 아이콘이 오늘의 인증 번호인지 확인합니다."""
    want = accepted_icons(game_name, tag_line, datetime.now(KST))
    shown = " 또는 ".join(str(n) for n in sorted(want))
    attempts = max(1, int(os.environ.get("VERIFY_ATTEMPTS", "3")))
    delay = int(os.environ.get("VERIFY_DELAY", "25"))

    got = None
    for i in range(attempts):
        if i:
            print(f"    · 아이콘이 아직 {shown}번이 아닙니다(현재 {got}번). "
                  f"{delay}초 후 재확인 ({i + 1}/{attempts})")
            time.sleep(delay)
        try:
            summoner = api.summoner_by_puuid(player["puuid"])
        except RiotError as e:
            print(f"오류: 소환사 조회 실패 — {e}", file=sys.stderr)
            return False
        got = summoner.get("profileIconId")
        if got in want:
            print(f"인증 성공: 프로필 아이콘 {got}번 확인")
            return True

    print(f"인증 실패: 현재 아이콘 {got}번, 필요한 아이콘 {shown}번", file=sys.stderr)
    print("      수정 페이지에 나온 번호로 아이콘을 바꾸고 로비로 나온 뒤 다시 신청하세요.", file=sys.stderr)
    print("      ※ 수정용 번호는 매일 바뀝니다. 어제 안내받은 번호는 통과하지 않습니다.", file=sys.stderr)
    return False


def apply_to_ranking(player_id, changes):
    """사이트가 읽는 ranking.json에도 즉시 반영합니다 (API 호출 없음).

    이걸 하지 않으면 다음 날 04:10 자동 갱신 전까지 화면이 그대로라
    '바꿨는데 안 바뀐다'는 문의가 옵니다.
    """
    data = read_json(RANKING_FILE, None)
    if not data:
        return
    for entry in data.get("players", []):
        if entry.get("id") == player_id:
            entry.update(changes)
            write_json(RANKING_FILE, data)
            return


def main():
    ap = argparse.ArgumentParser(description="충남 아마추어 랭킹 - 선수 본인 정보 수정")
    ap.add_argument("--riot-id", required=True, help='예: "홍길동#KR1"')
    ap.add_argument("--name", default="", help="표시 닉네임 (비우면 그대로)")
    ap.add_argument("--team", default="", help="소속 (비우면 그대로)")
    ap.add_argument("--region", default="", help="지역 (비우면 그대로)")
    ap.add_argument("--position", default="", help="주 포지션 (비우면 그대로)")
    ap.add_argument("--clear-team", action="store_true", help="소속을 비웁니다 (빈 값은 \"안 바꿈\"이라 별도 플래그가 필요)")
    ap.add_argument("--skip-verify", action="store_true", help="아이콘 인증 생략 (운영자용)")
    args = ap.parse_args()

    try:
        game_name, tag_line = split_riot_id(args.riot_id)
    except ValueError as e:
        print(f"오류: {e}", file=sys.stderr)
        return 1

    data = read_json(PLAYERS_FILE, {"players": []})
    key = normalize_riot_id(game_name, tag_line)
    player = next(
        (p for p in data.get("players", [])
         if normalize_riot_id(p["gameName"], p["tagLine"]) == key),
        None,
    )
    if not player:
        print(f"오류: 등록되지 않은 Riot ID입니다 — {game_name}#{tag_line}", file=sys.stderr)
        print("      먼저 등록 페이지에서 선수 등록을 마쳐 주세요.", file=sys.stderr)
        return 1

    today = datetime.now(KST).date().isoformat()
    if player.get("lastEditAt") == today and not args.skip_verify:
        print("오류: 정보 수정은 하루 한 번만 가능합니다. 내일 다시 시도해 주세요.", file=sys.stderr)
        return 1

    # 바꿀 값 정리 — 현재 값과 같은 항목은 버립니다.
    changes = {}
    for field, raw in (
        ("name", args.name), ("team", args.team),
        ("region", args.region), ("position", args.position),
    ):
        value = sanitize(field, raw)
        if not value or value == player.get(field, ""):
            continue
        changes[field] = value

    # 빈 값은 "그대로 둠"이므로, 소속을 지우려면 별도 신호가 필요합니다.
    if args.clear_team and player.get("team"):
        changes["team"] = ""

    if changes.get("position") and changes["position"] not in POSITIONS:
        print(f"오류: 주 포지션은 {' / '.join(POSITIONS)} 중 하나여야 합니다.", file=sys.stderr)
        return 1

    if not changes:
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

        if not verify_icon(api, player, game_name, tag_line):
            return 1

    print(f"수정: {player['id']} · {player.get('name')}")
    for field, value in changes.items():
        print(f"  · {field}: {player.get(field, '')!r} → {value!r}")

    player.update(changes)
    player["lastEditAt"] = today
    data["updatedAt"] = datetime.now(KST).isoformat(timespec="seconds")
    write_json(PLAYERS_FILE, data)
    apply_to_ranking(player["id"], changes)
    print("완료: 랭킹 화면에 바로 반영됩니다.")
    return 0


if __name__ == "__main__":
    sys.exit(main())
