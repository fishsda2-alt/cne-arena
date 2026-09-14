/**
 * 스타크래프트: 리마스터 선수 등록 (scr.html)
 *
 *  1) 선수가 래더 화면 스크린샷을 고르거나 붙여넣습니다.
 *  2) **브라우저 안에서** tesseract.js 로 글자를 읽습니다. 파일은 어디에도 올라가지 않습니다.
 *  3) js/scr-parse.js 가 등급·레이팅·전적을 추려 입력칸을 미리 채웁니다.
 *  4) 선수가 스크린샷과 대조해 확인·수정한 값만 Apps Script → GitHub Actions 로 보냅니다.
 *
 * 인식 결과는 검증이 아니라 **입력을 덜어주는 보조**입니다. 그래서 새로 읽을 때마다
 * "스크린샷과 같은지 확인했습니다" 체크를 풀어, 반드시 다시 대조하게 합니다.
 */

const $ = (sel) => document.querySelector(sel);

/** tesseract.js — 스크린샷을 고를 때만 불러옵니다 (페이지만 열어본 사람에게 수 MB를 받게 하지 않도록) */
const TESSERACT_SRC = "https://cdn.jsdelivr.net/npm/tesseract.js@5.1.1/dist/tesseract.min.js";
const MAX_FILE = 15 * 1024 * 1024;

const GAME_SCR = gameById("scr");
const LADDER_FIELDS = [
  ["grade", "#fGrade", "#mGrade"],
  ["rating", "#fRating", "#mRating"],
  ["wins", "#fWins", "#mWins"],
  ["losses", "#fLosses", "#mLosses"],
  ["ladderRank", "#fLadderRank", "#mLadderRank"],
];

let shotReady = false;  // 스크린샷을 한 번이라도 올렸는지
let ocrRun = 0;         // 읽는 도중 다른 파일을 고르면 먼저 것은 버립니다
let previewUrl = null;

document.addEventListener("DOMContentLoaded", init);

function init() {
  $("#contact").textContent = SITE.contact;

  if (GAME_SCR) {
    document.documentElement.style.setProperty("--accent", GAME_SCR.accent);
    document.documentElement.style.setProperty("--accent-hover", GAME_SCR.accentHover);
  }

  fillSelect($("#fRegion"), REGIONS.map((r) => [r, r]));
  fillSelect($("#fRace"), (GAME_SCR ? GAME_SCR.positions : []).map((r) => [r, r]));
  fillSelect($("#fGrade"), Object.entries(GAME_SCR ? GAME_SCR.tiers : {}).map(([k, v]) => [k, v.ko]));

  // 스크린샷 고르기 · 끌어다 놓기 · 붙여넣기
  $("#shotFile").addEventListener("change", (e) => {
    const f = e.target.files && e.target.files[0];
    if (f) handleFile(f);
    e.target.value = "";  // 같은 파일을 다시 골라도 change 가 나도록
  });
  const drop = $("#shotDrop");
  drop.addEventListener("keydown", (e) => {
    if (e.key === "Enter" || e.key === " ") { e.preventDefault(); $("#shotFile").click(); }
  });
  ["dragenter", "dragover"].forEach((t) => drop.addEventListener(t, (e) => {
    e.preventDefault();
    drop.classList.add("over");
  }));
  ["dragleave", "drop"].forEach((t) => drop.addEventListener(t, () => drop.classList.remove("over")));
  drop.addEventListener("drop", (e) => {
    e.preventDefault();
    const f = [...(e.dataTransfer?.files || [])].find((x) => x.type.startsWith("image/"));
    if (f) handleFile(f);
  });
  document.addEventListener("paste", (e) => {
    // 입력칸에 글자를 붙여넣는 중이면 방해하지 않습니다.
    const item = [...(e.clipboardData?.items || [])].find((i) => i.type.startsWith("image/"));
    if (!item) return;
    e.preventDefault();
    handleFile(item.getAsFile());
  });

  // 배치 전을 고르면 레이팅이 필요 없습니다.
  $("#fGrade").addEventListener("change", () => {
    $("#fRating").disabled = $("#fGrade").value === "U";
    if ($("#fRating").disabled) $("#fRating").value = "";
  });

  $("#scrForm").addEventListener("submit", submit);
}

function fillSelect(sel, pairs) {
  sel.innerHTML = '<option value="">선택하세요</option>' +
    pairs.map(([v, t]) => `<option value="${esc(v)}">${esc(t)}</option>`).join("");
}

