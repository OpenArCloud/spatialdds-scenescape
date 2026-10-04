#!/usr/bin/env python3
"""Typed-topic watcher: reads the sidecar back off DDS and prints one line per sample.

Subscribes to the sidecar's SpatialDDS 1.8 topics with the generated types and
prints one line per sample. Deliberately a *typed* reader, not a wire sniffer:
the point of the capture is that the traffic is typed, so the watcher has to
decode through the IDL to show anything at all. A sample it cannot deserialize
does not print, which is the property that makes the pane evidence.

  python3 sidecar/watch.py --scene <scene-id> [--domain N] [--cameras a,b]

Runs on its own DDS domain by default (ratified): the default VPC also hosts
the ISMAR demo stack, and domain separation means the sidecar cannot be
discovered by it even accidentally.
"""
from __future__ import annotations

import argparse
import sys
import time
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent.parent))

from cyclonedds.domain import DomainParticipant          # noqa: E402
from cyclonedds.sub import Subscriber, DataReader, InvalidSample  # noqa: E402
from cyclonedds.topic import Topic                        # noqa: E402
from cyclonedds.core import Qos, Policy                   # noqa: E402
from cyclonedds.util import duration                      # noqa: E402

from sidecar import topics                                # noqa: E402
from spatialdds18.spatial.core._core import FrameTransform, GeoAnchor      # noqa: E402
from spatialdds18.spatial.events._events import (                           # noqa: E402
    SpatialZone, CrossingLine, SpatialEvent)
from spatialdds18.spatial.semantics._semantics import (                     # noqa: E402
    Detection2DSet, FusedTrackSet)
from spatialdds18.spatial.disco._discovery import Announce                  # noqa: E402

DEFAULT_DOMAIN = 7   # not 0, not 1: the demo stack uses those
DISPOSE_LINES = 3    # per topic, before coalescing -- see the finale note

TYPES = {
    "announce": Announce,
    "frame_transform": FrameTransform,
    "geo_anchor": GeoAnchor,
    "spatial_zone": SpatialZone,
    "crossing_line": CrossingLine,
    "fused_track": FusedTrackSet,
    "spatial_event": SpatialEvent,
}

# Latched definitions must be readable by a late joiner, the watcher starts
# after the sidecar, so without TRANSIENT_LOCAL the one-shot GeoAnchor and the
# zone layout would simply never appear and the pane would look broken.
LATCHED = {"announce", "frame_transform", "geo_anchor", "spatial_zone", "crossing_line"}
QOS_LATCHED = Qos(Policy.Reliability.Reliable(duration(seconds=1)),
                  Policy.Durability.TransientLocal,
                  Policy.History.KeepLast(1))
QOS_EVENT = Qos(Policy.Reliability.Reliable(duration(seconds=1)),
                Policy.Durability.Volatile,
                Policy.History.KeepLast(16))


def _summary(label: str, s) -> str:
    """One line per sample: enough to see it is real, short enough to scroll."""
    if label == "fused_track":
        n = len(s.tracks)
        first = f" first={s.tracks[0].track_id}" if n else ""
        return f"{n} track(s) frame={s.frame_ref.fqn} seq={s.seq}{first}"
    if label.startswith("detection2d"):
        n = len(s.dets)
        classes = sorted({d.class_id for d in s.dets if d.class_id})
        top = max((d.score for d in s.dets), default=0.0)
        return (f"{n} det(s) cam={s.camera_id} "
                f"class={','.join(classes) or '-'} best={top:.2f}")
    if label == "spatial_zone":
        g = f"polygon[{len(s.polygon)}]" if s.has_polygon else "bounds-only"
        return f"{s.zone_id} kind={s.kind} {g}"
    if label == "crossing_line":
        band = f" z[{s.z_min},{s.z_max}]" if s.has_vertical_band else ""
        return f"{s.line_id} path[{len(s.path)}]{band}"
    if label == "spatial_event":
        extra = []
        if s.has_crossing:
            extra.append(f"crossing={s.crossing_direction}")
        if s.has_crossing_line_id:
            extra.append(f"line={s.crossing_line_id}")
        if s.has_measured_dwell_sec:
            extra.append(f"dwell={s.measured_dwell_sec:.1f}s")
        return f"{s.type} zone={s.zone_id if s.has_zone_id else '-'} " + " ".join(extra)
    if label == "frame_transform":
        return (f"{s.child_ref.fqn} -> {s.parent_ref.fqn}  "
                f"t={[round(v, 3) for v in s.T_parent_child.t]}")
    if label == "geo_anchor":
        g = s.geopose
        return (f"{s.anchor_id} lat={g.lat_deg:.7f} lon={g.lon_deg:.7f} "
                f"alt={g.alt_m:.2f} method={s.method}")
    if label == "announce":
        return f"{s.service_id} kind={s.kind} topics={len(s.topics)}"
    return repr(s)[:110]


