/**
 * 사이트 설정 — 여기만 고치면 모든 페이지에 반영됩니다.
 */
const SITE = {
  name: "충남 아마추어 랭킹",
  short: "CHUNGNAM RANK.GG",
  contact: "fishsda2@gmail.com",
  // 자동 등록 주소 (Google Apps Script 웹앱). README '자동 등록 연결하기' 참고.
  //  · 설정하면 등록 페이지에서 제출하는 즉시 아이콘 인증 → 자동 등록까지 진행됩니다.
  //  · 비워두면 입력값이 채워진 이메일 창이 열리고, 운영자가 수동으로 등록합니다.
  submitUrl: "https://script.google.com/macros/s/AKfycbwSA4iSJLt3cbQFWT4YWTgbIW7mmo3F6-GlQ1FQzIHAH-XA35ddta2iH0vcD4lHXEjIHw/exec",
  // 운영자 GitHub 저장소 (등록 신청 안내용, 비워도 됩니다)
  repoUrl: "",
  // 팀 모집·대회 이야기를 나누는 디스코드 초대 링크.
  //  · 팀 구성은 사이트가 아니라 여기서 합니다. 사이트에 연락 수단을 두면
  //    개인정보를 다루게 되고, 미성년 선수가 섞여 있어 위험합니다.
  //  · **만료되지 않는 초대 링크**로 만드세요 (기본값은 7일 뒤 끊깁니다).
  //  · 비워두면 관련 안내가 화면에 나오지 않습니다.
  discordUrl: "https://discord.gg/vgKajq2gGC",
  // 방문 집계 (GoatCounter) — goatcounter.com 에서 만든 코드만 적습니다.
  //   예) 주소가 https://cnrank.goatcounter.com 이면  "cnrank"
  //  · 비워두면 집계 스크립트를 아예 불러오지 않습니다 (요청도 나가지 않습니다).
  //  · 운영 현황의 '누적 방문' 숫자를 보려면 GoatCounter 사이트 설정에서
  //    "Make counter public" (또는 대시보드 공개)을 켜야 합니다. 안 켜도 집계는 됩니다.
  goatcounter: "cnrank"
};

/** 지역 필터 목록 (충남 시·군) */
const REGIONS = [
  "천안", "공주", "보령", "아산", "서산", "논산", "계룡", "당진",
  "금산", "부여", "서천", "청양", "홍성", "예산", "태안"
];

/* ══════════════ 종목별 정보 ══════════════ */

