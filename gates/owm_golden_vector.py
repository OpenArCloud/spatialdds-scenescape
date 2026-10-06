#!/usr/bin/env python3
"""One entity's whole lifecycle, hand-computed, checked field by field.

The lifecycle gate counts. This one reads. It takes a single track out of the
reference corpus, states what its two entity samples must contain, and
compares every field. The expected values below were read off the raw
SceneScape messages and written here as literals, so they do not move when the
implementation does. That is the difference between a golden vector and a
regression snapshot: a snapshot records what the code did, a vector records
what the data says it should do.

The track was chosen for being short and complete: eighteen frames, appearing
and retiring well inside the recorded window, so its whole lifecycle is
present rather than truncated at either end.

Raw facts, from `regulated-scene.jsonl` in the v2 corpus:

    track id          cd7acee2-d96e-48ea-976e-211e3bd4fb98
    scene             302cf49a-97ec-402d-a324-c5077b280b7b  (Queuing)
    frames present    18
    first seen        2026-10-03T05:09:47.277Z
    category          person
    reid_state        pending_collection
    first translation [-0.06595612617551357, 6.0519747189433595, ~0]
    retire observed   2026-10-03T05:09:54.432Z, 5.052 s after the last sight

The retirement frame is identified by the **producer's own timestamps**, not
by the recorder's wall clock in the corpus line prefix. The two differ by
about ten milliseconds here, enough to select a different frame: the recorder
clock picks 05:09:54.280Z and a 5.042 s gap, the producer clock picks
05:09:54.432Z and 5.052 s. The router reads the payload's timestamp, which is
the right one, since the claim being made is about when SceneScape saw the
track leave and not about when our recorder wrote a line. An earlier draft of
this gate derived its expected values from the recorder clock and reported two
false failures against correct output.

Usage:  gates/owm_golden_vector.py <replay.mcap>
"""
from __future__ import annotations

import argparse
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
if str(ROOT) not in sys.path:
    sys.path.insert(0, str(ROOT))

from mcap.reader import make_reader                            # noqa: E402

from spatialdds18.spatial.owm._owm import (                    # noqa: E402
    Entity, Basis, LifecycleState, ModelLayer)

SCENE = "302cf49a-97ec-402d-a324-c5077b280b7b"
TRACK = "cd7acee2-d96e-48ea-976e-211e3bd4fb98"
ENTITY_ID = f"scenescape/{SCENE}/track/{TRACK}"

# Whole seconds and nanoseconds of 2026-10-03T05:09:47.277Z and ...54.432Z,
# exactly as the producer stamped them. Exact is the operative word: these
# are the values a correct parser produces, and the stamp-fidelity gate exists
# because an earlier parser produced 276999950 for the first of them.
CREATE_SEC, CREATE_NSEC = 1791004187, 277000000
RETIRE_SEC, RETIRE_NSEC = 1791004194, 432000000

CREATE_POS = [-0.06595612617551357, 6.0519747189433595]
COCO_PERSON = "http://cocodataset.org/#explore?cat=person"


def props(e: Entity) -> dict[str, str]:
    return {kv.key: kv.value for kv in e.properties}


def main() -> int:
    ap = argparse.ArgumentParser()
    ap.add_argument("mcap", type=Path)
    a = ap.parse_args()

    samples: list[Entity] = []
    with open(a.mcap, "rb") as f:
        for sch, ch, msg in make_reader(f).iter_messages():
            if sch.name != "spatial::owm::Entity":
                continue
            e = Entity.deserialize(msg.data)
            if e.entity_id == ENTITY_ID:
                samples.append(e)

    print(f"mcap {a.mcap}")
    print(f"  entity {ENTITY_ID}")
    print(f"  samples found: {len(samples)}\n")

    checks: list[tuple[str, bool, str]] = []
    checks.append(("exactly two samples, one create and one retire",
                   len(samples) == 2, f"got {len(samples)}"))
    if len(samples) != 2:
        print(f"  FAIL only {len(samples)} sample(s); cannot continue")
        return 1

    create, retire = samples[0], samples[1]
    cp, rp = props(create), props(retire)

    def check(label, got, want):
        checks.append((f"{label}: {want!r}", got == want, f"got {got!r}"))

    # --- the create sample
    check("create.entity_id", create.entity_id, ENTITY_ID)
    check("create.basis", create.basis, Basis.OBSERVED)
    check("create.state", create.state, LifecycleState.ACTIVE)
    check("create.state_reason is empty while ACTIVE", create.state_reason, "")
    check("create.layer", create.layer, ModelLayer.FAST)
    check("create.frame_ref.fqn", create.frame_ref.fqn,
          "scenescape/scene/Queuing")
    check("create.type_uris", list(create.type_uris), [COCO_PERSON])
    check("create.has_pose", create.has_pose, True)
    checks.append((
        f"create.pose.t matches the producer's first translation "
        f"{CREATE_POS}",
        abs(create.pose.t[0] - CREATE_POS[0]) < 1e-12
        and abs(create.pose.t[1] - CREATE_POS[1]) < 1e-12,
        f"got {list(create.pose.t)[:2]}"))
    check("create.has_extent is false, a track has no stated box",
          create.has_extent, False)
    check("create.stamp.sec", create.stamp.sec, CREATE_SEC)
    check("create.stamp.nanosec", create.stamp.nanosec, CREATE_NSEC)
    check("create.source_id", create.source_id,
          f"scenescape/controller/{SCENE}")
    check("create property scenescape.track_id", cp.get("scenescape.track_id"),
          TRACK)
    check("create property scenescape.reid_state",
          cp.get("scenescape.reid_state"), "pending_collection")
    check("create property schema.stability", cp.get("schema.stability"),
          "provisional")
    check("create property schema.module", cp.get("schema.module"),
          "spatial.owm/0.1")

    # --- the retire sample
    check("retire.entity_id matches the create", retire.entity_id, ENTITY_ID)
    check("retire.state", retire.state, LifecycleState.RETIRED)
    check("retire.basis is still OBSERVED", retire.basis, Basis.OBSERVED)
    checks.append((
        "retire.state_reason names the retention rule and the gap",
        retire.state_reason.startswith("absent from regulated/scene for 5.1s")
        and "retention 5.0s" in retire.state_reason,
        f"got {retire.state_reason!r}"))
    checks.append((
        "retire.state_reason carries the last reid_state",
        "pending_collection" in retire.state_reason,
        f"got {retire.state_reason!r}"))
    check("retire.has_pose is false, the thing is gone", retire.has_pose, False)
    check("retire.stamp.sec", retire.stamp.sec, RETIRE_SEC)
    check("retire.stamp.nanosec", retire.stamp.nanosec, RETIRE_NSEC)
    checks.append((
        "retire is stamped after the create",
        (retire.stamp.sec, retire.stamp.nanosec)
        > (create.stamp.sec, create.stamp.nanosec),
        "retire is not after create"))

    ok = True
    for label, passed, detail in checks:
        print(f"  {'ok  ' if passed else 'FAIL'} {label}")
        if not passed:
            print(f"       {detail}")
        ok = ok and passed

    print(f"\n{'PASS' if ok else 'FAIL'} — golden vector, {len(checks)} field "
          f"checks against hand-read values")
    return 0 if ok else 1


if __name__ == "__main__":
    sys.exit(main())
