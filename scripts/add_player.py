"""
선수 등록 — data/players.json 에 한 명(또는 이미 있는 선수에게 종목 하나)을 추가합니다.

1) Riot ID → puuid 변환 (account-v1)
2) 프로필 아이콘 인증: 신청자가 등록 페이지에 안내된 번호로 아이콘을 바꿨는지 확인
   (API로 검증 가능한 유일한 계정 소유 증명입니다)

인증은 **롤 프로필 아이콘**으로 합니다. Riot 계정 하나에 puuid가 하나라서,
롤로 소유를 증명하면 같은 계정의 발로란트도 본인 것이 됩니다.
그래서 발로란트 등록에는 발로란트 API 권한이 필요하지 않습니다.
(필요한 건 티어 수집이고, 그건 승인이 나야 합니다)

사용법:
  python scripts/add_player.py --riot-id "홍길동#KR1" --game lol --name 홍길동 \
      --team OO고등학교 --region 천안 --position 미드
옵션:
  --game          lol | val   (기본 lol)
  --skip-verify   아이콘 인증 없이 등록 (오프라인에서 본인 확인을 끝낸 경우)
  --no-approve    승인 대기 상태로 등록 (랭킹에 노출되지 않음)
"""

import argparse
import os
import re
import sys
import time
from datetime import datetime, timedelta, timezone

import players as P
from riot import NotFound, RiotAPI, RiotError, expected_icon_id, split_riot_id

KST = timezone(timedelta(hours=9))


def next_id(existing):
    used = {int(m.group(1)) for p in existing if (m := re.fullmatch(r"p(\d+)", p.get("id", "")))}
    return "p{:03d}".format(max(used, default=0) + 1)


def verify_icon(api, puuid, game_name, tag_line):
    """프로필 아이콘이 안내한 번호로 바뀌었는지 확인합니다."""
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
        except NotFound:
            # 롤을 한 번도 하지 않은 계정입니다. 아이콘 인증 자체가 불가능합니다.
            print("인증 불가: 이 Riot 계정에는 리그 오브 레전드 기록이 없습니다.", file=sys.stderr)
            print("      본인 확인은 롤 프로필 아이콘으로만 할 수 있습니다.", file=sys.stderr)
            print("      발로란트만 하는 선수는 운영자에게 문의해 주세요 "
                  "(수동 확인 후 --skip-verify 로 등록).", file=sys.stderr)
            return False
        except RiotError as e:
            print(f"오류: 소환사 조회 실패 — {e}", file=sys.stderr)
            return False
        got = summoner.get("profileIconId")
        if got == want:
            print(f"인증 성공: 프로필 아이콘 {want}번 확인")
            return True

    print(f"인증 실패: 현재 아이콘 {got}번, 필요한 아이콘 {want}번", file=sys.stderr)
    print("      신청자가 게임에서 프로필 아이콘을 바꾸고 로비로 나온 뒤 다시 시도하세요.", file=sys.stderr)
    print(f"      ({attempts}회 확인했으나 계속 {got}번이었습니다. "
          "변경 직후라면 몇 분 뒤 다시 신청해 주세요)", file=sys.stderr)
    return False


