#!/usr/bin/env python3
"""Regression gate for the four defects the live/replay split exposed.

History, because it explains the shape of this file. The replay path and the
live path were written separately, and `an earlier equivalence gate (superseded)` existed briefly to
assert they produced byte-identical samples. It immediately failed, and every
cause was a defect in replay rather than a divergence:

  1. `data/camera` carries no scene in its topic, and replay attributed every
     camera to `sorted(scenes)[0]`. Retail's `camera1`/`camera2` were therefore
     published in Queuing's frame -- 4,794 of 9,554 detections in corpus v2.
  2. `SpatialEvent.measured_dwell_sec` was joined from the `data/region`
     stream's running dwell, which starts at 0.0 and grows. Events received the
     value measured at the END of the recording.
  3. One global sequence counter served two scenes that alternate message by
     message, so each scene's `FusedTrackSet` sequence advanced by two.
  4. `entered` holds bare objects but `exited` holds `{"dwell", "object"}`
     wrappers. Reading an exit's wrapper as an object lost its dwell, position,
     track id, class and confidence -- 40 of 80 events in v2.

Replay now drives `sidecar.route.Router`, so a router-versus-replay comparison
has become tautological. This gate replaces it and asserts the four behaviours
directly against a recorded corpus, so they cannot regress quietly.

Usage:  gates/route_regress.py <corpus-dir> --scene-config FILE
"""
from __future__ import annotations

import argparse
import json
import sys
from collections import defaultdict
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
sys.path.insert(0, str(ROOT))

from sidecar import route                                      # noqa: E402
from spatialdds18.spatial.events.enums.event_type_enum._events import (  # noqa: E402
    EventType)

TRANSLATED = ("regulated-scene", "data-camera", "data-region", "event")


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


def main() -> int:
    ap = argparse.ArgumentParser()
    ap.add_argument("corpus", type=Path)
    ap.add_argument("--scene-config", type=Path, required=True)
    a = ap.parse_args()

    raw = json.loads(a.scene_config.read_text())
    cfgs = {c["uid"]: c for c in (raw if isinstance(raw, list) else [raw])
            if c.get("uid")}
    expect_cam = {}
    for sid, c in cfgs.items():
        for cam in (c.get("cameras") or []):
            expect_cam[cam["name"] if isinstance(cam, dict) else cam] = sid

    msgs = [m for n in TRANSLATED for m in read(a.corpus, n)]
    msgs.sort(key=lambda m: m[0])
    print(f"corpus {a.corpus}\n  {len(msgs)} messages, arrival order")
    print(f"  camera map from config: "
          f"{ {k: v[:8] for k, v in expect_cam.items()} }\n")

    r = route.Router(cfgs)
    det_scene: dict[str, set[str]] = defaultdict(set)
    seqs: dict[str, list[int]] = defaultdict(list)
    exits: list = []
    entries: list = []

    for _, topic, payload in msgs:
        for dds_topic, sample, _ in r.route(topic, payload):
            parts = dds_topic.split("/")
            if "detection2d" in dds_topic:
                det_scene[parts[2]].add(parts[1])
            elif "fused_track" in dds_topic:
                seqs[parts[1]].append(sample.seq)
            elif "spatial_event" in dds_topic:
                if sample.type == EventType.ZONE_EXIT:
                    exits.append(sample)
                elif sample.type == EventType.ZONE_ENTRY:
                    entries.append(sample)

    checks: list[tuple[str, bool]] = []

    # 1. every camera's detections land in the scene that declares it
    for cam, want in expect_cam.items():
        got = det_scene.get(cam, set())
        checks.append((f"{cam} -> scene {want[:8]} (got {[g[:8] for g in got]})",
                       got == {want}))
    checks.append((f"no camera dropped as unattributable "
                   f"({sum(r.unattributed.values())})", not r.unattributed))

    # 2. per-scene sequence numbers are contiguous from 1
    for sid, s in seqs.items():
        checks.append((f"scene {sid[:8]} seq is 1..{len(s)} contiguous",
                       s == list(range(1, len(s) + 1))))

    # 3. exits carry dwell AND their object's identity
    if exits:
        checks += [
            (f"all {len(exits)} ZONE_EXIT carry measured_dwell_sec",
             all(e.has_measured_dwell_sec for e in exits)),
            ("ZONE_EXIT dwell values are not all zero",
             any(e.measured_dwell_sec > 0.0 for e in exits)),
            ("all ZONE_EXIT carry a trigger_track_id",
             all(e.has_trigger_track_id and e.trigger_track_id for e in exits)),
            ("all ZONE_EXIT carry a position",
             all(e.has_position for e in exits)),
            ("all ZONE_EXIT carry a class",
             all(e.trigger_class_id for e in exits)),
            ("all ZONE_EXIT carry a nonzero confidence",
             all(e.confidence > 0.0 for e in exits)),
        ]
    else:
        checks.append(("ZONE_EXIT events present in the corpus", False))

    # 4. entries have no dwell to carry
    if entries:
        checks.append((f"no ZONE_ENTRY claims a dwell ({len(entries)} checked)",
                       not any(e.has_measured_dwell_sec for e in entries)))

    ok = True
    for label, passed in checks:
        print(f"  {'ok  ' if passed else 'FAIL'} {label}")
        ok = ok and passed
    print(f"\n{'PASS' if ok else 'FAIL'}, four defects, "
          f"{'all still fixed' if ok else 'a regression'}")
    return 0 if ok else 1


if __name__ == "__main__":
    sys.exit(main())
