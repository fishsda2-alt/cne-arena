/**
 * 운영 현황 페이지
 *
 * 조회는 data/players.json 하나만 읽습니다. 그 파일은 공개 저장소에 그대로 있으므로
 * 이 화면이 새로 드러내는 정보는 없습니다.
 *
 * 바꾸는 일(★·승인)은 Apps Script를 거칩니다. 관리 키는 사이트에 두지 않고
 * 운영자가 입력해 그때그때 보냅니다 — 정적 사이트에 비밀을 숨길 방법은 없기 때문입니다.
 * 키는 sessionStorage 에만 두어 창을 닫으면 사라집니다.
 */

const $ = (sel) => document.querySelector(sel);
const KEY_STORE = "cnrank.adminKey";

let ALL = [];

document.addEventListener("DOMContentLoaded", init);

async function init() {
  fillSelect($("#fGame"), GAMES.map((g) => ({ v: g.id, t: g.name })), "전체 종목");
  fillSelect($("#fRegion"), REGIONS.map((r) => ({ v: r, t: r })), "전체 지역");

  ["#q", "#fGame", "#fRegion", "#fState"].forEach((sel) => {
    $(sel).addEventListener("input", render);
    $(sel).addEventListener("change", render);
  });

  setupManageToggle();

  $("#keyBtn").addEventListener("click", saveKey);
  $("#keyClear").addEventListener("click", clearKey);
  if (readKey()) {
    $("#fKey").value = readKey();
    showKeyMsg("이 탭에 관리 키가 기억돼 있습니다.");
  }

  loadVisits();
  await load();
}

/* ───────── 운영자 도구 열고 닫기 ───────── */

/**
 * 관리 버튼은 기본으로 감춰 둡니다. 보안 장치가 아니라 화면 정리입니다 —
 * 실제로 막는 것은 Apps Script 쪽 관리 키입니다.
 * 주소에 ?manage 를 붙이면 바로 열리므로 운영자는 그 주소를 즐겨찾기 하면 됩니다.
 */
function setupManageToggle() {
  const asked = new URLSearchParams(location.search).has("manage");
  setManage(asked);
  $("#manageToggle").addEventListener("click", (e) => {
    e.preventDefault();
    setManage(!document.body.classList.contains("manage"));
  });
}

function setManage(on) {
  document.body.classList.toggle("manage", on);
  $("#manageToggle").textContent = on ? "운영자 도구 닫기" : "운영자 도구";
  const url = new URL(location.href);
  if (on) url.searchParams.set("manage", "1");
  else url.searchParams.delete("manage");
  history.replaceState({}, "", url);
}

/* ───────── 방문 집계 ───────── */

/**
 * 누적 방문 — GoatCounter 의 공개 카운터에서 읽습니다.
 *
 * 사이트 설정의 "Allow adding visitor counts on your website" 를 켜야 열립니다.
 * 합계(TOTAL)는 GoatCounter가 따로 집계하는 값이라 방금 생긴 방문은 한동안
 * 0으로 나옵니다. 그래서 0이면 숫자 대신 대시보드 링크를 보여줍니다 —
 * 실제로는 방문이 있는데 0이라고 적으면 그게 더 나쁜 거짓말이기 때문입니다.
 */
async function loadVisits() {
  const code = SITE.goatcounter;
  const box = $("#sVisits");
  if (!code) {
    box.textContent = "미설정";
    box.title = "js/config.js 의 SITE.goatcounter 를 채우면 켜집니다.";
    return;
  }

  const dash = `https://${code}.goatcounter.com`;
  const link = (t, tip) => {
    box.innerHTML = `<a href="${esc(dash)}" target="_blank" rel="noopener">${esc(t)}</a>`;
    box.title = tip;
  };

  try {
    const res = await fetch(`${dash}/counter/TOTAL.json`);
    if (!res.ok) throw new Error(res.status);
    const data = await res.json();
    const n = Number(String(data.count_unique || data.count || "0").replace(/,/g, ""));
    if (!n) {
      link("대시보드", "합계는 GoatCounter가 나중에 집계합니다. 그때까지는 대시보드에서 보세요.");
      return;
    }
    box.innerHTML = `<a href="${esc(dash)}" target="_blank" rel="noopener">${esc(n.toLocaleString("ko-KR"))}</a>`;
    box.title = "GoatCounter 누적 방문 (고유 방문자)";
  } catch (e) {
    // 카운터 공개가 꺼져 있으면 여기로 옵니다.
    link("대시보드", "숫자를 여기 표시하려면 GoatCounter 설정에서 카운터 공개를 켜세요.");
  }
}

