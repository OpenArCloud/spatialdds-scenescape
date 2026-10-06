#!/usr/bin/env python3
"""Replay a corpus through the translator and record the typed output to MCAP.

  python3 tools/replay_to_mcap.py <corpus-dir> [--out FILE] [--scene-config FILE]

This is the production replay: the same mapping functions the live membrane
uses, driven from recorded MQTT instead of a live broker, with every emitted
sample written to MCAP as CDR under an omgidl schema.

Corpus in, MCAP out. Together they make every claim about the translation
re-checkable offline, by anyone, forever, which is the point of the MCAP recording step and the
reason the conservation audit can be an independent script rather than a
self-report.

Deliberately dropped inputs are named here rather than silently skipped, so the
conservation audit can account for every topic.
"""
from __future__ import annotations

import argparse
import json
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
sys.path.insert(0, str(ROOT))

from sidecar import mapping, route, topics                              # noqa: E402
from sidecar.mcap_out import McapOut                             # noqa: E402

# Inputs translated, and the corpus file each comes from.
TRANSLATED = ("regulated-scene", "data-camera", "data-region", "event")

# Inputs deliberately not translated, with the reason. The brief's named list.
DROPPED = {
    "image-camera": "base64 JPEG frames; not northbound semantics (census §7 MISMATCH)",
    "data-scene": "per-thing_type duplicate of regulated/scene; the regulated "
                  "superset is the contract (census §1)",
    "external": "scene-composition input; expressible as guidance, not a type "
                "(census §8, EXPRESSIBLE)",
    "data-sensor": "scalar sensor readings; refused with a mapping (§2.15)",
    "analytics-clusters": "analytics aggregates; refused with a mapping (§2.15)",
    "autocalib-cam-pose": "camera pose; declared but unpublished at this pin "
                          "(census Revision 3)",
    "sys-child-status": "child-scene health; composition guidance (§2.17)",
}


def read(corpus: Path, name: str):
    p = corpus / f"{name}.jsonl"
    if not p.is_file():
        return
    for line in p.read_text().splitlines():
        parts = line.split("|", 2)
        if len(parts) != 3:
            continue
        try:
            yield float(parts[0]), parts[1], json.loads(parts[2])
        except (ValueError, json.JSONDecodeError):
            continue


