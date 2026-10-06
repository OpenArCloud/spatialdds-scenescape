#!/usr/bin/env python3
"""Run every gate and print what happened to each one.

This exists because a verification claim is an output like any other, and an
output needs a producer. The README used to say "ten gates, clean clone" in
prose, written beside a run that had in fact exercised seven of them: three
need a recorded corpus, which the shipped sample is not, and two of those
three were broken for weeks without anything noticing. The claim was true of
the gates that ran and silent about the gates that did not.

So the claim is now a quote of this script's output. Every gate is listed
whether or not it can run here, and one that cannot says SKIPPED with the
reason. The day a gate stops being runnable the manifest says so in the place
that used to say nothing at all.

    python3 gates/run_all.py                      # what runs on the sample
    python3 gates/run_all.py --corpus <dir>       # everything

Exit code is 0 only when nothing failed. Skips do not fail the run: a skip is
a stated absence, which is the point of printing it.
"""
from __future__ import annotations

import argparse
import os
import shutil
import subprocess
import sys
import tempfile
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
SAMPLE = ROOT / "samples" / "queuing-retail-sample.mcap"
LAYOUT = ROOT / "samples" / "queuing-retail-sample.layout.json"
CFG = ROOT / "samples" / "scene-config.json"


def gates(corpus: Path | None, tmp: Path) -> list[dict]:
    """Every gate, with what it needs and why it might not run.

    `needs` is evaluated here rather than inside each gate so that a gate
    which cannot run is reported by name instead of being left out of the
    list, which is exactly the failure this file exists to prevent.
    """
    replay = tmp / "replay.mcap"
    node = shutil.which("node") is not None
    try:
        import playwright  # noqa: F401
        have_pw = True
    except ImportError:
        have_pw = False

    return [
        {"name": "bindings_roundtrip",
         "what": "every generated struct imports and round-trips CDR",
         "cmd": ["gates/bindings_roundtrip.py"]},
        {"name": "golden_vector",
         "what": "georeference against the producer's published worked example",
         "cmd": ["gates/golden_vector.py"]},
        {"name": "golden_point",
         "what": "georeference against the producer's live per-object output",
         "cmd": ["gates/golden_point.py", "--recorded"]},
        {"name": "schema_check",
         "what": "embedded schemas are self-contained and every channel decodes",
         "cmd": ["gates/schema_check.py", str(SAMPLE)]},
        {"name": "layout_check",
         "what": "every Foxglove layout path resolves against the recording",
         "cmd": ["gates/layout_check.py", str(LAYOUT), str(SAMPLE)]},
        {"name": "render_check",
         "what": "a headless browser renders a value for every panel path",
         "cmd": ["gates/render_check.py", str(SAMPLE), str(LAYOUT),
                 "--out-dir", str(tmp / "render")],
         "skip": None if (node and have_pw) else
                 "needs Node and Playwright, which are not installed"},
        {"name": "stamp_fidelity",
         "what": "published timestamps are exactly the producer's timestamps",
         "cmd": ["gates/stamp_fidelity.py", str(corpus), str(replay)]
                if corpus else None,
         "skip": None if corpus else "needs a recorded corpus (--corpus)"},
        {"name": "conservation_audit",
         "what": "every input topic accounted for, every 1:1 mapping exact",
         "cmd": ["gates/conservation_audit.py", str(corpus), str(replay)]
                if corpus else None,
         "skip": None if corpus else "needs a recorded corpus (--corpus)"},
        {"name": "determinism",
         "what": "two replays of one input give byte-identical content",
         "cmd": ["gates/determinism.py", str(corpus),
                 "--scene-config", str(CFG)] if corpus else None,
         "skip": None if corpus else "needs a recorded corpus (--corpus)"},
        {"name": "route_regress",
         "what": "four past defects stay fixed",
         "cmd": ["gates/route_regress.py", str(corpus),
                 "--scene-config", str(CFG)] if corpus else None,
         "skip": None if corpus else "needs a recorded corpus (--corpus)"},
        {"name": "owm_golden_vector",
         "what": "one entity's whole lifecycle, field by field against the raw messages",
         "cmd": ["gates/owm_golden_vector.py", str(SAMPLE)]},
        {"name": "owm_lifecycle",
         "what": "one entity per track lifecycle, and the lane is the slow tier",
         "cmd": ["gates/owm_lifecycle.py", str(corpus), str(replay),
                 "--scene-config", str(CFG)] if corpus else None,
         "skip": None if corpus else "needs a recorded corpus (--corpus)"},
        {"name": "owm_route_equiv",
         "what": "replay and the live bridge publish identical owm samples",
         "cmd": ["gates/owm_route_equiv.py", str(corpus),
                 "--scene-config", str(CFG)] if corpus else None,
         "skip": None if corpus else "needs a recorded corpus (--corpus)"},
    ]