/* ───────── 관리 키 ───────── */

function readKey() {
  try {
    return sessionStorage.getItem(KEY_STORE) || "";
  } catch (e) {
    return "";
  }
}

function saveKey() {
  const v = $("#fKey").value.trim();
  if (!v) return showKeyMsg("키를 입력해 주세요.");
  try {
    sessionStorage.setItem(KEY_STORE, v);
  } catch (e) {
    /* 저장 못 해도 이번 화면에서는 씁니다 */
  }
  showKeyMsg("기억했습니다. 창을 닫으면 사라집니다.");
  render();
}

function clearKey() {
  try {
    sessionStorage.removeItem(KEY_STORE);
  } catch (e) { /* 무시 */ }
  $("#fKey").value = "";
  showKeyMsg("지웠습니다.");
  render();
}

function showKeyMsg(t) {
  const el = $("#keyMsg");
  el.textContent = t;
  el.classList.add("show");
}

/* ───────── 데이터 ───────── */

async function load() {
  try {
    const res = await fetch(`data/players.json?t=${Date.now()}`);
    if (!res.ok) throw new Error(res.status);
    const data = await res.json();
    ALL = data.players || [];
    $("#updated").textContent = data.updatedAt ? `명단 갱신: ${fmtTime(data.updatedAt)}` : "";
    summarize();
    render();
  } catch (e) {
    $("#empty").textContent =
      "명단을 불러오지 못했습니다. (파일을 브라우저로 직접 열면 차단됩니다 — start-server.bat으로 실행하세요)";
    $("#empty").style.display = "block";
  }
}

function summarize() {
  const approved = ALL.filter((p) => p.approved);
  $("#sTotal").textContent = `${ALL.length}명`;
  $("#sApproved").textContent = `${approved.length}명`;
  $("#sPending").textContent = `${ALL.length - approved.length}명`;
  $("#sPro").textContent = `${ALL.filter((p) => p.proAspirant).length}명`;

  // 종목별 — 한 선수가 여러 종목에 등록할 수 있어 합계가 총원보다 클 수 있습니다.
  drawBars("#byGame", GAMES.map((g) => ({
    label: g.name,
    n: ALL.filter((p) => playerGames(p)[g.id]).length,
    color: g.accent,
  })));

  // 지역별 — 등록자가 있는 지역만, 많은 순서로.
  const counts = new Map();
  for (const p of ALL) {
    const key = p.region || "(미지정)";
    counts.set(key, (counts.get(key) || 0) + 1);
  }
  drawBars("#byRegion", [...counts.entries()]
    .sort((a, b) => b[1] - a[1])
    .map(([label, n]) => ({ label, n })));
}

/** 막대 하나짜리 간단한 분포표 (라이브러리 없이) */
function drawBars(sel, items) {
  const box = $(sel);
  if (!items.length || items.every((i) => !i.n)) {
    box.innerHTML = '<p style="color:var(--text-dim)">아직 등록이 없습니다.</p>';
    return;
  }
  const max = Math.max(...items.map((i) => i.n), 1);
  box.innerHTML = items.map((i) => {
    const width = (i.n / max) * 100;
    const fill = i.color ? `;background:${esc(i.color)}` : "";
    return `<div class="bar"><span class="bl">${esc(i.label)}</span>` +
      `<span class="bt"><span class="bf" style="width:${width}%${fill}"></span></span>` +
      `<span class="bn">${i.n}</span></div>`;
  }).join("");
}

function fillSelect(sel, items, allLabel) {
  sel.innerHTML = `<option value="">${allLabel}</option>` +
    items.map((i) => `<option value="${esc(i.v)}">${esc(i.t)}</option>`).join("");
}

function fmtTime(iso) {
  const d = new Date(iso);
  return isNaN(d) ? iso : d.toLocaleString("ko-KR", { dateStyle: "medium", timeStyle: "short" });
}

