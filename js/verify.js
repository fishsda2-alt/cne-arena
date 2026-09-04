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
