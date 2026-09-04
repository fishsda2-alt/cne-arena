"""
아이콘 재인증 — 정보 수정(self_edit)과 등록 삭제(self_remove)가 함께 씁니다.

등록 때와 달리 번호가 날짜마다 바뀌고, 용도(수정/삭제)에 따라서도 갈립니다.
이유는 scripts/riot.py 의 challenge_icon_id 주석을 보세요.
"""

import os
import sys
import time
from datetime import timedelta

from riot import NotFound, RiotError, challenge_icon_id

# 자정 직전에 페이지를 열고 자정 직후에 제출하면 안내받은 번호가 '어제 번호'가 됩니다.
# 그 시간대에 한해 어제 번호도 인정합니다 (통과 가능한 번호가 늘어나므로 새벽에만).
GRACE_UNTIL_HOUR = 3


def accepted_icons(game_name, tag_line, now, purpose="edit"):
    """지금 인정되는 인증 아이콘 번호들 (보통 1개, 새벽에는 어제 것도 함께)"""
    today = now.date()
    days = [today.isoformat()]
    if now.hour < GRACE_UNTIL_HOUR:
        days.append((today - timedelta(days=1)).isoformat())
    return {challenge_icon_id(game_name, tag_line, purpose, d) for d in days}


def verify_icon(api, puuid, game_name, tag_line, purpose, label):
    """프로필 아이콘이 오늘의 인증 번호인지 확인합니다. label 은 안내 문구용('수정'/'삭제')."""
    from datetime import datetime

    from riot import KST

    want = accepted_icons(game_name, tag_line, datetime.now(KST), purpose)
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
            summoner = api.summoner_by_puuid(puuid)
        except NotFound:
            print("인증 불가: 이 Riot 계정에는 리그 오브 레전드 기록이 없습니다.", file=sys.stderr)
            print("      본인 확인은 롤 프로필 아이콘으로만 할 수 있습니다. "
                  "운영자에게 문의해 주세요.", file=sys.stderr)
            return False
        except RiotError as e:
            print(f"오류: 소환사 조회 실패 — {e}", file=sys.stderr)
            return False
        got = summoner.get("profileIconId")
        if got in want:
            print(f"인증 성공: 프로필 아이콘 {got}번 확인")
            return True

    print(f"인증 실패: 현재 아이콘 {got}번, 필요한 아이콘 {shown}번", file=sys.stderr)
    print(f"      {label} 페이지에 나온 번호로 아이콘을 바꾸고 로비로 나온 뒤 다시 신청하세요.",
          file=sys.stderr)
    print("      ※ 번호는 매일 바뀌고, 수정용과 삭제용도 서로 다릅니다.", file=sys.stderr)
    return False