/** 리그 오브 레전드 */
const LOL_POSITIONS = ["탑", "정글", "미드", "원딜", "서포터"];
const LOL_TIERS = {
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

/** 발로란트 (승인 대기 중 — 화면 준비용) */
const VAL_POSITIONS = ["타격대", "척후대", "감시자", "전략가"];
const VAL_TIERS = {
  RADIANT:    { ko: "레디언트",   color: "#f5e6a8" },
  IMMORTAL:   { ko: "불멸",       color: "#e8515a" },
  ASCENDANT:  { ko: "초월자",     color: "#2fbf8f" },
  DIAMOND:    { ko: "다이아몬드", color: "#b57bee" },
  PLATINUM:   { ko: "플래티넘",   color: "#4ec5c1" },
  GOLD:       { ko: "골드",       color: "#d5a54a" },
  SILVER:     { ko: "실버",       color: "#9aa5bb" },
  BRONZE:     { ko: "브론즈",     color: "#b07a4f" },
  IRON:       { ko: "아이언",     color: "#7c7c7c" }
};

/**
 * 종목 목록 — 종목을 하나 늘리려면 여기에 한 칸을 추가하면 됩니다.
 * 화면(js/ranking.js)은 이 목록만 읽고 그리므로 HTML은 건드릴 필요가 없습니다.
 *
 * status
 *   "live"      — 랭킹표를 그립니다. dataFile 이 실제로 있어야 합니다.
 *   "preparing" — 탭은 보이되 표 대신 notice 문구를 띄웁니다. (데이터가 아직 없을 때)
 *
 * dataFile 은 종목마다 하나씩 둡니다. 티어 체계도 점수 환산도 종목마다 달라서
 * 한 파일에 합치면 오히려 복잡해집니다.
 * (롤만 이름에 종목이 없는 것은, 지금 돌고 있는 워크플로가 쓰는 경로라서입니다)
 */
const GAMES = [
  {
    id: "lol",
    name: "리그 오브 레전드",
    short: "LoL",
    accent: "#4f8cff",
    accentHover: "#6da1ff",
    status: "live",
    basis: "솔로랭크 기준",
    description: "충남 지역 아마추어 선수들의 솔로랭크 티어를 매일 자동으로 집계합니다.",
    dataFile: "data/ranking.json",
    sampleFile: "data/ranking.sample.json",
    positions: LOL_POSITIONS,
    tiers: LOL_TIERS,
    unit: "LP",
    /** 평균 점수를 다시 티어 문자열로 (요약 카드용) — 점수 체계가 종목마다 달라 여기 둡니다 */
    avgLabel(score) {
      const order = ["IRON", "BRONZE", "SILVER", "GOLD", "PLATINUM", "EMERALD", "DIAMOND"];
      const divs = ["IV", "III", "II", "I"];
      if (score >= 2800) return `마스터+ ${score - 2800}LP`;
      const t = Math.min(Math.floor(score / 400), order.length - 1);
      const d = Math.min(Math.floor((score - t * 400) / 100), 3);
      return `${LOL_TIERS[order[t]].ko} ${divs[d]}`;
    }
  },
  {
    id: "val",
    name: "발로란트",
    short: "VALORANT",
    accent: "#ff4655",
    accentHover: "#ff6b78",
    status: "preparing",
    basis: "경쟁전 기준",
    description: "충남 지역 아마추어 선수들의 발로란트 경쟁전 티어를 집계할 예정입니다.",
    notice: {
      title: "발로란트는 준비 중입니다",
      body: [
        "Riot에 발로란트 API 사용 승인을 신청해 둔 상태입니다. 승인이 나야 티어를 자동으로 가져올 수 있어서, 그전까지는 랭킹을 열지 않습니다.",
        "본인 인증은 이미 준비돼 있습니다. Riot 계정이 롤과 같기 때문에, 지금 쓰는 프로필 아이콘 인증을 그대로 씁니다. 발로란트만 하는 선수는 별도 방법을 마련할 예정입니다.",
        "열리면 이 자리에 랭킹표가 그대로 나타납니다. 지금 롤로 등록해 두시면 발로란트가 열릴 때 다시 등록하지 않아도 됩니다."
      ]
    },
    dataFile: "data/ranking.val.json",
    positions: VAL_POSITIONS,
    tiers: VAL_TIERS,
    unit: "RR"
  }
];

/** id로 종목 찾기 (없으면 null) */
function gameById(id) {
  return GAMES.find((g) => g.id === id) || null;
}

/**
 * 선수 한 명이 등록한 종목 정보 — { lol: {position}, ... }
 *
 * players.json 이 아직 옛 형식(최상위 position, games 없음)일 수도 있어
 * 그 경우 롤 한 종목으로 봅니다. 배포가 잠깐 어긋나도 화면이 비지 않도록.
 */
function playerGames(player) {
  if (player && player.games && typeof player.games === "object") return player.games;
  return { lol: { position: (player && player.position) || "" } };
}

/** 처음 보여줄 종목 — 운영 중인 것 중 첫 번째 */
function defaultGame() {
  return GAMES.find((g) => g.status === "live") || GAMES[0];
}

/**
 * 등록·수정 페이지는 아직 롤 전용입니다. 그 페이지들이 쓰는 이름을 남겨 둡니다.
 * (발로란트 등록을 열 때 이 두 줄을 걷어내고 종목 선택을 붙이면 됩니다)
 */
const POSITIONS = LOL_POSITIONS;
const TIER_INFO = LOL_TIERS;

/** 프로필 아이콘 이미지 (버전 무관 CDN) */
function profileIconUrl(id) {
  return `https://raw.communitydragon.org/latest/plugins/rcp-be-lol-game-data/global/default/v1/profile-icons/${id}.jpg`;
}
