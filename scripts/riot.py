"""
Riot API 클라이언트 — 표준 라이브러리만 사용합니다 (pip install 불필요).

개발용 키 기본 제한: 초당 20건 / 2분당 100건.
두 제한을 모두 지키도록 요청 전에 스스로 대기하며, 429가 오면 Retry-After만큼 쉬었다 재시도합니다.
"""

import json
import os
import time
import urllib.error
import urllib.parse
import urllib.request
import zlib
from collections import deque

# 플랫폼 라우팅: 소환사/리그 API (한국 서버)
PLATFORM_HOST = os.environ.get("RIOT_PLATFORM", "kr") + ".api.riotgames.com"
# 지역 라우팅: 계정(Riot ID) API
REGION_HOST = os.environ.get("RIOT_REGION", "asia") + ".api.riotgames.com"

# 본인 인증용 프로필 아이콘 후보 (0~28번은 계정 생성 시 누구나 가진 기본 아이콘)
VERIFY_ICONS = list(range(0, 29))


class RiotError(Exception):
    """Riot API 호출 실패"""

    def __init__(self, status, message):
        super().__init__(f"[{status}] {message}")
        self.status = status


class NotFound(RiotError):
    """존재하지 않는 Riot ID / 랭크 정보 없음"""


def normalize_riot_id(game_name, tag_line):
    """대소문자·앞뒤 공백 차이를 없앤 비교용 문자열"""
    return f"{game_name.strip().lower()}#{tag_line.strip().lstrip('#').lower()}"


def split_riot_id(riot_id):
    """'홍길동#KR1' → ('홍길동', 'KR1')"""
    if "#" not in riot_id:
        raise ValueError(f"Riot ID에 태그(#)가 없습니다: {riot_id}")
    game_name, tag_line = riot_id.rsplit("#", 1)
    game_name, tag_line = game_name.strip(), tag_line.strip()
    if not game_name or not tag_line:
        raise ValueError(f"Riot ID 형식이 올바르지 않습니다: {riot_id}")
    return game_name, tag_line


def expected_icon_id(game_name, tag_line):
    """
    Riot ID로부터 인증용 아이콘 번호를 결정적으로 계산합니다.
    (서버 없이도 등록 페이지에서 같은 번호를 보여줄 수 있도록 js/verify.js에 동일 로직이 있습니다)
    """
    digest = zlib.crc32(normalize_riot_id(game_name, tag_line).encode("utf-8"))
    return VERIFY_ICONS[digest % len(VERIFY_ICONS)]


class RiotAPI:
    def __init__(self, api_key, per_second=20, per_two_min=100):
        if not api_key:
            raise RuntimeError(
                "RIOT_API_KEY가 비어 있습니다. "
                "GitHub 저장소 Settings > Secrets and variables > Actions 에 등록하세요."
            )
        # 붙여넣을 때 딸려오는 공백·줄바꿈은 여기서 제거하되, 있었다는 사실은 기억합니다.
        self.api_key = api_key.strip()
        self._had_whitespace = api_key != self.api_key
        self.per_second = per_second
        self.per_two_min = per_two_min
        self._recent = deque()  # 최근 요청 시각

    def key_shape(self):
        """
        키 값을 노출하지 않고 모양만 알려줍니다 (붙여넣기 실수 진단용).
        실제 키는 절대 출력하지 않습니다 — 실행 기록은 공개됩니다.
        """
        k = self.api_key
        prefix = "RGAPI-로 시작" if k.startswith("RGAPI-") else "RGAPI-로 시작하지 않음"
        extra = ", 앞뒤에 공백/줄바꿈이 섞여 있었음" if self._had_whitespace else ""
        return f"길이 {len(k)}자, {prefix}{extra}"

    def key_fingerprint(self):
        """
        키 대조용 지문 — 앞뒤 3글자만 남기고 가립니다.
        36자 중 6자만 보여주므로 이것으로 키를 복원할 수 없습니다.
        developer.riotgames.com 앱 화면의 키와 눈으로 맞춰보는 용도입니다.
        """
        k = self.api_key
        body = k[6:] if k.startswith("RGAPI-") else k
        if len(body) < 8:
            return "(너무 짧아 표시 생략)"
        return f"RGAPI-{body[:3]}…{body[-3:]}"

    # ---------- 내부 ----------

    def _throttle(self):
        while True:
            now = time.monotonic()
            while self._recent and now - self._recent[0] > 120:
                self._recent.popleft()

            in_1s = sum(1 for t in self._recent if now - t < 1)
            wait = 0.0
            if in_1s >= self.per_second:
                wait = max(wait, 1.0 - (now - self._recent[-self.per_second]))
            if len(self._recent) >= self.per_two_min:
                wait = max(wait, 120.0 - (now - self._recent[0]) + 0.1)

            if wait <= 0:
                self._recent.append(now)
                return
            time.sleep(wait)

    def _get(self, host, path, retries=3):
        url = f"https://{host}{path}"
        req = urllib.request.Request(url, headers={"X-Riot-Token": self.api_key})

        for attempt in range(retries + 1):
            self._throttle()
            try:
                with urllib.request.urlopen(req, timeout=15) as res:
                    return json.loads(res.read().decode("utf-8"))
            except urllib.error.HTTPError as e:
                if e.code == 404:
                    raise NotFound(404, path)
                if e.code in (401, 403):
                    # 키 만료·오입력이 가장 흔한 실패 원인이라 진단 정보를 함께 보여줍니다.
                    raise RiotError(
                        e.code,
                        "API 키가 거부되었습니다. "
                        f"[Secret에 들어있는 값: {self.key_shape()}] "
                        "정상값은 'RGAPI-'로 시작하는 42자입니다. "
                        "모양이 다르면 붙여넣기가 잘못된 것이고, "
                        "모양이 맞는데도 거부되면 키를 재발급한 뒤 Secret을 "
                        "다시 교체하지 않은 것입니다 (재발급하면 이전 키는 즉시 무효).",
                    )
                if e.code == 429 and attempt < retries:
                    try:
                        delay = int(e.headers.get("Retry-After", "10"))
                    except (TypeError, ValueError):
                        delay = 10
                    print(f"    · 요청 한도 초과, {delay}초 대기")
                    time.sleep(delay + 1)
                    continue
                if e.code in (500, 502, 503, 504) and attempt < retries:
                    time.sleep(2 ** attempt)
                    continue
                raise RiotError(e.code, f"{path} — {e.reason}")
            except urllib.error.URLError as e:
                if attempt < retries:
                    time.sleep(2 ** attempt)
                    continue
                raise RiotError(0, f"{path} — 네트워크 오류: {e.reason}")

        raise RiotError(0, f"{path} — 재시도 실패")

    # ---------- 공개 API ----------

    def account_by_riot_id(self, game_name, tag_line):
        """Riot ID → puuid (등록할 때 한 번만 호출)"""
        path = (
            "/riot/account/v1/accounts/by-riot-id/"
            f"{urllib.parse.quote(game_name)}/{urllib.parse.quote(tag_line)}"
        )
        return self._get(REGION_HOST, path)

    def summoner_by_puuid(self, puuid):
        """프로필 아이콘·레벨 (본인 인증 및 랭킹 표시용)"""
        return self._get(PLATFORM_HOST, f"/lol/summoner/v4/summoners/by-puuid/{puuid}")

    def league_entries_by_puuid(self, puuid):
        """솔로랭크·자유랭크 티어 정보 (하루 1회 갱신의 핵심 호출)"""
        return self._get(PLATFORM_HOST, f"/lol/league/v4/entries/by-puuid/{puuid}")
