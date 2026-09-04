/**
 * 등록·수정 폼 → GitHub Actions 중계 (Google Apps Script)
 *
 * GitHub Pages는 서버가 없어서 브라우저에서 바로 저장소에 쓸 수 없습니다.
 * 이 스크립트가 그 사이를 이어 줍니다. 무료이고, 구글 계정만 있으면 됩니다.
 *
 *   등록 페이지 → (이 스크립트) → GitHub Actions → 아이콘 인증 → 등록 완료
 *   수정 페이지 → (이 스크립트) → GitHub Actions → 아이콘 인증 → 수정 완료
 *
 * ── 설치 방법 ─────────────────────────────────────────────
 * 1. https://script.google.com 에서 [새 프로젝트]
 * 2. 이 파일 내용을 통째로 붙여넣기
 * 3. 좌측 톱니바퀴(프로젝트 설정) → 스크립트 속성 → 속성 3개 추가
 *      GITHUB_TOKEN : GitHub 개인 액세스 토큰 (아래 참고)
 *      GITHUB_OWNER : GitHub 아이디            (예: fishsda2-alt)
 *      GITHUB_REPO  : 저장소 이름              (예: cne-arena)
 * 4. 우측 상단 [배포] → [새 배포] → 유형 [웹 앱]
 *      실행 계정: 나
 *      액세스 권한: 모든 사용자          ← 반드시 이걸로
 * 5. 배포 후 나오는 웹 앱 URL을 js/config.js 의 submitUrl 에 붙여넣고 커밋
 *
 * ── 이 파일을 고친 뒤에는 반드시 다시 배포하세요 ──────────
 * 코드를 붙여넣기만 하면 웹 앱은 옛 버전 그대로 돕니다.
 *   [배포] → [배포 관리] → 연필(수정) → 버전 [새 버전] → [배포]
 * 이렇게 하면 **URL은 그대로 유지**되므로 config.js는 고칠 필요가 없습니다.
 * ([새 배포]를 누르면 주소가 새로 생겨 config.js도 바꿔야 합니다)
 *
 * ── GitHub 토큰 만들기 ────────────────────────────────────
 * GitHub → Settings → Developer settings → Personal access tokens
 *   → Fine-grained tokens → Generate new token
 *   · Repository access: 이 저장소만 선택
 *   · Permissions → Repository permissions → Contents: Read and write
 *   · 만료일을 적어두고, 만료되면 새로 발급해 스크립트 속성만 교체하세요
 *
 * 토큰은 이 스크립트 속성에만 있고 사이트에는 노출되지 않습니다.
 */

/** 하루에 받을 수 있는 최대 신청 수 (등록·수정 합산, 도배 방지) */
var DAILY_LIMIT = 20;

function doPost(e) {
  try {
    var data = JSON.parse(e.postData.contents);

    // action 이 'edit' 이면 정보 수정, 없거나 그 밖이면 신규 등록입니다.
    var isEdit = String(data.action || '') === 'edit';

    var riotId = String(data.riotId || '').trim();
    var nickname = String(data.nickname || '').trim();
    var region = String(data.region || '').trim();
    var position = String(data.position || '').trim();
    var team = String(data.team || '').trim();
    var clearTeam = data.clearTeam === true;   // 소속을 비우려는 신청 (빈 값 = '안 바꿈'과 구분)

    // ── 검증 ──
    if (!/^.+#.+$/.test(riotId)) return fail('Riot ID 형식이 올바르지 않습니다.');
    if (riotId.length > 40) return fail('Riot ID가 너무 깁니다.');
    if (nickname.length > 20) return fail('닉네임은 20자 이내로 입력해 주세요.');
    if (team.length > 30) return fail('소속은 30자 이내로 입력해 주세요.');

    // 등록은 모든 항목이 필요하지만, 수정은 바꾸는 항목만 있으면 됩니다.
    if (!isEdit) {
      if (!nickname) return fail('표시 닉네임을 입력해 주세요.');
      if (!region) return fail('지역을 선택해 주세요.');
      if (!position) return fail('주 포지션을 선택해 주세요.');
    } else if (!nickname && !region && !position && !team && !clearTeam) {
      return fail('바꿀 내용을 하나 이상 입력해 주세요.');
    }

    // 줄바꿈·따옴표 등은 제거합니다 (워크플로로 넘어가는 값이므로)
    nickname = clean(nickname);
    region = clean(region);
    position = clean(position);
    team = clean(team);

    if (!withinDailyLimit()) {
      return fail('오늘 접수 가능한 신청 수를 넘었습니다. 내일 다시 시도해 주세요.');
    }

    var props = PropertiesService.getScriptProperties();
    var owner = props.getProperty('GITHUB_OWNER');
    var repo = props.getProperty('GITHUB_REPO');
    var token = props.getProperty('GITHUB_TOKEN');
    if (!owner || !repo || !token) {
      return fail('서버 설정이 완료되지 않았습니다. 운영자에게 문의해 주세요.');
    }

    var res = UrlFetchApp.fetch(
      'https://api.github.com/repos/' + owner + '/' + repo + '/dispatches',
      {
        method: 'post',
        contentType: 'application/json',
        headers: {
          Authorization: 'Bearer ' + token,
          Accept: 'application/vnd.github+json'
        },
        payload: JSON.stringify({
          event_type: isEdit ? 'edit-player' : 'register-player',
          client_payload: {
            riotId: riotId,
            nickname: nickname,
            region: region,
            position: position,
            team: team,
            clearTeam: clearTeam
          }
        }),
        muteHttpExceptions: true
      }
    );

    var code = res.getResponseCode();
    if (code !== 204) {
      console.error('GitHub dispatch 실패: ' + code + ' ' + res.getContentText());
      return fail((isEdit ? '수정' : '등록') + ' 서버에 전달하지 못했습니다. 잠시 후 다시 시도해 주세요.');
    }

    logSubmission(isEdit ? '수정' : '등록', riotId, nickname);
    return ok();
  } catch (err) {
    console.error(err);
    return fail('처리 중 오류가 발생했습니다.');
  }
}

/** 브라우저가 주소를 직접 열었을 때 */
function doGet() {
  return ContentService
    .createTextOutput('CHUNGNAM RANK.GG 등록 중계 서버가 동작 중입니다.')
    .setMimeType(ContentService.MimeType.TEXT);
}

function clean(s) {
  return s.replace(/[\r\n\t"'`$\\]/g, ' ').replace(/\s+/g, ' ').trim();
}

function ok() {
  return json({ ok: true });
}

function fail(message) {
  return json({ ok: false, error: message });
}

function json(obj) {
  return ContentService
    .createTextOutput(JSON.stringify(obj))
    .setMimeType(ContentService.MimeType.JSON);
}

/** 하루 접수 건수 제한 */
function withinDailyLimit() {
  var cache = CacheService.getScriptCache();
  var key = 'count-' + Utilities.formatDate(new Date(), 'Asia/Seoul', 'yyyyMMdd');
  var n = Number(cache.get(key) || 0);
  if (n >= DAILY_LIMIT) return false;
  cache.put(key, String(n + 1), 21600); // 6시간 보관
  return true;
}

/** 접수 기록 남기기 (Apps Script 실행 로그에서 확인) */
function logSubmission(kind, riotId, nickname) {
  console.log(kind + ' 접수: ' + riotId + ' / ' + nickname);
}
