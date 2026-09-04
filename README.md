# 충남 아마추어 LoL 랭킹

등록된 선수의 솔로랭크 티어를 **하루 한 번 자동으로 긁어와 랭킹표로 보여주는** 사이트입니다.

- 서버 없음 · DB 없음 · **비용 0원** (GitHub Actions + GitHub Pages 무료 범위)
- 수집 대상은 "등록된 선수"뿐이라 크롤러·집계 배치가 필요 없습니다.
- 선수 1명당 하루 2번의 API 호출이 전부입니다.

---

## 동작 구조

```
   [선수]  등록 페이지에서 인증 아이콘 확인 → 아이콘 변경 → 신청서 제출
              │
   [운영자]  Actions 탭 > "선수 등록" 실행
              │  ① Riot ID → puuid 변환      (account-v1)
              │  ② 프로필 아이콘 일치 확인    (summoner-v4)   ← 본인 인증
              ▼
        data/players.json  (승인된 선수 명단, 영구 보관)
              ▲
              └── (자동 등록을 연결한 경우) 등록 페이지 제출 → Apps Script
                  → GitHub Actions가 같은 인증을 거쳐 바로 등록
              │
   [자동]  매일 04:10 GitHub Actions
              │  ③ 티어 조회                  (league-v4/entries/by-puuid)
              ▼
        data/ranking.json + data/history/YYYY-MM.json  (커밋)
              │
              ▼
        GitHub Pages 정적 페이지 (index.html이 ranking.json만 읽음)
```

호출량: 선수 100명 → 하루 200콜. 개발용 키 한도(2분당 100건)에 맞춰 스스로 대기하므로 약 4분 걸립니다.

---

## 파일 구조

```
cnrank/
├── index.html               랭킹표 (티어순 / 주간 상승 / 승률 / 판수)
├── register.html            선수 등록 — 아이콘 인증 + 입력 폼 + 제출
├── pro.html                 프로 트라이아웃 희망 신청 안내 (이메일 양식)
├── css/style.css
├── js/
│   ├── config.js            ★ 사이트명·연락처·지역 목록·자동등록 주소 (여기만 고치면 됨)
│   ├── verify.js            인증 아이콘 번호 계산 (Python과 동일한 CRC32)
│   ├── register.js          등록 폼 검증 + 제출 (자동등록 ↔ 이메일 자동 전환)
│   └── ranking.js           랭킹표 렌더링
├── scripts/                 (GitHub Actions가 실행, 외부 패키지 0개)
│   ├── riot.py              API 클라이언트 + 요청 한도 제어
│   ├── ranking.py           티어→점수 변환·정렬
│   ├── update_ranking.py    하루 1회 갱신
│   ├── add_player.py        선수 등록 + 아이콘 인증
│   ├── manage_player.py     승인 / 보류 / ★표시 / 수정 / 삭제
│   └── apps-script/
│       └── register-proxy.gs  자동 등록 중계 (구글 Apps Script에 붙여넣는 코드)
├── data/
│   ├── players.json         등록 선수 명단 (워크플로가 관리)
│   ├── ranking.json         자동 생성 — 사이트가 읽는 유일한 파일
│   ├── ranking.sample.json  API 키 없이 화면만 보고 싶을 때 쓰는 예시
│   └── history/YYYY-MM.json 일별 스냅샷 (주간 상승폭 계산용)
├── .github/workflows/
│   ├── update-ranking.yml     매일 04:10 자동 갱신
│   ├── register-from-site.yml 사이트에서 들어온 신청 자동 등록
│   ├── add-player.yml         선수 등록 (수동 실행)
│   ├── manage-player.yml      승인/보류/★/수정/삭제 (수동 실행)
│   └── deploy-pages.yml       정적 사이트 배포
├── serve.ps1 / start-server.bat   로컬 미리보기 (아무것도 설치 안 해도 됨)
└── README.md
```

---

## 지금 바로 화면 확인하기

`start-server.bat` 더블클릭 → <http://localhost:8189>

아직 선수가 없으므로 표는 비어 있습니다. **예시 데이터로 완성된 화면을 보려면**
<http://localhost:8189/?sample> 로 접속하세요. (`data/ranking.sample.json`을 읽으며 실제 데이터는 건드리지 않습니다)

> `index.html`을 그냥 더블클릭하면 브라우저 보안 정책 때문에 JSON을 못 읽습니다. 반드시 위 서버로 여세요.

---

## 실제 운영 시작하기 (30분)

### 1. Riot API 키 발급

1. <https://developer.riotgames.com> 로그인 (롤 계정)
2. 메인 화면의 **DEVELOPMENT API KEY** 복사 — `RGAPI-...` 형태
3. 이 키는 **24시간마다 만료**됩니다. 테스트용으로만 쓰세요.

### 2. GitHub 저장소에 올리기

저장소는 반드시 **Public**이어야 Pages가 무료입니다.
그리고 이 폴더의 **내용물이 저장소 루트**에 있어야 합니다 — `cnrank/`라는 폴더를 한 겹 더
만들면 `.github/workflows/`를 GitHub가 못 찾아서 자동 갱신이 동작하지 않습니다.

