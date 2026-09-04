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
```

- `data/players.json` — 등록 선수 명단(운영자가 직접 고치지 않음, 워크플로가 관리)
- `data/ranking.json` — 사이트가 읽는 유일한 파일. 매일 04:10 KST 재생성
- `data/history/YYYY-MM.json` — 일별 스냅샷(주간 LP 상승폭 계산용)
- `scripts/` — 외부 패키지 0개, 표준 라이브러리만 사용
- `scripts/apps-script/register-proxy.gs` — 구글 Apps Script에 붙여넣는 중계 코드

## 반드시 지킬 것 (실제로 겪은 함정)

**Riot API 호출에 `urllib`을 쓰지 말 것.**
urllib은 헤더 이름을 `X-Riot-Token` → `X-riot-token`으로 바꿔 보내는데,
Riot 게이트웨이가 이를 인증 헤더로 인정하지 않고 **403**을 냅니다.
키가 멀쩡한데도 403이 나서 원인 찾는 데 오래 걸렸습니다. `http.client`를 쓰세요.

**데이터를 커밋하는 워크플로는 반드시 끝에 Pages 배포를 호출할 것.**
GitHub은 `GITHUB_TOKEN`으로 만든 커밋으로는 다른 워크플로를 실행시키지 않습니다.
그래서 push 트리거만 걸어두면 저장소만 갱신되고 **사이트는 영영 옛 파일을 내보냅니다.**
`deploy-pages.yml`이 `workflow_call`을 받도록 돼 있고, 데이터 워크플로 4개가 이를 호출합니다.
배포 시 기본 브랜치 최신을 다시 체크아웃해야 방금 커밋한 내용이 반영됩니다.

**워크플로를 고친 뒤에는 `Re-run jobs`로 확인하지 말 것.**
재실행은 원래 실행 시점의 커밋 코드로 돕니다. 새로 트리거해야 최신 코드가 돕니다.

**개인정보를 저장소에 넣지 말 것.**
저장소도 Actions 실행 기록도 전부 공개됩니다. 실명·연락처·이메일·생년월일은
구글 드라이브의 비공개 명단에만 두고, 저장소에는 `proAspirant` 플래그(★)만 둡니다.
프로 트라이아웃 신청을 자동 등록 경로에 태우지 않는 이유가 이것입니다.

**티어는 사람이 수정할 수 없음.** Riot API가 매일 자동으로 채웁니다.
선수가 정하는 것은 표시 닉네임·지역·주 포지션·소속뿐입니다.

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
- 파이썬이 설치돼 있지 않은 환경일 수 있습니다. 스크립트 검증은 Actions에서 합니다.
- `.gs`·`.ps1`·`.bat`은 CRLF로 유지 (메모장에서 한 줄로 보이는 문제 방지).
  `serve.ps1`은 UTF-8 **BOM 포함**이어야 Windows PowerShell이 한글을 읽습니다.

## 문제가 생기면 먼저 볼 곳

Actions 탭의 각 실행 요약에 **결과 상자**가 있습니다. 로그를 펼치지 않아도
실패 이유(아이콘 불일치, 키 거부 등)가 한국어로 나옵니다.

키가 의심되면 **Actions → API 키 점검 → Run workflow**.
등록·갱신을 건드리지 않고 키만 시험하며, 키 값은 출력하지 않고 모양·지문·해시만 보여줍니다.
