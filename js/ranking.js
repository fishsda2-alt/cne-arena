/**
 * 랭킹 페이지 — 고른 종목의 랭킹 파일 하나만 읽어서 표를 그립니다.
 * (서버·DB 없이 정적 파일만으로 동작합니다)
 *
 * 종목은 js/config.js 의 GAMES 목록에서 옵니다. 종목을 늘릴 때 이 파일은
 * 건드릴 필요가 없습니다 — 목록에 한 칸 추가하면 탭이 하나 늘어납니다.
 */

let ALL = [];
let SORT = "tier"; // tier | weekly | winrate | games | flex
let GAME = null;   // 지금 보고 있는 종목 (GAMES 의 한 칸)

const $ = (sel) => document.querySelector(sel);

document.addEventListener("DOMContentLoaded", init);

async function init() {
  $("#siteName").innerHTML = SITE.short.replace(/\s(\S+)$/, ' <span>$1</span>');

  fillSelect($("#fRegion"), REGIONS, "전체 지역");

  $("#q").addEventListener("input", render);
  $("#fRegion").addEventListener("change", render);
  $("#fPosition").addEventListener("change", render);
  $("#fTeam").addEventListener("change", render);
  $("#fPro").addEventListener("change", render);
  document.querySelectorAll(".tabs button").forEach((b) => {
    b.addEventListener("click", () => setSort(b.dataset.sort));
  });

  // 브라우저 뒤로/앞으로 가기도 종목 전환으로 이어지게 합니다.
  window.addEventListener("popstate", () => {
    const g = gameById(new URLSearchParams(location.search).get("game"));
    if (g && g !== GAME) selectGame(g, { replace: true });
  });

  // 상세 모달 닫기 (X · 바깥 클릭 · Esc)
  $("#pClose").addEventListener("click", closePlayer);
  $("#pBack").addEventListener("click", closePlayer);
  document.addEventListener("keydown", (e) => {
    if (e.key === "Escape" && !$("#pModal").hidden) closePlayer();
  });

  buildGameTabs();
  await selectGame(startingGame(), { replace: true });
}

function setSort(sort) {
  SORT = sort;
  document.querySelectorAll(".tabs button").forEach((x) => {
    x.classList.toggle("active", x.dataset.sort === sort);
  });
  render();
}

/** 처음 열 종목 — 주소의 ?game= 이 우선, 없으면 지난번에 보던 종목 */
function startingGame() {
  const asked = new URLSearchParams(location.search).get("game");
  return gameById(asked) || gameById(readLastGame()) || defaultGame();
}

function readLastGame() {
  // 브라우저가 저장을 막아둔 경우(시크릿 창 등)에도 페이지는 그대로 떠야 합니다.
  try {
    return localStorage.getItem("cnrank.game");
  } catch (e) {
    return null;
  }
}

function rememberGame(id) {
  try {
    localStorage.setItem("cnrank.game", id);
  } catch (e) {
    /* 저장 못 해도 그만입니다 */
  }
}

function buildGameTabs() {
  const wrap = $("#gameTabs");
  if (GAMES.length < 2) {
    // 종목이 하나뿐이면 고를 것이 없으므로 줄 자체를 숨깁니다.
    wrap.hidden = true;
    return;
  }
  wrap.innerHTML = GAMES.map(
    (g) => `<button type="button" data-game="${esc(g.id)}">
      <span class="nm">${esc(g.name)}</span>${
      g.status === "live" ? "" : '<span class="soon">준비 중</span>'
    }</button>`
  ).join("");
  wrap.querySelectorAll("button").forEach((b) => {
    b.addEventListener("click", () => selectGame(gameById(b.dataset.game)));
  });
}

