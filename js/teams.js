/**
 * 소속·지역 랭킹 — 랭킹 파일 하나만 읽어 묶어서 보여줍니다.
 *
 * 선수 한 명씩 오는 것보다 학교·클럽이 통째로 오는 편이 지역 아마추어 씬에서는
 * 훨씬 흔합니다. 그래서 "우리 학교가 몇 위"를 볼 자리를 따로 만들었습니다.
 * 새 데이터도, 새 API 호출도 없습니다 — 이미 있는 랭킹을 다르게 묶을 뿐입니다.
 */

let GAME = null;
let ALL = [];
let MODE = "team"; // team | region

const $ = (sel) => document.querySelector(sel);

document.addEventListener("DOMContentLoaded", init);

async function init() {
  $("#siteName") && ($("#siteName").innerHTML = SITE.short);

  document.querySelectorAll("#modeTabs button").forEach((b) => {
    b.addEventListener("click", () => {
      MODE = b.dataset.mode;
      document.querySelectorAll("#modeTabs button").forEach((x) =>
        x.classList.toggle("active", x === b));
      render();
    });
  });

  buildGameTabs();
  await selectGame(startingGame());
}

/* ───────── 종목 (랭킹 페이지와 같은 규칙) ───────── */

function startingGame() {
  const asked = new URLSearchParams(location.search).get("game");
  return gameById(asked) || gameById(readLastGame()) || defaultGame();
}

function readLastGame() {
  try {
    return localStorage.getItem("cnrank.game");
  } catch (e) {
    return null;
  }
}

function buildGameTabs() {
  const wrap = $("#gameTabs");
  if (GAMES.length < 2) {
    wrap.hidden = true;
    return;
  }
  wrap.innerHTML = GAMES.map(
    (g) => `<button type="button" data-game="${esc(g.id)}">
      <span class="nm">${esc(g.name)}</span>${
      g.status === "live" ? "" : '<span class="soon">준비 중</span>'}</button>`
  ).join("");
  wrap.querySelectorAll("button").forEach((b) => {
    b.addEventListener("click", () => selectGame(gameById(b.dataset.game)));
  });
}

async function selectGame(game) {
  GAME = game;
  document.querySelectorAll("#gameTabs button").forEach((b) => {
    b.classList.toggle("active", b.dataset.game === game.id);
  });
  document.documentElement.style.setProperty("--accent", game.accent);
  document.documentElement.style.setProperty("--accent-hover", game.accentHover);

  document.title = `클럽·지역 랭킹 · ${game.short} — ${SITE.name}`;
  $("#pageTitle").textContent = `클럽·지역 랭킹 · ${game.short}`;
  $("#basis").textContent = game.basis;
  renderDiscord("#discordBar");

  const url = new URL(location.href);
  url.searchParams.set("game", game.id);
  history.replaceState({}, "", url);

  if (game.status !== "live") {
    const n = game.notice || {};
    $("#noticeTitle").textContent = n.title || `${game.name}은 아직 준비 중입니다`;
    $("#noticeBody").innerHTML = (n.body || []).map((t) => `<p>${esc(t)}</p>`).join("");
    $("#gameNotice").hidden = false;
    $("#liveArea").hidden = true;
    return;
  }
  $("#gameNotice").hidden = true;
  $("#liveArea").hidden = false;

  const wantSample = new URLSearchParams(location.search).has("sample");
  const file = (wantSample && game.sampleFile) || game.dataFile;
  // 예시 데이터를 보고 있으면 반드시 그렇다고 밝힙니다.
  $("#sampleBar").hidden = !wantSample;
  try {
    const res = await fetch(`${file}?t=${Date.now()}`);
    if (!res.ok) throw new Error(res.status);
    ALL = (await res.json()).players || [];
    render();
  } catch (e) {
    ALL = [];
    $("#tbody").innerHTML = "";
    $("#empty").textContent = "랭킹 데이터를 불러오지 못했습니다.";
    $("#empty").style.display = "block";
  }
}