def main() -> int:
    ap = argparse.ArgumentParser()
    ap.add_argument("--corpus", type=Path, default=None,
                    help="a recorded corpus directory; without it the "
                         "corpus-dependent gates report SKIPPED")
    ap.add_argument("--keep", action="store_true",
                    help="keep the scratch directory")
    a = ap.parse_args()

    if a.corpus and not a.corpus.is_dir():
        print(f"no such corpus directory: {a.corpus}", file=sys.stderr)
        return 2

    tmp = Path(tempfile.mkdtemp(prefix="gates-"))
    env = dict(os.environ, PYTHONPATH=str(ROOT))

    # The corpus gates compare a replay against the corpus it came from, so
    # one replay is cut here and shared rather than each gate cutting its own.
    if a.corpus:
        r = subprocess.run(
            [sys.executable, str(ROOT / "tools" / "replay_to_mcap.py"),
             str(a.corpus), "--scene-config", str(CFG),
             "--label", "gates", "--out", str(tmp / "replay.mcap")],
            cwd=ROOT, env=env, capture_output=True, text=True)
        if r.returncode != 0:
            print("could not replay the corpus:\n" + r.stdout[-800:],
                  file=sys.stderr)
            return 2

    rows = []
    for g in gates(a.corpus, tmp):
        if g.get("skip"):
            rows.append((g["name"], "SKIPPED", g["skip"], g["what"]))
            continue
        r = subprocess.run([sys.executable] + g["cmd"], cwd=ROOT, env=env,
                           capture_output=True, text=True)
        if r.returncode == 0:
            rows.append((g["name"], "PASS", "", g["what"]))
        else:
            # Prefer the gate's own verdict line over its last line of
            # output. render_check, for instance, prints the proof paths
            # after its verdict, and a manifest that quoted a file path
            # where the diagnosis should be would be useless at the only
            # moment it matters.
            lines = [l.strip() for l in (r.stdout or "").splitlines()
                     if l.strip()]
            verdicts = [l for l in lines
                        if l.startswith(("FAIL", "PASS")) or ", FAIL" in l]
            if verdicts:
                detail = verdicts[-1]
            elif lines:
                detail = lines[-1]
            else:
                err = (r.stderr or "").strip().splitlines()
                detail = err[-1] if err else "no output"
            rows.append((g["name"], "FAIL", detail[:96], g["what"]))

    width = max(len(r[0]) for r in rows)
    print(f"gate manifest, {ROOT.name}")
    print(f"  corpus: {a.corpus if a.corpus else 'not supplied'}\n")
    for name, status, detail, what in rows:
        print(f"  {status:<8} {name:<{width}}  {what}")
        if detail:
            print(f"           {' ' * width}  {detail}")

    npass = sum(1 for r in rows if r[1] == "PASS")
    nfail = sum(1 for r in rows if r[1] == "FAIL")
    nskip = sum(1 for r in rows if r[1] == "SKIPPED")
    if not a.keep:
        shutil.rmtree(tmp, ignore_errors=True)
    print(f"\n{len(rows)} gates: {npass} passed, {nfail} failed, {nskip} skipped")
    return 1 if nfail else 0


if __name__ == "__main__":
    sys.exit(main())
