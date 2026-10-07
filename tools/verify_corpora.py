#!/usr/bin/env python3
"""Check restored corpora against their published manifest.

The six corpus-dependent gates read a recording that does not live in this
repository. A digest in `CORPORA.md` is only worth having if something checks
it, so this is that something: it verifies the archive, then every file inside
it, against the sha256 values recorded when the corpora were first published.

The archive digest tells you the download is intact. The per-file manifest is
the one that matters, because it tells you each file is the one the gates were
run against. An empty file is a real result here, a topic this deployment never
published on, so empty files are verified like any other rather than skipped.

Usage:  tools/verify_corpora.py [--dir ../spatialdds-scenescape-corpora]
"""
from __future__ import annotations

import argparse
import hashlib
import re
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
DEFAULT_DIR = ROOT.parent / "spatialdds-scenescape-corpora"
MANIFEST = "corpora-20261003.manifest.txt"
ARCHIVE = "corpora-20261003.tgz"
ARCHIVE_SHA = "5af06f7a963cd4f3b46e8da2e9c9aae714437c214056e100841401117f6a6bd8"
MANIFEST_SHA = "c4dcb245f4e1354e534e1c7938aae78bb460caf57408c205094c6ff3d2a0038c"
EMPTY_SHA = "e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855"


def sha256(path: Path) -> str:
    h = hashlib.sha256()
    with open(path, "rb") as f:
        for chunk in iter(lambda: f.read(1 << 20), b""):
            h.update(chunk)
    return h.hexdigest()


def check(corpora: Path, only: str | None = None) -> tuple[int, list[str], bool]:
    """Verify files under `corpora`, optionally just one subdirectory.

    Returns (verified, problems, pinned). `pinned` is False when no manifest
    was found, which is not a failure: a corpus recorded locally has no
    published digest to check against and says so rather than claiming one.
    """
    man = corpora / MANIFEST
    if not man.is_file():
        return 0, [], False
    verified, problems = 0, []
    for line in man.read_text().splitlines():
        m = re.match(r"^([0-9a-f]{64})\s+(\d+)\s+(.+)$", line.strip())
        if not m:
            continue
        digest, size, rel = m.group(1), int(m.group(2)), m.group(3)
        if only and not rel.startswith(f"{only}/"):
            continue
        f = corpora / rel
        if not f.is_file():
            problems.append(f"missing {rel}")
        elif f.stat().st_size != size:
            problems.append(f"{rel}: {f.stat().st_size} bytes, "
                            f"manifest says {size}")
        elif sha256(f) != digest:
            problems.append(f"{rel}: content does not match its digest")
        else:
            verified += 1
    return verified, problems, True


def main() -> int:
    ap = argparse.ArgumentParser()
    ap.add_argument("--dir", type=Path, default=DEFAULT_DIR,
                    help="where the corpora were restored")
    a = ap.parse_args()
    d = a.dir

    print(f"corpora {d}")
    if not d.is_dir():
        print(f"  FAIL no such directory\n\nFAIL, nothing to verify. "
              f"See CORPORA.md for what to restore and where.")
        return 1

    checks: list[tuple[str, bool, str]] = []

    man = d / MANIFEST
    if man.is_file():
        got = sha256(man)
        checks.append((f"{MANIFEST} matches its published digest",
                       got == MANIFEST_SHA, f"got {got}"))
    else:
        checks.append((f"{MANIFEST} is present", False,
                       "without it no per-file check is possible"))

    arc = d / ARCHIVE
    if arc.is_file():
        got = sha256(arc)
        checks.append((f"{ARCHIVE} matches its published digest",
                       got == ARCHIVE_SHA, f"got {got}"))
    else:
        # Legitimate: the archive may have been removed after unpacking.
        print(f"  note {ARCHIVE} is not here, checking unpacked files only")

    ok_files = bad = missing = wrong_size = empty = 0
    problems: list[str] = []
    if man.is_file():
        for line in man.read_text().splitlines():
            m = re.match(r"^([0-9a-f]{64})\s+(\d+)\s+(.+)$", line.strip())
            if not m:
                continue
            digest, size, rel = m.group(1), int(m.group(2)), m.group(3)
            f = d / rel
            if not f.is_file():
                missing += 1
                problems.append(f"missing {rel}")
                continue
            actual_size = f.stat().st_size
            if actual_size != size:
                wrong_size += 1
                problems.append(f"{rel}: {actual_size} bytes, manifest says {size}")
            if sha256(f) == digest:
                ok_files += 1
                if digest == EMPTY_SHA:
                    empty += 1
            else:
                bad += 1
                problems.append(f"{rel}: content does not match its digest")

        checks.append((f"all {ok_files + bad + missing} manifest entries present",
                       missing == 0, f"{missing} file(s) missing"))
        checks.append((f"every file matches its digest "
                       f"({ok_files} verified, {empty} of them empty topics)",
                       bad == 0, f"{bad} file(s) differ"))
        checks.append(("every file matches its recorded byte count",
                       wrong_size == 0, f"{wrong_size} file(s) wrong size"))

    for label, passed, detail in checks:
        print(f"  {'ok  ' if passed else 'FAIL'} {label}")
        if not passed:
            print(f"       {detail}")
    for p in problems[:12]:
        print(f"       {p}")
    if len(problems) > 12:
        print(f"       and {len(problems) - 12} more")

    good = all(c[1] for c in checks)
    print(f"\n{'PASS' if good else 'FAIL'}, the restored corpora are "
          f"{'the bytes the gates were run against' if good else 'not what was published'}")
    return 0 if good else 1


if __name__ == "__main__":
    sys.exit(main())
