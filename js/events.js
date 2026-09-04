/**
 * 대회·행사 안내 — data/events.json 을 읽어 랭킹 첫 화면에 띄웁니다.
 *
 * 끝난 대회는 **저절로 내려갑니다.** 운영자가 지우는 걸 잊으면 지난 대회가 계속
 * 걸려 있게 되고, 그런 사이트는 관리를 안 하는 곳처럼 보이기 때문입니다.
 *
 * 팀 모집은 여기서 하지 않습니다. 사이트에 연락 수단을 두면 개인정보를 다루게
 * 되고 미성년 선수가 섞여 있어서, 디스코드로 보냅니다.
 */

async function fetchEvents() {
  try {
    const res = await fetch(`data/events.json?t=${Date.now()}`);
    if (!res.ok) throw new Error(res.status);
    const data = await res.json();
    // 승인 대기(approved === false)는 화면에 내보내지 않습니다.
    // approved 가 아예 없는 항목은 운영자가 손으로 적은 것이라 그대로 보입니다.
    return (data.events || []).filter((e) => e && e.name && e.approved !== false);
  } catch (e) {
    return null;
  }
}

let EVENTS = [];

/** 대회 안내 페이지 — 종목·상태로 걸러 봅니다 */
async function renderEventsPage() {
  const games = typeof GAMES !== "undefined" ? GAMES : [];
  document.querySelector("#fGame").innerHTML =
    '<option value="">전체 종목</option>' +
    games.map((g) => `<option value="${escEv(g.id)}">${escEv(g.name)}</option>`).join("");

  ["#q", "#fGame", "#fState"].forEach((sel) => {
    const el = document.querySelector(sel);
    el.addEventListener("input", drawEvents);
    el.addEventListener("change", drawEvents);
  });

  EVENTS = (await fetchEvents()) || [];
  drawEvents();
}

function drawEvents() {
  const today = kstToday();
  const q = document.querySelector("#q").value.trim().toLowerCase();
  const game = document.querySelector("#fGame").value;
  const state = document.querySelector("#fState").value;

  const stateOf = (e) => {
    if (e.end && e.end < today) return "ended";
    if (e.start && e.start <= today) return "running";
    return "soon";
  };

  const list = EVENTS.filter((e) => {
    if (game && e.game !== game) return false;
    const st = stateOf(e);
    if (state === "open" && st === "ended") return false;
    if (state && state !== "open" && st !== state) return false;
    if (q && !`${e.name} ${e.host || ""} ${e.note || ""}`.toLowerCase().includes(q)) return false;
    return true;
  });

  // 끝나지 않은 대회는 시작이 빠른 순, 끝난 대회는 최근에 끝난 순으로.
  list.sort((a, b) => {
    const ea = stateOf(a) === "ended", eb = stateOf(b) === "ended";
    if (ea !== eb) return ea ? 1 : -1;
    return ea
      ? (b.end || "").localeCompare(a.end || "")
      : (a.start || "9999").localeCompare(b.start || "9999");
  });

  document.querySelector("#count").textContent = `${list.length}건`;
  document.querySelector("#eventList").innerHTML = list.map((e) => card(e, today)).join("");

  const empty = document.querySelector("#eventEmpty");
  empty.hidden = list.length > 0;
  empty.innerHTML = EVENTS.length
    ? "조건에 맞는 대회가 없습니다."
    : "지금은 안내할 대회가 없습니다.<br>알고 계신 대회가 있으면 디스코드로 알려주세요.";
}

/** KST 기준 오늘 (YYYY-MM-DD) */
function kstToday() {
  return new Date(Date.now() + 9 * 60 * 60 * 1000).toISOString().slice(0, 10);
}

function card(e, today) {
  const ended = e.end && e.end < today;
  const running = !ended && e.start && e.start <= today && (!e.end || e.end >= today);
  const state = ended
    ? '<span class="chip">종료</span>'
    : running
      ? '<span class="chip ok">진행 중</span>'
      : '<span class="chip">예정</span>';

  const period = [e.start, e.end].filter(Boolean).join(" ~ ") || "기간 미정";

  // 신청 마감이 남았으면 며칠 남았는지 알려줍니다. 지났으면 굳이 세지 않습니다.
  let apply = "";
  if (e.applyBy) {
    const left = daysBetween(today, e.applyBy);
    apply = left >= 0
      ? `<span class="ev-apply">신청 마감 ${escEv(e.applyBy)}${left === 0 ? " (오늘까지)" : ` (${left}일 남음)`}</span>`
      : `<span class="ev-apply done">신청 마감됨</span>`;
  }

  const link = e.url
    ? `<a class="btn btn-sm ghost" href="${escEv(e.url)}" target="_blank" rel="noopener">공식 안내</a>`
    : "";

  // 포스터는 주최측 저작물입니다. 허락받은 것만 events.json 에 넣도록 안내해 두었습니다.
  const poster = e.poster
    ? `<img class="ev-poster" src="${escEv(e.poster)}" alt="${escEv(e.name)} 포스터" loading="lazy">`
    : "";

  const g = e.game && typeof gameById === "function" ? gameById(e.game) : null;
  const gameChip = g ? `<span class="chip">${escEv(g.short)}</span>` : "";

  return `<article class="ev">
    ${poster}
    <div class="ev-body">
      <div class="ev-top">${state}${gameChip}<span class="ev-name">${escEv(e.name)}</span></div>
      <div class="ev-meta">${escEv(period)}${e.host ? ` · ${escEv(e.host)}` : ""}</div>
      ${e.note ? `<div class="ev-note">${escEv(e.note)}</div>` : ""}
      <div class="ev-foot">${apply}${link}</div>
    </div>
  </article>`;
}

