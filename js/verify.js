/**
 * 본인 인증용 아이콘 번호 계산 — scripts/riot.py 의 expected_icon_id 와 동일한 결과를 냅니다.
 * (서버 없이 등록 페이지에서 바로 번호를 안내하기 위해 결정적 해시를 씁니다)
 */

/** 인증에 쓰는 기본 프로필 아이콘 (0~28번은 누구나 보유) */
const VERIFY_ICONS = Array.from({ length: 29 }, (_, i) => i);

/** zlib.crc32 와 동일한 CRC-32 */
function crc32(str) {
  const bytes = new TextEncoder().encode(str);
  let crc = 0xffffffff;
  for (const b of bytes) {
    crc ^= b;
    for (let i = 0; i < 8; i++) {
      crc = (crc >>> 1) ^ (0xedb88320 & -(crc & 1));
    }
  }
  return (crc ^ 0xffffffff) >>> 0;
}

/** '홍길동#KR1' → { gameName, tagLine } (형식이 틀리면 null) */
function splitRiotId(riotId) {
  const raw = (riotId || "").trim();
  const at = raw.lastIndexOf("#");
  if (at <= 0) return null;
  const gameName = raw.slice(0, at).trim();
  const tagLine = raw.slice(at + 1).trim();
  if (!gameName || !tagLine) return null;
  return { gameName, tagLine };
}

/** Riot ID → 인증에 사용할 아이콘 번호 */
function expectedIconId(gameName, tagLine) {
  const key = `${gameName.trim().toLowerCase()}#${tagLine.trim().replace(/^#/, "").toLowerCase()}`;
  return VERIFY_ICONS[crc32(key) % VERIFY_ICONS.length];
}

/** KST 기준 오늘 날짜 (YYYY-MM-DD) — 보는 사람의 시간대와 무관하게 같은 값을 냅니다 */
function kstDateString(now) {
  const t = (now || new Date()).getTime() + 9 * 60 * 60 * 1000;
  return new Date(t).toISOString().slice(0, 10);
}

/**
 * 본인 확인용 아이콘 번호 — scripts/riot.py 의 challenge_icon_id 와 같은 결과를 냅니다.
 *
 * 등록용 번호는 Riot ID마다 고정이라, 인증 후 아이콘을 되돌리지 않은 선수는
 * Riot ID만 아는 사람에게 정보를 건드려질 수 있습니다. 수정·삭제는 반복되는
 * 행위이므로 날짜를 섞어 매일 다른 번호가 나오게 했습니다.
 *
 * purpose 로 용도까지 가릅니다 — 수정용 아이콘이 삭제까지 통과시키면,
 * 오늘 정보를 고친 선수를 같은 날 남이 지울 수 있게 됩니다.
 */
function challengeIconId(gameName, tagLine, purpose, day) {
  const base = `${gameName.trim().toLowerCase()}#${tagLine.trim().replace(/^#/, "").toLowerCase()}`;
  return VERIFY_ICONS[crc32(`${base}|${day || kstDateString()}|${purpose}`) % VERIFY_ICONS.length];
}

/** 정보 수정용 번호 */
function editIconId(gameName, tagLine, day) {
  return challengeIconId(gameName, tagLine, "edit", day);
}

/** 등록 삭제용 번호 — 수정용과 다른 번호가 나옵니다 */
function removeIconId(gameName, tagLine, day) {
  return challengeIconId(gameName, tagLine, "remove", day);
}
