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
├── register.html            선수 등록 안내 + 인증 아이콘 번호 계산기
├── css/style.css
├── js/
│   ├── config.js            ★ 사이트명·연락처·지역 목록 (여기만 고치면 됨)
│   ├── verify.js            인증 아이콘 번호 계산 (Python과 동일한 CRC32)
│   └── ranking.js           랭킹표 렌더링
├── scripts/                 (GitHub Actions가 실행, 외부 패키지 0개)
│   ├── riot.py              API 클라이언트 + 요청 한도 제어
│   ├── ranking.py           티어→점수 변환·정렬
│   ├── update_ranking.py    하루 1회 갱신
│   ├── add_player.py        선수 등록 + 아이콘 인증
│   └── manage_player.py     승인 / 보류 / 삭제
├── data/
│   ├── players.json         등록 선수 명단 (워크플로가 관리)
│   ├── ranking.json         자동 생성 — 사이트가 읽는 유일한 파일
│   ├── ranking.sample.json  API 키 없이 화면만 보고 싶을 때 쓰는 예시
│   └── history/YYYY-MM.json 일별 스냅샷 (주간 상승폭 계산용)
├── .github/workflows/
│   ├── update-ranking.yml   매일 04:10 자동 갱신
│   ├── add-player.yml       선수 등록 (수동 실행)
│   ├── manage-player.yml    승인/보류/삭제 (수동 실행)
│   └── deploy-pages.yml     정적 사이트 배포
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

### 2. GitHub 저장소 만들기

1. GitHub에서 새 저장소 생성 (**Public** — Pages 무료 사용 조건)
2. 이 `cnrank` 폴더를 저장소 루트로 올립니다.

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

## 운영 방법

| 하고 싶은 일 | 방법 |
|---|---|
| 선수 추가 | Actions → **선수 등록** → Run workflow |
| 승인 보류 / 재승인 | Actions → **선수 관리** → `hold` / `approve` |
| 개인정보 삭제 요청 | Actions → **선수 관리** → `remove` (랭킹·기록에서 전부 삭제) |
| 지금 당장 랭킹 갱신 | Actions → **랭킹 갱신** → Run workflow |
| 사이트 이름·연락처 변경 | `js/config.js` 수정 후 커밋 |

### 선수 등록 신청은 어떻게 받나요

기본값은 **이메일**(`js/config.js`의 `contact`)입니다. 구글 폼을 쓰면 더 편합니다.

1. Google Forms에서 폼 생성 — 문항: Riot ID / 이름 / 소속 / 지역 / 포지션 / 개인정보 동의
2. 폼 주소를 `js/config.js`의 `formUrl`에 붙여넣기
3. 접수된 응답을 보고 **선수 등록** 워크플로를 실행

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

- 공개 저장소를 쓰면 `data/players.json`도 공개됩니다. 실명 대신 활동명을 권장하세요.
- 만 14세 미만 선수는 보호자 동의를 받아야 합니다.
- 삭제 요청은 **선수 관리 → remove**로 처리하면 랭킹·스냅샷에서 모두 지워집니다.
  (단 git 커밋 히스토리에는 남으므로, 완전 파기가 필요하면 저장소 히스토리 정리가 별도로 필요합니다)

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
