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

    python3 gates/run_all.py                      # all 14 if the corpora are
                                                  # restored beside the checkout
    python3 gates/run_all.py --no-corpus          # only what the sample proves
    python3 gates/run_all.py --corpus <dir>       # a corpus somewhere else

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

# The six corpus-dependent gates read a recording too large to keep in the
# repository, so it is restored beside this checkout rather than inside it.
# Found by default, because a path nobody has to remember is a path that
# gets used; CORPORA.md pins the objects and their digests.
DEFAULT_CORPUS = (ROOT.parent / "spatialdds-scenescape-corpora"
                  / "20261003T050916Z")

# A skip is only useful if it says how to un-skip it, so the reason names
# the object to restore rather than just the flag that was missing.
CORPUS_HINT = ("needs a recorded corpus: restore corpora-20261003.tgz, "
               "see CORPORA.md")


def corpus_note(corpus: Path) -> tuple[str, list[str]]:
    """Whether the corpus about to be used is the published one.

    A discovered corpus is otherwise trusted on the strength of its path, and
    six gates would then compare output against bytes nobody checked. The
    digests are pinned in CORPORA.md precisely so that this is answerable, so
    it gets answered here rather than left to a command nobody runs. Reported
    in the header rather than as a gate row: it qualifies the corpus the gates
    read, it is not itself one of the claims about the adapter.
    """
    import importlib.util
    spec = importlib.util.spec_from_file_location(
        "verify_corpora", ROOT / "tools" / "verify_corpora.py")
    vc = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(vc)
    n, problems, pinned = vc.check(corpus.parent, corpus.name)
    if not pinned:
        return "digests not pinned, so these results are not traceable", []
    if problems:
        return f"{len(problems)} file(s) are not the published bytes", problems
    return f"{n} file(s) verified against the published digests", []


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
        {"name": "translation_check",
         "what": "the eight translations hold, field by field, on real messages",
         # Ships with a 25-message fixture so it runs on a clean clone, and
         # takes the full recording when there is one, which is strictly the
         # stronger run.
         "cmd": ["gates/translation_check.py"] + ([str(corpus)] if corpus
                                                  else [])},
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
         "skip": None if corpus else CORPUS_HINT},
        {"name": "conservation_audit",
         "what": "every input topic accounted for, every 1:1 mapping exact",
         "cmd": ["gates/conservation_audit.py", str(corpus), str(replay)]
                if corpus else None,
         "skip": None if corpus else CORPUS_HINT},
        {"name": "determinism",
         "what": "two replays of one input give byte-identical content",
         "cmd": ["gates/determinism.py", str(corpus),
                 "--scene-config", str(CFG)] if corpus else None,
         "skip": None if corpus else CORPUS_HINT},
        {"name": "route_regress",
         "what": "four past defects stay fixed",
         "cmd": ["gates/route_regress.py", str(corpus),
                 "--scene-config", str(CFG)] if corpus else None,
         "skip": None if corpus else CORPUS_HINT},
        {"name": "owm_golden_vector",
         "what": "one entity's whole lifecycle, field by field against the raw messages",
         "cmd": ["gates/owm_golden_vector.py", str(SAMPLE)]},
        {"name": "owm_lifecycle",
         "what": "one entity per track lifecycle, and the lane is the slow tier",
         "cmd": ["gates/owm_lifecycle.py", str(corpus), str(replay),
                 "--scene-config", str(CFG)] if corpus else None,
         "skip": None if corpus else CORPUS_HINT},
        {"name": "owm_route_equiv",
         "what": "replay and the live bridge publish identical owm samples",
         "cmd": ["gates/owm_route_equiv.py", str(corpus),
                 "--scene-config", str(CFG)] if corpus else None,
         "skip": None if corpus else CORPUS_HINT},
        {"name": "readme_manifest",
         "what": "the README quotes this manifest exactly",
         "cmd": ["gates/readme_manifest.py"]},
    ]


def main() -> int:
    ap = argparse.ArgumentParser()
    src = ap.add_mutually_exclusive_group()
    src.add_argument("--corpus", type=Path, default=None,
                     help=f"a recorded corpus directory. Defaults to "
                          f"{DEFAULT_CORPUS} when that exists; without a "
                          f"corpus the six that need one report SKIPPED")
    src.add_argument("--no-corpus", action="store_true",
                     help="ignore the corpus beside the checkout. This is the "
                          "manifest a clean clone produces, and the one the "
                          "README quotes")
    ap.add_argument("--keep", action="store_true",
                    help="keep the scratch directory")
    # readme_manifest runs this script to get the manifest it compares the
    # README against, and this script runs readme_manifest. The cycle is cut
    # here rather than by leaving the gate out of the list: with this flag the
    # readme row is rendered as it would read on a passing run, and nothing is
    # executed for it. If the README is in fact wrong, readme_manifest itself
    # fails, and a normal run of this script fails with it.
    ap.add_argument("--assume-readme-pass", action="store_true",
                    help=argparse.SUPPRESS)
    a = ap.parse_args()

    if a.corpus and not a.corpus.is_dir():
        print(f"no such corpus directory: {a.corpus}", file=sys.stderr)
        return 2

    corpus, found = a.corpus, False
    if corpus is None and not a.no_corpus and DEFAULT_CORPUS.is_dir():
        corpus, found = DEFAULT_CORPUS, True

    tmp = Path(tempfile.mkdtemp(prefix="gates-"))
    env = dict(os.environ, PYTHONPATH=str(ROOT))

    note = ""
    if corpus:
        note, problems = corpus_note(corpus)
        if problems:
            print(f"the corpus at {corpus} is not what was published:",
                  file=sys.stderr)
            for pr in problems[:8]:
                print(f"  {pr}", file=sys.stderr)
            print("refusing to run: six gates would compare output against "
                  "bytes nobody checked.\nSee CORPORA.md, or pass a different "
                  "--corpus.", file=sys.stderr)
            return 2

    # The corpus gates compare a replay against the corpus it came from, so
    # one replay is cut here and shared rather than each gate cutting its own.
    if corpus:
        r = subprocess.run(
            [sys.executable, str(ROOT / "tools" / "replay_to_mcap.py"),
             str(corpus), "--scene-config", str(CFG),
             "--label", "gates", "--out", str(tmp / "replay.mcap")],
            cwd=ROOT, env=env, capture_output=True, text=True)
        if r.returncode != 0:
            print("could not replay the corpus:\n" + r.stdout[-800:],
                  file=sys.stderr)
            return 2

    rows = []
    for g in gates(corpus, tmp):
        if g["name"] == "readme_manifest" and a.assume_readme_pass:
            rows.append((g["name"], "PASS", "", g["what"]))
            continue
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
    if corpus is None:
        where = "none, so six gates will report SKIPPED"
    elif found:
        where = f"{corpus} (found beside the checkout)"
    else:
        where = str(corpus)
    print(f"  corpus: {where}")
    if note:
        print(f"  corpus: {note}")
    print()
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
