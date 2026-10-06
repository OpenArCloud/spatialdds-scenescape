#!/usr/bin/env python3
"""Determinism check: the translation is a function, not a mood. the determinism gate.

  python3 gates/determinism.py <corpus-dir> [--scene-config FILE]

Replays the corpus twice and hashes the canonicalized output of each run. The
hashes must match.

**What is canonicalized away, and why each is legitimate.** Only values that
cannot be a function of the input:

  * `publish_time`, the writer's wall clock at the moment of writing. The
    sample's own `log_time` is NOT excluded: it comes from the data.
  * the MCAP header's library/profile and any file-level timestamps, writer
    metadata, not message content.

Nothing else is excluded. In particular every field of every message body is
hashed, so a mapping that varied with iteration order, dict ordering, a
random id, or an unstable float would fail here. If the exclusion list ever
needs to grow to make this pass, that growth is the finding.
"""
from __future__ import annotations

import argparse
import hashlib
import subprocess
import sys
import tempfile
from pathlib import Path

from mcap.reader import make_reader

ROOT = Path(__file__).resolve().parent.parent


def run_once(corpus: Path, out: Path, scene_config: Path | None) -> None:
    cmd = [sys.executable, str(ROOT / "tools" / "replay_to_mcap.py"),
           str(corpus), "--out", str(out), "--label", "determinism"]
    if scene_config:
        cmd += ["--scene-config", str(scene_config)]
    r = subprocess.run(cmd, capture_output=True, text=True)
    if r.returncode != 0:
        print(r.stdout[-2000:], r.stderr[-2000:], file=sys.stderr)
        raise SystemExit("replay failed")


def digest(path: Path) -> tuple[str, int]:
    """Hash topic + schema + log_time + body, in file order. Excludes
    publish_time and all writer metadata."""
    h = hashlib.sha256()
    n = 0
    with open(path, "rb") as f:
        for sch, ch, msg in make_reader(f).iter_messages():
            h.update(ch.topic.encode())
            h.update(b"\x00")
            h.update(sch.name.encode())
            h.update(b"\x00")
            h.update(str(msg.log_time).encode())
            h.update(b"\x00")
            h.update(msg.data)
            h.update(b"\x1e")
            n += 1
    return h.hexdigest(), n


def main() -> int:
    ap = argparse.ArgumentParser()
    ap.add_argument("corpus", type=Path)
    ap.add_argument("--scene-config", type=Path, default=None)
    a = ap.parse_args()

    cfg = a.scene_config
    if cfg is None and (a.corpus / "scene-config.json").is_file():
        cfg = a.corpus / "scene-config.json"

    with tempfile.TemporaryDirectory() as td:
        p1, p2 = Path(td) / "run1.mcap", Path(td) / "run2.mcap"
        run_once(a.corpus, p1, cfg)
        run_once(a.corpus, p2, cfg)
        d1, n1 = digest(p1)
        d2, n2 = digest(p2)

    print(f"corpus {a.corpus}")
    print(f"  run 1: {n1} messages  sha256 {d1}")
    print(f"  run 2: {n2} messages  sha256 {d2}")
    print("  excluded from the hash: publish_time (writer clock), MCAP header")
    print("  included: topic, schema name, log_time (from the data), full body")
    if d1 == d2 and n1 == n2:
        print("\n  MATCH, the translation is a function of its input, not a mood.")
        return 0
    print("\n  MISMATCH, the translation is not deterministic. This is a finding.")
    return 1


if __name__ == "__main__":
    sys.exit(main())