function esc(s) {
  return String(s ?? "").replace(/[&<>"']/g, (c) =>
    ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
}

/* ───────── 목록 ───────── */

function render() {
  const q = $("#q").value.trim().toLowerCase();
  const game = $("#fGame").value;
  const region = $("#fRegion").value;
  const state = $("#fState").value;

  const rows = ALL.filter((p) => {
    if (game && !playerGames(p)[game]) return false;
    if (region && p.region !== region) return false;
    if (state === "pending" && p.approved) return false;
    if (state === "pro" && !p.proAspirant) return false;
    if (q) {
      const hay = `${p.name} ${p.gameName}#${p.tagLine} ${p.team}`.toLowerCase();
      if (!hay.includes(q)) return false;
    }
    return true;
  });

  $("#count").textContent = `${rows.length}명`;
  $("#empty").style.display = rows.length ? "none" : "block";
  if (!rows.length) {
    $("#tbody").innerHTML = "";
    $("#empty").textContent = ALL.length ? "조건에 맞는 선수가 없습니다." : "아직 등록된 선수가 없습니다.";
    return;
  }
  $("#tbody").innerHTML = rows.map(row).join("");
  $("#tbody").querySelectorAll("button[data-op]").forEach((b) => {
    b.addEventListener("click", () => act(b.dataset.op, b.dataset.who, b));
  });
}

function row(p) {
  const games = playerGames(p);
  const gameCells = Object.keys(games).map((g) => {
    const info = gameById(g);
    const pos = games[g].position || "-";
    return `<span class="chip">${esc(info ? info.short : g)} · ${esc(pos)}</span>`;
  }).join(" ");

  const who = esc(`${p.gameName}#${p.tagLine}`);
  const state = p.approved
    ? '<span class="chip ok">승인</span>'
    : '<span class="chip warn">대기</span>';
  const star = p.proAspirant ? '<span class="star">★</span>' : "";

  return `<tr>
    <td>
      <span class="nm">${esc(p.name)}${star}</span>
      <span class="id">${who}</span>
    </td>
    <td class="hide-sm">${esc(p.region) || "-"}</td>
    <td class="hide-sm">${esc(p.team) || "-"}</td>
    <td>${gameCells}</td>
    <td>${state}</td>
    <td class="ops manage-only">
      <button class="btn btn-sm ghost" data-op="${p.proAspirant ? "unpro" : "pro"}" data-who="${who}">${p.proAspirant ? "★ 끄기" : "★ 켜기"}</button>
      <button class="btn btn-sm ghost" data-op="${p.approved ? "hold" : "approve"}" data-who="${who}">${p.approved ? "보류" : "승인"}</button>
    </td>
  </tr>`;
}

/* ───────── 관리 동작 ───────── */

const OP_LABEL = { pro: "★ 켜기", unpro: "★ 끄기", approve: "승인", hold: "보류" };

async function act(op, who, btn) {
  hide("#okBox");
  hide("#ngBox");

  const key = readKey() || $("#fKey").value.trim();
  if (!key) {
    show("#ngBox");
    $("#ngMsg").textContent = "관리 키를 먼저 입력해 주세요.";
    return;
  }
  if (!confirm(`${who} — ${OP_LABEL[op]} 처리할까요?`)) return;

  if (!SITE.submitUrl) {
    show("#ngBox");
    $("#ngMsg").textContent =
      "자동 등록 주소(submitUrl)가 설정돼 있지 않습니다. Actions 탭의 '선수 관리'를 쓰세요.";
    return;
  }

  btn.disabled = true;
  const before = btn.textContent;
  btn.textContent = "처리 중…";

  try {
    // Apps Script는 CORS 사전요청을 처리하지 못하므로 단순 요청(text/plain)으로 보냅니다.
    const res = await fetch(SITE.submitUrl, {
      method: "POST",
      headers: { "Content-Type": "text/plain;charset=utf-8" },
      body: JSON.stringify({ action: "admin", op: op, who: who, adminKey: key }),
    });
    const out = await res.json().catch(() => ({}));

    if (res.ok && out.ok) {
      show("#okBox");
      $("#okMsg").innerHTML =
        `<strong>${esc(who)} — ${OP_LABEL[op]}</strong> 접수했습니다. ` +
        "1~2분 뒤 이 페이지를 새로고침하면 반영된 값이 보입니다.";
    } else {
      show("#ngBox");
      $("#ngMsg").textContent = out.error || "처리하지 못했습니다. 관리 키를 확인해 주세요.";
    }
  } catch (e) {
    show("#ngBox");
    $("#ngMsg").textContent = "서버에 연결하지 못했습니다.";
  } finally {
    btn.disabled = false;
    btn.textContent = before;
  }
}

function show(sel) { $(sel).classList.add("show"); }
function hide(sel) { $(sel).classList.remove("show"); }
