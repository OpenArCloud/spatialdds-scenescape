#!/usr/bin/env python3
"""Lifecycle parity and tempo for the spatial.owm entity lane.

Two gates in one pass over a corpus and the MCAP replayed from it, because
both are statements about the same counts and splitting them would mean
reading the corpus twice to say related things.

**Lifecycle parity.** Every track lifecycle visible in the raw SceneScape
messages corresponds to exactly one entity create, and at most one retire
carrying a reason. No orphan entities, which would be an entity for a track
that never existed, and no silent retirements, which would be a terminal
sample with an empty reason or a dispose with no terminal sample before it.

The expected counts are derived **here, from the raw corpus**, not from the
router. A gate that asked the implementation how many tracks it saw and then
checked it published that many would pass for any implementation, including a
broken one.

**Tempo.** The entity lane is the slow tier. Its sample count must be of the
order of lifecycle changes, not detections. A lane publishing at frame rate
fails this even when every individual sample is correct, which is the whole
point: correctness per sample does not make a lane the right shape.

Usage:  gates/owm_lifecycle.py <corpus-dir> <replay.mcap> --scene-config FILE
"""
from __future__ import annotations

import argparse
import json
import sys
from collections import Counter
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
if str(ROOT) not in sys.path:
    sys.path.insert(0, str(ROOT))

from mcap.reader import make_reader                            # noqa: E402

# The owm enums live in the module itself rather than in generated enum
# subpackages, unlike events; the generator nests only where the IDL does.
from spatialdds18.spatial.owm._owm import (                     # noqa: E402
    Entity, LifecycleState)

RETENTION_S = 5.0


def read(corpus: Path, name: str):
    f = corpus / f"{name}.jsonl"
    if not f.is_file():
        return
    for line in f.read_text().splitlines():
        parts = line.split("|", 2)
        if len(parts) != 3:
            continue
        try:
            yield float(parts[0]), parts[1], json.loads(parts[2])
        except (ValueError, json.JSONDecodeError):
            continue


def expected_from_corpus(corpus: Path) -> dict:
    """Track lifecycles straight out of the raw messages.

    Re-implements the retention rule from the producer's own timestamps rather
    than importing the router's detector, so the two can disagree.
    """
    last: dict[tuple[str, str], float] = {}
    first_seen: dict[tuple[str, str], float] = {}
    retired: set[tuple[str, str]] = set()
    frames = 0
    for ts, topic, payload in read(corpus, "regulated-scene"):
        sid = topic.rsplit("/", 1)[-1]
        stamp = payload.get("timestamp")
        if not stamp:
            continue
        frames += 1
        now = ts
        seen = set()
        for o in (payload.get("objects") or []):
            tid = str(o.get("id") or "")
            if not tid:
                continue
            seen.add(tid)
            key = (sid, tid)
            first_seen.setdefault(key, now)
            last[key] = now
        for key in list(last):
            if key[0] != sid or key[1] in seen or key in retired:
                continue
            if now - last[key] > RETENTION_S:
                retired.add(key)
    return {"tracks": set(first_seen), "retired": retired, "frames": frames}


def main() -> int:
    ap = argparse.ArgumentParser()
    ap.add_argument("corpus", type=Path)
    ap.add_argument("mcap", type=Path)
    ap.add_argument("--scene-config", type=Path, required=True)
    a = ap.parse_args()

    exp = expected_from_corpus(a.corpus)
    raw = json.loads(a.scene_config.read_text())
    cfgs = raw if isinstance(raw, list) else [raw]
    regions = sum(len(c.get("regions") or []) for c in cfgs)
    tripwires = sum(len(c.get("tripwires") or []) for c in cfgs)

    # What the lane actually published.
    creates: Counter = Counter()
    retires: Counter = Counter()
    reasons: dict[str, str] = {}
    basis_seen: Counter = Counter()
    other_lane = 0
    with open(a.mcap, "rb") as f:
        for sch, ch, msg in make_reader(f).iter_messages():
            if sch.name != "spatial::owm::Entity":
                other_lane += 1
                continue
            e = Entity.deserialize(msg.data)
            basis_seen[e.basis.name] += 1
            if e.state == LifecycleState.ACTIVE:
                creates[e.entity_id] += 1
            elif e.state == LifecycleState.RETIRED:
                retires[e.entity_id] += 1
                reasons[e.entity_id] = e.state_reason

    checks: list[tuple[str, bool, str]] = []

    n_tracks, n_retired = len(exp["tracks"]), len(exp["retired"])
    exp_creates = n_tracks + regions
    checks.append((
        f"one create per track lifecycle plus one per declared region "
        f"({n_tracks} + {regions})",
        len(creates) == exp_creates,
        f"expected {exp_creates}, got {len(creates)}"))
    checks.append((
        "no entity created twice",
        all(v == 1 for v in creates.values()),
        f"{sum(1 for v in creates.values() if v > 1)} duplicated"))
    checks.append((
        f"one retire per retired track ({n_retired})",
        len(retires) == n_retired,
        f"expected {n_retired}, got {len(retires)}"))
    checks.append((
        "no entity retired twice",
        all(v == 1 for v in retires.values()),
        f"{sum(1 for v in retires.values() if v > 1)} duplicated"))
    orphans = set(retires) - set(creates)
    checks.append((
        "no orphan retire, every retire follows a create",
        not orphans, f"{len(orphans)} orphan(s)"))
    silent = [k for k, v in reasons.items() if not v.strip()]
    checks.append((
        "no silent retirement, every terminal sample carries a reason",
        not silent, f"{len(silent)} without a reason"))
    checks.append((
        f"declared regions are DECLARED, observed tracks are OBSERVED",
        basis_seen.get("DECLARED", 0) == regions
        and basis_seen.get("OBSERVED", 0) == n_tracks + n_retired,
        f"{dict(basis_seen)}"))
    checks.append((
        f"tripwires get no entity ({tripwires} configured, a line is not an area)",
        basis_seen.get("DECLARED", 0) == regions,
        f"DECLARED={basis_seen.get('DECLARED', 0)}, regions={regions}"))

    total = sum(creates.values()) + sum(retires.values())
    expected_total = exp_creates + n_retired
    checks.append((
        f"lane total matches lifecycle events exactly ({expected_total})",
        total == expected_total, f"got {total}"))

    # Tempo. The comparison is against the producer's own frame count, so the
    # threshold moves with the data rather than being a number typed here.
    ratio = other_lane / max(1, total)
    checks.append((
        f"slow tier: {other_lane} other-lane samples to {total} entity "
        f"samples, 1 in {ratio:.0f}",
        ratio >= 10.0,
        f"ratio {ratio:.1f} is frame-rate-like, expected an order of magnitude"))
    checks.append((
        f"entity count is lifecycle-shaped, not frame-shaped "
        f"({exp['frames']} frames)",
        total < exp["frames"] / 10,
        f"{total} vs {exp['frames']} frames"))

    print(f"corpus {a.corpus}")
    print(f"  raw: {n_tracks} track lifecycles, {n_retired} retired, "
          f"{exp['frames']} frames")
    print(f"  config: {regions} region(s), {tripwires} tripwire(s)\n")
    ok = True
    for label, passed, detail in checks:
        print(f"  {'ok  ' if passed else 'FAIL'} {label}")
        if not passed:
            print(f"       {detail}")
        ok = ok and passed

    print(f"\n{'PASS' if ok else 'FAIL'} — lifecycle parity and tempo")
    return 0 if ok else 1


if __name__ == "__main__":
    sys.exit(main())
