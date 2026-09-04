/**
 * 랭킹 페이지 — data/ranking.json 하나만 읽어서 표를 그립니다.
 * (서버·DB 없이 정적 파일만으로 동작합니다)
 */

let ALL = [];
let SORT = "tier"; // tier | weekly | winrate | games

const $ = (sel) => document.querySelector(sel);

document.addEventListener("DOMContentLoaded", init);

async function init() {
  document.title = `${SITE.name}`;
  $("#siteName").innerHTML = SITE.short.replace(/\s(\S+)$/, ' <span>$1</span>');
  $("#pageDesc").textContent = SITE.description;

  fillSelect($("#fRegion"), REGIONS, "전체 지역");
  fillSelect($("#fPosition"), POSITIONS, "전체 포지션");

  $("#q").addEventListener("input", render);
  $("#fRegion").addEventListener("change", render);
  $("#fPosition").addEventListener("change", render);
  $("#fTeam").addEventListener("change", render);
  document.querySelectorAll(".tabs button").forEach((b) => {
    b.addEventListener("click", () => {
      document.querySelectorAll(".tabs button").forEach((x) => x.classList.remove("active"));
      b.classList.add("active");
      SORT = b.dataset.sort;
      render();
    });
  });

  // 주소 뒤에 ?sample 을 붙이면 예시 데이터로 화면을 미리 볼 수 있습니다.
  const file = new URLSearchParams(location.search).has("sample")
    ? "data/ranking.sample.json"
    : "data/ranking.json";

  try {
    const res = await fetch(`${file}?t=${Date.now()}`);
    if (!res.ok) throw new Error(res.status);
    const data = await res.json();
    ALL = data.players || [];
    fillSummary(data);
    fillSelect($("#fTeam"), uniq(ALL.map((p) => p.team)), "전체 소속");
    render();
  } catch (e) {
    $("#tbody").innerHTML = "";
    $("#empty").textContent =
      "랭킹 데이터를 불러오지 못했습니다. (파일을 브라우저로 직접 열면 보안 정책상 차단됩니다 — start-server.bat으로 실행하세요)";
    $("#empty").style.display = "block";
  }
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

  const top = (data.players || []).find((p) => p.score !== null);
  $("#sTop").textContent = top ? `${top.name} · ${top.label}` : "-";

  const ranked = (data.players || []).filter((p) => p.score !== null);
  const avg = ranked.length
    ? Math.round(ranked.reduce((s, p) => s + p.score, 0) / ranked.length)
    : null;
  $("#sAvg").textContent = avg === null ? "-" : scoreToLabel(avg);

  $("#updated").textContent = data.updatedAt
    ? `마지막 갱신: ${fmtTime(data.updatedAt)} (매일 오전 4시 자동 갱신)`
    : "아직 갱신 기록이 없습니다.";
}

/** 평균 점수를 다시 티어 문자열로 (요약용) */
function scoreToLabel(score) {
  const tiers = ["IRON","BRONZE","SILVER","GOLD","PLATINUM","EMERALD","DIAMOND"];
  const divs = ["IV","III","II","I"];
  if (score >= 2800) return `마스터+ ${score - 2800}LP`;
  const t = Math.min(Math.floor(score / 400), tiers.length - 1);
  const rest = score - t * 400;
  const d = Math.min(Math.floor(rest / 100), 3);
  return `${TIER_INFO[tiers[t]].ko} ${divs[d]}`;
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

  let rows = ALL.filter((p) => {
    if (region && p.region !== region) return false;
    if (position && p.position !== position) return false;
    if (team && p.team !== team) return false;
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
  }
  // tier: ranking.json이 이미 티어순으로 정렬되어 있음

  $("#count").textContent = `${rows.length}명`;
  $("#thExtra").textContent =
    SORT === "weekly" ? "주간 변동" : SORT === "games" ? "판수" : "어제 대비";

  if (!rows.length) {
    $("#tbody").innerHTML = "";
    $("#empty").textContent = ALL.length
      ? "조건에 맞는 선수가 없습니다."
      : "아직 등록된 선수가 없습니다. 등록 안내를 확인해 주세요.";
    $("#empty").style.display = "block";
    return;
  }
  $("#empty").style.display = "none";
  $("#tbody").innerHTML = rows.map((p, i) => row(p, i)).join("");
}

function row(p, i) {
  const no = SORT === "tier" ? p.rank : i + 1;
  const noClass = no === 1 ? "top1" : no === 2 ? "top2" : no === 3 ? "top3" : "";
  const info = p.tier ? TIER_INFO[p.tier] : null;

  const icon = p.profileIconId
    ? `<img src="${profileIconUrl(p.profileIconId)}" alt="" loading="lazy"
           onerror="this.replaceWith(Object.assign(document.createElement('div'),{className:'noimg'}))">`
    : `<div class="noimg"></div>`;

  const tierCell = p.tier
    ? `<div class="tier"><span class="dot" style="background:${info.color}"></span>
         <span>${esc(p.label)}</span></div>`
    : `<div class="tier"><span class="dot" style="background:#444"></span>
         <span style="color:var(--text-dim)">언랭크</span></div>`;

  const extra =
    SORT === "games"
      ? `<span class="delta zero">${p.games || 0}판</span>`
      : deltaCell(SORT === "weekly" ? p.weeklyLpDelta : p.lpDelta);

  const wr = p.games
    ? `<span class="wr ${p.winRate >= 55 ? "hi" : p.winRate < 45 ? "lo" : ""}">${p.winRate}%</span>`
    : `<span class="wr" style="color:var(--text-dim)">-</span>`;

  return `<tr>
    <td class="rank-no ${noClass}">${no ?? "-"}</td>
    <td>
      <div class="player">
        ${icon}
        <div class="who">
          <span class="nm">${esc(p.name)}${p.hotStreak ? '<span class="badge hot">연승</span>' : ""}${
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
