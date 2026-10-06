#!/usr/bin/env python3
"""The live sidecar: SceneScape MQTT in, SpatialDDS 1.8 out.

**Northbound only.** This process subscribes and publishes DDS. It never
publishes to SceneScape's broker, never calls their REST API, and never writes
a file inside their tree. Killing it stops the DDS side and leaves their stack
untouched, which is the whole claim the capture exists to show.

**Input is a line format, deliberately.** It reads
`<unix_ts>|<topic>|<json>` on stdin -- the exact format `tools/record_corpus.sh`
writes and `tools/replay_to_mcap.py` reads. So the live path and the replay path
consume identical bytes, and the corpus on disk is a faithful recording of what
this process saw. It also means no MQTT client library is needed here:
`tools/bridge_live.sh` pipes `mosquitto_sub` into it, reusing the subscriber that
recorded the corpora. One format, one mapping, two transports.

**The mapping is `sidecar.route.Router`**, the same object replay drives, so
there is no second implementation to drift. The four defects that the
live/replay split exposed are in NOTES and locked down by
`gates/route_regress.py`.

Latched definitions are published once at startup and carry **publication
time**, not a back-dated stamp. Replay back-dates them to the corpus start
because a recording's zones were in force throughout the window; doing that
live would be a false claim about when we learned them. The convention states
its own boundary -- see the census's adapter-mapping table -- and this is the
side of the boundary where it does not apply.
"""
from __future__ import annotations

import argparse
import json
import signal
import sys
import time
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
if str(ROOT) not in sys.path:
    sys.path.insert(0, str(ROOT))

from cyclonedds.core import Qos, Policy                        # noqa: E402
from cyclonedds.domain import DomainParticipant                # noqa: E402
from cyclonedds.util import duration                           # noqa: E402
from cyclonedds.pub import Publisher, DataWriter               # noqa: E402
from cyclonedds.topic import Topic                             # noqa: E402

from sidecar import route                                      # noqa: E402

# Latched definitions must survive a late-joining reader, so RELIABLE +
# TRANSIENT_LOCAL per §2.14; live streams are volatile and best-effort-ish.
QOS_LATCHED = Qos(Policy.Reliability.Reliable(duration(seconds=1)),
                  Policy.Durability.TransientLocal,
                  Policy.History.KeepLast(1))
QOS_LIVE = Qos(Policy.Reliability.Reliable(duration(seconds=1)),
               Policy.Durability.Volatile,
               Policy.History.KeepLast(16))

# Entity is RELIABLE + TRANSIENT_LOCAL, KEEP_LAST(1) per key, as the module
# specifies, so a late joiner is handed each entity's current rest state.
LATCHED_TYPES = {"SpatialZone", "CrossingLine", "GeoAnchor", "FrameTransform",
                 "Entity"}


class Writers:
    """One DataWriter per (topic, type), created on first use."""

    def __init__(self, dp: DomainParticipant) -> None:
        self.dp = dp
        self.pub = Publisher(dp)
        self.cache: dict[tuple[str, str], DataWriter] = {}

    def get(self, topic_name: str, sample) -> DataWriter:
        tp = type(sample)
        key = (topic_name, tp.__name__)
        w = self.cache.get(key)
        if w is None:
            qos = QOS_LATCHED if tp.__name__ in LATCHED_TYPES else QOS_LIVE
            w = DataWriter(self.pub, Topic(self.dp, topic_name, tp), qos=qos)
            self.cache[key] = w
        return w


def main() -> int:
    ap = argparse.ArgumentParser()
    ap.add_argument("--scene-config", type=Path, required=True,
                    help="scene config JSON as their REST API returns it; "
                         "zones and camera membership are unlearnable from "
                         "the bus (see NOTES)")
    ap.add_argument("--domain", type=int, default=7)
    ap.add_argument("--mcap", type=Path, default=None,
                    help="also record everything published, for the MCAP recording step")
    ap.add_argument("--idl", type=Path,
                    default=ROOT / "idl" / "v1.8")
    ap.add_argument("--status-every", type=float, default=5.0)
    a = ap.parse_args()

    raw = json.loads(a.scene_config.read_text())
    cfgs = {c["uid"]: c for c in (raw if isinstance(raw, list) else [raw])
            if c.get("uid")}
    router = route.Router(cfgs)

    dp = DomainParticipant(a.domain)
    writers = Writers(dp)
    rec = None
    if a.mcap:
        from sidecar.mcap_out import McapOut
        rec = McapOut(a.mcap, a.idl, "live").__enter__()

    print(f"sidecar: domain {a.domain}, {len(cfgs)} scene(s), "
          f"{len(router.cam_scene)} camera(s) mapped", flush=True)
    for cam, sid in sorted(router.cam_scene.items()):
        print(f"   {cam:12} -> {sid[:8]}", flush=True)

    # Latched first, so a reader that joins later still learns the layout.
    now_ns = time.time_ns()
    now_iso = (time.strftime("%Y-%m-%dT%H:%M:%S", time.gmtime(now_ns / 1e9))
               + f".{(now_ns % 1_000_000_000) // 1_000_000:03d}Z")
    latched = 0
    for sid in sorted(cfgs):
        for topic_name, sample, _ in router.definitions(sid, now_iso, now_ns):
            writers.get(topic_name, sample).write(sample)
            if rec:
                rec.write(topic_name, sample, now_ns)
            latched += 1
        for topic_name, sample, _ in router.owm_definitions(sid, now_iso, now_ns):
            writers.get(topic_name, sample).write(sample)
            if rec:
                rec.write(topic_name, sample, now_ns)
            latched += 1
    print(f"   {latched} latched definition(s) published", flush=True)

    stop = {"now": False}

    def _bye(signum, frame):
        stop["now"] = True

    signal.signal(signal.SIGINT, _bye)
    signal.signal(signal.SIGTERM, _bye)

    published = 0
    skipped = 0
    last = time.monotonic()
    try:
        for line in sys.stdin:
            if stop["now"]:
                break
            parts = line.rstrip("\n").split("|", 2)
            if len(parts) != 3:
                skipped += 1
                continue
            try:
                ts, topic, payload = float(parts[0]), parts[1], json.loads(parts[2])
            except (ValueError, json.JSONDecodeError):
                skipped += 1
                continue
            for topic_name, sample, ns in router.route(topic, payload):
                writers.get(topic_name, sample).write(sample)
                if rec:
                    rec.write(topic_name, sample, ns)
                published += 1
            if a.status_every and time.monotonic() - last >= a.status_every:
                last = time.monotonic()
                counts = " ".join(f"{k}={v}" for k, v in sorted(router.counts.items()))
                print(f"   published {published}  {counts}", flush=True)
    finally:
        if rec:
            rec.__exit__(None, None, None)

    print(f"\nsidecar stopping: {published} sample(s) published, "
          f"{skipped} unparsable line(s)", flush=True)
    if router.unattributed:
        print("  cameras with no declaring scene, dropped rather than guessed:",
              flush=True)
        for cam, n in sorted(router.unattributed.items()):
            print(f"    {cam}  {n}", flush=True)
    if router.unparsed:
        print(f"  {len(router.unparsed)} unparsed event topic(s)", flush=True)
    return 0


if __name__ == "__main__":
    sys.exit(main())