function esc(s) {
  return String(s ?? "").replace(/[&<>"']/g, (c) =>
    ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
}

/* ───────── 스크린샷 → 글자 ───────── */

async function handleFile(file) {
  setError("#errShot", false);
  if (!file || !file.type.startsWith("image/")) {
    showStatus("이미지 파일만 올릴 수 있습니다.", null, true);
    return;
  }
  if (file.size > MAX_FILE) {
    showStatus("파일이 너무 큽니다 (15MB 이하). 게임 창만 잘라서 올려 주세요.", null, true);
    return;
  }

  const run = ++ocrRun;
  shotReady = true;

  if (previewUrl) URL.revokeObjectURL(previewUrl);
  previewUrl = URL.createObjectURL(file);
  $("#shotImg").src = previewUrl;
  $("#confirmCard").hidden = false;
  $("#profileCard").hidden = false;

  // 새 스크린샷이면 다시 대조해야 합니다.
  $("#fMatch").checked = false;
  hide("#okBox");
  hide("#ngBox");
  clearLadderFields();

  showStatus("글자 인식 도구를 불러오는 중…", 0.02);

  let text = "";
  try {
    await loadTesseract();
    if (run !== ocrRun) return;

    const canvas = await prepareImage(file);
    if (run !== ocrRun) return;

    const worker = await Tesseract.createWorker(["kor", "eng"], 1, {
      logger: (m) => { if (run === ocrRun) showProgress(m); },
    });
    try {
      const first = await worker.recognize(canvas);
      text = first.data.text || "";

      // 손본 그림에서 아무것도 못 찾으면, 손보지 않은 원본으로 한 번 더 읽어 봅니다.
      // 화면 구성이 예상과 달라 손보기가 오히려 글자를 해치는 경우를 대비합니다.
      if (run === ocrRun && !ScrParse.parseLadderText(text).found.length) {
        showStatus("다른 방식으로 한 번 더 읽는 중…", 0.5, false);
        const second = await worker.recognize(await prepareImage(file, { raw: true }));
        const again = second.data.text || "";
        if (ScrParse.parseLadderText(again).found.length) text = again;
      }
    } finally {
      await worker.terminate();
    }
  } catch (err) {
    if (run !== ocrRun) return;
    console.error(err);
    showStatus(
      "글자를 읽지 못했습니다 (인터넷 연결이나 브라우저 문제일 수 있습니다). " +
      "아래 칸에 스크린샷을 보고 직접 입력해 주세요.", 1, true);
    markAll([]);
    $("#confirmCard").scrollIntoView({ behavior: "smooth", block: "start" });
    return;
  }
  if (run !== ocrRun) return;

  const got = ScrParse.parseLadderText(text);
  $("#ocrRaw").textContent = text.trim() || "(읽어낸 글자가 없습니다)";
  applyParsed(got);

  if (got.found.length) {
    showStatus(
      `${got.found.length}개 칸을 채웠습니다. 스크린샷과 같은지 꼭 한 칸씩 확인해 주세요.`, 1, false);
  } else {
    showStatus(
      "숫자를 찾지 못했습니다. 아래 칸에 스크린샷을 보고 직접 입력해 주세요. " +
      "(게임 창을 크게 띄워 다시 찍으면 잘 읽힐 수 있습니다)", 1, true);
  }
  $("#confirmCard").scrollIntoView({ behavior: "smooth", block: "start" });
}

function loadTesseract() {
  if (window.Tesseract) return Promise.resolve();
  if (loadTesseract.pending) return loadTesseract.pending;
  loadTesseract.pending = new Promise((resolve, reject) => {
    const s = document.createElement("script");
    s.src = TESSERACT_SRC;
    s.onload = () => resolve();
    s.onerror = () => {
      loadTesseract.pending = null;  // 다음에 다시 시도할 수 있게
      reject(new Error("tesseract.js 를 불러오지 못했습니다"));
    };
    document.head.appendChild(s);
  });
  return loadTesseract.pending;
}

/**
 * 인식 전에 그림을 손봅니다.
 *  · 작은 캡처는 키우고, 너무 큰 것은 줄입니다 (인식기는 글자 높이 20~40px에서 잘 읽습니다)
 *  · 흑백으로 바꾸고, 어두운 바탕에 밝은 글자(게임 화면)면 뒤집어 흰 바탕 검은 글자로
 *  · 대비를 넓힙니다
 * raw: true 면 크기만 맞추고 손대지 않은 그림을 돌려줍니다 (두 번째 시도용).
 */
async function prepareImage(file, { raw = false } = {}) {
  const img = await decodeImage(file);
  const w0 = img.width;
  const h0 = img.height;
  let scale = 1;
  if (w0 < 1600) scale = Math.min(2.5, 1600 / w0);
  else if (w0 > 2800) scale = 2800 / w0;

  const canvas = document.createElement("canvas");
  canvas.width = Math.round(w0 * scale);
  canvas.height = Math.round(h0 * scale);
  const ctx = canvas.getContext("2d", { willReadFrequently: true });
  ctx.imageSmoothingQuality = "high";
  ctx.drawImage(img, 0, 0, canvas.width, canvas.height);
  if (raw) return canvas;

  const im = ctx.getImageData(0, 0, canvas.width, canvas.height);
  const px = im.data;
  const val = new Uint8ClampedArray(px.length / 4);
  const hist = new Uint32Array(256);
  let sum = 0;
  for (let i = 0, j = 0; i < px.length; i += 4, j++) {
    // 게임 글자는 금색·청록색처럼 색이 든 경우가 많아, 밝기 대신 가장 밝은 채널을 씁니다.
    // (밝기로 계산하면 파란 글자가 어두운 바탕과 비슷한 값이 됩니다)
    const v = Math.max(px[i], px[i + 1], px[i + 2]);
    val[j] = v;
    hist[v]++;
    sum += v;
  }
  const invert = sum / val.length < 110;

  // 대비 넓히기.
  // ⚠ 밝은 쪽을 크게 잘라내면 안 됩니다. 래더 화면에서 글자는 전체 픽셀의 1~3% 뿐이라,
  //   처음에 위아래 2%씩 잘랐더니 글자가 통째로 잘려 어두운 판넬과 같은 흰색으로 뭉개졌고
  //   또렷한 시험 그림에서도 아무것도 못 읽었습니다.
  //   어두운 쪽 1%, 밝은 쪽 0.1%만 자르고, 범위가 좁으면 넓히지 않습니다.
  const n = val.length;
  let lo = 0;
  let hi = 255;
  for (let acc = 0; lo < 255 && acc + hist[lo] < n * 0.01; lo++) acc += hist[lo];
  for (let acc = 0; hi > 0 && acc + hist[hi] < n * 0.001; hi--) acc += hist[hi];
  const span = hi - lo;

  for (let i = 0, j = 0; i < px.length; i += 4, j++) {
    let v = span >= 64 ? ((val[j] - lo) * 255) / span : val[j];
    if (invert) v = 255 - v;
    px[i] = px[i + 1] = px[i + 2] = v;
  }
  ctx.putImageData(im, 0, 0);
  return canvas;
}

function decodeImage(file) {
  if (window.createImageBitmap) return createImageBitmap(file);
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.onload = () => resolve(img);
    img.onerror = reject;
    img.src = URL.createObjectURL(file);
  });
}

