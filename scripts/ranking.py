"""정렬 점수 계산 및 티어 표기 유틸"""

TIERS = [
    "IRON", "BRONZE", "SILVER", "GOLD", "PLATINUM",
    "EMERALD", "DIAMOND", "MASTER", "GRANDMASTER", "CHALLENGER",
]
DIVISIONS = {"IV": 0, "III": 1, "II": 2, "I": 3}
APEX = ("MASTER", "GRANDMASTER", "CHALLENGER")

TIER_KO = {
    "IRON": "아이언", "BRONZE": "브론즈", "SILVER": "실버", "GOLD": "골드",
    "PLATINUM": "플래티넘", "EMERALD": "에메랄드", "DIAMOND": "다이아몬드",
    "MASTER": "마스터", "GRANDMASTER": "그랜드마스터", "CHALLENGER": "챌린저",
}


def score(tier, division, lp):
    """
    티어·디비전·LP를 하나의 정수로 눌러 정렬 가능하게 만듭니다.
    다이아 I 100LP = 2800, 마스터 0LP = 2800 으로 자연스럽게 이어집니다.
    랭크가 없으면 None (정렬 시 맨 뒤).
    """
    if not tier:
        return None
    tier = tier.upper()
    if tier not in TIERS:
        return None
    lp = int(lp or 0)
    if tier in APEX:
        return TIERS.index("MASTER") * 400 + lp
    return TIERS.index(tier) * 400 + DIVISIONS.get((division or "IV").upper(), 0) * 100 + lp


def label(tier, division, lp):
    """'골드 II 45LP' 형태의 표시 문자열"""
    if not tier:
        return "언랭크"
    tier = tier.upper()
    name = TIER_KO.get(tier, tier)
    if tier in APEX:
        return f"{name} {int(lp or 0)}LP"
    return f"{name} {division} {int(lp or 0)}LP"


def sort_key(entry):
    """랭킹 정렬 키(오름차순 정렬용) — 점수 높은 순, 언랭크는 맨 뒤, 동점이면 승수 → 이름 순"""
    s = entry.get("score")
    return (1 if s is None else 0, -(s or 0), -entry.get("wins", 0), entry.get("name", ""))
