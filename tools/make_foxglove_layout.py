#!/usr/bin/env python3
"""Build a Foxglove layout for a sidecar MCAP.

Foxglove loads these files cleanly now, but Play shows nothing: it has no
built-in visualiser for `spatial::semantics::FusedTrackSet` or
`spatial::events::SpatialEvent`, so a default layout is a blank timeline over a
file that is full of data. A layout fixes that, and shipping one beside the
MCAP is the difference between "here is a recording" and "here is a recording
you can see".

**The layout is generated from the file, not hand-written.** Topic names carry
a scene uuid and a camera id, so a hand-typed path is a typo waiting to happen
and a stale one the moment a scene is recreated. Everything below is read out
of the MCAP: which scene has the most tracks, which track lives longest, which
cameras exist. `gates/layout_check.py` then verifies the result
independently, against the file, without consulting this generator.

Panels, chosen for what reads well on these types rather than for coverage:

* **Raw Messages** on `fused_track` -- the headline. One message is a whole
  scene's tracks with ids, classes, positions, velocities and ages.
* **Raw Messages** on `spatial_event` -- sparse and high-value: 80 samples in
  the whole recording, each a zone entry or exit with its dwell.
* **Plot** of one track's x and y against time -- the thing a reviewer wants to
  see move. Uses a message-path filter on `track_id` so the series follows one
  person through the scene rather than whichever track happens to be first in
  each set.
* **State Transitions** on `spatial_event.type` -- events as a timeline band,
  which is how you spot the entry/exit pattern at a glance.
* **Table** on one camera's `detection2d` -- shows the per-frame detections
  with bboxes and scores.
* **Raw Messages** on `spatial_zone` -- the latched zone definitions, published
  once each at the start; worth a panel because it shows the layout the events
  refer to.

Usage:  tools/make_foxglove_layout.py <file.mcap> --out layout.json
"""
from __future__ import annotations

import argparse
import json
import sys
from collections import Counter, defaultdict
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
if str(ROOT) not in sys.path:
    sys.path.insert(0, str(ROOT))

from mcap.reader import make_reader                            # noqa: E402


def survey(path: Path) -> dict:
    """What is actually in this file: topics by type, and track lifetimes."""
    from spatialdds18.spatial.semantics._semantics import FusedTrackSet

    by_type: dict[str, list[str]] = defaultdict(list)
    counts: Counter = Counter()
    track_samples: dict[str, Counter] = defaultdict(Counter)
    track_first: dict[str, dict[str, int]] = defaultdict(dict)

    with open(path, "rb") as f:
        for sch, ch, msg in make_reader(f).iter_messages():
            if ch.topic not in counts:
                by_type[sch.name].append(ch.topic)
            counts[ch.topic] += 1
            if sch.name == "spatial::semantics::FusedTrackSet":
                s = FusedTrackSet.deserialize(msg.data)
                for tr in s.tracks:
                    track_samples[ch.topic][tr.track_id] += 1
                    track_first[ch.topic].setdefault(tr.track_id,
                                                     counts[ch.topic])
    return {"by_type": dict(by_type), "counts": counts,
            "tracks": track_samples, "track_first": track_first}


