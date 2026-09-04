"""
인증 아이콘 번호가 파이썬·자바스크립트 양쪽에서 같은 값을 내는지 대조합니다.

서버가 없어서 번호를 두 곳에서 각각 계산합니다.
  · js/verify.js   — 등록·수정 페이지가 신청자에게 번호를 보여줄 때
  · scripts/riot.py — 워크플로가 실제 아이콘과 대조할 때

이 둘이 어긋나면 **아무도 인증을 통과하지 못하는데 원인은 화면에 안 보입니다.**
(선수는 안내받은 대로 바꿨는데 계속 "인증 실패"만 나옵니다)
그래서 두 파일 중 하나라도 고치면 이 검사가 자동으로 돕니다.

사용법: python scripts/check_parity.py   (node 필요 — GitHub Actions에는 이미 있습니다)
"""

import json
import os
import subprocess
import sys
import tempfile

from riot import edit_icon_id, expected_icon_id

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
VERIFY_JS = os.path.join(ROOT, "js", "verify.js")

# 한글·공백·대소문자·특수 태그까지 섞어 봅니다.
IDS = [
    ("홍길동", "KR1"),
    ("Yeunsb", "KR1"),
    ("hide on bush", "KR1"),
    ("ABC", "kr2"),
    ("  앞뒤공백  ", " KR1 "),
    ("한글닉네임", "크맆"),
    ("Mixed CaSe 이름", "TAG9"),
]
DAYS = ["2026-01-01", "2026-09-04", "2026-12-31", "2027-02-28"]

# verify.js 를 함수 본문으로 감싸 실행합니다.
# (const 선언이 eval 밖으로 새지 않으므로 new Function 안에서 그대로 호출합니다)
HARNESS = r"""
const fs = require('fs');
const cases = JSON.parse(fs.readFileSync(process.argv[2], 'utf8'));
const src = fs.readFileSync(process.argv[3], 'utf8');
const run = new Function('cases', src + `
  return cases.map(function (c) {
    return c.day ? editIconId(c.gameName, c.tagLine, c.day)
                 : expectedIconId(c.gameName, c.tagLine);
  });
`);
console.log(JSON.stringify(run(cases)));
"""


def build_cases():
    cases = [{"gameName": g, "tagLine": t, "day": None} for g, t in IDS]
    for g, t in IDS:
        for day in DAYS:
            cases.append({"gameName": g, "tagLine": t, "day": day})
    return cases


def python_results(cases):
    return [
        edit_icon_id(c["gameName"], c["tagLine"], c["day"]) if c["day"]
        else expected_icon_id(c["gameName"], c["tagLine"])
        for c in cases
    ]


def js_results(cases):
    with tempfile.TemporaryDirectory() as tmp:
        cases_path = os.path.join(tmp, "cases.json")
        harness_path = os.path.join(tmp, "harness.js")
        with open(cases_path, "w", encoding="utf-8") as f:
            json.dump(cases, f, ensure_ascii=False)
        with open(harness_path, "w", encoding="utf-8") as f:
            f.write(HARNESS)
        out = subprocess.run(
            ["node", harness_path, cases_path, VERIFY_JS],
            capture_output=True, text=True, encoding="utf-8",
        )
    if out.returncode != 0:
        print("node 실행 실패:", file=sys.stderr)
        print(out.stderr.strip(), file=sys.stderr)
        return None
    return json.loads(out.stdout)


def main():
    cases = build_cases()
    py = python_results(cases)
    js = js_results(cases)
    if js is None:
        return 1

    bad = [(c, a, b) for c, a, b in zip(cases, py, js) if a != b]
    for case, a, b in bad:
        day = case["day"] or "(등록용·날짜 무관)"
        print(f"불일치: {case['gameName']}#{case['tagLine']} · {day} "
              f"→ python {a}번 / js {b}번", file=sys.stderr)

    if bad:
        print(f"\n{len(bad)}/{len(cases)}건 불일치. "
              "js/verify.js 와 scripts/riot.py 의 계산이 어긋났습니다.", file=sys.stderr)
        print("이대로 두면 선수가 안내받은 아이콘으로 바꿔도 인증에 실패합니다.", file=sys.stderr)
        return 1

    print(f"일치: {len(cases)}건 모두 같은 번호 (등록용 {len(IDS)}건 + 수정용 {len(cases) - len(IDS)}건)")
    return 0


if __name__ == "__main__":
    sys.exit(main())