```
저장소 루트/
├── .github/workflows/   ← 여기 있어야 Actions가 인식합니다
├── index.html           ← 여기 있어야 Pages 첫 화면이 됩니다
├── css/  js/  data/  scripts/
└── README.md
```

이 폴더에서 그대로 push하면 위 구조가 됩니다.

```bash
git push -u origin main
```

(아직 `git init`을 안 했다면)

```bash
git init
git add .
git commit -m "init: 충남 아마추어 랭킹"
git branch -M main
git remote add origin https://github.com/<아이디>/<저장소>.git
git push -u origin main
```

### 3. API 키 등록

저장소 **Settings → Secrets and variables → Actions → New repository secret**

- Name: `RIOT_API_KEY`
- Secret: 발급받은 키

### 4. Pages 켜기

**Settings → Pages → Source: GitHub Actions** 선택.
`https://<아이디>.github.io/<저장소>/` 로 공개됩니다.

### 5. 첫 선수 등록

**Actions 탭 → 선수 등록 → Run workflow** → Riot ID·이름·소속 입력 → 실행.
아이콘 인증까지 통과하면 `players.json`에 추가되고 랭킹이 바로 갱신됩니다.

---

## 어디서든 작업하기

이 PC가 없어도 됩니다. 설치할 것도 없습니다.

| 하고 싶은 일 | 어디서 |
|---|---|
| 코드 수정 | 저장소 페이지에서 **`.` 키**를 누르면 브라우저 안에서 VS Code가 열립니다 (`github.dev/<아이디>/<저장소>`). 수정 후 커밋하면 바로 반영됩니다. |
| 선수 등록·랭킹 갱신 | **Actions 탭**에서 버튼만 누르면 GitHub 서버가 대신 실행합니다. 내 PC는 꺼져 있어도 됩니다. |
| 개인정보 자료 보관 | 구글 드라이브 (신청서 응답, 보호자 동의서, 승인 대장) |

> **소스 코드는 드라이브에 사본을 두지 마세요.** 저장소는 매일 자동 커밋되기 때문에
> 드라이브 사본은 하루 만에 낡은 파일이 됩니다. 코드의 원본은 항상 GitHub 한 곳입니다.
> 드라이브는 **공개 저장소에 올리면 안 되는 개인정보 자료** 보관용으로 쓰세요.

---

## 운영 방법

| 하고 싶은 일 | 방법 |
|---|---|
| 선수 추가 | Actions → **선수 등록** → Run workflow |
| 승인 보류 / 재승인 | Actions → **선수 관리** → `hold` / `approve` |
| ★ 프로 지망 표시 켜기/끄기 | Actions → **선수 관리** → `pro` / `unpro` |
| 닉네임·지역·포지션 수정 | Actions → **선수 관리** → `edit` + 바꿀 항목만 입력 |
| 개인정보 삭제 요청 | Actions → **선수 관리** → `remove` (랭킹·기록에서 전부 삭제) |
| 지금 당장 랭킹 갱신 | Actions → **랭킹 갱신** → Run workflow |
| 사이트 이름·연락처 변경 | `js/config.js` 수정 후 커밋 |

> **티어·전적은 운영자가 바꿀 수 없습니다.** Riot API가 매일 새벽에 자동으로 채웁니다.
> 선수가 직접 정하는 것은 표시 닉네임·지역·주 포지션·소속뿐입니다.

### 신청 창구는 둘로 나뉩니다

| | 일반 등록 (`register.html`) | 프로 지망 (`pro.html`) |
|---|---|---|
| 받는 정보 | 닉네임·지역·포지션·소속 | 이름·연락처·이메일 |
| 처리 방식 | **사이트에서 바로 자동 등록** | **이메일로만** |
| 결과 | 랭킹에 등재 | 닉네임 옆 ★ 표시 |
| 보관 위치 | 저장소 (공개) | 구글 드라이브 (비공개) |

프로 지망을 자동 경로에 태우지 않는 이유는 **Actions 실행 기록이 공개**되기 때문입니다.
연락처가 로그에 남으면 되돌릴 수 없습니다. 그래서 이메일로만 받고,
저장소에는 `선수 관리 → pro` 로 ★ 플래그만 켭니다.

---

## 자동 등록 연결하기 (선택, 무료)

`js/config.js`의 `submitUrl`이 비어 있으면 등록 페이지의 제출 버튼은
**입력값이 채워진 이메일 창**을 엽니다. 운영자가 그걸 보고 워크플로를 돌리면 됩니다.
이것만으로도 운영은 됩니다.

여기에 Google Apps Script를 붙이면 **선수가 제출한 즉시 자동 등록**됩니다.

```
등록 페이지 → Apps Script → GitHub Actions → 아이콘 인증 → 등록 완료 (1~2분)
```