/** 종목을 바꿉니다 (주소·저장·색·데이터까지 함께) */
async function selectGame(game, { replace = false } = {}) {
  GAME = game;
  // 아직 열지 않은 종목은 기억하지 않습니다. 기억하면 다음 방문 때
  // 볼 것이 없는 안내 화면으로 착지하게 됩니다.
  if (game.status === "live") rememberGame(game.id);

  document.querySelectorAll("#gameTabs button").forEach((b) => {
    b.classList.toggle("active", b.dataset.game === game.id);
  });

  // 종목마다 강조색을 바꿔, 지금 무엇을 보고 있는지 한눈에 들어오게 합니다.
  document.documentElement.style.setProperty("--accent", game.accent);
  document.documentElement.style.setProperty("--accent-hover", game.accentHover);

  document.title = `${game.name} — ${SITE.name}`;
  $("#pageTitle").textContent = `${SITE.name} · ${game.short}`;
  $("#pageDesc").textContent = game.description;
  $("#basis").textContent = game.basis;

  // 포지션 목록도 종목마다 다릅니다.
  fillSelect($("#fPosition"), game.positions, "전체 포지션");

  // 자유랭크는 롤에만 있는 개념이라 다른 종목에서는 탭을 감춥니다.
  const hasFlex = game.id === "lol";
  document.querySelectorAll(".tabs .flex-only").forEach((b) => { b.hidden = !hasFlex; });
  if (!hasFlex && SORT === "flex") setSort("tier");

  // 주소에 남겨 두면 링크로 공유했을 때 같은 종목이 열립니다.
  const url = new URL(location.href);
  url.searchParams.set("game", game.id);
  history[replace ? "replaceState" : "pushState"]({}, "", url);

  await loadGame(game);
}

async function loadGame(game) {
  if (game.status !== "live") {
    showNotice(game);
    return;
  }

  // 주소 뒤에 ?sample 을 붙이면 예시 데이터로 화면을 미리 볼 수 있습니다.
  const wantSample = new URLSearchParams(location.search).has("sample");
  const file = (wantSample && game.sampleFile) || game.dataFile;

  try {
    const res = await fetch(`${file}?t=${Date.now()}`);
    if (!res.ok) throw new Error(res.status);
    const data = await res.json();
    showTable();
    ALL = data.players || [];
    // 예시 데이터를 보고 있으면 반드시 그렇다고 밝힙니다. 표시가 없으면
    // 처음 온 사람이 실제 등록 선수로 오해합니다.
    $("#sampleBar").hidden = !wantSample;
    // 선수가 적을 때는 빈 표만 두지 않고 무슨 곳인지 먼저 설명합니다.
    $("#introCard").hidden = wantSample || ALL.length >= 5;
    fillSummary(data);
    drawDistribution();
    fillSelect($("#fTeam"), uniq(ALL.map((p) => p.team)), "전체 소속");
    render();
    // 링크에 선수가 지정돼 있으면 그 선수를 열어 둡니다 (공유용).
    const asked = new URLSearchParams(location.search).get("player");
    const found = asked && ALL.find((p) => p.id === asked);
    if (found) openPlayer(found);
  } catch (e) {
    ALL = [];
    showTable();
    $("#sampleBar").hidden = true;
    $("#introCard").hidden = true;
    $("#tbody").innerHTML = "";
    $("#empty").textContent =
      "랭킹 데이터를 불러오지 못했습니다. (파일을 브라우저로 직접 열면 보안 정책상 차단됩니다 — start-server.bat으로 실행하세요)";
    $("#empty").style.display = "block";
  }
}

/** 아직 열지 않은 종목 — 표 대신 안내를 보여줍니다 */
function showNotice(game) {
  const n = game.notice || {};
  $("#noticeTitle").textContent = n.title || `${game.name}은 아직 준비 중입니다`;
  $("#noticeBody").innerHTML = (n.body || []).map((t) => `<p>${esc(t)}</p>`).join("");
  $("#gameNotice").hidden = false;
  $("#liveArea").hidden = true;
}

function showTable() {
  $("#gameNotice").hidden = true;
  $("#liveArea").hidden = false;
}

function uniq(arr) {
  return [...new Set(arr.filter(Boolean))].sort((a, b) => a.localeCompare(b, "ko"));
}

function fillSelect(sel, items, allLabel) {
  sel.innerHTML = `<option value="">${allLabel}</option>` +
    items.map((v) => `<option value="${esc(v)}">${esc(v)}</option>`).join("");
}