function showProgress(m) {
  const names = {
    "loading tesseract core": "글자 인식 도구를 불러오는 중",
    "initializing tesseract": "준비하는 중",
    "loading language traineddata": "한글·영문 인식 데이터를 받는 중",
    "initializing api": "준비하는 중",
    "recognizing text": "스크린샷에서 글자를 읽는 중",
  };
  const label = names[m.status] || "처리하는 중";
  // 단계마다 진행률이 0부터 다시 시작하므로, 전체 막대는 단계별로 구간을 나눠 채웁니다.
  const base = m.status === "recognizing text" ? 0.35 : 0.05;
  const width = m.status === "recognizing text" ? 0.65 : 0.3;
  const p = base + width * (typeof m.progress === "number" ? m.progress : 0);
  showStatus(`${label}… ${Math.round((m.progress || 0) * 100)}%`, p, false);
}

function showStatus(msg, progress, warn) {
  const box = $("#ocrStatus");
  box.hidden = false;
  box.classList.toggle("warn", !!warn);
  $("#ocrMsg").textContent = msg;
  if (typeof progress === "number") {
    $("#ocrBar").style.width = `${Math.round(Math.min(1, Math.max(0, progress)) * 100)}%`;
  }
}

/* ───────── 읽은 값 → 입력칸 ───────── */

function clearLadderFields() {
  for (const [, input, mark] of LADDER_FIELDS) {
    $(input).value = "";
    $(mark).className = "mark";
    $(mark).textContent = "";
  }
  $("#fRating").disabled = false;
  $("#ocrRaw").textContent = "";
}

function applyParsed(got) {
  for (const [key, input] of LADDER_FIELDS) {
    if (got[key] !== null && got[key] !== undefined) $(input).value = String(got[key]);
  }
  $("#fRating").disabled = $("#fGrade").value === "U";
  markAll(got.found);
}

