# CLAUDE.md

충남 지역 아마추어 LoL 선수 랭킹 사이트. 서버·DB 없이 GitHub Actions + GitHub Pages로만 돌아갑니다.
사람 손이 필요한 일은 전부 Actions 탭의 버튼으로 처리하도록 설계돼 있습니다.

- 공개 사이트: <https://fishsda2-alt.github.io/cne-arena/>
- 저장소: `fishsda2-alt/cne-arena` (Public — Pages 무료 조건)

## 구조

```
등록 폼(register.html) → Google Apps Script → repository_dispatch
  → register-from-site.yml → 아이콘 인증 → players.json 커밋
  → update_ranking.py → ranking.json 커밋 → Pages 배포

수정 폼(edit.html) → Google Apps Script → repository_dispatch
  → edit-from-site.yml → 아이콘 인증(날짜별 번호) → players.json + ranking.json 커밋
  → Pages 배포

삭제 폼(remove.html) → Google Apps Script → repository_dispatch
  → remove-from-site.yml → 아이콘 인증(삭제용 번호) → 명단·랭킹·기록에서 제거
```

- `data/players.json` — 등록 선수 명단(운영자가 직접 고치지 않음, 워크플로가 관리)
  한 선수가 여러 종목에 등록할 수 있습니다. 닉네임·지역·소속은 공통이고
  **포지션만 종목별**입니다 — `games: {lol: {position}, val: {position}}`.
  읽고 쓰는 일은 `scripts/players.py` 한 곳으로 모았습니다.
- `data/ranking.json` — 롤 랭킹. 매일 04:10 KST 재생성
  (종목마다 파일이 하나씩입니다. 롤만 이름에 종목이 없는 것은 워크플로가 쓰는 경로라서)
- `data/history/YYYY-MM.json` — 일별 스냅샷(주간 LP 상승폭 계산용)
- `scripts/` — 외부 패키지 0개, 표준 라이브러리만 사용
- `admin.html` — 운영 현황. 푸터의 CHUNGNAM RANK.GG 버튼으로 들어갑니다.
  **누구나 열 수 있습니다**(정적 사이트라 감출 수 없음). 보이는 값은 이미 공개된 것뿐이고,
  ★·승인 같은 쓰기만 Apps Script 속성 `ADMIN_KEY` 로 잠급니다. 삭제는 넣지 않았습니다.
  관리 버튼은 `?manage` 또는 맨 아래 '운영자 도구'로 폅니다(화면 정리일 뿐 잠금 아님).
  **운영 안내 문구를 화면에 두지 마세요** — 방문자가 볼 내용이 아닙니다. 설명은 README에.
- `assets/og.png` — 링크 공유용 대표 이미지 (`scripts/make_og.py` 로 다시 만듭니다)

**사이트 주소를 바꾸면 같이 고쳐야 하는 곳**
공유 미리보기 태그(`og:url`·`og:image`·`canonical`)는 **절대 주소**여야 해서
각 HTML의 `<head>`에 박혀 있습니다. 크롤러는 자바스크립트를 실행하지 않아
`config.js`에서 읽어올 수 없습니다. 주소를 바꾸면 `scripts/make_og.py` 의 BASE 와
각 페이지 head 를 함께 고치세요. (그 밖에 Apps Script 의 `GITHUB_REPO`,
Riot 제품 URL 두 개와 `riot.txt`, CLAUDE.md 상단 주소도 함께)

- `scripts/apps-script/register-proxy.gs` — 구글 Apps Script에 붙여넣는 중계 코드
  (등록·수정 둘 다 여기를 지납니다. 고친 뒤 **배포 관리 → 새 버전**으로 다시 배포해야 반영됩니다)

## 반드시 지킬 것 (실제로 겪은 함정)

**Riot API 호출에 `urllib`을 쓰지 말 것.**
urllib은 헤더 이름을 `X-Riot-Token` → `X-riot-token`으로 바꿔 보내는데,
Riot 게이트웨이가 이를 인증 헤더로 인정하지 않고 **403**을 냅니다.
키가 멀쩡한데도 403이 나서 원인 찾는 데 오래 걸렸습니다. `http.client`를 쓰세요.

