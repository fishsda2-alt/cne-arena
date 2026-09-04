"""
인증 아이콘 번호가 파이썬·자바스크립트 양쪽에서 같은 값을 내는지 대조합니다.

서버가 없어서 번호를 두 곳에서 각각 계산합니다.
  · js/verify.js   — 등록·수정 페이지가 신청자에게 번호를 보여줄 때
  · scripts/riot.py — 워크플로가 실제 아이콘과 대조할 때

이 둘이 어긋나면 **아무도 인증을 통과하지 못하는데 원인은 화면에 안 보입니다.**
(선수는 안내받은 대로 바꿨는데 계속 "인증 실패"만 나옵니다)
그래서 두 파일 중 하나라도 고치면 이 검사가 자동으로 돕니다.

덤으로 self_edit.py 의 값 정리·번호 계산도 한 번 굴려 봅니다. 정규식이 깨져 있어도
문법 검사로는 안 걸리고, 신청이 실제로 들어와야 터지기 때문입니다.

사용법: python scripts/check_parity.py   (node 필요 — GitHub Actions에는 이미 있습니다)
"""

import json
import os
import subprocess
import sys
import tempfile
from datetime import datetime

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


def smoke_test():
    """self_edit 의 순수 함수가 실제로 굴러가는지 봅니다.

    정규식이 깨져 있으면 여기서 잡힙니다. 한 번 겪은 일입니다 — 이스케이프가 한 겹
    벗겨져 문자 클래스가 안 닫혔는데, 파일을 눈으로 보면 멀쩡해 보이고 **신청이
    실제로 들어와야만** 터지는 상태였습니다. 문법 검사로는 안 걸립니다.
    """
    import self_edit
    from riot import KST

    dirty = "이름\t줄\n바꿈 \"따옴표\" '작은' `백틱` $달러 " + chr(92) + " 끝"
    cleaned = self_edit.sanitize("name", dirty)
    for ch in ("\n", "\t", '"', "'", "`", "$", chr(92)):
        assert ch not in cleaned, f"{ch!r} 가 남았습니다: {cleaned!r}"
    assert len(cleaned) <= self_edit.LIMITS["name"], cleaned

    낮 = self_edit.accepted_icons("홍길동", "KR1", datetime(2026, 9, 4, 12, 0, tzinfo=KST))
    새벽 = self_edit.accepted_icons("홍길동", "KR1", datetime(2026, 9, 4, 1, 0, tzinfo=KST))
    assert len(낮) == 1, 낮
    assert 낮 <= 새벽, (낮, 새벽)   # 새벽에는 어제 번호가 더해질 수 있습니다

    print("자가 점검 통과: 값 정리·인증 번호 계산 정상")


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
    smoke_test()

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