function fillSummary(data) {
  $("#sTotal").textContent = `${data.playerCount || 0}명`;
  $("#sRanked").textContent = `${data.rankedCount || 0}명`;
  $("#sPro").textContent = `${(data.players || []).filter((p) => p.proAspirant).length}명`;

  const top = (data.players || []).find((p) => p.score !== null);
  $("#sTop").textContent = top ? `${top.name} · ${top.label}` : "-";

  const ranked = (data.players || []).filter((p) => p.score !== null);
  const avg = ranked.length
    ? Math.round(ranked.reduce((s, p) => s + p.score, 0) / ranked.length)
    : null;
  // 점수를 티어로 되돌리는 방법은 종목마다 다릅니다 (config.js 의 avgLabel).
  $("#sAvg").textContent =
    avg === null || !GAME.avgLabel ? "-" : GAME.avgLabel(avg);

  $("#updated").textContent = data.updatedAt
    ? `마지막 갱신: ${fmtTime(data.updatedAt)} (매일 오전 4시 자동 갱신)`
    : "아직 갱신 기록이 없습니다.";
}

/**
 * 티어 분포 — 등록 선수가 어느 구간에 몰려 있는지 한눈에.
 *
 * 종목의 티어 표(config.js)를 그대로 쓰므로, 종목이 늘어도 여기는 손댈 필요가 없습니다.
 * 선수가 적을 때는 막대 하나짜리 그림이 되어 오히려 초라해 보이므로 숨깁니다.
 */
function drawDistribution() {
  const box = $("#distBox");
  const ranked = ALL.filter((p) => p.tier && GAME.tiers[p.tier]);
  if (ranked.length < 3) {
    box.hidden = true;
    return;
  }

  const counts = new Map();
  for (const p of ranked) counts.set(p.tier, (counts.get(p.tier) || 0) + 1);

  // config.js 의 티어 표는 높은 티어부터 적혀 있습니다. 그 순서를 그대로 씁니다.
  const items = Object.keys(GAME.tiers)
    .filter((t) => counts.get(t))
    .map((t) => ({ label: GAME.tiers[t].ko, n: counts.get(t), color: GAME.tiers[t].color }));

  const max = Math.max(...items.map((i) => i.n));
  $("#dist").innerHTML = items.map((i) => `
    <div class="bar">
      <span class="bl">${esc(i.label)}</span>
      <span class="bt"><span class="bf" style="width:${(i.n / max) * 100}%;background:${esc(i.color)}"></span></span>
      <span class="bn">${i.n}</span>
    </div>`).join("");
  $("#distNote").textContent = `랭크 배치 ${ranked.length}명 기준`;
  box.hidden = false;
}

function fmtTime(iso) {
  const d = new Date(iso);
  if (isNaN(d)) return iso;
  return d.toLocaleString("ko-KR", { dateStyle: "medium", timeStyle: "short" });
}

function esc(s) {
  return String(s ?? "").replace(/[&<>"']/g, (c) =>
    ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c])
  );
}

function render() {
  const q = $("#q").value.trim().toLowerCase();
  const region = $("#fRegion").value;
  const position = $("#fPosition").value;
  const team = $("#fTeam").value;
  const proOnly = $("#fPro").value === "pro";

  let rows = ALL.filter((p) => {
    if (region && p.region !== region) return false;
    if (position && p.position !== position) return false;
    if (team && p.team !== team) return false;
    if (proOnly && !p.proAspirant) return false;
    if (q) {
      const hay = `${p.name} ${p.gameName}#${p.tagLine} ${p.team}`.toLowerCase();
      if (!hay.includes(q)) return false;
    }
    return true;
  });

  if (SORT === "weekly") {
    rows = rows.filter((p) => p.weeklyLpDelta !== null && p.weeklyLpDelta !== undefined);
    rows.sort((a, b) => b.weeklyLpDelta - a.weeklyLpDelta);
  } else if (SORT === "winrate") {
    rows = rows.filter((p) => (p.games || 0) >= 20); // 표본 20판 미만 제외
    rows.sort((a, b) => b.winRate - a.winRate || b.games - a.games);
  } else if (SORT === "games") {
    rows.sort((a, b) => (b.games || 0) - (a.games || 0));
  } else if (SORT === "flex") {
    // 자유랭크 기록이 있는 선수만. 점수는 솔로랭크와 같은 기준입니다.
    rows = rows.filter((p) => p.flex && p.flex.score != null);
    rows.sort((a, b) => b.flex.score - a.flex.score);
  }
  // tier: ranking.json이 이미 티어순으로 정렬되어 있음

  $("#count").textContent = `${rows.length}명`;
  $("#thExtra").textContent =
    SORT === "weekly" ? "주간 변동" : SORT === "games" ? "판수"
      : SORT === "flex" ? "솔로랭크" : "어제 대비";

  if (!rows.length) {
    $("#tbody").innerHTML = "";
    $("#empty").textContent = !ALL.length
      ? "아직 등록된 선수가 없습니다. 등록 안내를 확인해 주세요."
      : SORT === "flex"
        ? "자유랭크 기록이 있는 선수가 없습니다."
        : "조건에 맞는 선수가 없습니다.";
    $("#empty").style.display = "block";
    return;
  }
  $("#empty").style.display = "none";
  $("#tbody").innerHTML = rows.map((p, i) => row(p, i)).join("");
  $("#tbody").querySelectorAll("tr[data-id]").forEach((tr) => {
    tr.addEventListener("click", () => {
      const p = ALL.find((x) => x.id === tr.dataset.id);
      if (p) openPlayer(p);
    });
  });
}

