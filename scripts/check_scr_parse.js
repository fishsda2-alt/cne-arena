/**
 * 스타크래프트 래더 화면 글자 → 등급·레이팅·전적 추려내기(js/scr-parse.js) 시험.
 *
 * 인식기가 실제로 내놓는 모양(한글 사이 빈칸, 연도 섞임, 이름표 없이 숫자만 등)을
 * 흉내 낸 글자로 확인합니다. 추출기를 고친 뒤에는 반드시 돌리세요.
 * 틀리게 채우는 것이 비워 두는 것보다 나쁘므로, "안 채워야 하는 경우"도 함께 봅니다.
 *
 *   node scripts/check_scr_parse.js
 */

const path = require("path");
const { parseLadderText } = require(path.join(__dirname, "..", "js", "scr-parse.js"));

const cases = [
  {
    name: "한글 화면 · 이름표 있음",
    text: "래더 시즌 2026\n등급 B\n레이팅 1856\n120승 98패\n순위 1,234위",
    want: { grade: "B", rating: 1856, wins: 120, losses: 98, ladderRank: 1234 },
  },
  {
    name: "영문 화면",
    text: "LADDER\nRANK B\nRating: 2105\n340 W   280 L\nRank: #512",
    want: { grade: "B", rating: 2105, wins: 340, losses: 280, ladderRank: 512 },
  },
  {
    name: "이름표 없이 숫자만 (등급 글자 한 줄)",
    text: "A\n2231\n412 - 377",
    want: { grade: "A", rating: 2231, wins: 412, losses: 377, ladderRank: null },
  },
  {
    name: "시즌 연도가 섞임",
    text: "시즌 2026\nS\n3012\n801-402",
    want: { grade: "S", rating: 3012, wins: 801, losses: 402, ladderRank: null },
  },
  {
    name: "인식기가 한글 사이에 빈칸을 끼움",
    text: "등 급 C\n레 이 팅 1,432\n55 승 61 패",
    want: { grade: "C", rating: 1432, wins: 55, losses: 61, ladderRank: null },
  },
  {
    name: "배치 전",
    text: "등급 U\n0승 0패",
    want: { grade: "U", rating: null, wins: 0, losses: 0, ladderRank: null },
  },
  {
    name: "B등급 순서 반대",
    text: "B등급  레이팅 1700  10승 5패",
    want: { grade: "B", rating: 1700, wins: 10, losses: 5, ladderRank: null },
  },
  {
    name: "아무것도 못 읽음",
    text: "",
    want: { grade: null, rating: null, wins: null, losses: null, ladderRank: null },
  },
  {
    name: "날짜만 있는 잡음 — 전적·레이팅으로 오인하면 안 됨",
    text: "2026-09 업데이트 안내",
    want: { grade: null, rating: null, wins: null, losses: null, ladderRank: null },
  },
  {
    name: "영문 소문자 단어 속 글자를 등급으로 오인하면 안 됨",
    text: "Best of luck\nrank a",
    want: { grade: null, rating: null, wins: null, losses: null, ladderRank: null },
  },

  /* ── 실제 인식 결과 (브라우저에서 tesseract.js 가 그림을 읽고 내놓은 글자 그대로) ── */
  {
    name: "실제 인식 1 — 등급 B를 숫자 8로 읽음, 패 앞에 밑줄 잡음",
    text: "래더\n\n시즌 2026\n등급 8\n레이팅 1856\n120승 _98패\n순위 1,234위",
    want: { grade: "B", rating: 1856, wins: 120, losses: 98, ladderRank: 1234 },
  },
  {
    name: "실제 인식 2 — 색 글자, 휘장 글자가 이름표와 한 줄, '431승'을 '315'로 잘못 읽음",
    text: "래더 프로필\n천안테란\nA       레이팅\n2,210\n315    360패      승률 54.5%\n전체 순위 1,502위\n2026-09 시즌 진행 중",
    // 승은 틀린 숫자로 채우지 않고 비워야 합니다 (선수가 직접 입력)
    want: { grade: "A", rating: 2210, wins: null, losses: 360, ladderRank: 1502 },
  },

  /* ── 좁혀 둔 규칙이 엉뚱한 곳에 걸리지 않는지 ── */
  {
    name: "'Rank 5' 는 순위일 수 있으니 S로 바꾸면 안 됨",
    text: "Rank 5\n레이팅 1700",
    want: { grade: null, rating: 1700, wins: null, losses: null, ladderRank: null },
  },
  {
    name: "문장 첫 글자 'A' (빈칸 한 칸) 는 등급이 아님",
    text: "A new season begins\nRating 1650",
    want: { grade: null, rating: 1650, wins: null, losses: null, ladderRank: null },
  },
  {
    name: "등급 뒤 두 자리 숫자는 등급으로 바꾸지 않음",
    text: "등급 85\n레이팅 1500",
    want: { grade: null, rating: 1500, wins: null, losses: null, ladderRank: null },
  },
];

let fail = 0;
for (const c of cases) {
  const got = parseLadderText(c.text);
  const diffs = Object.keys(c.want).filter((k) => got[k] !== c.want[k]);
  if (diffs.length) {
    fail++;
    console.log(`FAIL ${c.name}`);
    for (const k of diffs) console.log(`     ${k}: 나온 값 ${got[k]} / 기대 ${c.want[k]}`);
  } else {
    console.log(`OK   ${c.name}  (${got.found.join(", ") || "채운 칸 없음"})`);
  }
}
console.log(fail ? `\n실패 ${fail}건` : "\n전부 통과");
process.exit(fail ? 1 : 0);