function daysBetween(a, b) {
  return Math.round((Date.parse(b) - Date.parse(a)) / 86400000);
}

function escEv(s) {
  return String(s ?? "").replace(/[&<>"']/g, (c) =>
    ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
}

/**
 * 팀 모집 안내 — 디스코드로 보냅니다.
 *
 * 사이트 안에 모집 게시판을 두지 않는 이유는 두 가지입니다.
 * 연락 수단을 저장하면 개인정보를 다루게 되고(미성년 선수가 섞입니다),
 * 글이 쌓이면 신고·삭제·분쟁을 운영자 한 사람이 감당해야 합니다.
 * 사이트는 '누가 어디 있는지'까지만 보여주고, 대화는 디스코드에서 합니다.
 */
function renderDiscord(sel) {
  const box = document.querySelector(sel);
  if (!box) return;
  if (!SITE.discordUrl) {
    box.hidden = true;
    return;
  }
  box.innerHTML = `
    <div>
      <strong>팀을 찾고 계신가요?</strong>
      팀원 모집과 스크림 약속은 디스코드에서 합니다.
      여기서는 <strong>누가 어느 지역에 있고 어떤 팀에 속해 있는지</strong>까지 보여줍니다.
    </div>
    <a class="btn btn-sm" href="${escEv(SITE.discordUrl)}" target="_blank" rel="noopener">디스코드 열기</a>`;
  box.hidden = false;
}

/* ───────── 대회 제보 ───────── */

/**
 * 제보는 아무나 보낼 수 있습니다. 확인할 대상이 없어 본인 인증을 걸 수 없기
 * 때문에, 보낸 것은 **승인 대기로만 쌓이고 화면에 나오지 않습니다.**
 * 여기서 거르는 것은 사람이 실수로 잘못 적는 경우까지이고,
 * 실제 방어는 Apps Script(도배 제한)와 scripts/events.py(주소 검사)가 합니다.
 */
function setupEventForm() {
  const form = document.querySelector("#evForm");
  if (!form) return;

  const games = typeof GAMES !== "undefined" ? GAMES : [];
  document.querySelector("#eGame").innerHTML =
    '<option value="">선택 안 함</option>' +
    games.map((g) => `<option value="${escEv(g.id)}">${escEv(g.name)}</option>`).join("");

  form.addEventListener("submit", submitEvent);
}

/** 눌렀을 때 코드가 실행되는 주소가 들어오지 않도록 https 만 받습니다 */
function safeUrl(v) {
  return !v || /^https:\/\/\S+$/i.test(v);
}

function evErr(id, show) {
  document.querySelector(id).classList.toggle("show", show);
  return !show;
}

async function submitEvent(e) {
  e.preventDefault();
  const $ = (s) => document.querySelector(s);
  $("#evOk").classList.remove("show");
  $("#evNg").classList.remove("show");

  const data = {
    action: "event",
    name: $("#eName").value.trim(),
    host: $("#eHost").value.trim(),
    game: $("#eGame").value,
    start: $("#eStart").value,
    end: $("#eEnd").value,
    applyBy: $("#eApply").value,
    url: $("#eUrl").value.trim(),
    poster: $("#ePoster").value.trim(),
    note: $("#eNote").value.trim(),
  };

  let ok = true;
  ok = evErr("#errName", !data.name) && ok;
  ok = evErr("#errDate", !!(data.start && data.end && data.end < data.start)) && ok;
  ok = evErr("#errUrl", !safeUrl(data.url)) && ok;
  ok = evErr("#errPoster", !safeUrl(data.poster)) && ok;
  if (!ok) {
    document.querySelector("#evForm .err.show")?.scrollIntoView({ behavior: "smooth", block: "center" });
    return;
  }

  if (!SITE.submitUrl) {
    $("#evNg").classList.add("show");
    $("#evNgMsg").innerHTML =
      "지금은 폼으로 받을 수 없습니다. " +
      (SITE.discordUrl
        ? `<a href="${escEv(SITE.discordUrl)}" target="_blank" rel="noopener">디스코드</a>로 알려주세요.`
        : "아래 이메일로 알려주세요.");
    return;
  }

  const btn = $("#evSubmit");
  btn.disabled = true;
  btn.textContent = "보내는 중…";

  try {
    // Apps Script는 CORS 사전요청을 처리하지 못하므로 단순 요청(text/plain)으로 보냅니다.
    const res = await fetch(SITE.submitUrl, {
      method: "POST",
      headers: { "Content-Type": "text/plain;charset=utf-8" },
      body: JSON.stringify(data),
    });
    const out = await res.json().catch(() => ({}));

    if (res.ok && out.ok) {
      $("#evOk").classList.add("show");
      $("#evOkMsg").textContent =
        "고맙습니다. 운영자가 확인한 뒤 목록에 올립니다. 바로 뜨지는 않으니 조금 기다려 주세요.";
      document.querySelector("#evForm").reset();
    } else {
      $("#evNg").classList.add("show");
      $("#evNgMsg").textContent = out.error || "잠시 후 다시 시도해 주세요.";
    }
  } catch (err) {
    $("#evNg").classList.add("show");
    $("#evNgMsg").textContent = "서버에 연결하지 못했습니다.";
  } finally {
    btn.disabled = false;
    btn.textContent = "제보 보내기";
  }
}
