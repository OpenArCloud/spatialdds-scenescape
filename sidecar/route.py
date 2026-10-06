"""One MQTT message -> the SpatialDDS samples it becomes.

Why this exists. The replay path (`tools/replay_to_mcap.py`) walks the corpus
**topic by topic** -- every `regulated/scene` line, then every `data/camera`
line -- because that is the cheapest way to read a directory of per-topic
files. A live bridge cannot do that: messages arrive interleaved, in whatever
order the broker delivers them. The *ordering* therefore differs by necessity,
but the *mapping* must not, or the thing we validated in replay is not the
thing we publish live.

So the per-message mapping lives here, called once per arriving message and
order-independent, and `an earlier equivalence gate (superseded)` asserts that routing a corpus
through this module yields byte-identical samples to the replay's own calls.

There is **no** live/replay asymmetry, and the earlier claim that there was one
was a symptom of a bug rather than a fact about the data. It said
`measured_dwell_sec` had to be joined from the `data/region` stream, so live
could only publish a dwell once the matching region message had arrived. In
fact their exit event carries its own final dwell, and their entry event has
none to carry. Nothing needs joining, so live and replay are exactly equivalent
here. `data/region` is still consumed -- its running dwell is a continuous
measurement rather than an event quantity -- but no event depends on it.

Northbound only. This module produces samples; it never writes to SceneScape.
"""
from __future__ import annotations

from typing import Any, Iterator

from sidecar import mapping, owm, topics


def _ns(stamp: Any) -> int:
    return int(stamp.sec) * 1_000_000_000 + int(stamp.nanosec)


