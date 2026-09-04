/**
 * 등록 삭제 페이지 로직
 *
 * 정보 수정과 같은 경로를 쓰되, 아이콘 번호가 **삭제용**이라 수정용과 다릅니다.
 * (같은 번호면 정보를 고치려고 아이콘을 바꿔 둔 선수를 같은 날 남이 지울 수 있습니다)
 *
 * 되돌릴 수 없는 동작이라 세 겹으로 막아 둡니다.
 *   ① 아이콘 재인증 ② Riot ID를 다시 타이핑 ③ 되돌릴 수 없음에 동의
 */

const $ = (sel) => document.querySelector(sel);

let current = null;   // players.json 에서 찾은 내 정보
let SCOPE = null;     // "all" 또는 종목 코드

document.addEventListener("DOMContentLoaded", init);

function init() {
  $("#contact").textContent = SITE.contact;
  $("#contactHold").textContent = SITE.contact;

  $("#checkBtn").addEventListener("click", lookup);
  $("#riotId").addEventListener("keydown", (e) => {
    if (e.key === "Enter") { e.preventDefault(); lookup(); }
  });
  $("#riotId").addEventListener("input", () => {
    const f = $("#fRiotId");
    if (!f.dataset.touched) f.value = $("#riotId").value;
    syncConfirmTarget();
  });
  $("#fRiotId").addEventListener("input", () => {
    $("#fRiotId").dataset.touched = "1";
    syncConfirmTarget();
  });

  $("#rmForm").addEventListener("submit", submit);
  buildScope([]);
}

function syncConfirmTarget() {
  const v = $("#fRiotId").value.trim();
  $("#confirmTarget").textContent = v || "Riot ID";
}

function normalizeRiotId(gameName, tagLine) {
  return `${gameName.trim().toLowerCase()}#${tagLine.trim().replace(/^#/, "").toLowerCase()}`;
}

async function lookup() {
  const parsed = splitRiotId($("#riotId").value);
  if (!parsed) {
    $("#hint").classList.add("show");
    $("#result").classList.remove("show");
    return;
  }
  $("#hint").classList.remove("show");

  // 삭제용 번호 — 수정용과 다릅니다.
  const id = removeIconId(parsed.gameName, parsed.tagLine);
  $("#iconNo").textContent = id;
  $("#iconImg").src = profileIconUrl(id);
  $("#result").classList.add("show");

  current = await findPlayer(parsed);
  const box = $("#curBox");
  box.style.display = "";

  if (!current) {
    $("#curInfo").innerHTML =
      "등록된 선수를 찾지 못했습니다. Riot ID를 다시 확인해 주세요. " +
      "이미 삭제되었을 수도 있습니다.";
    buildScope([]);
    return;
  }

  const games = Object.keys(playerGames(current));
  $("#curInfo").innerHTML =
    `<strong>${escapeHtml(current.name)}</strong> · 등록 종목: ` +
    games.map((g) => {
      const info = gameById(g);
      return escapeHtml(info ? info.name : g);
    }).join(" · ");
  buildScope(games);
}

/** 지울 범위 — 종목이 하나뿐이면 '전체 삭제'만 보여줍니다 */
function buildScope(games) {
  const wrap = $("#scopePick");
  const items = [];
  if (games.length > 1) {
    for (const g of games) {
      const info = gameById(g);
      items.push({ id: g, label: `${info ? info.name : g}만 해지` });
    }
  }
  items.push({ id: "all", label: games.length > 1 ? "전체 삭제" : "등록 삭제" });

  wrap.innerHTML = items
    .map((it) => `<button type="button" data-scope="${escapeHtml(it.id)}">${escapeHtml(it.label)}</button>`)
    .join("");
  wrap.querySelectorAll("button").forEach((b) => {
    b.addEventListener("click", () => pickScope(b.dataset.scope));
  });
  SCOPE = null;
  if (items.length === 1) pickScope("all");
}

function pickScope(id) {
  SCOPE = id;
  $("#scopePick").querySelectorAll("button").forEach((b) => {
    b.classList.toggle("active", b.dataset.scope === id);
  });
}

/** data/players.json 에서 찾습니다 (랭킹을 아직 열지 않은 종목도 보이도록) */
async function findPlayer(parsed) {
  try {
    const res = await fetch(`data/players.json?t=${Date.now()}`);
    if (!res.ok) return null;
    const data = await res.json();
    const key = normalizeRiotId(parsed.gameName, parsed.tagLine);
    return (data.players || []).find(
      (p) => normalizeRiotId(p.gameName, p.tagLine) === key
    ) || null;
  } catch (err) {
    return null;
  }
}

