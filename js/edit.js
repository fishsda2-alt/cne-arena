/**
 * 정보 수정 페이지 로직
 *
 * 등록 페이지와 같은 경로를 씁니다. 다만 아이콘 번호가 날짜마다 바뀌고(verify.js의 editIconId),
 * Apps Script에는 action: "edit" 로 보내 수정용 워크플로가 깨어나게 합니다.
 *
 * 현재 등록된 값은 data/ranking.json 에서 읽어 폼에 미리 채웁니다.
 * (사이트가 이미 읽고 있는 파일이라 서버가 따로 필요 없습니다)
 */

const $ = (sel) => document.querySelector(sel);

/** 1단계에서 불러온 현재 등록 정보 (없으면 null) */
let current = null;
/** 포지션을 바꿀 종목 */
let GAME = null;

document.addEventListener("DOMContentLoaded", init);

function init() {
  $("#contact").textContent = SITE.contact;
  $("#contact2").textContent = SITE.contact;

  fillSelect($("#fRegion"), REGIONS);

  $("#checkBtn").addEventListener("click", lookup);
  $("#riotId").addEventListener("keydown", (e) => {
    if (e.key === "Enter") { e.preventDefault(); lookup(); }
  });

  $("#riotId").addEventListener("input", () => {
    const f = $("#fRiotId");
    if (!f.dataset.touched) f.value = $("#riotId").value;
  });
  $("#fRiotId").addEventListener("input", () => { $("#fRiotId").dataset.touched = "1"; });

  $("#editForm").addEventListener("submit", submit);
}

function fillSelect(sel, items) {
  sel.innerHTML = '<option value="">선택하세요</option>' +
    items.map((v) => `<option value="${v}">${v}</option>`).join("");
}

/** 대소문자·공백 차이를 없앤 비교용 문자열 (scripts/riot.py 의 normalize_riot_id 와 같은 규칙) */
function normalizeRiotId(gameName, tagLine) {
  return `${gameName.trim().toLowerCase()}#${tagLine.trim().replace(/^#/, "").toLowerCase()}`;
}

/** 1단계 — 오늘의 인증 번호를 보여주고, 등록된 정보를 폼에 채웁니다. */
async function lookup() {
  const parsed = splitRiotId($("#riotId").value);
  if (!parsed) {
    $("#hint").classList.add("show");
    $("#result").classList.remove("show");
    return;
  }
  $("#hint").classList.remove("show");

  const id = editIconId(parsed.gameName, parsed.tagLine);
  $("#iconNo").textContent = id;
  $("#iconImg").src = profileIconUrl(id);
  $("#result").classList.add("show");

  current = await findPlayer(parsed);
  const box = $("#curBox");
  box.style.display = "";

  if (!current) {
    $("#curInfo").innerHTML =
      "등록된 선수를 찾지 못했습니다. Riot ID를 다시 확인해 주세요.<br>" +
      "아직 등록하지 않으셨다면 <a href='register.html'>선수 등록</a>을 먼저 해 주세요.";
    $("#gameField").hidden = true;
    return;
  }

  const games = Object.keys(playerGames(current));
  $("#curInfo").innerHTML = [
    ["표시 닉네임", current.name],
    ["지역", current.region],
    ["소속", current.team || "(없음)"],
  ].map(([k, v]) => `${k}: <strong>${escapeHtml(v || "-")}</strong>`).join(" · ") +
    "<br>등록 종목: " + games.map((g) => {
      const info = gameById(g);
      const pos = (playerGames(current)[g] || {}).position || "-";
      return `<strong>${escapeHtml(info ? info.name : g)}</strong>(${escapeHtml(pos)})`;
    }).join(" · ");

  // 폼에 현재 값을 채워 둡니다 — 바꾸지 않을 항목은 그대로 두면 됩니다.
  $("#fNick").value = current.name || "";
  $("#fTeam").value = current.team || "";
  $("#fRegion").value = current.region || "";

  buildGamePick(games);
}

/** 등록한 종목이 둘 이상이면 어느 종목의 포지션을 바꿀지 고르게 합니다 */
function buildGamePick(games) {
  const field = $("#gameField");
  const wrap = $("#gamePick");
  field.hidden = games.length < 2;
  wrap.innerHTML = games.map((g) => {
    const info = gameById(g);
    return `<button type="button" data-game="${escapeHtml(g)}">${escapeHtml(info ? info.name : g)}</button>`;
  }).join("");
  wrap.querySelectorAll("button").forEach((b) => {
    b.addEventListener("click", () => pickGame(b.dataset.game));
  });
  pickGame(games[0]);
}

function pickGame(id) {
  GAME = id;
  $("#gamePick").querySelectorAll("button").forEach((b) => {
    b.classList.toggle("active", b.dataset.game === id);
  });
  const info = gameById(id);
  if (info) {
    document.documentElement.style.setProperty("--accent", info.accent);
    document.documentElement.style.setProperty("--accent-hover", info.accentHover);
    fillSelect($("#fPosition"), info.positions);
    $("#posGame").textContent = info.name;
  }
  $("#fPosition").value = (playerGames(current)[id] || {}).position || "";
}