class Router:
    """Stateful per-message router. One instance per bridge or replay run."""

    def __init__(self, scene_cfgs: dict[str, dict] | None = None,
                 retention_s: float = 5.0, owm_lane: bool = True) -> None:
        self.scene_cfgs = scene_cfgs or {}
        # camera id -> scene uid, from each scene's own `cameras` list as the
        # REST payload returns it. Their `data/camera/<id>` topic does not name
        # a scene, and guessing is not harmless: `camera1`/`camera2` belong to
        # Retail while `atag-qcam1`/`atag-qcam2` belong to Queuing
        # (`sample_data/Retail.json:10-11` for the first pair), so picking one
        # scene for all of them publishes half the detections in the wrong
        # frame. An unknown camera is dropped and counted, never attributed.
        self.cam_scene: dict[str, str] = {}
        for sid, cfg in self.scene_cfgs.items():
            for cam in (cfg.get("cameras") or []):
                key = cam.get("uid") or cam.get("name") if isinstance(cam, dict) else cam
                if key:
                    self.cam_scene[str(key)] = sid
                if isinstance(cam, dict) and cam.get("name"):
                    self.cam_scene[str(cam["name"])] = sid
        self.unattributed: dict[str, int] = {}
        # The spatial.owm/0.1 lane. Additive and on by default; off makes the
        # router byte-identical to Phase 1, which is how the regression gate
        # proves the lane is additive rather than merely believed to be.
        self.owm_lane = owm_lane
        self.owm_live: dict[str, str] = {}      # entity_id -> track key seen
        self.owm_created = 0
        self.owm_retired = 0
        self.dwell: dict[tuple[str, str], float] = {}
        self.retire = mapping.TrackRetirement(retention_s=retention_s)
        self.seq: dict[str, int] = {}
        self.retirements: list[dict] = []
        self.counts: dict[str, int] = {}
        self.dwell_misses = 0
        self.unparsed: list[str] = []

    # -- latched definitions, from configuration rather than from the bus ----

    def definitions(self, scene_id: str, stamp_iso: str | None,
                    stamp_ns: int) -> Iterator[tuple[str, Any, int]]:
        """Zones, lines, anchor and transform for one scene. Published once.

        These come from the scene configuration, not from a message, because a
        zone that is never occupied emits nothing on their bus at all -- so the
        inventory is unlearnable by listening. See NOTES.
        """
        cfg = self.scene_cfgs.get(scene_id, {"name": scene_id})
        geo = mapping.geo_for_scene(cfg, scene_id, stamp_iso)
        if geo["frame_transform"] is not None:
            yield topics.frame_transform(scene_id), geo["frame_transform"], stamp_ns
        if geo["geo_anchor"] is not None:
            yield topics.geo_anchor(scene_id), geo["geo_anchor"], stamp_ns
        for r in cfg.get("regions") or []:
            yield (topics.spatial_zone(scene_id),
                   mapping.spatial_zone(r, scene_id, cfg.get("name"), stamp_iso),
                   stamp_ns)
        for tw in cfg.get("tripwires") or []:
            yield (topics.crossing_line(scene_id),
                   mapping.crossing_line(tw, scene_id, cfg.get("name"), stamp_iso),
                   stamp_ns)

    # -- the live lanes ------------------------------------------------------

    def route(self, topic: str, payload: dict[str, Any],
              scene_hint: str | None = None) -> list[tuple[str, Any, int]]:
        """One MQTT topic+payload -> [(dds_topic, sample, log_time_ns)].

        Returns a list because one message may yield several samples, and an
        empty list for the topics that are deliberately dropped (declared in
        `gates/conservation_audit.py`'s table) or consumed for side effects only.
        """
        parts = topic.strip("/").split("/")
        if len(parts) < 2 or parts[0] != "scenescape":
            return []
        kind = parts[1]

        if kind == "regulated" and len(parts) >= 4 and parts[2] == "scene":
            sid = parts[3]
            self.seq[sid] = self.seq.get(sid, 0) + 1
            fts = mapping.fused_track_set(payload, sid, self.seq[sid])
            gone = self.retire.observe(sid, payload)
            self.retirements += gone
            self._bump("regulated/scene")
            out = [(topics.fused_track(sid), fts, _ns(fts.stamp))]
            if self.owm_lane:
                out += self._owm_lifecycle(sid, payload, gone)
            return out

        if kind == "data" and len(parts) >= 4 and parts[2] == "camera":
            cam = parts[3]
            sid = self.cam_scene.get(cam) or scene_hint or self._only_scene()
            if sid is None:
                self.unattributed[cam] = self.unattributed.get(cam, 0) + 1
                return []
            ds = mapping.detection2d_set(payload, cam)
            self._bump("data/camera")
            return [(topics.detection2d(sid, cam), ds, _ns(ds.stamp))]

        if kind == "data" and len(parts) >= 3 and parts[2] == "region":
            # Consumed for dwell, published as nothing. The dwell it carries
            # lands on a later SpatialEvent.
            self.dwell.update(mapping.dwell_by_object(payload))
            self._bump("data/region")
            return []

        if kind == "event":
            # No dwell lookup. The exit event carries its own dwell and the
            # entry event legitimately has none -- see `mapping.spatial_event`.
            # The earlier cross-topic table looked dwell up by (object, region)
            # from `data/region`, which fed entries a stale running value and
            # fed exits nothing at all because their object id sits one level
            # down. Removing it also removes the only live/replay asymmetry
            # this router had.
            ev = mapping.spatial_event(topic, payload)
            if ev is None:
                self.unparsed.append(topic)
                return []
            sid = str(payload.get("scene_id") or scene_hint
                      or self._only_scene() or "")
            self._bump("event")
            return [(topics.spatial_event(sid), ev, _ns(ev.stamp))]

        return []

    # -- the owm lane -------------------------------------------------------

    def _owm_lifecycle(self, scene_id: str, payload: dict[str, Any],
                       gone: list[dict[str, Any]]) -> list[tuple[str, Any, int]]:
        """Entity samples for lifecycle changes in one regulated/scene frame.

        State change only. A track already known produces nothing, which is
        what makes this the slow tier: over the reference corpus it is 90
        samples against 5,947 on the semantics lane.
        """
        cfg = self.scene_cfgs.get(scene_id, {})
        name = cfg.get("name")
        stamp_iso = payload.get("timestamp")
        out: list[tuple[str, Any, int]] = []
        topic = topics.owm_entity(scene_id)

        for o_ in (payload.get("objects") or []):
            tid = str(o_.get("id") or "")
            if not tid:
                continue
            eid = owm.entity_id_for_track(scene_id, tid)
            if eid in self.owm_live:
                continue
            self.owm_live[eid] = tid
            ent = owm.entity_for_track(o_, scene_id, name, stamp_iso)
            self.owm_created += 1
            out.append((topic, ent, _ns(ent.stamp)))

        for r in gone:
            eid = owm.entity_id_for_track(str(r.get("scene_id") or ""),
                                          str(r.get("track_id") or ""))
            if eid not in self.owm_live:
                continue
            del self.owm_live[eid]
            ent = owm.retire_entity(r, name, stamp_iso)
            self.owm_retired += 1
            out.append((topic, ent, _ns(ent.stamp)))
        return out

    def owm_definitions(self, scene_id: str, stamp_iso: str | None,
                        stamp_ns: int) -> list[tuple[str, Any, int]]:
        """Declared region entities, published once with the other latched set.

        Regions only. Tripwires get no entity: a line is not an area, 0.1 has
        no line shape and no footprint reference, and a box around a line
        would assert an area nobody drew.
        """
        if not self.owm_lane:
            return []
        cfg = self.scene_cfgs.get(scene_id, {})
        out = []
        for r in (cfg.get("regions") or []):
            ent = owm.entity_for_region(r, scene_id, cfg.get("name"), stamp_iso)
            self.owm_created += 1
            out.append((topics.owm_entity(scene_id), ent, stamp_ns))
        return out

    # -- helpers ------------------------------------------------------------

    def _bump(self, key: str) -> None:
        self.counts[key] = self.counts.get(key, 0) + 1

    def _only_scene(self) -> str | None:
        """Their `data/camera` topic does not name a scene.

        With one configured scene the answer is unambiguous; with several it is
        not, and guessing would attach detections to the wrong frame. Returns
        None rather than pick, and the caller drops the message.
        """
        if len(self.scene_cfgs) == 1:
            return next(iter(self.scene_cfgs))
        return None
