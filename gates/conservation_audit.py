#!/usr/bin/env python3
"""Conservation audit: reconcile the membrane by counting.

  python3 gates/conservation_audit.py <corpus-dir> <output.mcap>

**Independent of the translator by construction.** This script imports neither
`sidecar.mapping` nor the generated bindings. It reads the recorded MQTT corpus
on one side and the MCAP on the other, counts both, and states the mapping
between the counts. If it agreed with the translator by sharing code with it,
it would be a self-report rather than an audit.

Every input topic must land in exactly one of three buckets: **translated**
(with its count and the expected output relation), **deliberately dropped**
(the named list, with the reason), or **unexpected**, which is a
stop-and-report, not a rounding note.
"""
from __future__ import annotations

import argparse
import json
import sys
from collections import Counter
from pathlib import Path

from mcap.reader import make_reader

# Expected relation per translated input, as a (output-type, relation) pair.
# "1:1" means one output sample per input message; "once" means a fixed number
# regardless of input volume.
EXPECTED = {
    "regulated-scene": ("spatial.semantics.FusedTrackSet", "1:1"),
    "data-camera": ("spatial.semantics.Detection2DSet", "1:1"),
    "event": ("spatial.events.SpatialEvent", "1:1"),
    # data/region is consumed for its dwell measurements, which ride on the
    # events rather than producing samples of their own. Zero output is the
    # correct answer, and saying so is the point of listing it.
    "data-region": (None, "consumed-for-dwell"),
}


def corpus_counts(corpus: Path) -> dict[str, int]:
    out: dict[str, int] = {}
    for p in sorted(corpus.glob("*.jsonl")):
        n = sum(1 for line in p.read_text().splitlines() if line.count("|") >= 2)
        out[p.stem] = n
    return out


def mcap_counts(path: Path) -> tuple[dict[str, int], dict[str, int], dict]:
    by_topic: Counter = Counter()
    by_type: Counter = Counter()
    meta: dict = {}
    with open(path, "rb") as f:
        r = make_reader(f)
        s = r.get_summary()
        meta["schemas"] = {sc.name: sc.encoding for sc in s.schemas.values()}
        meta["encodings"] = sorted({c.message_encoding for c in s.channels.values()})
        for sch, ch, _msg in r.iter_messages():
            by_topic[ch.topic] += 1
            # Channel metadata, not sch.name: the schema name is the
            # IDL-qualified `spatial::events::X` form that omgidl
            # readers need, while this table is keyed on cyclonedds'
            # dotted spelling. Reading the metadata keeps the audit
            # independent of that choice.
            by_type[ch.metadata.get("spatialdds_type") or sch.name] += 1
    return dict(by_topic), dict(by_type), meta


def main() -> int:
    ap = argparse.ArgumentParser()
    ap.add_argument("corpus", type=Path)
    ap.add_argument("mcap", type=Path)
    a = ap.parse_args()

    cin = corpus_counts(a.corpus)
    ctopic, ctype, meta = mcap_counts(a.mcap)

    side_path = a.mcap.with_suffix(".summary.json")
    dropped = {}
    if side_path.is_file():
        dropped = json.loads(side_path.read_text()).get("dropped", {})

    print(f"corpus {a.corpus}")
    print(f"mcap   {a.mcap}  ({a.mcap.stat().st_size} bytes)")
    print(f"       encodings={meta['encodings']} "
          f"schemas={sorted(set(meta['schemas'].values()))}\n")

    print("== input topics, every one accounted for")
    print(f"  {'corpus file':22} {'in':>7}  {'bucket':<22} {'out':>7}  relation")
    problems: list[str] = []
    accounted = 0
    for name in sorted(cin):
        n = cin[name]
        if name in EXPECTED:
            typename, rel = EXPECTED[name]
            out = ctype.get(typename, 0) if typename else 0
            print(f"  {name:22} {n:7}  {'translated':<22} {out:7}  {rel}")
            accounted += 1
            if rel == "1:1" and n != out:
                problems.append(
                    f"{name}: {n} in but {out} out, expected 1:1")
            if rel == "consumed-for-dwell" and out != 0:
                problems.append(f"{name}: expected no direct output, got {out}")
        elif name in dropped:
            print(f"  {name:22} {n:7}  {'dropped (declared)':<22} {0:7}  "
                  f"{dropped[name][:46]}")
            accounted += 1
        else:
            print(f"  {name:22} {n:7}  {'UNEXPECTED':<22} {'?':>7}  "
                  f"stop-and-report")
            problems.append(f"{name}: not in the translated or dropped lists")

    print(f"\n  {accounted}/{len(cin)} input topics accounted for")

    print("\n== output, by type")
    for k in sorted(ctype):
        print(f"  {ctype[k]:7}  {k}")

    print("\n== latched definitions: published once each, not per sample")
    once = {k: v for k, v in ctype.items()
            if k in ("spatial.events.SpatialZone", "spatial.events.CrossingLine",
                     "spatial.core.GeoAnchor", "spatial.core.FrameTransform")}
    if once:
        for k, v in sorted(once.items()):
            print(f"  {v:7}  {k}")
    else:
        print("   none present. Not a failure, and not necessarily a missing")
        print("   config: a zone, line, anchor or transform is published only")
        print("   when the scene configuration declares one. Corpus v1 replays")
        print("   against a config that has cameras but no regions or")
        print("   tripwires, because that is what the deployment was when v1")
        print("   was recorded, and output_lla was off for both corpora so")
        print("   neither carries an anchor. See samples/README.md.")

    if problems:
        print(f"\n== {len(problems)} RECONCILIATION FAILURE(S), findings, not notes")
        for p in problems:
            print(f"  - {p}")
        return 1
    print("\n== conservation holds: every input accounted for, every 1:1 exact")
    return 0


if __name__ == "__main__":
    sys.exit(main())
