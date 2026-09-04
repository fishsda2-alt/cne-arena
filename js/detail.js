/**
 * 선수 상세 — 표에서 이름을 누르면 열립니다.
 *
 * 티어 변동 그래프는 data/history/YYYY-MM.json 을 읽습니다. 매일 새벽 갱신 때
 * 쌓아두던 스냅샷인데, 지금까지 '주간 상승' 계산에만 쓰고 화면에는 보여준 적이
 * 없었습니다. 새 API 호출은 한 건도 없습니다.
 *
 * 주소에 ?player=p001 이 붙으므로 링크로 공유하면 그 선수가 열린 채로 뜹니다.
 */

/** 이미 읽은 월별 기록 (같은 파일을 두 번 받지 않도록) */
const HISTORY_CACHE = new Map();

function openPlayer(p) {
  const $$ = (s) => document.querySelector(s);

  $$("#pIcon").src = p.profileIconId ? profileIconUrl(p.profileIconId) : "";
  $$("#pIcon").alt = `${p.name} 프로필 아이콘`;
  $$("#pName").textContent = p.name;

  const badges = [];
  if (p.proAspirant) badges.push('<span class="star" title="프로 트라이아웃 희망 선수">★</span>');
  if (p.hotStreak) badges.push('<span class="badge hot">연승</span>');
  if (p.inactive) badges.push('<span class="badge stale">비활동</span>');
  if (p.stale) badges.push('<span class="badge stale">갱신실패</span>');
  $$("#pBadges").innerHTML = badges.join("");

  $$("#pId").textContent = `${p.gameName}#${p.tagLine}`;
  $$("#pMeta").textContent = [
    p.region, p.position, p.team,
    p.summonerLevel ? `Lv.${p.summonerLevel}` : "",
  ].filter(Boolean).join(" · ");

  const cards = [
    ["순위", p.rank ? `${p.rank}위` : "-"],
    ["솔로랭크", p.label || "언랭크", true],
    ["전적", p.games ? `${p.wins}승 ${p.losses}패` : "-", true],
    ["승률", p.games ? `${p.winRate}%` : "-"],
    ["주간 변동", fmtDelta(p.weeklyLpDelta)],
    ["자유랭크", (p.flex && p.flex.label) || "-", true],
  ];
  document.querySelector("#pStats").innerHTML = cards.map(
    ([k, v, sm]) => `<div class="s"><div class="k">${escHtml(k)}</div>` +
      `<div class="v${sm ? " sm" : ""}">${escHtml(v)}</div></div>`
  ).join("");

  document.querySelector("#pChart").innerHTML = '<div class="note">기록을 불러오는 중…</div>';
  document.querySelector("#pChartNote").textContent = "";
  document.querySelector("#pModal").hidden = false;
  document.body.style.overflow = "hidden";

  const url = new URL(location.href);
  url.searchParams.set("player", p.id);
  history.replaceState({}, "", url);

  drawHistory(p);
}

function closePlayer() {
  document.querySelector("#pModal").hidden = true;
  document.body.style.overflow = "";
  const url = new URL(location.href);
  url.searchParams.delete("player");
  history.replaceState({}, "", url);
}

function fmtDelta(v) {
  if (v === null || v === undefined) return "-";
  if (v > 0) return `▲ ${v}`;
  if (v < 0) return `▼ ${Math.abs(v)}`;
  return "변동 없음";
}

function escHtml(s) {
  return String(s ?? "").replace(/[&<>"']/g, (c) =>
    ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
}

/* ───────── 티어 변동 그래프 ───────── */

/** YYYY-MM 형태로 최근 몇 달치 파일 이름을 만듭니다 (KST 기준) */
function recentMonths(n) {
  const now = new Date(Date.now() + 9 * 60 * 60 * 1000);
  const out = [];
  for (let i = 0; i < n; i++) {
    const d = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth() - i, 1));
    out.push(`${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, "0")}`);
  }
  return out;
}

async function monthData(ym) {
  if (HISTORY_CACHE.has(ym)) return HISTORY_CACHE.get(ym);
  let data = {};
  try {
    const res = await fetch(`data/history/${ym}.json?t=${Date.now()}`);  // ../ 를 쓰면 data/ 바로 아래를 가리킵니다
    if (res.ok) data = await res.json();
  } catch (e) {
    // 그 달 파일이 아직 없으면 빈 값으로 둡니다.
  }
  HISTORY_CACHE.set(ym, data);
  return data;
}