function esc(s) {
  return String(s ?? "").replace(/[&<>"']/g, (c) =>
    ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
}

/* ───────── 묶어서 순위 매기기 ───────── */

/**
 * 평균은 **랭크 배치를 마친 선수만** 가지고 냅니다.
 * 언랭크를 0점으로 치면 신입을 많이 받은 팀이 부당하게 내려갑니다.
 * 대신 인원 칸에 "배치 n / 전체 m" 을 함께 보여줘 판단할 근거를 남깁니다.
 */
function groups() {
  const key = (p) => (MODE === "team" ? p.team : p.region) || "";
  const map = new Map();

  for (const p of ALL) {
    const k = key(p);
    if (!k) continue;                       // 소속 없는 선수는 팀 순위에 넣지 않습니다
    if (!map.has(k)) map.set(k, { name: k, members: [], ranked: [] });
    const g = map.get(k);
    g.members.push(p);
    if (p.score != null) g.ranked.push(p);
  }

  const list = [...map.values()].map((g) => {
    g.ranked.sort((a, b) => b.score - a.score);
    g.avg = g.ranked.length
      ? Math.round(g.ranked.reduce((s, p) => s + p.score, 0) / g.ranked.length)
      : null;
    g.top = g.ranked[0] || null;
    return g;
  });

  // 평균이 높은 순, 배치 인원이 없는 묶음은 맨 뒤로.
  list.sort((a, b) => {
    if ((a.avg === null) !== (b.avg === null)) return a.avg === null ? 1 : -1;
    return (b.avg || 0) - (a.avg || 0) || b.members.length - a.members.length
      || a.name.localeCompare(b.name, "ko");
  });
  return list;
}

/** 한 묶음의 선수들 — 티어 높은 순, 언랭크는 뒤로 */
function roster(g) {
  const list = [...g.ranked, ...g.members.filter((p) => p.score == null)];
  return `<div class="roster-list">` + list.map((p) => `
    <a class="rm" href="index.html?game=${esc(GAME.id)}&player=${esc(p.id)}">
      <span class="rm-name">${esc(p.name)}${p.proAspirant ? '<span class="star">★</span>' : ""}</span>
      <span class="rm-pos">${esc(p.position) || "-"}</span>
      <span class="rm-tier">${esc(p.label || "언랭크")}</span>
    </a>`).join("") + `</div>`;
}

/** 속성 선택자에 넣을 수 있게 따옴표만 막습니다 (팀 이름에 따옴표가 들어갈 수 있음) */
function cssEsc(s) {
  return String(s).replace(/["\\]/g, "\\$&");
}

function render() {
  const isTeam = MODE === "team";
  $("#thGroup").firstChild.nodeValue = isTeam ? "클럽 " : "지역 ";

  const list = groups();
  $("#count").textContent = `${list.length}곳`;

  if (!list.length) {
    $("#tbody").innerHTML = "";
    $("#empty").textContent = ALL.length
      ? (isTeam
        ? "아직 소속을 적은 선수가 없습니다. 등록할 때 학교·클럽·팀 이름을 넣으면 여기에 모입니다."
        : "아직 지역이 있는 선수가 없습니다.")
      : "아직 등록된 선수가 없습니다.";
    $("#empty").style.display = "block";
    $("#note").textContent = "";
    return;
  }
  $("#empty").style.display = "none";

  $("#tbody").innerHTML = list.map((g, i) => {
    const no = g.avg === null ? "-" : i + 1;
    const cls = no === 1 ? "top1" : no === 2 ? "top2" : no === 3 ? "top3" : "";
    const tierInfo = g.top && GAME.tiers[g.top.tier];
    const avg = g.avg === null
      ? '<span style="color:var(--text-dim)">배치 전</span>'
      : `<div class="tier">${tierInfo ? `<span class="dot" style="background:${tierInfo.color}"></span>` : ""}
           <span>${esc(GAME.avgLabel ? GAME.avgLabel(g.avg) : g.avg)}</span></div>`;

    const top = g.top
      ? `<a href="index.html?game=${esc(GAME.id)}&player=${esc(g.top.id)}">${esc(g.top.name)}</a>
         <span style="color:var(--text-dim)"> · ${esc(g.top.label)}</span>`
      : "-";

    return `<tr class="clickable" data-group="${esc(g.name)}">
      <td class="rank-no ${cls}">${no}</td>
      <td><span class="nm">${esc(g.name)}</span><span class="more">멤버 보기</span></td>
      <td><span class="wr">${g.members.length}명</span>${
        g.ranked.length !== g.members.length
          ? `<span style="color:var(--text-dim);font-size:.8rem"> (배치 ${g.ranked.length})</span>`
          : ""}</td>
      <td>${avg}</td>
      <td class="hide-sm">${top}</td>
    </tr>
    <tr class="roster" data-for="${esc(g.name)}" hidden>
      <td colspan="5">${roster(g)}</td>
    </tr>`;
  }).join("");

  // 이름을 누르면 그 아래 팀원 줄이 펼쳐집니다.
  $("#tbody").querySelectorAll("tr[data-group]").forEach((tr) => {
    tr.addEventListener("click", () => {
      const row = $("#tbody").querySelector(`tr.roster[data-for="${cssEsc(tr.dataset.group)}"]`);
      if (!row) return;
      row.hidden = !row.hidden;
      tr.classList.toggle("open", !row.hidden);
    });
  });

  const noTeam = ALL.filter((p) => !(isTeam ? p.team : p.region)).length;
  $("#note").textContent = [
    "평균은 랭크 배치를 마친 선수만으로 냅니다 — 언랭크를 0점으로 치면 신입을 많이 받은 곳이 밀려납니다.",
    "인원이 적으면 평균이 크게 흔들리니 인원 칸을 함께 보세요.",
    noTeam ? `${isTeam ? "클럽" : "지역"}을 적지 않은 선수 ${noTeam}명은 빠져 있습니다.` : "",
  ].filter(Boolean).join(" ");
}