GitHub Pages에는 서버가 없어서 브라우저가 저장소에 직접 쓸 수 없습니다.
Apps Script가 그 사이에서 토큰을 보관하는 중계 역할을 합니다. 비용은 없습니다.

설치 방법은 [scripts/apps-script/register-proxy.gs](scripts/apps-script/register-proxy.gs)
파일 맨 위 주석에 단계별로 적어두었습니다. 요약하면:

1. script.google.com에서 새 프로젝트 → 그 파일 내용 붙여넣기
2. 스크립트 속성에 `GITHUB_TOKEN` / `GITHUB_OWNER` / `GITHUB_REPO` 등록
3. 웹 앱으로 배포 (액세스 권한: **모든 사용자**)
4. 나온 URL을 `js/config.js`의 `submitUrl`에 붙여넣고 커밋

토큰은 Apps Script 안에만 있고 사이트에는 노출되지 않습니다.
도배 방지로 하루 접수 수 제한이 걸려 있습니다 (`DAILY_LIMIT`).

> 자동 등록도 **아이콘 인증을 반드시 통과해야** 등록됩니다.
> 남의 Riot ID를 적어 보내면 아이콘이 달라서 실패합니다.

---

## 본인 인증 방식

계정 소유를 API로 증명할 수 있는 유일한 방법이 **프로필 아이콘 확인**입니다.

1. 등록 페이지에서 Riot ID를 넣으면 그 ID 전용 아이콘 번호가 나옵니다
   (`js/verify.js`와 `scripts/riot.py`가 같은 CRC32 해시를 써서 서버 없이도 같은 번호를 냅니다)
2. 신청자가 게임에서 그 아이콘으로 변경
3. 운영자가 등록 워크플로 실행 → `summoner-v4`로 `profileIconId` 대조 → 일치하면 등록

번호를 남이 계산할 수는 있지만, **해당 계정에 로그인해야만** 아이콘을 바꿀 수 있으므로 소유 증명이 됩니다.
아이콘 변경이 API에 반영되기까지 몇 분 걸릴 수 있고, 인증 후에는 원래 아이콘으로 되돌려도 됩니다.

> "충남 소재"는 API로 확인할 방법이 없습니다. 소속 학교·팀을 받아 **운영자가 수동 승인**하세요.
> (`approved: false`인 선수는 랭킹에 나오지 않습니다)

---

## 개인정보 처리

### 저장소에 들어가는 것 / 절대 안 들어가는 것

| 항목 | 저장소(공개) | 구글 드라이브(비공개) |
|---|---|---|
| 표시 닉네임, Riot ID, 지역, 포지션, 소속 | ○ | |
| 티어·전적 (자동 수집) | ○ | |
| `proAspirant` — ★ 표시 여부 | ○ | |
| **이름, 연락처, 이메일, 생년월일** | **✗ 절대 금지** | ○ |
| 보호자 동의서 | **✗ 절대 금지** | ○ |

`data/players.json`은 공개 저장소에 그대로 노출됩니다. 한 번 커밋하면
git 히스토리에 영구히 남아 나중에 지워도 복구할 수 있습니다.

**워크플로 입력창도 마찬가지입니다.** Actions 실행 기록은 공개되므로
`선수 등록` 폼에 실명이나 연락처를 타이핑하면 그대로 공개됩니다.
프로 지망 선수는 **체크박스만** 켜세요.

### 그 밖에

- 만 14세 미만 선수는 보호자 동의를 받아야 합니다.
- 삭제 요청은 **선수 관리 → remove**로 처리하면 랭킹·스냅샷에서 모두 지워집니다.
  드라이브 명단의 연락처도 함께 지우세요.
  (git 커밋 히스토리에는 남으므로, 완전 파기가 필요하면 저장소 히스토리 정리가 별도로 필요합니다)
- 구단에서 선수 연락처를 문의해 오면 **본인에게 먼저 확인한 뒤에만** 전달하세요.
  등록 시 받은 제3자 제공 동의는 포괄 위임이 아닙니다.

---

## Production Key 신청

개발용 키는 24시간마다 만료되므로 실서비스는 불가능합니다.
<https://developer.riotgames.com> → **REGISTER PRODUCT** → Personal API Key 신청.

- 제출 항목: 서비스 URL(Pages 주소), 용도 설명, 수집 데이터 범위
- 이 정도 규모의 지역 커뮤니티 프로젝트는 승인 자체는 어렵지 않은 편입니다
- 승인되면 만료가 없고 한도도 늘어납니다 (Secret만 새 키로 교체)
- 하단의 Riot 고지 문구는 지우지 마세요 (승인 요건)

---

## 나중에 확장한다면

- **최근 경기·주챔피언**: `match-v5` 추가. 선수당 20경기면 호출이 20배로 뛰므로
  하루에 1/4씩 나눠 도는 설계가 필요합니다.
- **자동 등록 폼**: 등록이 늘면 Supabase 무료 티어를 붙여 신청·승인을 자동화.
- **자유랭크 랭킹**: 이미 `ranking.json`의 `flex` 필드에 저장되어 있어 화면만 추가하면 됩니다.