def main() -> int:
    ap = argparse.ArgumentParser(description=__doc__)
    ap.add_argument("--scene", required=True)
    ap.add_argument("--domain", type=int, default=DEFAULT_DOMAIN)
    ap.add_argument("--cameras", default="")
    ap.add_argument("--seconds", type=float, default=0, help="0 = run until Ctrl-C")
    a = ap.parse_args()

    cams = [c for c in a.cameras.split(",") if c]
    names = topics.all_for_scene(a.scene, cams)

    dp = DomainParticipant(a.domain)
    sub = Subscriber(dp)
    readers = {}
    for label, name in names.items():
        tp = Detection2DSet if label.startswith("detection2d") else TYPES[label]
        qos = QOS_LATCHED if label in LATCHED else QOS_EVENT
        readers[label] = DataReader(sub, Topic(dp, name, tp), qos=qos)

    print(f"watching domain {a.domain}, scene {a.scene!r}")
    for label, name in sorted(names.items()):
        print(f"  {label:22} {name}")
    print("-" * 78, flush=True)

    counts: dict[str, int] = {}
    disposes: dict[str, int] = {}
    deadline = time.time() + a.seconds if a.seconds else None
    try:
        while deadline is None or time.time() < deadline:
            got = False
            for label, r in readers.items():
                for s in r.take(N=10):
                    got = True
                    # A dispose / unregister arrives as InvalidSample: key
                    # fields only, no payload. Render it rather than skip it, # track retirement under the §2.14 convention (terminal
                    # sample, then dispose) is part of what the translator
                    # does, so a disposal on this pane is evidence, not noise.
                    #
                    # Found by the local smoke test: treating these as full
                    # samples crashed the watcher the moment a writer exited,
                    # which is precisely what the `docker stop` rollback shot
                    # at the end of the capture does.
                    if isinstance(s, InvalidSample):
                        # InvalidSample exposes no public attributes; it is
                        # constructed from (key_sample, sample_info) and the
                        # fact of it is the signal.
                        # Coalesced after the first few, for a reason that
                        # is about the capture rather than tidiness. The
                        # finale shot stops the translator and shows this
                        # pane going quiet while the left pane carries on.
                        # `Detection2DSet` is keyed by `set_id` -- a *batch*
                        # id by the IDL's own comment -- so every message is
                        # its own instance, and the first dry run produced
                        # 317 disposes per camera on shutdown. Over 600 lines
                        # would scroll past in the one shot the whole capture
                        # exists for. Printing a few per topic and counting
                        # the rest keeps the evidence and keeps it legible;
                        # the totals are still exact in the summary below.
                        d = disposes.get(label, 0) + 1
                        disposes[label] = d
                        if d <= DISPOSE_LINES:
                            print(f"{time.strftime('%H:%M:%S')} {label:22} "
                                  f"-- instance disposed / unregistered",
                                  flush=True)
                        elif d == DISPOSE_LINES + 1:
                            print(f"{time.strftime('%H:%M:%S')} {label:22} "
                                  f"-- further disposals coalesced, counted "
                                  f"in the summary", flush=True)
                        continue
                    counts[label] = counts.get(label, 0) + 1
                    print(f"{time.strftime('%H:%M:%S')} {label:22} {_summary(label, s)}",
                          flush=True)
            if not got:
                time.sleep(0.05)
    except KeyboardInterrupt:
        pass

    print("-" * 78)
    print("samples by topic:")
    for label in sorted(names):
        d = disposes.get(label, 0)
        suffix = f"  (+{d} dispose)" if d else ""
        print(f"  {label:22} {counts.get(label, 0)}{suffix}")
    silent = [l for l in names if not counts.get(l)]
    if silent:
        print("\nno samples on: " + ", ".join(sorted(silent)))
        print("(expected for anything the demo scene never produces, "
              "record which, for the report)")
    return 0


if __name__ == "__main__":
    sys.exit(main())