async function drawHistory(p) {
  // 예시 모드에서는 예시 기록을 씁니다. 실제 기록은 하루에 한 줄씩만 쌓여서,
  // 미리보기로 화면을 볼 때 그래프가 늘 비어 있게 되기 때문입니다.
  const sample = new URLSearchParams(location.search).has("sample");
  const months = sample
    ? [await monthData("../history.sample")]
    : await Promise.all(recentMonths(3).map(monthData));

  // { 날짜: {선수id: {s: 점수}} } 를 이 선수의 점수만 뽑아 날짜순으로.
  const points = [];
  for (const month of months) {
    for (const [date, day] of Object.entries(month)) {
      const rec = day[p.id];
      if (rec && rec.s != null) points.push({ date, score: rec.s });
    }
  }
  points.sort((a, b) => a.date.localeCompare(b.date));

  const box = document.querySelector("#pChart");
  if (points.length < 2) {
    // 언랭크 선수는 기록 자체가 쌓이지 않습니다 (점수가 없는 날은 스냅샷에서 빠집니다).
    // 그 경우에 "이틀만 지나면"이라고 안내하면 기다려도 안 나오는 것을 기다리게 됩니다.
    box.innerHTML = p.score == null
      ? '<div class="note">아직 랭크 배치 전입니다.<br>' +
        "배치를 마치면 그날부터 하루에 한 점씩 기록이 쌓입니다.</div>"
      : '<div class="note">기록이 쌓이는 중입니다.<br>' +
        "매일 새벽 4시에 하루치씩 더해지므로, 이틀이면 선이 그려집니다.</div>";
    return;
  }

  document.querySelector("#pChartNote").textContent =
    `${points[0].date} ~ ${points[points.length - 1].date} · ${points.length}일`;
  box.innerHTML = lineChart(points);
}

/**
 * 선 그래프 하나 — 라이브러리 없이 SVG 문자열로 그립니다.
 * y축은 점수(티어+LP를 하나로 누른 값)이고, 눈금은 티어 이름으로 보여줍니다.
 */
function lineChart(points) {
  const W = 600, H = 200, L = 74, R = 14, T = 14, B = 26;
  const iw = W - L - R, ih = H - T - B;

  const vals = points.map((p) => p.score);
  let lo = Math.min(...vals), hi = Math.max(...vals);
  if (hi === lo) { lo -= 50; hi += 50; }          // 변동이 없으면 납작한 선이 되지 않게
  const pad = (hi - lo) * 0.15;
  lo -= pad; hi += pad;

  const x = (i) => L + (points.length === 1 ? iw / 2 : (i / (points.length - 1)) * iw);
  const y = (v) => T + ih - ((v - lo) / (hi - lo)) * ih;

  const line = points.map((p, i) => `${i ? "L" : "M"}${x(i).toFixed(1)},${y(p.score).toFixed(1)}`).join("");
  const area = `${line}L${x(points.length - 1).toFixed(1)},${T + ih}L${x(0).toFixed(1)},${T + ih}Z`;

  const label = (v) => (typeof GAME !== "undefined" && GAME.avgLabel) ? GAME.avgLabel(Math.round(v)) : Math.round(v);
  const grid = [hi - pad, (hi + lo) / 2, lo + pad].map((v) => `
    <line x1="${L}" y1="${y(v).toFixed(1)}" x2="${W - R}" y2="${y(v).toFixed(1)}" stroke="var(--border)" stroke-width="1"/>
    <text x="${L - 8}" y="${(y(v) + 4).toFixed(1)}" text-anchor="end" font-size="11" fill="var(--text-dim)">${escHtml(label(v))}</text>`
  ).join("");

  const last = points[points.length - 1];
  const first = points[0];
  const up = last.score >= first.score;
  const color = up ? "var(--up)" : "var(--down)";

  return `<svg viewBox="0 0 ${W} ${H}" role="img" aria-label="티어 변동 그래프">
    <defs>
      <linearGradient id="g" x1="0" y1="0" x2="0" y2="1">
        <stop offset="0%" stop-color="${color}" stop-opacity=".28"/>
        <stop offset="100%" stop-color="${color}" stop-opacity="0"/>
      </linearGradient>
    </defs>
    ${grid}
    <path d="${area}" fill="url(#g)"/>
    <path d="${line}" fill="none" stroke="${color}" stroke-width="2.5" stroke-linejoin="round" stroke-linecap="round"/>
    <circle cx="${x(points.length - 1).toFixed(1)}" cy="${y(last.score).toFixed(1)}" r="4.5" fill="${color}"/>
    <text x="${L}" y="${H - 8}" font-size="11" fill="var(--text-dim)">${escHtml(first.date.slice(5))}</text>
    <text x="${W - R}" y="${H - 8}" text-anchor="end" font-size="11" fill="var(--text-dim)">${escHtml(last.date.slice(5))}</text>
  </svg>`;
}