function escapeHtml(s) {
  return String(s ?? "").replace(/[&<>"']/g, (c) =>
    ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
}

function setError(id, show) {
  $(id).classList.toggle("show", show);
  return !show;
}

function collect() {
  return {
    action: "remove",
    // "all" 이면 종목을 비워 보냅니다 — 워크플로가 전체 삭제로 처리합니다.
    game: SCOPE === "all" ? "" : (SCOPE || ""),
    riotId: $("#fRiotId").value.trim(),
  };
}

function validate(data) {
  const typed = $("#fConfirm").value.trim().toLowerCase();
  const target = data.riotId.toLowerCase();
  let ok = true;
  ok = setError("#errRiotId", !splitRiotId(data.riotId)) && ok;
  ok = setError("#errScope", !SCOPE) && ok;
  ok = setError("#errConfirm", !target || typed !== target) && ok;
  ok = setError("#errIcon", !$("#fIcon").checked) && ok;
  ok = setError("#errAgree", !$("#fAgree").checked) && ok;
  return ok;
}

async function submit(e) {
  e.preventDefault();
  hide("#okBox");
  hide("#ngBox");

  const data = collect();
  if (!validate(data)) {
    $("#rmForm").querySelector(".err.show")?.scrollIntoView({ behavior: "smooth", block: "center" });
    return;
  }

  const parsed = splitRiotId(data.riotId);
  data.expectedIcon = removeIconId(parsed.gameName, parsed.tagLine);

  if (!SITE.submitUrl) {
    openMail(data);
    return;
  }

  const btn = $("#submitBtn");
  btn.disabled = true;
  btn.textContent = "삭제하는 중…";

  try {
    // Apps Script는 CORS 사전요청을 처리하지 못하므로 단순 요청(text/plain)으로 보냅니다.
    const res = await fetch(SITE.submitUrl, {
      method: "POST",
      headers: { "Content-Type": "text/plain;charset=utf-8" },
      body: JSON.stringify(data),
    });
    const out = await res.json().catch(() => ({}));

    if (res.ok && out.ok) {
      show("#okBox");
      $("#okMsg").innerHTML =
        "접수되었습니다. <strong>1~2분 뒤 랭킹 페이지를 새로고침</strong>해 주세요.<br>" +
        "이름이 사라졌으면 삭제가 끝난 것입니다.<br><br>" +
        "5분이 지나도 남아 있으면 <strong>프로필 아이콘이 " +
        data.expectedIcon + "번으로 바뀌었는지</strong> 확인하고 다시 신청해 주세요. " +
        "(삭제용 번호는 정보 수정용과 다릅니다)";
      $("#rmForm").reset();
    } else {
      show("#ngBox");
      $("#ngMsg").textContent = out.error ||
        "잠시 후 다시 시도해 주세요. 계속 실패하면 아래 이메일로 요청해 주세요.";
    }
  } catch (err) {
    show("#ngBox");
    $("#ngMsg").textContent =
      "서버에 연결하지 못했습니다. 이메일 신청 창을 대신 열어 드립니다.";
    openMail(data);
  } finally {
    btn.disabled = false;
    btn.textContent = "삭제 신청하기";
  }
}

function openMail(data) {
  const info = data.game ? gameById(data.game) : null;
  const body = [
    "[충남 아마추어 랭킹] 등록 삭제 신청",
    "",
    `Riot ID: ${data.riotId}`,
    `삭제 범위: ${info ? info.name + "만 해지" : "전체 삭제"}`,
    "",
    `인증 아이콘: ${data.expectedIcon}번으로 변경 완료 (${kstDateString()} 기준, 삭제용)`,
    "되돌릴 수 없음을 확인했습니다.",
  ].join("\n");

  const href =
    `mailto:${SITE.contact}` +
    `?subject=${encodeURIComponent("[랭킹] 등록 삭제 신청 - " + data.riotId)}` +
    `&body=${encodeURIComponent(body)}`;
  location.href = href;

  show("#okBox");
  $("#okMsg").textContent =
    "입력하신 내용이 담긴 이메일 창을 열었습니다. 그대로 보내주시면 운영자가 확인 후 처리합니다. " +
    "메일 창이 뜨지 않으면 아래 내용을 복사해 " + SITE.contact + " 로 보내주세요.";

  const pre = document.createElement("pre");
  pre.className = "mail-preview";
  pre.textContent = body;
  $("#okBox").appendChild(pre);
}

function show(sel) { $(sel).classList.add("show"); }
function hide(sel) {
  $(sel).classList.remove("show");
  $(sel).querySelector(".mail-preview")?.remove();
}