**데이터를 커밋하는 워크플로는 반드시 끝에 Pages 배포를 호출할 것.**
GitHub은 `GITHUB_TOKEN`으로 만든 커밋으로는 다른 워크플로를 실행시키지 않습니다.
그래서 push 트리거만 걸어두면 저장소만 갱신되고 **사이트는 영영 옛 파일을 내보냅니다.**
`deploy-pages.yml`이 `workflow_call`을 받도록 돼 있고, 데이터 워크플로 5개가 이를 호출합니다.
배포 시 기본 브랜치 최신을 다시 체크아웃해야 방금 커밋한 내용이 반영됩니다.

**워크플로를 고친 뒤에는 `Re-run jobs`로 확인하지 말 것.**
재실행은 원래 실행 시점의 커밋 코드로 돕니다. 새로 트리거해야 최신 코드가 돕니다.

**수정·삭제 인증 번호는 날짜와 용도를 함께 섞을 것.**
등록용 번호(`expected_icon_id`)는 Riot ID만으로 정해져 영원히 같습니다.
등록은 1회성(중복 Riot ID 거부)이라 괜찮지만, 수정은 반복되는 행위라 사정이 다릅니다.
인증 후 아이콘을 되돌리지 않은 선수가 있으면 **Riot ID만 아는 사람이 그 선수의 정보를
고칠 수 있습니다.** 그래서 `challenge_icon_id`가 날짜를 섞어 매일 번호가 바뀝니다.
**용도(edit/remove)도 섞습니다.** 같은 번호면, 오늘 정보를 고치려고 아이콘을
바꿔 둔 선수를 같은 날 남이 삭제할 수 있습니다. 삭제는 되돌릴 수 없습니다.
자정 경계 때문에 새벽 3시 전까지는 어제 번호도 인정합니다.

**인증 번호를 고쳤으면 `js/verify.js`와 `scripts/riot.py`를 함께 고칠 것.**
번호를 화면에 안내하는 쪽(JS)과 실제로 대조하는 쪽(Python)이 따로 계산합니다.
둘이 어긋나면 선수는 안내대로 바꿨는데 계속 "인증 실패"만 나오고, 화면에는
원인이 안 보입니다. 두 파일이 바뀌면 **아이콘 번호 대조** 워크플로가 자동으로 돕니다.

**정규식이 든 파일을 통째로 다시 쓴 뒤에는 역슬래시가 살아 있는지 확인할 것.**
`register-proxy.gs`의 `clean()`과 `self_edit.py`의 `sanitize()`에 있던 문자 클래스에서
역슬래시가 한 겹 벗겨져 `\]` 가 되었고, 문자 클래스가 닫히지 않아 깨졌습니다.
눈으로 보면 멀쩡해 보이고 **문법 검사로도 안 걸립니다** — Apps Script는 저장할 때,
파이썬은 신청이 실제로 들어와야 터집니다.
`grep -nF '\' 파일` 로 확인하고, 원본이 있으면 `git show HEAD~1:파일` 과 대조하세요.
`check_parity.py`의 자가 점검이 파이썬 쪽은 잡아 줍니다.

**`hidden` 으로 감출 요소에 CSS 로 `display` 를 지정했는지 볼 것.**
브라우저 기본값 `[hidden]{display:none}` 은 우선순위가 가장 낮아서,
`.modal{display:flex}` 같은 클래스가 있으면 **그냥 무시됩니다.**
실제로 상세 모달이 늘 떠 있는 채로 배포됐습니다.
`css/style.css` 맨 위에 `[hidden]{display:none!important}` 을 두어 막았습니다.

**`hidden` 속성과 `.manage-only` 같은 클래스를 같이 걸지 말 것.**
클래스로 감추는 것과 속성으로 감추는 것을 둘 다 걸면, 속성을 벗겨 주는 코드가
없어서 영영 안 보입니다. 대회 승인 구간이 실제로 그랬습니다. 하나만 쓰세요.

**감췄는지 확인할 때 `el.hidden` 을 믿지 말 것.**
그 값은 속성일 뿐 실제로 안 보이는지와 다릅니다. 위 사고를 놓친 이유가 이것입니다.
`getComputedStyle(el).display` 를 보거나 화면을 직접 보세요.