/**
 * data/players.json 에서 이 Riot ID의 선수를 찾습니다.
 * 랭킹 파일이 아니라 명단을 읽는 이유는, 승인 대기 중이거나 아직 랭킹을 열지 않은
 * 종목(발로란트)에 등록한 선수도 자기 정보를 고칠 수 있어야 하기 때문입니다.
 * (players.json 은 공개 저장소에 그대로 있는 파일이라 새로 노출되는 정보는 없습니다)
 */
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
  return String(s).replace(/[&<>"']/g, (c) =>
    ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
}

function setError(id, show) {
  $(id).classList.toggle("show", show);
  return !show;
}

function collect() {
  const team = $("#fTeam").value.trim();
  return {
    action: "edit",
    game: GAME || "",
    riotId: $("#fRiotId").value.trim(),
    nickname: $("#fNick").value.trim(),
    region: $("#fRegion").value,
    position: $("#fPosition").value,
    team: team,
    // 빈 값은 "안 바꿈"이라는 뜻이라, 소속을 지우려는 것인지 따로 알려 줍니다.
    clearTeam: !team && !!(current && current.team),
  };
}

/** 현재 값과 하나도 다르지 않으면 보낼 필요가 없습니다. (현재 값을 모르면 그냥 보냅니다) */
function hasChange(data) {
  if (!current) return true;
  const nowPos = (playerGames(current)[GAME] || {}).position || "";
  return data.nickname !== (current.name || "") ||
    data.region !== (current.region || "") ||
    data.position !== nowPos ||
    data.team !== (current.team || "");
}

function validate(data) {
  let ok = true;
  ok = setError("#errRiotId", !splitRiotId(data.riotId)) && ok;
  ok = setError("#errIcon", !$("#fIcon").checked) && ok;
  ok = setError("#errNone", !hasChange(data)) && ok;
  return ok;
}

async function submit(e) {
  e.preventDefault();
  hide("#okBox");
  hide("#ngBox");

  const data = collect();
  if (!validate(data)) {
    $("#editForm").querySelector(".err.show")?.scrollIntoView({ behavior: "smooth", block: "center" });
    return;
  }

  const parsed = splitRiotId(data.riotId);
  data.expectedIcon = editIconId(parsed.gameName, parsed.tagLine);

  if (!SITE.submitUrl) {
    openMail(data);
    return;
  }

  const btn = $("#submitBtn");
  btn.disabled = true;
  btn.textContent = "수정하는 중…";

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
      // 아이콘 인증은 접수 뒤 서버에서 이뤄지므로 여기서 "성공"이라고 단정하지 않습니다.
      $("#okMsg").innerHTML =
        "접수되었습니다. <strong>1~2분 뒤 랭킹 페이지를 새로고침</strong>해 주세요.<br>" +
        "바뀐 내용이 보이면 완료입니다.<br><br>" +
        "5분이 지나도 그대로라면 <strong>프로필 아이콘이 " +
        data.expectedIcon + "번으로 바뀌었는지</strong> 확인하고 다시 신청해 주세요. " +
        "아이콘이 다르면 본인 확인에 실패해 반영되지 않습니다. " +
        "(변경 직후에는 반영까지 몇 분 걸립니다)";
    } else {
      show("#ngBox");
      $("#ngMsg").textContent = out.error ||
        "잠시 후 다시 시도해 주세요. 계속 실패하면 아래 이메일로 신청해 주세요.";
    }
  } catch (err) {
    show("#ngBox");
    $("#ngMsg").textContent =
      "서버에 연결하지 못했습니다. 이메일 신청 창을 대신 열어 드립니다.";
    openMail(data);
  } finally {
    btn.disabled = false;
    btn.textContent = "수정 신청하기";
  }
}

/** 입력값이 그대로 채워진 이메일 작성 창을 엽니다. */
function openMail(data) {
  const body = [
    "[충남 아마추어 랭킹] 선수 정보 수정 신청",
    "",
    `Riot ID: ${data.riotId}`,
    `표시 닉네임: ${data.nickname}`,
    `지역: ${data.region}`,
    `주 포지션: ${data.position} (${data.game})`,
    `소속: ${data.team || (data.clearTeam ? "(없음으로 변경)" : "(변경 없음)")}`,
    "",
    `인증 아이콘: ${data.expectedIcon}번으로 변경 완료 (${kstDateString()} 기준)`,
  ].join("\n");

  const href =
    `mailto:${SITE.contact}` +
    `?subject=${encodeURIComponent("[랭킹] 선수 정보 수정 신청 - " + data.nickname)}` +
    `&body=${encodeURIComponent(body)}`;
  location.href = href;

  show("#okBox");
  $("#okMsg").textContent =
    "입력하신 내용이 담긴 이메일 창을 열었습니다. 그대로 보내주시면 운영자가 확인 후 수정합니다. " +
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