def main() -> int:
    ap = argparse.ArgumentParser()
    ap.add_argument("mcap", type=Path)
    ap.add_argument("--out", type=Path, required=True)
    a = ap.parse_args()

    info = survey(a.mcap)
    by_type, counts, tracks = info["by_type"], info["counts"], info["tracks"]

    ft_topics = by_type.get("spatial::semantics::FusedTrackSet", [])
    ev_topics = by_type.get("spatial::events::SpatialEvent", [])
    zn_topics = by_type.get("spatial::events::SpatialZone", [])
    cl_topics = by_type.get("spatial::events::CrossingLine", [])
    d2_topics = by_type.get("spatial::semantics::Detection2DSet", [])
    owm_topics = by_type.get("spatial::owm::Entity", [])
    if not ft_topics:
        print("no FusedTrackSet topic in this file", file=sys.stderr)
        return 1

    # The scene worth opening on: most track samples. With events present,
    # prefer a scene that has them -- an empty event panel is the problem this
    # layout exists to avoid.
    def score(t: str) -> tuple[int, int]:
        scene = t.split("/")[1]
        has_ev = any(scene in e for e in ev_topics)
        return (1 if has_ev else 0, counts[t])

    ft = max(ft_topics, key=score)
    scene = ft.split("/")[1]
    ev = next((t for t in ev_topics if scene in t), None)
    zn = next((t for t in zn_topics if scene in t), None)
    cl = next((t for t in cl_topics if scene in t), None)
    d2 = next((t for t in d2_topics if scene in t), d2_topics[0] if d2_topics else None)
    ow = next((t for t in owm_topics if scene in t), None)

    # The track to plot. Longest-lived is the obvious criterion and it is the
    # wrong one on its own: the longest-lived track in this recording first
    # appears about a third of the way in, so a reviewer pressing Play would
    # watch an empty plot for thirty seconds -- precisely the blank-panel
    # problem this layout exists to solve. Caught by the checker, which
    # reported the filter matching nothing in the opening messages.
    #
    # So: among tracks present in the opening stretch, take the longest-lived.
    # Fall back to the overall longest only if nothing is there at the start.
    first_seen = info["track_first"][ft]
    opening = max(1, int(counts[ft] * 0.02))
    early = {tid: n for tid, n in tracks[ft].items()
             if first_seen.get(tid, 10 ** 9) <= opening}
    if early:
        track_id = max(early, key=lambda k: early[k])
        n_samples = early[track_id]
        why = f"present from message {first_seen[track_id]}"
    else:
        track_id, n_samples = tracks[ft].most_common(1)[0]
        why = (f"NO track in the opening {opening} message(s); "
               f"this one starts at {first_seen.get(track_id)}")

    print(f"scene       {scene}")
    print(f"fused_track {ft}  ({counts[ft]} msgs)")
    print(f"events      {ev}  ({counts.get(ev, 0)} msgs)")
    print(f"zones       {zn}  ({counts.get(zn, 0)} msgs)")
    print(f"crossing    {cl}  ({counts.get(cl, 0)} msgs)")
    print(f"detections  {d2}  ({counts.get(d2, 0)} msgs)")
    print(f"plot track  {track_id}  ({n_samples} samples, {why})")

    sel = f'{{track_id=="{track_id}"}}'
    px = f"{ft}.tracks[:]{sel}.position[0]"
    py = f"{ft}.tracks[:]{sel}.position[1]"

    def plot_path(value: str, label: str) -> dict:
        return {"value": value, "enabled": True, "label": label,
                "timestampMethod": "receiveTime"}

    def raw(topic: str, expansion: str) -> dict:
        return {"topicPath": topic, "diffEnabled": False,
                "diffMethod": "custom", "diffTopicPath": "",
                "showFullMessageForDiff": False, "expansion": expansion}

    # Panels are built only for topics this file actually has. The first
    # version defaulted an absent topic to the fused-track one, which would
    # have put a panel captioned "events" in front of a reviewer showing
    # tracks -- worse than an empty panel, because it is quietly wrong. Corpus
    # v1 predates the zone configuration and has no events at all, so this is
    # a real case and not a defensive hypothetical.
    panels: list[tuple[str, dict]] = [
        ("RawMessages!tracks", raw(ft, "none")),
        ("Plot!position", {
            "paths": [plot_path(px, "x (east, m)"),
                      plot_path(py, "y (north, m)")],
            "showXAxisLabels": True, "showYAxisLabels": True,
            "showLegend": True, "legendDisplay": "floating",
            "showPlotValuesInLegend": True, "isSynced": True,
            "xAxisVal": "timestamp", "sidebarDimension": 240,
        }),
    ]
    if ev:
        panels.append(("RawMessages!events", raw(ev, "all")))
        panels.append(("StateTransitions!eventtype", {
            "paths": [
                {"value": f"{ev}.type", "timestampMethod": "receiveTime",
                 "label": "event type"},
                {"value": f"{ev}.zone_occupancy",
                 "timestampMethod": "receiveTime", "label": "occupancy"},
            ],
            "isSynced": True,
        }))
    if zn:
        panels.append(("RawMessages!zones", raw(zn, "all")))
    if cl:
        panels.append(("RawMessages!crossing", raw(cl, "all")))
    if ow:
        # The world-model lane. Sparse by design: one sample per lifecycle
        # change, so a reviewer scrubbing the timeline sees entities appear
        # and retire rather than a wall of per-frame updates.
        panels.append(("RawMessages!entities", raw(ow, "all")))
        panels.append(("StateTransitions!entitystate", {
            "paths": [
                {"value": f"{ow}.state", "timestampMethod": "receiveTime",
                 "label": "lifecycle state"},
                {"value": f"{ow}.basis", "timestampMethod": "receiveTime",
                 "label": "basis"},
            ],
            "isSynced": True,
        }))
    if d2:
        panels.append(("Table!dets", {"topicPath": f"{d2}.dets"}))

    config = dict(panels)

    def fold(ids: list[str], direction: str):
        """Nest panel ids into a mosaic tree, splitting evenly."""
        if len(ids) == 1:
            return ids[0]
        mid = (len(ids) + 1) // 2
        other = "column" if direction == "row" else "row"
        return {
            "direction": direction,
            "first": fold(ids[:mid], other),
            "second": fold(ids[mid:], other),
            "splitPercentage": round(100 * mid / len(ids), 1),
        }

    # Reading order: the two message panels on the left, the derived views on
    # the right, so the eye lands on raw typed samples first -- that is the
    # thing being evidenced.
    left = [i for i, _ in panels if i.startswith("RawMessages!")]
    right = [i for i, _ in panels if not i.startswith("RawMessages!")]
    if right:
        layout = {"direction": "row", "first": fold(left, "column"),
                  "second": fold(right, "column"), "splitPercentage": 45}
    else:
        layout = fold(left, "column")

    doc = {
        "configById": config,
        "globalVariables": {"scene": scene, "plotted_track": track_id},
        "userNodes": {},
        "playbackConfig": {"speed": 1},
        "layout": layout,
    }
    a.out.write_text(json.dumps(doc, indent=2) + "\n")
    print(f"\nwrote {a.out}  ({len(json.dumps(doc))} bytes, "
          f"{len(config)} panels)")
    return 0


if __name__ == "__main__":
    sys.exit(main())