**가짜 선수를 실제 데이터에 넣지 말 것.**
사이트가 비어 보인다고 채우고 싶어지지만, Riot 신청서에 "크롤링하지 않고 본인이
신청한 선수만 조회한다"고 적혀 있습니다. 심사관이 랭킹의 Riot ID를 조회해 없는
계정이 나오면 나머지 진술까지 의심받습니다. `update_ranking.py`도 매일 그 계정을
조회하다 실패해 오류가 쌓입니다.
비어 보이는 문제는 `?sample` 예시 화면과 '이제 막 문을 열었습니다' 안내로 풉니다.
**예시 화면에는 가짜 데이터라는 배너가 반드시 보여야 합니다** — 표시가 없으면
그 화면이야말로 조작으로 오해받습니다.

**개인정보를 저장소에 넣지 말 것.**
저장소도 Actions 실행 기록도 전부 공개됩니다. 실명·연락처·이메일·생년월일은
구글 드라이브의 비공개 명단에만 두고, 저장소에는 `proAspirant` 플래그(★)만 둡니다.
프로 트라이아웃 신청을 자동 등록 경로에 태우지 않는 이유가 이것입니다.

**티어는 사람이 수정할 수 없음.** Riot API가 매일 자동으로 채웁니다.
선수가 정하는 것은 표시 닉네임·지역·주 포지션·소속뿐이고,
이 네 가지는 `edit.html`에서 **선수 본인이 직접** 바꿉니다(하루 1회, 아이콘 재인증).
Riot ID 변경은 puuid가 달라져 기록이 끊기므로 자동 경로에서 받지 않습니다.

## 비밀 정보 (새 컴퓨터로 옮기지 말 것)

| 값 | 사는 곳 |
|---|---|
| `RIOT_API_KEY` | 저장소 Secret (Settings > Secrets and variables > Actions) |
| GitHub 개인 액세스 토큰 | Google Apps Script 스크립트 속성 (`GITHUB_TOKEN`) |

둘 다 이미 클라우드에 있으므로 다른 컴퓨터에 복사할 필요가 없습니다.
Riot 키는 Personal API Key(App ID 877537, 승인됨)라 만료가 없습니다.
GitHub 토큰은 2027-06-30 만료 — 그때 재발급 후 Apps Script 속성만 교체.

## 작업 방식

- 커밋 후 **푸시까지 진행해도 됩니다** (사용자가 명시적으로 허용함).
- 자동 커밋과 충돌하면 `git pull --rebase` 후 푸시.
- 로컬 미리보기: `start-server.bat` → <http://localhost:8189>
  예시 데이터로 보려면 `?sample` 을 붙입니다.
- 파이썬이 없는 환경일 수 있습니다. 그때는 스크립트 검증을 Actions에서 합니다.
- 로컬 검증(파이썬이 있으면):
  `PYTHONUTF8=1 python scripts/check_parity.py` — 아이콘 번호 대조 + self_edit 자가 점검.
  `PYTHONUTF8=1`을 빼면 Windows 콘솔에서 한글이 깨집니다. 번호 대조에는 node도 필요합니다
  (없으면 자가 점검만 하고 안내를 냅니다). 없어도 푸시하면 Actions가 대신 돌립니다.
- `self_edit.py`·`manage_player.py`는 `--skip-verify`로 API 키 없이 시험할 수 있습니다.
  data/를 실제로 고치므로 끝나면 `git checkout -- data/` 로 되돌리세요.
- `.gs`·`.ps1`·`.bat`은 CRLF로 유지 (메모장에서 한 줄로 보이는 문제 방지).
  `serve.ps1`은 UTF-8 **BOM 포함**이어야 Windows PowerShell이 한글을 읽습니다.

## 문제가 생기면 먼저 볼 곳

Actions 탭의 각 실행 요약에 **결과 상자**가 있습니다. 로그를 펼치지 않아도
실패 이유(아이콘 불일치, 키 거부 등)가 한국어로 나옵니다.

키가 의심되면 **Actions → API 키 점검 → Run workflow**.
등록·갱신을 건드리지 않고 키만 시험하며, 키 값은 출력하지 않고 모양·지문·해시만 보여줍니다.
