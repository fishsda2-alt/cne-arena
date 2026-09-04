/**
 * 선수 등록 페이지 로직
 *
 * 등록 경로는 두 가지입니다.
 *  1) config.js의 SITE.submitUrl 이 설정돼 있으면 → 그 주소(Google Apps Script)로 바로 전송.
 *     Apps Script가 GitHub Actions를 깨워 아이콘 인증 후 자동 등록합니다.
 *  2) 비어 있으면 → 입력값이 그대로 채워진 이메일 창이 열립니다. (운영자가 수동 등록)
 */

const $ = (sel) => document.querySelector(sel);

document.addEventListener("DOMContentLoaded", init);

function init() {
  $("#contact").textContent = SITE.contact;

  fillSelect($("#fRegion"), REGIONS);
  fillSelect($("#fPosition"), POSITIONS);

  // 1단계 — 아이콘 번호 확인
  $("#checkBtn").addEventListener("click", checkIcon);
  $("#riotId").addEventListener("keydown", (e) => {
    if (e.key === "Enter") { e.preventDefault(); checkIcon(); }
  });

  // 1단계에 입력한 Riot ID를 3단계 폼에 자동으로 옮겨 적어 줍니다.
  $("#riotId").addEventListener("input", () => {
    const f = $("#fRiotId");
    if (!f.dataset.touched) f.value = $("#riotId").value;
  });
  $("#fRiotId").addEventListener("input", () => { $("#fRiotId").dataset.touched = "1"; });

  $("#regForm").addEventListener("submit", submit);
}

function fillSelect(sel, items) {
  sel.innerHTML = '<option value="">선택하세요</option>' +
    items.map((v) => `<option value="${v}">${v}</option>`).join("");
}

function checkIcon() {
  const parsed = splitRiotId($("#riotId").value);
  if (!parsed) {
    $("#hint").classList.add("show");
    $("#result").classList.remove("show");
    return;
  }
  $("#hint").classList.remove("show");
  const id = expectedIconId(parsed.gameName, parsed.tagLine);
  $("#iconNo").textContent = id;
  $("#iconImg").src = profileIconUrl(id);
  $("#result").classList.add("show");
}

/** 오류 문구 표시 토글 */
function setError(id, show) {
  $(id).classList.toggle("show", show);
  return !show;
}

function collect() {
  return {
    riotId: $("#fRiotId").value.trim(),
    nickname: $("#fNick").value.trim(),
    region: $("#fRegion").value,
    position: $("#fPosition").value,
    team: $("#fTeam").value.trim(),
  };
}

function validate(data) {
  let ok = true;
  ok = setError("#errRiotId", !splitRiotId(data.riotId)) && ok;
  ok = setError("#errNick", !data.nickname) && ok;
  ok = setError("#errRegion", !data.region) && ok;
  ok = setError("#errPosition", !data.position) && ok;
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
    $("#regForm").querySelector(".err.show")?.scrollIntoView({ behavior: "smooth", block: "center" });
    return;
  }

  const parsed = splitRiotId(data.riotId);
  data.expectedIcon = expectedIconId(parsed.gameName, parsed.tagLine);

  if (!SITE.submitUrl) {
    openMail(data);
    return;
  }

  const btn = $("#submitBtn");
  btn.disabled = true;
  btn.textContent = "등록하는 중…";

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
      // 아이콘 인증은 접수 뒤 서버에서 이뤄지므로, 여기서는 "성공"이라고 단정하지 않습니다.
      $("#okMsg").innerHTML =
        "접수되었습니다. <strong>1~2분 뒤 랭킹 페이지를 새로고침</strong>해 주세요.<br>" +
        "이름이 보이면 등록 완료입니다. 랭크 배치 전이라면 '언랭크'로 표시되고, " +
        "배치가 끝나면 다음 갱신 때 티어가 채워집니다.<br><br>" +
        "5분이 지나도 보이지 않으면 <strong>프로필 아이콘이 " +
        data.expectedIcon + "번으로 바뀌었는지</strong> 확인하고 다시 신청해 주세요. " +
        "아이콘이 다르면 본인 확인에 실패해 등록되지 않습니다. " +
        "(변경 직후에는 반영까지 몇 분 걸립니다)";
      $("#regForm").reset();
    } else {
      show("#ngBox");
      $("#ngMsg").textContent = out.error ||
        "잠시 후 다시 시도해 주세요. 계속 실패하면 아래 이메일로 신청해 주세요.";
    }
  } catch (err) {
    // 네트워크 실패 시에는 이메일 경로로 자연스럽게 넘어갑니다.
    show("#ngBox");
    $("#ngMsg").textContent =
      "서버에 연결하지 못했습니다. 이메일 신청 창을 대신 열어 드립니다.";
    openMail(data);
  } finally {
    btn.disabled = false;
    btn.textContent = "등록 신청하기";
  }
}

/** 입력값이 그대로 채워진 이메일 작성 창을 엽니다. */
function openMail(data) {
  const body = [
    "[충남 아마추어 랭킹] 선수 등록 신청",
    "",
    `Riot ID: ${data.riotId}`,
    `표시 닉네임: ${data.nickname}`,
    `지역: ${data.region}`,
    `주 포지션: ${data.position}`,
    `소속: ${data.team || "(없음)"}`,
    "",
    `인증 아이콘: ${data.expectedIcon}번으로 변경 완료`,
    "개인정보 수집·이용 동의: 예",
  ].join("\n");

  const href =
    `mailto:${SITE.contact}` +
    `?subject=${encodeURIComponent("[랭킹] 선수 등록 신청 - " + data.nickname)}` +
    `&body=${encodeURIComponent(body)}`;
  location.href = href;

  show("#okBox");
  $("#okMsg").textContent =
    "입력하신 내용이 담긴 이메일 창을 열었습니다. 그대로 보내주시면 운영자가 확인 후 등록합니다. " +
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
