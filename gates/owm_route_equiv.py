#!/usr/bin/env python3
"""The replay path and the live bridge publish identical owm samples.

The same harness that caught four Phase 1 defects, pointed at the new lane.
Replay walks a corpus directory; the bridge reads the same records as a stream
on stdin, exactly as it reads them from `mosquitto_sub` in production. Two
control flows, one `sidecar.route.Router`. If they ever disagree, the thing
validated in replay is not the thing published live.

Byte comparison, not field comparison. A field walk only checks the fields
somebody thought to list, which is how a timestamp defect survived nine gates
in Phase 1.

**One documented exception.** Declared region entities are latched, and
latched samples carry the replay-scoped stamp convention: in replay they are
back-dated to the corpus start, because the regions were configured for the
whole recorded window, while live they carry publication time, because
back-dating a live stream would be a false claim about when the fact was
learned. So their stamps differ by design and their bodies are compared with
the stamp excluded. Track entities carry the producer's own timestamps on both
paths and are compared whole.

Usage:  gates/owm_route_equiv.py <corpus-dir> --scene-config FILE
"""
from __future__ import annotations

import argparse
import subprocess
import sys
import tempfile
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
if str(ROOT) not in sys.path:
    sys.path.insert(0, str(ROOT))

from mcap.reader import make_reader                            # noqa: E402

from spatialdds18.spatial.owm._owm import Entity, Basis        # noqa: E402

TRANSLATED = ("regulated-scene", "data-camera", "data-region", "event")


def corpus_stream(corpus: Path) -> str:
    """The corpus as the bridge reads it: one record per line, arrival order."""
    lines = []
    for name in TRANSLATED:
        f = corpus / f"{name}.jsonl"
        if f.is_file():
            lines += [l for l in f.read_text().splitlines() if l.count("|") >= 2]
    lines.sort(key=lambda l: float(l.split("|", 1)[0]))
    return "\n".join(lines) + "\n"


def owm_samples(path: Path) -> list[tuple[str, bytes]]:
    out = []
    with open(path, "rb") as f:
        for sch, ch, msg in make_reader(f).iter_messages():
            if sch.name == "spatial::owm::Entity":
                out.append((ch.topic, msg.data))
    return out


def main() -> int:
    ap = argparse.ArgumentParser()
    ap.add_argument("corpus", type=Path)
    ap.add_argument("--scene-config", type=Path, required=True)
    a = ap.parse_args()

    tmp = Path(tempfile.mkdtemp(prefix="owm-equiv-"))
    replay_mcap, live_mcap = tmp / "replay.mcap", tmp / "live.mcap"
    env = {"PYTHONPATH": str(ROOT), "PATH": "/usr/bin:/bin:/usr/local/bin"}

    r = subprocess.run(
        [sys.executable, str(ROOT / "tools" / "replay_to_mcap.py"),
         str(a.corpus), "--scene-config", str(a.scene_config),
         "--label", "equiv", "--out", str(replay_mcap)],
        cwd=ROOT, env=env, capture_output=True, text=True)
    if r.returncode != 0:
        print("replay failed:\n" + (r.stdout or r.stderr)[-600:], file=sys.stderr)
        return 2

    r = subprocess.run(
        [sys.executable, str(ROOT / "sidecar" / "bridge.py"),
         "--scene-config", str(a.scene_config), "--mcap", str(live_mcap),
         "--status-every", "0"],
        cwd=ROOT, env=env, input=corpus_stream(a.corpus),
        capture_output=True, text=True)
    if r.returncode != 0:
        print("bridge failed:\n" + (r.stdout or r.stderr)[-600:], file=sys.stderr)
        return 2

    rep, live = owm_samples(replay_mcap), owm_samples(live_mcap)

    def split(samples):
        tracks, declared = [], []
        for topic, data in samples:
            e = Entity.deserialize(data)
            (declared if e.basis == Basis.DECLARED else tracks).append(
                (topic, data, e))
        return tracks, declared

    rt, rd = split(rep)
    lt, ld = split(live)

    checks: list[tuple[str, bool, str]] = []
    checks.append((f"both paths publish owm samples "
                   f"(replay {len(rep)}, live {len(live)})",
                   bool(rep) and bool(live), "one path published none"))
    checks.append((f"same number of track entities ({len(rt)})",
                   len(rt) == len(lt), f"replay {len(rt)}, live {len(lt)}"))
    checks.append((f"same number of declared entities ({len(rd)})",
                   len(rd) == len(ld), f"replay {len(rd)}, live {len(ld)}"))

    same_bytes = [(t, d) for t, d, _ in rt] == [(t, d) for t, d, _ in lt]
    first_diff = ""
    if not same_bytes and len(rt) == len(lt):
        for i, ((t1, d1, e1), (t2, d2, e2)) in enumerate(zip(rt, lt)):
            if (t1, d1) != (t2, d2):
                first_diff = f"sample {i}, entity {e1.entity_id}"
                break
    checks.append(("track entities are byte-identical across both paths",
                   same_bytes, f"first difference at {first_diff}"))

    def without_stamp(e: Entity):
        return (e.entity_id, e.basis, e.state, e.state_reason, e.layer,
                tuple(e.type_uris), e.has_extent,
                tuple(e.extent.min_xyz), tuple(e.extent.max_xyz),
                tuple((kv.key, kv.value) for kv in e.properties),
                e.source_id)

    decl_match = ([without_stamp(e) for _, _, e in rd]
                  == [without_stamp(e) for _, _, e in ld])
    checks.append(("declared entities match in every field but the stamp",
                   decl_match, "bodies differ beyond the stamp"))
    stamps_differ = all(
        (e1.stamp.sec, e1.stamp.nanosec) != (e2.stamp.sec, e2.stamp.nanosec)
        for (_, _, e1), (_, _, e2) in zip(rd, ld)) if rd and ld else True
    checks.append((
        "declared entity stamps differ, as the replay convention requires",
        stamps_differ,
        "replay and live stamped a latched sample identically, which means "
        "one of them is not following the convention"))

    print(f"corpus {a.corpus}")
    print(f"  replay {len(rep)} owm sample(s), live {len(live)}\n")
    ok = True
    for label, passed, detail in checks:
        print(f"  {'ok  ' if passed else 'FAIL'} {label}")
        if not passed:
            print(f"       {detail}")
        ok = ok and passed

    print(f"\n{'PASS' if ok else 'FAIL'} — replay and live agree on the owm lane")
    return 0 if ok else 1


if __name__ == "__main__":
    sys.exit(main())
