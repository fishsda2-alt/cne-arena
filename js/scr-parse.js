/**
 * 스타크래프트: 리마스터 래더 화면에서 읽어낸 글자 → 등급·레이팅·전적 추려내기
 *
 * 브라우저(js/scr.js)와 node(scripts/check_scr_parse.js 시험) 양쪽에서 씁니다.
 *
 * 글자 인식은 틀립니다. 게임 화면 글꼴 + 어두운 배경이라 특히 그렇습니다.
 * 그래서 여기서 찾은 값은 **입력칸을 미리 채워 두는 용도**일 뿐이고,
 * 선수 본인이 스크린샷과 대조해 확인·수정한 값만 제출됩니다.
 * 확실하지 않으면 추측하지 말고 비워 두는 편이 낫습니다 — 빈칸은 눈에 띄지만,
 * 그럴듯한 틀린 숫자는 그대로 넘어갑니다.
 */
(function (root) {
  "use strict";

  /** 높은 등급부터. U = 배치 전 */
  const GRADES = ["S", "A", "B", "C", "D", "E", "F", "U"];

  const RATING_MIN = 500;
  const RATING_MAX = 4000;
  const COUNT_MAX = 100000;

  function toInt(s) {
    const n = parseInt(String(s).replace(/[,.\s]/g, ""), 10);
    return Number.isFinite(n) ? n : null;
  }

  /** 연도처럼 보이는 숫자 (시즌 표시 등에 섞여 나옴) */
  function looksLikeYear(n) {
    return n >= 2017 && n <= 2099;
  }

  function parseLadderText(raw) {
    const text = String(raw || "")
      .replace(/\r/g, "")
      .replace(/[|｜]/g, " ")
      .replace(/：/g, ":")
      .replace(/，/g, ",")
      .replace(/＃/g, "#");

    const lines = text.split("\n").map((l) => l.trim()).filter(Boolean);
    const flat = lines.join(" ").replace(/\s+/g, " ");
    // 인식기가 한글 사이에 빈칸을 끼워 넣는 일이 잦습니다 ("레 이 팅").
    const compact = flat.replace(/([가-힣])\s+(?=[가-힣])/g, "$1");

    const out = { grade: null, rating: null, wins: null, losses: null, ladderRank: null, found: [] };
    let m;

    /* ── 승·패 ── */
    m = compact.match(/(\d[\d,]*)\s*승/);
    if (m) out.wins = toInt(m[1]);
    m = compact.match(/(\d[\d,]*)\s*패/);
    if (m) out.losses = toInt(m[1]);

    if (out.wins === null) {
      m = flat.match(/(\d[\d,]*)\s*W(?:ins?)?(?![A-Za-z])/);
      if (m) out.wins = toInt(m[1]);
    }
    if (out.losses === null) {
      m = flat.match(/(\d[\d,]*)\s*L(?:oss(?:es)?)?(?![A-Za-z])/);
      if (m) out.losses = toInt(m[1]);
    }
    if (out.wins === null && out.losses === null) {
      // "120 - 98" 처럼 전적만 붙어 나오는 경우. 날짜(2026-09)는 거릅니다.
      const re = /(?<![\d.])(\d{1,5})\s*[-–\/]\s*(\d{1,5})(?![\d.])/g;
      while ((m = re.exec(flat))) {
        const a = toInt(m[1]);
        const b = toInt(m[2]);
        if (looksLikeYear(a) && b <= 12) continue;
        out.wins = a;
        out.losses = b;
        break;
      }
    }
    if (out.wins !== null && out.wins > COUNT_MAX) out.wins = null;
    if (out.losses !== null && out.losses > COUNT_MAX) out.losses = null;

    /* ── 래더 순위 (몇 위) ── */
    m = compact.match(/(\d[\d,]*)\s*위/)
      || compact.match(/순위\s*:?\s*#?\s*(\d[\d,]*)/)
      || flat.match(/(?:Rank(?:ing)?|RANK(?:ING)?)\s*:?\s*#\s*(\d[\d,]*)/)
      || flat.match(/#\s*(\d[\d,]*)/);
    if (m) {
      const n = toInt(m[1]);
      if (n !== null && n > 0 && n <= 10000000) out.ladderRank = n;
    }

    /* ── 등급 ── */
    // "등급 B", "Rank: B", "B등급", "B 랭크" — 등급 글자는 대문자 하나만 인정합니다.
    m = compact.match(/(?:등급|랭크)\s*:?\s*([SABCDEFU])(?![A-Za-z])/)
      || flat.match(/(?:Rank|RANK|Tier|TIER|Grade|GRADE)\s*:?\s*([SABCDEFU])(?![A-Za-z])/)
      || compact.match(/(?<![A-Za-z])([SABCDEFU])\s*(?:등급|랭크)/);
    if (!m) {
      // 인식기가 등급 글자를 숫자로 읽는 일이 잦습니다 (실제로 B를 8로 읽었습니다).
      // 뜻이 분명한 이름표(등급·Grade·Tier) 바로 뒤에 숫자 한 글자만 있을 때만 되돌립니다.
      // "Rank 5"·"랭크 5" 는 순위일 수도 있어 제외합니다.
      const LOOKALIKE = { 8: "B", 5: "S" };
      const d = compact.match(/등급\s*:?\s*([85])(?![\d,.])/)
        || flat.match(/(?:Grade|GRADE|Tier|TIER)\s*:?\s*([85])(?![\d,.])/);
      if (d) m = [d[0], LOOKALIKE[d[1]]];
    }
    if (m) {
      out.grade = m[1];
    } else {
      // 등급 휘장 옆에 글자 하나만 따로 찍히는 화면 — 한 줄에 그 글자뿐이거나,
      // 줄 맨 앞에 그 글자가 오고 넓은 빈칸이 이어질 때만 믿습니다
      // (휘장과 이름표가 한 줄로 읽혀 "A       레이팅" 처럼 나오는 경우. "A new season" 은 아님).
      const solo = lines.find((l) => /^[SABCDEFU]$/.test(l));
      const lead = lines.map((l) => /^([SABCDEFU])\s{2,}\S/.exec(l)).find(Boolean);
      if (solo) out.grade = solo;
      else if (lead) out.grade = lead[1];
    }

    /* ── 레이팅 ── */
    m = compact.match(/(?:레이팅|점수)\s*:?\s*(\d[\d,]{2,5})/)
      || flat.match(/(?:Rating|RATING|MMR|Points?|POINTS?)\s*:?\s*(\d[\d,]{2,5})/);
    if (m) {
      const n = toInt(m[1]);
      if (n !== null && n >= RATING_MIN && n <= RATING_MAX) out.rating = n;
    }
    if (out.rating === null) {
      // 이름표가 안 읽혔을 때 — 레이팅 범위의 숫자 중 다른 칸에 쓰이지 않은 것.
      // 여러 개면 가장 큰 값을 고릅니다 (선수 화면에서 가장 크게 찍히는 숫자라서).
      const taken = new Set([out.wins, out.losses, out.ladderRank].filter((v) => v !== null));
      const cands = [];
      const re = /(?<![\d,])(\d[\d,]{2,5})(?![\d,])/g;
      while ((m = re.exec(compact))) {
        const n = toInt(m[1]);
        const after = compact.slice(m.index + m[0].length, m.index + m[0].length + 2);
        const before = compact.slice(Math.max(0, m.index - 3), m.index);
        if (n === null || n < RATING_MIN || n > RATING_MAX) continue;
        if (taken.has(n)) continue;
        if (/^\s*(?:년|승|패|위|%)/.test(after) || /시즌\s*$/.test(before)) continue;
        if (/^[-./]\d/.test(after)) continue;  // 2026-09, 2026.09 같은 날짜
        if (looksLikeYear(n) && /시즌|season|Season/.test(compact)) continue;
        cands.push(n);
      }
      if (cands.length) out.rating = Math.max(...cands);
    }

    for (const k of ["grade", "rating", "wins", "losses", "ladderRank"]) {
      if (out[k] !== null) out.found.push(k);
    }
    return out;
  }

  const api = { parseLadderText, GRADES };
  root.ScrParse = api;
  if (typeof module !== "undefined" && module.exports) module.exports = api;
})(typeof window !== "undefined" ? window : globalThis);
