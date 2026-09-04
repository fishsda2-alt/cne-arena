/**
 * 모든 페이지에 공통으로 들어가는 것.
 *
 * 지금은 푸터의 문의 안내 한 줄뿐입니다. 페이지가 여덟 개라 문구를 HTML에
 * 박아두면 바꿀 때 여덟 곳을 고쳐야 하고 한두 곳을 빠뜨리게 됩니다.
 */
document.addEventListener("DOMContentLoaded", () => {
  const box = document.querySelector("#footerContact");
  if (!box) return;

  const parts = [];
  if (SITE.discordUrl) {
    parts.push(
      `문의 · 팀 모집 · 대회 제보는 ` +
      `<a href="${SITE.discordUrl}" target="_blank" rel="noopener">디스코드</a>에서 받습니다.`
    );
  }
  // 디스코드를 안 쓰는 분도 있으니 이메일은 늘 함께 둡니다.
  if (SITE.contact) {
    parts.push(`이메일 <a href="mailto:${SITE.contact}">${SITE.contact}</a>`);
  }
  box.innerHTML = parts.join(" · ");
});