function row(p, i) {
  const no = SORT === "tier" ? p.rank : i + 1;
  const noClass = no === 1 ? "top1" : no === 2 ? "top2" : no === 3 ? "top3" : "";
  const flexMode = SORT === "flex";
  const shown = flexMode ? (p.flex || {}) : p;
  const info = (shown.tier && GAME.tiers[shown.tier]) || null;

  const icon = p.profileIconId
    ? `<img src="${profileIconUrl(p.profileIconId)}" alt="" loading="lazy"
           onerror="this.replaceWith(Object.assign(document.createElement('div'),{className:'noimg'}))">`
    : `<div class="noimg"></div>`;

  const tierCell = info
    ? `<div class="tier"><span class="dot" style="background:${info.color}"></span>
         <span>${esc(shown.label)}</span></div>`
    : `<div class="tier"><span class="dot" style="background:#444"></span>
         <span style="color:var(--text-dim)">언랭크</span></div>`;

  const extra =
    SORT === "games"
      ? `<span class="delta zero">${p.games || 0}판</span>`
      : flexMode
        // 자유랭크를 볼 때는 그 선수의 솔로랭크가 궁금해집니다.
        ? `<span class="delta zero">${esc(p.label)}</span>`
        : deltaCell(SORT === "weekly" ? p.weeklyLpDelta : p.lpDelta);

  const wr = p.games
    ? `<span class="wr ${p.winRate >= 55 ? "hi" : p.winRate < 45 ? "lo" : ""}">${p.winRate}%</span>`
    : `<span class="wr" style="color:var(--text-dim)">-</span>`;

  return `<tr class="clickable" data-id="${esc(p.id)}">
    <td class="rank-no ${noClass}">${no ?? "-"}</td>
    <td>
      <div class="player">
        ${icon}
        <div class="who">
          <span class="nm">${esc(p.name)}${
            p.proAspirant ? '<span class="star" title="프로 트라이아웃 희망 선수">★</span>' : ""
          }${p.hotStreak ? '<span class="badge hot">연승</span>' : ""}${
            p.stale ? '<span class="badge stale">갱신실패</span>' : ""
          }</span>
          <span class="id">${esc(p.gameName)}#${esc(p.tagLine)}</span>
        </div>
      </div>
    </td>
    <td class="hide-sm">${esc(p.team) || "-"}</td>
    <td class="hide-sm">${esc(p.position) || "-"}</td>
    <td>${tierCell}</td>
    <td>${extra}</td>
    <td class="hide-sm wl"><span class="w">${p.wins || 0}승</span> <span class="l">${p.losses || 0}패</span></td>
    <td>${wr}</td>
  </tr>`;
}

function deltaCell(v) {
  if (v === null || v === undefined) return `<span class="delta zero">-</span>`;
  if (v > 0) return `<span class="delta up">▲ ${v}</span>`;
  if (v < 0) return `<span class="delta down">▼ ${Math.abs(v)}</span>`;
  return `<span class="delta zero">-</span>`;
}
