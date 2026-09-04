"""
선수 등록 (운영자용) — data/players.json 에 한 명을 추가합니다.

1) Riot ID → puuid 변환
2) 프로필 아이콘 인증: 신청자가 등록 페이지에 안내된 번호로 아이콘을 바꿨는지 확인
   (API로 검증 가능한 유일한 계정 소유 증명입니다)

사용법:
  python scripts/add_player.py --riot-id "홍길동#KR1" --name 홍길동 --team OO고등학교 \
      --region 천안 --position 미드
옵션:
  --skip-verify   아이콘 인증 없이 등록 (오프라인에서 본인 확인을 끝낸 경우)
  --no-approve    승인 대기 상태로 등록 (랭킹에 노출되지 않음)
"""

import argparse
import json
import os
import re
import sys
import time
from datetime import datetime, timedelta, timezone

from riot import NotFound, RiotAPI, RiotError, expected_icon_id, normalize_riot_id, split_riot_id

KST = timezone(timedelta(hours=9))
ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
PLAYERS_FILE = os.path.join(ROOT, "data", "players.json")


def load_players():
    try:
        with open(PLAYERS_FILE, encoding="utf-8") as f:
            data = json.load(f)
    except (FileNotFoundError, json.JSONDecodeError):
        data = {}
    data.setdefault("players", [])
    return data


def save_players(data):
    data["updatedAt"] = datetime.now(KST).isoformat(timespec="seconds")
    os.makedirs(os.path.dirname(PLAYERS_FILE), exist_ok=True)
    with open(PLAYERS_FILE, "w", encoding="utf-8") as f:
        json.dump(data, f, ensure_ascii=False, indent=2)
        f.write("\n")


def next_id(players):
    used = {int(m.group(1)) for p in players if (m := re.fullmatch(r"p(\d+)", p.get("id", "")))}
    return "p{:03d}".format(max(used, default=0) + 1)


def main():
    ap = argparse.ArgumentParser(description="충남 아마추어 랭킹 - 선수 등록")
    ap.add_argument("--riot-id", required=True, help='예: "홍길동#KR1"')
    ap.add_argument("--name", default="", help="랭킹에 표시할 닉네임 (비우면 게임 닉네임 사용)")
    ap.add_argument("--team", default="", help="소속 (학교/팀/클럽)")
    ap.add_argument("--region", default="", help="지역 (예: 천안, 아산)")
    ap.add_argument("--position", default="", help="주 포지션")
    ap.add_argument("--pro", action="store_true", help="프로 트라이아웃 희망 선수 (랭킹에 ★ 표시)")
    ap.add_argument("--skip-verify", action="store_true", help="아이콘 인증 생략")
    ap.add_argument("--no-approve", action="store_true", help="승인 대기 상태로 등록")
    args = ap.parse_args()

    try:
        game_name, tag_line = split_riot_id(args.riot_id)
    except ValueError as e:
        print(f"오류: {e}", file=sys.stderr)
        return 1

    data = load_players()
    key = normalize_riot_id(game_name, tag_line)
    for p in data["players"]:
        if normalize_riot_id(p["gameName"], p["tagLine"]) == key:
            print(f"오류: 이미 등록된 Riot ID입니다 ({p['id']} / {p.get('name')})", file=sys.stderr)
            return 1

    api = RiotAPI(os.environ.get("RIOT_API_KEY", "").strip())

    try:
        account = api.account_by_riot_id(game_name, tag_line)
    except NotFound:
        print(f"오류: 존재하지 않는 Riot ID입니다 — {game_name}#{tag_line}", file=sys.stderr)
        print("      대소문자는 상관없지만 띄어쓰기와 태그(#뒤)는 정확해야 합니다.", file=sys.stderr)
        return 1
    except RiotError as e:
        print(f"오류: 계정 조회 실패 — {e}", file=sys.stderr)
        return 1

    puuid = account["puuid"]
    game_name = account.get("gameName", game_name)  # Riot이 돌려준 정식 표기 사용
    tag_line = account.get("tagLine", tag_line)

    if not args.skip_verify:
        want = expected_icon_id(game_name, tag_line)
        # Riot 서버가 아이콘 변경을 늦게 반영하는 경우가 잦아, 한 번 더 기다렸다 확인합니다.
        attempts = max(1, int(os.environ.get("VERIFY_ATTEMPTS", "3")))
        delay = int(os.environ.get("VERIFY_DELAY", "25"))
        got = None
        for i in range(attempts):
            if i:
                print(f"    · 아이콘이 아직 {want}번이 아닙니다(현재 {got}번). "
                      f"{delay}초 후 재확인 ({i + 1}/{attempts})")
                time.sleep(delay)
            try:
                summoner = api.summoner_by_puuid(puuid)
            except RiotError as e:
                print(f"오류: 소환사 조회 실패 — {e}", file=sys.stderr)
                return 1
            got = summoner.get("profileIconId")
            if got == want:
                break

        if got != want:
            print(f"인증 실패: 현재 아이콘 {got}번, 필요한 아이콘 {want}번", file=sys.stderr)
            print("      신청자가 게임에서 프로필 아이콘을 바꾸고 로비로 나온 뒤 다시 시도하세요.", file=sys.stderr)
            print(f"      ({attempts}회 확인했으나 계속 {got}번이었습니다. "
                  "변경 직후라면 몇 분 뒤 다시 신청해 주세요)", file=sys.stderr)
            return 1
        print(f"인증 성공: 프로필 아이콘 {want}번 확인")

    player = {
        "id": next_id(data["players"]),
        "name": args.name.strip() or game_name,
        "gameName": game_name,
        "tagLine": tag_line,
        "puuid": puuid,
        "team": args.team.strip(),
        "region": args.region.strip(),
        "position": args.position.strip(),
        "proAspirant": args.pro,
        "approved": not args.no_approve,
        "verified": not args.skip_verify,
        "registeredAt": datetime.now(KST).date().isoformat(),
    }
    data["players"].append(player)
    save_players(data)

    state = "승인 완료" if player["approved"] else "승인 대기"
    star = " ★프로지망" if args.pro else ""
    print(f"등록됨: {player['id']} · {player['name']}{star} ({game_name}#{tag_line}) · {state}")
    if args.pro:
        print("      ※ 실명·연락처·이메일은 저장소에 저장하지 않았습니다.")
        print("         트라이아웃 연락처는 구글 드라이브 명단에서만 관리하세요.")
    return 0


if __name__ == "__main__":
    sys.exit(main())