def content_digest(path: Path) -> tuple[str, int]:
    """Reproducible fingerprint of an MCAP's content.

    Deliberately identical in construction to `gates/determinism.py:digest` --
    topic, schema name, log_time, body, in file order. Kept as two small
    functions rather than one shared import so the determinism check stays
    independent of the thing it checks.
    """
    import hashlib

    from mcap.reader import make_reader

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
    ap.add_argument("--out", type=Path, default=None)
    ap.add_argument("--scene-config", type=Path, default=None,
                    help="scene config JSON, for bullet 2's georeference branch")
    ap.add_argument("--idl", type=Path,
                    default=ROOT / "idl" / "v1.8")
    ap.add_argument("--label", default="replay")
    a = ap.parse_args()

    out = a.out or (a.corpus / f"{a.label}.mcap")
    stats: dict[str, int] = {}

    scene_cfgs: dict[str, dict] = {}
    if a.scene_config and a.scene_config.is_file():
        cfg = json.loads(a.scene_config.read_text())
        for c in (cfg if isinstance(cfg, list) else [cfg]):
            if c.get("uid"):
                scene_cfgs[c["uid"]] = c

    print(f"corpus {a.corpus}")
    print(f"mcap   {out}")
    print(f"idl    {a.idl}  (omgidl schemas, CDR messages)\n")

    # REPLAY-SCOPED CONVENTION. Latched definitions carry no timestamp of
    # their own in the scene config, so without this they were written at the
    # writer's wall clock -- which made the output non-deterministic, and was
    # caught by the determinism gate rather than argued away by widening its exclusion list.
    # The recording's first stamp is the honest answer here: the zones, the
    # line and the georeference were all in force throughout the window, so
    # the window's start is when the file should show them.
    #
    # **This applies to REPLAY ONLY.** In live operation a latched definition
    # carries publication time as normal. Back-dating is correct for a
    # recording being re-played and would be a false claim about a live
    # stream, so the rule is stated with its boundary and the live membrane
    # must not adopt it. See the adapter-mapping conventions table in the
    # census.
    corpus_start_iso: str | None = None
    corpus_start_ns: int | None = None
    for fname in TRANSLATED:
        for _, _, payload in read(a.corpus, fname):
            ts = payload.get("timestamp")
            if not ts:
                continue
            st = mapping.parse_iso(ts)
            ns = st.sec * 1_000_000_000 + st.nanosec
            if ns and (corpus_start_ns is None or ns < corpus_start_ns):
                corpus_start_ns, corpus_start_iso = ns, ts
    stats["corpus_start_ns"] = corpus_start_ns or 0

    # Replay drives the SAME router the live bridge drives, over the same
    # messages in **arrival order**. It used to walk topic by topic with its
    # own inline logic, and that cost three real defects which only surfaced
    # once a second implementation existed to disagree with it
    # (`an earlier equivalence gate (superseded)`):
    #
    #   1. `data/camera` has no scene in its topic, and the old code picked
    #      `sorted(scenes)[0]` for every camera. That put Retail's `camera1`
    #      and `camera2` (`sample_data/Retail.json:10-11`) into Queuing's
    #      frame -- 4,794 of 9,554 detections in v2, in a frame they do not
    #      belong to, and a georeferenced one once branch A is on.
    #   2. Dwell was harvested up front, so every `SpatialEvent` carried the
    #      dwell measured at the END of the recording. Dwell grows: all 15
    #      keys in v2 change over the window, one from 0.000 s to 5.696 s. So
    #      events carried values from after they happened.
    #   3. One global sequence counter served both scenes while they alternate
    #      message by message, so each scene's `FusedTrackSet` sequence
    #      advanced by two.
    #
    # Routing per message in time order fixes all three, and means the thing
    # validated here is literally the thing the bridge publishes.
    router = route.Router(scene_cfgs, retention_s=5.0)

    msgs: list[tuple[float, str, dict]] = []
    for fname in TRANSLATED:
        for ts, topic, payload in read(a.corpus, fname):
            msgs.append((ts, topic, payload))
    msgs.sort(key=lambda m: m[0])

    with McapOut(out, a.idl, a.label) as m:
        # Latched definitions, once per scene, stamped from the corpus start
        # per the replay-scoped convention above.
        scenes_seen: set[str] = set()
        for _, topic, _ in read(a.corpus, "regulated-scene"):
            scenes_seen.add(topic.rsplit("/", 1)[-1])
        for sid in sorted(scenes_seen):
            geo = mapping.geo_for_scene(scene_cfgs.get(sid, {"name": sid}), sid,
                                        corpus_start_iso)
            stats[f"branch:{sid[:8]}"] = 1 if geo["branch"].startswith("A") else 0
            for dds_topic, sample, ns in router.definitions(
                    sid, corpus_start_iso, corpus_start_ns or 0):
                m.write(dds_topic, sample, ns)
            # Declared region entities, latched alongside the zones they
            # point at, so a reader gets the entity and its footprint in the
            # same breath.
            for dds_topic, sample, ns in router.owm_definitions(
                    sid, corpus_start_iso, corpus_start_ns or 0):
                m.write(dds_topic, sample, ns)

        # The live lanes, in arrival order.
        for _, topic, payload in msgs:
            for dds_topic, sample, ns in router.route(topic, payload):
                m.write(dds_topic, sample, ns)

        counts = dict(m.counts)

    retirements = router.retirements
    for k, v in sorted(router.counts.items()):
        stats[f"in:{k}"] = v
    stats["dwell_measurements"] = len(router.dwell)
    stats["owm:entities_created"] = router.owm_created
    stats["owm:entities_retired"] = router.owm_retired
    stats["dwell_misses"] = router.dwell_misses
    if router.unattributed:
        stats["cameras_unattributed"] = sum(router.unattributed.values())
        print("== WARNING: cameras with no scene in any config, dropped")
        for cam, n in sorted(router.unattributed.items()):
            print(f"   {cam}  {n} messages")
    if router.unparsed:
        print(f"== WARNING: {len(router.unparsed)} unparsed event topics")

    stats["retirements_detected"] = len(retirements)

    print("== output samples by topic")
    for k in sorted(counts):
        print(f"  {counts[k]:7}  {k}")
    # CONTENT hash, and the distinction matters. The MCAP file's own bytes are
    # NOT reproducible: every message carries the writer's wall-clock
    # publish_time, so two runs over identical input give different files --
    # measured, 1,224,543 vs 1,224,617 bytes on consecutive runs. A sha256 of
    # the file therefore verifies a transfer and nothing more, and quoting one
    # as evidence of correct translation would be a category error.
    #
    # This is the reproducible fingerprint: topic + schema + log_time + body,
    # in file order, excluding publish_time and writer metadata. It is the
    # same digest the determinism gate compares between two runs, so the number printed here
    # is the one that should travel with the evidence.
    content, nmsg = content_digest(out)
    print(f"\n== mcap {out.stat().st_size} bytes  ({nmsg} messages)")
    print(f"   content sha256 {content}")
    print("   (file bytes are not reproducible -- publish_time is the writer's")
    print("    clock. This digest is, and is what the determinism gate compares.)")
    print("== stats")
    for k in sorted(stats):
        print(f"  {k:28} {stats[k]}")

    side = {"counts": counts, "stats": stats, "dropped": DROPPED,
            "retirements": retirements,
            "content_sha256": content, "messages": nmsg}
    (out.with_suffix(".summary.json")).write_text(json.dumps(side, indent=1))
    print(f"\n== summary {out.with_suffix('.summary.json')}")
    return 0


def _ns(stamp) -> int | None:
    if stamp is None or stamp.sec == 0:
        return None
    return stamp.sec * 1_000_000_000 + stamp.nanosec


def _scene_of(scenes: set[str]) -> str:
    return sorted(scenes)[0] if scenes else "unknown"


if __name__ == "__main__":
    sys.exit(main())