def main():
    ap = argparse.ArgumentParser(description="충남 아마추어 랭킹 - 선수 등록")
    ap.add_argument("--riot-id", required=True, help='예: "홍길동#KR1"')
    ap.add_argument("--game", default=P.DEFAULT_GAME, choices=sorted(P.POSITIONS),
                    help="등록할 종목 (기본 lol)")
    ap.add_argument("--name", default="", help="랭킹에 표시할 닉네임 (비우면 게임 닉네임 사용)")
    ap.add_argument("--team", default="", help="소속 (학교/팀/클럽)")
    ap.add_argument("--region", default="", help="지역 (예: 천안, 아산)")
    ap.add_argument("--position", default="", help="주 포지션 (종목마다 목록이 다릅니다)")
    ap.add_argument("--pro", action="store_true", help="프로 트라이아웃 희망 선수 (랭킹에 ★ 표시)")
    ap.add_argument("--skip-verify", action="store_true", help="아이콘 인증 생략")
    ap.add_argument("--no-approve", action="store_true", help="승인 대기 상태로 등록")
    args = ap.parse_args()

    game = args.game
    label = P.game_name(game)

    try:
        game_name, tag_line = split_riot_id(args.riot_id)
    except ValueError as e:
        print(f"오류: {e}", file=sys.stderr)
        return 1

    position = args.position.strip()
    if not P.valid_position(game, position):
        print(f"오류: {label}의 주 포지션은 "
              f"{' / '.join(P.POSITIONS[game])} 중 하나여야 합니다.", file=sys.stderr)
        return 1

    data = P.load()
    existing = P.find_by_riot_id(data["players"], game_name, tag_line)
    if existing and P.has_game(existing, game):
        print(f"오류: 이미 {label}에 등록된 Riot ID입니다 "
              f"({existing['id']} / {existing.get('name')})", file=sys.stderr)
        print("      정보를 바꾸시려면 사이트의 '정보 수정' 페이지를 이용하세요.", file=sys.stderr)
        return 1

    api = None
    if existing:
        # 이미 등록된 선수에게 종목만 더하는 경우입니다. puuid를 이미 알고 있으므로
        # 계정 조회를 한 번 아낍니다. 인증은 그 puuid의 아이콘으로 하므로,
        # 사이에 Riot ID가 남에게 넘어갔더라도 남이 통과할 수는 없습니다.
        puuid = existing["puuid"]
        game_name, tag_line = existing["gameName"], existing["tagLine"]
    else:
        api = RiotAPI(os.environ.get("RIOT_API_KEY", ""))
        try:
            account = api.account_by_riot_id(game_name, tag_line)
        except NotFound:
            print(f"오류: 존재하지 않는 Riot ID입니다 — {game_name}#{tag_line}", file=sys.stderr)
            print("      대소문자는 상관없지만 띄어쓰기와 태그(#뒤)는 정확해야 합니다.",
                  file=sys.stderr)
            return 1
        except RiotError as e:
            print(f"오류: 계정 조회 실패 — {e}", file=sys.stderr)
            return 1

        puuid = account["puuid"]
        game_name = account.get("gameName", game_name)  # Riot이 돌려준 정식 표기 사용
        tag_line = account.get("tagLine", tag_line)

    if not args.skip_verify:
        api = api or RiotAPI(os.environ.get("RIOT_API_KEY", ""))
        if not verify_icon(api, puuid, game_name, tag_line):
            return 1

    # 이미 등록된 선수라면 종목만 하나 더 붙입니다. 표시 정보는 건드리지 않습니다
    # (바꾸고 싶으면 '정보 수정'에서 하도록 — 여기서 덮어쓰면 의도치 않게 바뀝니다).
    if existing:
        P.add_game(existing, game, position)
        P.save(data)
        print(f"종목 추가: {existing['id']} · {existing.get('name')} 에 {label} 등록")
        print(f"      이 선수의 등록 종목: {', '.join(P.game_name(g) for g in P.games_of(existing))}")
        return 0

    player = {
        "id": next_id(data["players"]),
        "name": args.name.strip() or game_name,
        "gameName": game_name,
        "tagLine": tag_line,
        "puuid": puuid,
        "team": args.team.strip(),
        "region": args.region.strip(),
        # 프로 트라이아웃 희망 선수 (랭킹표에 ★ 표시).
        # 실명·연락처·이메일은 저장소에 저장하지 않습니다 — 이 플래그만 공개됩니다.
        "proAspirant": args.pro,
        "approved": not args.no_approve,
        "verified": not args.skip_verify,
        "registeredAt": datetime.now(KST).date().isoformat(),
        "games": {game: {"position": position}},
    }
    data["players"].append(player)
    P.save(data)

    state = "승인 완료" if player["approved"] else "승인 대기"
    star = " ★프로지망" if args.pro else ""
    print(f"등록됨: {player['id']} · {player['name']}{star} "
          f"({game_name}#{tag_line}) · {label} · {state}")
    if args.pro:
        print("      ※ 실명·연락처·이메일은 저장소에 저장하지 않았습니다.")
        print("         트라이아웃 연락처는 구글 드라이브 명단에서만 관리하세요.")
    return 0


if __name__ == "__main__":
    sys.exit(main())
