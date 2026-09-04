/**
 * 사이트 설정 — 여기만 고치면 모든 페이지에 반영됩니다.
 */
const SITE = {
  name: "충남 아마추어 LoL 랭킹",
  short: "CN RANK",
  description: "충남 지역 아마추어 선수들의 솔로랭크 티어를 매일 자동으로 집계합니다.",
  contact: "fishsda2@gmail.com",
  // 일반 등록 신청 구글 폼 (닉네임·지역·포지션만 받습니다. 개인정보 받지 마세요)
  formUrl: "",
  // 프로 트라이아웃 희망자 전용 구글 폼 (이름·연락처·이메일 수집 — 응답은 드라이브에만 남습니다)
  proFormUrl: "",
  // 운영자 GitHub 저장소 (등록 신청 안내용, 비워도 됩니다)
  repoUrl: ""
};

/** 지역 필터 목록 (충남 시·군) */
const REGIONS = [
  "천안", "공주", "보령", "아산", "서산", "논산", "계룡", "당진",
  "금산", "부여", "서천", "청양", "홍성", "예산", "태안"
];

/** 포지션 목록 */
const POSITIONS = ["탑", "정글", "미드", "원딜", "서포터"];

/** 티어 표시 정보 (색상은 티어 배지에 사용) */
const TIER_INFO = {
  CHALLENGER:  { ko: "챌린저",       color: "#f4c874" },
  GRANDMASTER: { ko: "그랜드마스터", color: "#e8515a" },
  MASTER:      { ko: "마스터",       color: "#c471ed" },
  DIAMOND:     { ko: "다이아몬드",   color: "#5b8dff" },
  EMERALD:     { ko: "에메랄드",     color: "#2fbf8f" },
  PLATINUM:    { ko: "플래티넘",     color: "#4ec5c1" },
  GOLD:        { ko: "골드",         color: "#d5a54a" },
  SILVER:      { ko: "실버",         color: "#9aa5bb" },
  BRONZE:      { ko: "브론즈",       color: "#b07a4f" },
  IRON:        { ko: "아이언",       color: "#7c7c7c" }
};

/** 프로필 아이콘 이미지 (버전 무관 CDN) */
function profileIconUrl(id) {
  return `https://raw.communitydragon.org/latest/plugins/rcp-be-lol-game-data/global/default/v1/profile-icons/${id}.jpg`;
}
