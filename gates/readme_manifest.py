#!/usr/bin/env python3
"""The README's quoted manifest is exactly what the runner prints.

The last hand-made comparison in the repository. `gates/run_all.py` made the
verification claim an output rather than a sentence, but the README quotes
that output, and a quote drifts: a gate gets added, a skip reason is reworded,
and the block in the README keeps saying what used to be true. Checking that
by eye is exactly the kind of manual comparison every defect this week lived
in.

So the quote is checked. The README's fenced block that follows the
`$ python3 gates/run_all.py` line must match the runner's output line for
line, ignoring only trailing whitespace.

**On the cycle.** This gate runs the runner, and the runner runs this gate.
The runner takes `--assume-readme-pass`, which renders the readme row as it
reads on a passing run without executing anything for it. Nothing is faked by
that: if the README is wrong, this gate fails on its own, and a normal run of
the runner fails with it, because the runner invokes this gate for real.

**On the corpus.** The comparison deliberately uses the no-corpus manifest,
which is why both the README and this gate name `--no-corpus` explicitly. It
is the manifest every reader can reproduce from a clean clone with nothing but
the repository, which makes it the right thing for a README to promise. The
flag has to be explicit now that the runner finds a restored corpus beside the
checkout on its own: without it this gate would compare the README against a
fourteen-pass run on the maintainer's machine and fail for everyone who has
the corpora, which is the one group whose setup is not what the README
describes.

Usage:  gates/readme_manifest.py [--readme FILE]
"""
from __future__ import annotations

import argparse
import os
import re
import subprocess
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
MARKER = "$ python3 gates/run_all.py --no-corpus"


def quoted_block(readme: str) -> list[str] | None:
    """The fenced block introduced by the runner's command line."""
    i = readme.find(MARKER)
    if i == -1:
        return None
    rest = readme[i + len(MARKER):]
    end = rest.find("```")
    if end == -1:
        return None
    return [l.rstrip() for l in rest[:end].splitlines()]


def main() -> int:
    ap = argparse.ArgumentParser()
    ap.add_argument("--readme", type=Path, default=ROOT / "README.md")
    a = ap.parse_args()

    readme = a.readme.read_text()
    quoted = quoted_block(readme)
    if quoted is None:
        print(f"  FAIL no fenced block after {MARKER!r} in {a.readme}")
        print("\nFAIL, the README does not quote the manifest at all")
        return 1

    r = subprocess.run(
        [sys.executable, str(ROOT / "gates" / "run_all.py"),
         "--no-corpus", "--assume-readme-pass"],
        cwd=ROOT, env=dict(os.environ, PYTHONPATH=str(ROOT)),
        capture_output=True, text=True)
    if r.returncode not in (0, 1):
        print(f"  FAIL the runner could not be executed:\n{r.stderr[-400:]}")
        return 2

    # The runner prints a header naming the checkout and the corpus; the
    # README quotes from the first gate row onward, so compare from there.
    actual = [l.rstrip() for l in r.stdout.splitlines()]
    first = next((i for i, l in enumerate(actual)
                  if l.strip().startswith(("PASS", "FAIL", "SKIPPED"))), None)
    if first is None:
        print("  FAIL the runner printed no gate rows")
        return 1
    actual = actual[first:]

    # Drop blank lines from both sides: they carry no claim, and a README
    # that renders the same rows with different spacing is not drifting.
    def meaningful(lines):
        return [l for l in lines if l.strip()]

    q, b = meaningful(quoted), meaningful(actual)

    print(f"readme {a.readme}")
    print(f"  quoted {len(q)} line(s), runner printed {len(b)}\n")

    ok = True
    if len(q) != len(b):
        ok = False
        print(f"  FAIL line counts differ: README {len(q)}, runner {len(b)}")
        extra = set(l.split()[1] if len(l.split()) > 1 else l
                    for l in b) - set(l.split()[1] if len(l.split()) > 1 else l
                                      for l in q)
        if extra:
            print(f"       the README is missing: {', '.join(sorted(extra))}")
    for i, (ql, bl) in enumerate(zip(q, b)):
        if " ".join(ql.split()) != " ".join(bl.split()):
            ok = False
            print(f"  FAIL line {i + 1} differs")
            print(f"       README: {ql.strip()}")
            print(f"       runner: {bl.strip()}")
            break
    if ok:
        print(f"  ok   every quoted line matches the runner's output")
        print(f"  ok   totals line: {b[-1].strip()}")

    print(f"\n{'PASS' if ok else 'FAIL'}, the README quotes the manifest "
          f"{'exactly' if ok else 'inaccurately'}")
    return 0 if ok else 1


if __name__ == "__main__":
    sys.exit(main())
