/**
 * 방문 집계 (GoatCounter) — js/config.js 의 SITE.goatcounter 가 있을 때만 켜집니다.
 *
 * 정적 사이트는 스스로 방문을 셀 수 없어 바깥 도구를 하나 씁니다.
 * GoatCounter를 고른 이유는 **쿠키를 쓰지 않고 개인을 식별하지 않기** 때문입니다.
 * 남는 것은 날짜·페이지·유입 경로 정도이고, 방문자를 사람 단위로 따라다니지 않습니다.
 *
 * 값을 비워두면 스크립트를 아예 불러오지 않습니다 — 아무 요청도 나가지 않습니다.
 */
(function () {
  var code = (typeof SITE !== "undefined" && SITE.goatcounter) || "";
  if (!code) return;

  var s = document.createElement("script");
  s.async = true;
  s.src = "https://gc.zgo.at/count.js";
  s.setAttribute("data-goatcounter", "https://" + code + ".goatcounter.com/count");
  document.head.appendChild(s);
})();