/** 채운 칸엔 '읽음', 못 채운 칸엔 '직접 입력' 표시 — 어디를 봐야 하는지 알려줍니다 */
function markAll(found) {
  for (const [key, input, mark] of LADDER_FIELDS) {
    const el = $(mark);
    if (found.includes(key)) {
      el.className = "mark auto";
      el.textContent = "읽음 · 확인 필요";
    } else if (!$(input).value) {
      el.className = "mark need";
      el.textContent = "직접 입력";
    } else {
      el.className = "mark";
      el.textContent = "";
    }
  }
}

/* ───────── 제출 ───────── */

function setError(sel, show) {
  $(sel).classList.toggle("show", show);
  return !show;
}

const DIGITS = /^\d{1,8}$/;
const num = (sel) => $(sel).value.replace(/[,\s]/g, "");

function collect() {
  return {
    action: "scr",
    scrId: $("#fScrId").value.trim(),
    nickname: $("#fNick").value.trim(),
    region: $("#fRegion").value,
    race: $("#fRace").value,
    team: $("#fTeam").value.trim(),
    grade: $("#fGrade").value,
    rating: $("#fGrade").value === "U" ? "" : num("#fRating"),
    wins: num("#fWins"),
    losses: num("#fLosses"),
    ladderRank: num("#fLadderRank"),
  };
}

function validate(d) {
  let ok = true;
  ok = setError("#errShot", !shotReady) && ok;
  ok = setError("#errGrade", !d.grade) && ok;
  const ratingBad = d.grade !== "U" && !(DIGITS.test(d.rating) && Number(d.rating) <= 5000);
  ok = setError("#errRating", ratingBad) && ok;
  ok = setError("#errWL", (d.wins && !DIGITS.test(d.wins)) || (d.losses && !DIGITS.test(d.losses))) && ok;
  ok = setError("#errLadderRank", !!d.ladderRank && !(DIGITS.test(d.ladderRank) && Number(d.ladderRank) >= 1)) && ok;
  ok = setError("#errScrId", !d.scrId) && ok;
  ok = setError("#errNick", !d.nickname) && ok;
  ok = setError("#errRegion", !d.region) && ok;
  ok = setError("#errRace", !d.race) && ok;
  ok = setError("#errMatch", !$("#fMatch").checked) && ok;
  ok = setError("#errAgree", !$("#fAgree").checked) && ok;
  return ok;
}

async function submit(e) {
  e.preventDefault();
  hide("#okBox");
  hide("#ngBox");

  const data = collect();
  if (!validate(data)) {
    document.querySelector(".err.show")?.scrollIntoView({ behavior: "smooth", block: "center" });
    return;
  }

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
      $("#okMsg").innerHTML =
        "1~2분 뒤 <a href=\"index.html?game=scr\">스타크래프트 랭킹</a>을 새로고침해 주세요. " +
        "이름 옆에 <span class=\"badge self\">본인 등록 / 오늘 날짜</span> 가 붙어 있으면 반영된 것입니다.<br>" +
        "실력이 바뀌면 같은 게임 아이디로 다시 등록하면 됩니다.";
      $("#fMatch").checked = false;
    } else {
      show("#ngBox");
      $("#ngMsg").textContent = out.error || "잠시 후 다시 시도해 주세요.";
    }
  } catch (err) {
    show("#ngBox");
    $("#ngMsg").textContent = "서버에 연결하지 못했습니다. 이메일 신청 창을 대신 열어 드립니다.";
    openMail(data);
  } finally {
    btn.disabled = false;
    btn.textContent = "등록하기";
  }
}

function openMail(d) {
  const gradeName = (GAME_SCR && GAME_SCR.tiers[d.grade] && GAME_SCR.tiers[d.grade].ko) || d.grade;
  const body = [
    "[충남 아마추어 랭킹] 스타크래프트 본인 등록",
    "",
    `게임 아이디: ${d.scrId}`,
    `표시 닉네임: ${d.nickname}`,
    `지역: ${d.region}`,
    `종족: ${d.race}`,
    `소속: ${d.team || "(없음)"}`,
    "",
    `등급: ${gradeName}`,
    `레이팅: ${d.rating || "-"}`,
    `전적: ${d.wins || 0}승 ${d.losses || 0}패`,
    `래더 순위: ${d.ladderRank || "-"}`,
    "",
    "(래더 화면 스크린샷을 함께 첨부해 주세요)",
  ].join("\n");
  location.href =
    `mailto:${SITE.contact}?subject=${encodeURIComponent("[랭킹] 스타크래프트 등록 - " + d.nickname)}` +
    `&body=${encodeURIComponent(body)}`;
}

function show(sel) { $(sel).classList.add("show"); }
function hide(sel) { $(sel).classList.remove("show"); }
