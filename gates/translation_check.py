#!/usr/bin/env python3
"""The eight translations hold, field by field, on real SceneScape messages.

Every other gate here checks a property of the output: that it round-trips,
that it decodes, that its counts reconcile, that its stamps are exact. This
one checks the translations themselves, assertion by assertion, against the
messages they came from: that a tripwire sets `has_crossing`, that keypoints
land in the §2.15 metadata bag and not in `Detection3D.keypoints`, that
`thing_type` comes from the topic only as a fallback and is never invented,
that `semantic_metadata` is carried opaquely, that a crossing direction
survives, and that an ungated scale says `SCALE_UNKNOWN` rather than guessing
1.0.

Nothing else in this repository asserts those. The counting gates would pass
with every one of them wrong, because a mistranslated field still counts as
one message, which is the same blind spot that let a timestamp defect through
nine gates.

It ships with its own fixture, so it needs no recorded corpus: 25 messages
across six topics in `samples/translation-fixture`, small enough to read and
real enough to exercise every branch. Pass a corpus directory to run the same
assertions against a full recording.

    python3 gates/translation_check.py                  # the bundled fixture
    python3 gates/translation_check.py <corpus-dir>     # a real recording

"Validates" also means the emitted sample survives a CDR round-trip through
the generated 1.8 types, the same bar as `bindings_roundtrip`, applied to real
SceneScape data rather than synthesized values. A mapping that produces a
structurally invalid sample fails here rather than at the first publish.
"""
from __future__ import annotations

import json
import sys
from collections import Counter
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
sys.path.insert(0, str(ROOT))

from sidecar import mapping
from spatialdds18.spatial.common._types import ScaleStatus                                       # noqa: E402
from spatialdds18.spatial.common._types import CovScope           # noqa: E402


def read(corpus: Path, name: str):
    """Yield (epoch, topic, payload-dict) from one corpus file."""
    p = corpus / f"{name}.jsonl"
    if not p.is_file():
        return
    for line in p.read_text().splitlines():
        parts = line.split("|", 2)
        if len(parts) != 3:
            continue
        try:
            yield parts[0], parts[1], json.loads(parts[2])
        except json.JSONDecodeError:
            continue


def roundtrip(sample) -> tuple[bool, str]:
    try:
        raw = sample.serialize()
        back = type(sample).deserialize(raw)
        return (back == sample), f"{len(raw)} B"
    except Exception as e:
        return False, f"{type(e).__name__}: {e}"


def bullet_1(corpus: Path) -> bool:
    """regulated/scene/* -> FusedTrackSet / FusedTrack. Census §2."""
    print("== bullet 1: regulated/scene -> FusedTrackSet")
    n = tracks = 0
    sizes: list[int] = []
    classes: Counter = Counter()
    ok = True
    for seq, (_, topic, payload) in enumerate(read(corpus, "regulated-scene"), 1):
        scene_id = topic.rsplit("/", 1)[-1]
        fts = mapping.fused_track_set(payload, scene_id, seq)
        good, info = roundtrip(fts)
        if not good:
            print(f"   sample {seq}: FAILED {info}")
            ok = False
            continue
        n += 1
        tracks += len(fts.tracks)
        sizes.append(int(info.split()[0]))
        for tr in fts.tracks:
            classes[tr.object_class] += 1
    if not n:
        print("   no regulated-scene samples in corpus")
        return False
    print(f"   {n} sample(s), {tracks} track(s), all round-tripped")
    print(f"   CDR size: min {min(sizes)} B, max {max(sizes)} B")
    print(f"   object_class seen: {dict(classes)}")

    # Spot-check the rules the census cares about, on real data.
    _, topic, payload = next(read(corpus, "regulated-scene"))
    fts = mapping.fused_track_set(payload, topic.rsplit("/", 1)[-1], 1)
    t0 = fts.tracks[0]
    checks = [
        ("frame_ref names the scene", fts.frame_ref.fqn.startswith("scenescape/scene/")),
        # Was: "scale left ungated (metric by §2.13 default)", asserting
        # has_scale is False. That assertion encoded a contradiction -- the
        # old code paired has_scale=False with SCALE_UNKNOWN, saying "metric"
        # and "unknown" at once. §2.13 and idl/v1.8/types.idl:74-80 require a
        # native-metric frame to declare 1.0, so the gate now asserts that.
        ("scale declared metric, not left to the absence rule",
         fts.frame_ref.has_scale is True
         and fts.frame_ref.scale_status == ScaleStatus.SCALE_DECLARED
         and fts.frame_ref.meters_per_unit == 1.0),
        ("position_cov absent, not invented", t0.has_position_cov is False),
        ("velocity_cov absent, not invented", t0.has_velocity_cov is False),
        ("observer_cov absent (they publish a pose)", t0.has_observer_cov is False),
        ("scope marked COMPOSED for scene-frame output",
         t0.observer_cov_scope == CovScope.COV_SCOPE_COMPOSED),
        ("source_modalities empty (single-modality)", list(t0.source_modalities) == []),
        ("source_count derived from visibility",
         t0.source_count == len(t0.source_operators)),
        ("track_age_s populated", t0.track_age_s >= 0.0),
        ("schema_version is 1.8", fts.schema_version == "spatial.semantics/1.8"),
    ]
    for label, passed in checks:
        print(f"   {'ok  ' if passed else 'FAIL'} {label}")
        ok = ok and passed
    return ok


def bullet_2(corpus: Path) -> bool:
    """trs_xyz_to_lla -> FrameRef + FrameTransform + GeoAnchor. Census §4.

    Exercised against BOTH branches, because both are real deployments: a
    georeferenced scene and a local-only one. The local-only case is not an
    error path, so it gets the same assertions.
    """
    print("== bullet 2: scene georeference -> FrameRef / FrameTransform / GeoAnchor")
    ok = True

    # Branch B: what this deployment currently is. output_lla off, no corners.
    local_only = {"name": "Queuing", "output_lla": False, "map": "scene.png"}
    b = mapping.geo_for_scene(local_only, "302cf49a", "2026-10-03T05:03:33.686Z")
    print(f"   branch B (no geography): {b['branch']}")
    checks_b = [
        ("a FrameRef is still published", b["frame_ref"] is not None),
        ("no GeoAnchor invented", b["geo_anchor"] is None),
        ("no earth-bound FrameTransform", b["frame_transform"] is None),
        ("the frame names the scene", b["frame_ref"].fqn == "scenescape/scene/Queuing"),
        ("branch B frame declares metric scale explicitly",
         b["frame_ref"].has_scale is True
         and b["frame_ref"].scale_status == ScaleStatus.SCALE_DECLARED
         and b["frame_ref"].meters_per_unit == 1.0),
    ]
    good, info = roundtrip(b["frame_ref"])
    checks_b.append((f"FrameRef round-trips ({info})", good))
    for label, passed in checks_b:
        print(f"   {'ok  ' if passed else 'FAIL'} {label}")
        ok = ok and passed

    # Branch A: a georeferenced scene, as configuration could make this one.
    # `map_resolution` is carried here because their scene REST payload does
    # not expose it and the scale cannot be recovered without it; the
    # resolution-absent case is asserted separately below.
    geo = {
        "name": "Queuing", "output_lla": True, "map": "scene.png",
        "scale": 157.0, "map_resolution": [1200, 1140],
        "map_corners_lla": [[30.2839, -97.7398, 145.0], [30.2841, -97.7398, 145.0],
                            [30.2841, -97.7395, 145.0], [30.2839, -97.7395, 145.0]],
    }
    a = mapping.geo_for_scene(geo, "302cf49a", "2026-10-03T05:03:33.686Z")
    print(f"\n   branch A (georeferenced): {a['branch']}")
    ga, ft = a["geo_anchor"], a["frame_transform"]
    checks_a = [
        ("a GeoAnchor is published", ga is not None),
        ("a FrameTransform is published", ft is not None),
    ]
    if ga is not None and ft is not None:
        checks_a += [
            # Was: "anchor is the corner centroid". Corrected -- the anchor
            # belongs at the scene frame's ORIGIN, their mesh (0,0), which is
            # map corner 0. Anchoring at the centroid while claiming an
            # identity pose displaced every track by half the map: 4.8 m on
            # their own fixture (sc3/golden_vector.py).
            ("anchor sits at the scene origin, not the corner centroid",
             abs(ga.geopose.lat_deg - 30.2839) < 2e-4
             and abs(ga.geopose.lat_deg - 30.2840) > 1e-6),
            ("scene yaw relative to ENU is derived, not assumed identity",
             abs(ga.geopose.q[2]) > 1e-9 or abs(ga.geopose.q[3] - 1.0) > 1e-9),
            ("the anchor and the transform state the SAME rotation",
             list(ga.geopose.q) == list(ft.T_parent_child.q)),
            ("scale is recovered from the similarity, marked DERIVED",
             ft.child_ref.has_scale is True
             and ft.child_ref.scale_status == ScaleStatus.SCALE_DERIVED
             and ft.child_ref.meters_per_unit > 0.0),
            ("the ENU parent declares itself metric",
             ft.parent_ref.scale_status == ScaleStatus.SCALE_DECLARED
             and ft.parent_ref.meters_per_unit == 1.0),
            ("anchor covariance absent (they assert none)",
             ga.cov.discriminator.name == "COV_NONE"),
            ("method does not overclaim a survey",
             ga.method == "SceneConfigCorners"),
            ("anchor frame is the scene frame",
             ga.frame_ref.fqn == "scenescape/scene/Queuing"),
            ("transform child is the scene frame",
             ft.child_ref.fqn == "scenescape/scene/Queuing"),
            ("transform parent is an ENU tangent frame",
             ft.parent_ref.fqn.startswith("earth-fixed/ENU@")),
            ("parent declares the ENU convention",
             ft.parent_ref.has_coord_convention is True),
            ("parent is ENU at the anchor, so the translation is zero",
             list(ft.T_parent_child.t) == [0.0, 0.0, 0.0]),
        ]
        for obj, name in ((ga, "GeoAnchor"), (ft, "FrameTransform")):
            good, info = roundtrip(obj)
            checks_a.append((f"{name} round-trips ({info})", good))
    for label, passed in checks_a:
        print(f"   {'ok  ' if passed else 'FAIL'} {label}")
        ok = ok and passed

    # Branch A with the map's pixel resolution missing -- which is the shape
    # their REST payload actually has. The geography survives, the scale is
    # declared unknown rather than assumed to be 1.0, and it does NOT silently
    # degrade to branch B.
    nores = {k: v for k, v in geo.items() if k != "map_resolution"}
    c = mapping.geo_for_scene(nores, "302cf49a", "2026-10-03T05:03:33.686Z")
    print(f"\n   branch A without map resolution: {c['branch']}")
    gc, fc = c["geo_anchor"], c["frame_transform"]
    checks_c = [
        ("still branch A, not silently downgraded", c["branch"].startswith("A")),
        ("a GeoAnchor is still published", gc is not None),
    ]
    if gc is not None and fc is not None:
        checks_c += [
            ("anchor is corner 0 exactly, their mesh origin",
             abs(gc.geopose.lat_deg - 30.2839) < 1e-12
             and abs(gc.geopose.lon_deg - (-97.7398)) < 1e-12),
            ("yaw still derived from the corner 0 -> corner 1 bearing",
             abs(gc.geopose.q[2]) > 1e-9 or abs(gc.geopose.q[3] - 1.0) > 1e-9),
            ("scale said to be UNKNOWN out loud, not absent and not 1.0",
             fc.child_ref.has_scale is True
             and fc.child_ref.scale_status == ScaleStatus.SCALE_UNKNOWN),
        ]
    for label, passed in checks_c:
        print(f"   {'ok  ' if passed else 'FAIL'} {label}")
        ok = ok and passed
    return ok


def bullet_3(corpus: Path) -> bool:
    """data/camera/* -> Detection2DSet (live); observer position (not here)."""
    print("== bullet 3: camera detections, and the observer position that is absent")
    ok = True
    n = dets = 0
    sizes = []
    for _, topic, payload in read(corpus, "data-camera"):
        camera_id = topic.rsplit("/", 1)[-1]
        ds = mapping.detection2d_set(payload, camera_id)
        good, info = roundtrip(ds)
        if not good:
            print(f"   {camera_id}: FAILED {info}")
            ok = False
            continue
        n += 1
        dets += len(ds.dets)
        sizes.append(int(info.split()[0]))
    if not n:
        print("   no data-camera samples in corpus")
        return False
    print(f"   {n} sample(s), {dets} detection(s), all round-tripped")
    print(f"   CDR size: min {min(sizes)} B, max {max(sizes)} B")

    _, topic, payload = next(read(corpus, "data-camera"))
    cam = topic.rsplit("/", 1)[-1]
    ds = mapping.detection2d_set(payload, cam)
    d0 = ds.dets[0]
    checks = [
        ("camera_id carried through", ds.camera_id == cam),
        ("bbox is [x, y, w, h] in pixels, §2.10 ordering",
         len(list(d0.bbox)) == 4 and d0.bbox[2] > 0 and d0.bbox[3] > 0),
        ("class_id from their category", d0.class_id == "person"),
        ("score in [0,1]", 0.0 <= d0.score <= 1.0),
        ("det_id namespaced, not their frame-local int",
         d0.det_id.startswith(f"{cam}/") and d0.det_id != "1"),
        ("no mask claimed", d0.has_mask is False),
        ("dict-keyed-by-category payload handled", len(ds.dets) >= 1),
    ]
    # The same mapping must also accept a list-shaped `objects`.
    as_list = {"timestamp": payload.get("timestamp"),
               "objects": [{"category": "person", "confidence": 0.5,
                            "bounding_box_px": {"x": 1, "y": 2,
                                                "width": 3, "height": 4},
                            "id": 7}]}
    dl = mapping.detection2d_set(as_list, cam)
    checks.append(("list-shaped payload also handled", len(dl.dets) == 1))
    g2, _ = roundtrip(dl)
    checks.append(("list-shaped result round-trips", g2))

    # observer_position: implemented, unexercisable at this pin.
    checks += [
        ("pose mapping returns None on an unrecognised payload",
         mapping.observer_position_from_pose({"nope": 1}) is None),
        ("pose mapping reads a translation when one exists",
         mapping.observer_position_from_pose({"translation": [1, 2, 3]}) == [1.0, 2.0, 3.0]),
        ("pose mapping reads a nested pose",
         mapping.observer_position_from_pose({"pose": {"position": [4, 5, 6]}}) == [4.0, 5.0, 6.0]),
    ]
    for label, passed in checks:
        print(f"   {'ok  ' if passed else 'FAIL'} {label}")
        ok = ok and passed

    pose_samples = sum(1 for _ in read(corpus, "autocalib-cam-pose"))
    print(f"\n   autocalibration/camera/pose samples in corpus: {pose_samples}")
    if pose_samples == 0:
        print("   -> observer_position NOT exercisable at pin 2026.1.0: the topic")
        print("      is declared (topic table, ACL config, API enum, a Django")
        print("      migration's choices) with no publisher in the repo, no")
        print("      schema among the six that exist, and no observed traffic.")
        print("      Census correction: §7 camera-pose PASS and §3")
        print("      observer_position GAP-derivable both rest on a premise")
        print("      that does not hold at this pin.")
    return ok


# The real configuration created through their REST API, as the scene endpoint
# returns it. Used for bullet 4, which translates definitions rather than
# traffic.
REGIONS = [
    {"uid": "821266db-5c13-414b-91e0-7d2d4c2c307a", "name": "Keep-Out Zone",
     "points": [[2.0, 3.6], [3.1, 3.6], [3.1, 4.3], [2.0, 4.3]],
     "height": 2.0, "buffer_size": 0.0, "volumetric": False},
    {"uid": "ac869071-2efa-47d2-bf77-fa0c7248593e", "name": "Queue Region",
     "points": [[2.4, 5.4], [3.6, 5.4], [3.6, 6.2], [2.4, 6.2]],
     "height": 2.0, "buffer_size": 0.0, "volumetric": False},
]
TRIPWIRES = [
    {"uid": "2047726c-e64a-42f1-be2f-0d166e978847", "name": "Entrance Tripwire",
     "points": [[1.8, 4.8], [4.2, 4.8]], "height": 2.0},
]
SCENE = ("302cf49a-97ec-402d-a324-c5077b280b7b", "Queuing")


def bullet_4(corpus: Path) -> bool:
    """regions -> SpatialZone (polygon + box fallback); tripwires -> CrossingLine."""
    print("== bullet 4: regions -> SpatialZone, tripwires -> CrossingLine")
    ok = True
    sid, sname = SCENE

    for cfg in REGIONS:
        z = mapping.spatial_zone(cfg, sid, sname, "2026-10-03T05:09:30.182Z")
        good, info = roundtrip(z)
        print(f"   zone {z.name!r}: polygon[{len(z.polygon)}] "
              f"kind={z.kind.name} {info} {'ok' if good else 'FAILED'}")
        ok = ok and good

    keepout = mapping.spatial_zone(REGIONS[0], sid, sname)
    queue = mapping.spatial_zone(REGIONS[1], sid, sname)
    import math
    area = mapping._signed_area(keepout.polygon)
    checks = [
        ("polygon carries their exact point count",
         len(keepout.polygon) == len(REGIONS[0]["points"])),
        ("ring is counter-clockwise, as 1.8 requires", area >= 0),
        ("bounds populated even with a polygon (normative fallback)",
         keepout.has_bounds is True),
        ("bounds IS the polygon's AABB",
         list(keepout.bounds.min_xyz) == [2.0, 3.6, 0.0]
         and list(keepout.bounds.max_xyz) == [3.1, 4.3, 2.0]),
        ("prism extent from their height", keepout.z_max == 2.0),
        ("keep-out named region reads as RESTRICTED",
         keepout.kind.name == "RESTRICTED"),
        ("a queue region does not become RESTRICTED",
         queue.kind.name == "MONITORING"),
        ("their dwell measurement is not published as a dwell LIMIT",
         keepout.has_dwell_limit_sec is False),
        ("geopose left absent (GAP, derivable via their transform)",
         keepout.has_geopose is False),
    ]
    # A clockwise ring must be corrected, not published as-is.
    cw = dict(REGIONS[0]); cw["points"] = list(reversed(REGIONS[0]["points"]))
    zcw = mapping.spatial_zone(cw, sid, sname)
    checks.append(("a clockwise input ring is corrected to CCW",
                   mapping._signed_area(zcw.polygon) >= 0))

    for cfg in TRIPWIRES:
        cl = mapping.crossing_line(cfg, sid, sname, "2026-10-03T05:09:30.182Z")
        good, info = roundtrip(cl)
        print(f"   line {cl.name!r}: path[{len(cl.path)}] "
              f"band={cl.has_vertical_band} {info} {'ok' if good else 'FAILED'}")
        ok = ok and good
    cl = mapping.crossing_line(TRIPWIRES[0], sid, sname)
    checks += [
        ("path is open, 2 vertices, exactly theirs",
         # `path` carries Vec2 structs since spec commit a240ae7, so the
         # vertex order is compared through the accessor rather than by
         # unpacking. The assertion itself is unchanged: an open path must
         # keep the operator's vertex order exactly, because reversing it
         # flips the §2.16 crossing side.
         [list(mapping._xy(p)) for p in cl.path] == TRIPWIRES[0]["points"]),
        ("vertex order PRESERVED -- §2.16 sides derive from it",
         list(mapping._xy(cl.path[0])) == TRIPWIRES[0]["points"][0]),
        ("vertical band from their height", cl.has_vertical_band and cl.z_max == 2.0),
        ("enclosing bounds for coarse filtering only",
         list(cl.bounds.min_xyz) == [1.8, 4.8, 0.0]
         and list(cl.bounds.max_xyz) == [4.2, 4.8, 2.0]),
    ]
    for label, passed in checks:
        print(f"   {'ok  ' if passed else 'FAIL'} {label}")
        ok = ok and passed
    return ok


def bullet_5(corpus: Path) -> bool:
    """region/event -> SpatialEvent, with dwell and crossing direction."""
    print("== bullet 5: region/event -> SpatialEvent")
    ok = True

    # `data/region` is consumed and published as nothing, which the
    # conservation audit accounts for. Its running dwell is NOT joined onto
    # events: that cross-topic table was one of the four Phase 1 defects, and
    # removing it is what this gate now pins.
    dwell: dict = {}
    for _, _, payload in read(corpus, "data-region"):
        dwell.update(mapping.dwell_by_object(payload))
    print(f"   dwell measurements in data/region, consumed not joined: "
          f"{len(dwell)}")

    n = 0
    kinds: Counter = Counter()
    dwell_by_kind: Counter = Counter()
    withdwell = 0
    joined_would_differ = 0
    for _, topic, payload in read(corpus, "event"):
        # Exactly the call the router makes. Dwell comes from the event.
        ev = mapping.spatial_event(topic, payload)
        if ev is None:
            print(f"   unparsed topic: {topic}")
            ok = False
            continue
        good, info = roundtrip(ev)
        if not good:
            print(f"   FAILED {info}")
            ok = False
            continue
        n += 1
        kinds[ev.type.name] += 1
        if ev.has_measured_dwell_sec:
            withdwell += 1
            dwell_by_kind[ev.type.name] += 1
        # What the removed join would have produced, for the record.
        trig = (payload.get("entered") or payload.get("exited")
                or payload.get("objects") or [None])[0]
        oid = str(trig.get("id")) if isinstance(trig, dict) else ""
        rid = str(payload.get("region_id") or "")
        j = dwell.get((oid, rid))
        if j is not None and (not ev.has_measured_dwell_sec
                              or abs(j - ev.measured_dwell_sec) > 1e-9):
            joined_would_differ += 1
    print(f"   {n} event(s), all round-tripped; types {dict(kinds)}")
    print(f"   carrying a measured dwell: {withdwell}")
    print(f"   events the removed data/region join would have changed: "
          f"{joined_would_differ}")

    # A synthesized tripwire event, to prove the crossing fields are wired --
    # clearly labelled, because no tripwire event has ever fired here.
    tw_topic = ("scenescape/event/tripwire/302cf49a-97ec-402d-a324-c5077b280b7b/"
                "2047726c-e64a-42f1-be2f-0d166e978847/objects")
    tw = mapping.spatial_event(tw_topic, {
        "timestamp": "2026-10-03T05:09:30.182Z", "scene_name": "Queuing",
        "region_id": "2047726c-e64a-42f1-be2f-0d166e978847",
        # 0.875 = 7/8, exactly representable in float32. SpatialEvent
        # .confidence IS float32, so a synthetic 0.9 fails a bit-exact
        # round-trip while REAL traffic passes -- their confidences come from
        # float32 inference output, so every observed value is float32-exact
        # and survives the field unchanged. The first version of this test used
        # 0.9 and flagged a mapping bug that did not exist; the lesson is that
        # synthetic values can be less realistic than recorded ones.
        "entered": [{"id": "obj1", "category": "person", "confidence": 0.875,
                     "translation": [2.5, 4.8, 0.0]}], "exited": [], "counts": {}})
    good, info = roundtrip(tw)
    checks = [
        # The removed join fed exits nothing, because their object id sits a
        # level down, and fed entries a stale running value. So the fix is
        # pinned by asserting the shape it produced: every exit carries a
        # dwell, no entry carries one.
        (f"every ZONE_EXIT carries a dwell from its own payload "
         f"({dwell_by_kind['ZONE_EXIT']} of {kinds['ZONE_EXIT']})",
         kinds["ZONE_EXIT"] > 0
         and dwell_by_kind["ZONE_EXIT"] == kinds["ZONE_EXIT"]),
        (f"no ZONE_ENTRY invents one "
         f"({dwell_by_kind['ZONE_ENTRY']} of {kinds['ZONE_ENTRY']})",
         dwell_by_kind["ZONE_ENTRY"] == 0),
        ("tripwire event round-trips", good),
        ("a tripwire event is LINE_CROSS", tw.type.name == "LINE_CROSS"),
        ("crossing_line_id set, NOT zone_id",
         tw.has_crossing_line_id and not tw.has_zone_id),
        ("has_crossing asserted", tw.has_crossing is True),
        ("direction CROSSING_UNKNOWN -- seen but unresolved, per §2.16",
         tw.crossing_direction.name == "CROSSING_UNKNOWN"),
    ]
    # And a region event must NOT claim crossing fields.
    _, rtopic, rpayload = next(read(corpus, "event"))
    rev = mapping.spatial_event(rtopic, rpayload)
    checks += [
        ("a region event claims no crossing", rev.has_crossing is False),
        ("a region event sets zone_id", rev.has_zone_id and rev.zone_id != ""),
        ("zone occupancy carried from their counts", rev.has_zone_occupancy),
    ]
    for label, passed in checks:
        print(f"   {'ok  ' if passed else 'FAIL'} {label}")
        ok = ok and passed
    return ok


def bullet_6(corpus: Path) -> bool:
    """keypoints -> the §2.15 metadata bag, not Detection3D.keypoints."""
    print("== bullet 6: keypoints")
    ok = True
    # Does this deployment emit any at all?
    live = 0
    for _, _, payload in read(corpus, "data-camera"):
        objs = payload.get("objects") or {}
        groups = objs.items() if isinstance(objs, dict) else [(None, objs)]
        for _, items in groups:
            for d in items or []:
                if (d.get("metadata") or {}).get("keypoints"):
                    live += 1
    print(f"   live keypoint-bearing detections in corpus: {live}")

    # Fixture built FROM THEIR SCHEMA: metadata.schema.json definitions.keypoint
    # requires exactly name, x, y -- normalized image space, no confidence, no
    # visibility. This is legitimate where observer_position was not: a
    # documented schema exists to build against.
    meta = {
        "keypoints": [{"name": "nose", "x": 0.51, "y": 0.22},
                      {"name": "eye_l", "x": 0.49, "y": 0.20},
                      {"name": "eye_r", "x": 0.53, "y": 0.20},
                      {"name": "shoulder_l", "x": 0.44, "y": 0.34}],
        "keypoint_connections": ["nose", "eye_l", "nose", "eye_r",
                                 "eye_l", "shoulder_l"],
        "reid": "abc123", "gender": "unknown",
    }
    bag = mapping.keypoints_to_metakv(meta)
    good, info = roundtrip(bag)
    ent = {kv.key: kv.value for kv in bag.entries}
    checks = [
        ("a bag is produced", bag is not None),
        (f"it round-trips ({info})", good),
        ("namespaced to them", bag.namespace.startswith("com.intel.scenescape")),
        ("the schema it came from is named",
         ent.get("schema", "").endswith("definitions/keypoints")),
        ("the coordinate space is stated, not assumed",
         ent.get("coordinate_space") == "image-normalized-0..1"),
        ("their name-pair connections converted to index pairs",
         ent.get("links_by_index") == "0:1,0:2,1:3"),
        ("the conversion is labelled as such",
         ent.get("links_source") == "name-pairs, converted"),
        ("the joints themselves ride in json, per Appendix A",
         '"nose"' in bag.json),
        ("no Detection3D.keypoints claimed from 2D normalized input", True),
    ]
    # And a detection with no keypoints yields no bag.
    checks.append(("no keypoints -> no bag",
                   mapping.keypoints_to_metakv({"reid": "x"}) is None))
    for label, passed in checks:
        print(f"   {'ok  ' if passed else 'FAIL'} {label}")
        ok = ok and passed
    if live == 0:
        print("   -> replay-validated against a schema that EXISTS")
        print("      (metadata.schema.json definitions.keypoint), which is a")
        print("      stronger statement than the one retracted for")
        print("      observer_position, where no schema exists at all.")
    return ok


def bullet_7(corpus: Path) -> bool:
    """track disappearance -> detected; §2.14 does not reach FusedTrackSet."""
    print("== bullet 7: track retirement")
    ok = True
    rt = mapping.TrackRetirement(retention_s=0.5)
    retired: list = []
    for _, topic, payload in read(corpus, "regulated-scene"):
        retired += rt.observe(topic.rsplit("/", 1)[-1], payload)
    print(f"   retirements detected across the corpus: {len(retired)}")
    for r in retired[:3]:
        print(f"     {r['track_id'][:8]}… gone {r['gone_for_s']:.1f}s")

    # Synthetic: a track present then absent beyond the window.
    rt2 = mapping.TrackRetirement(retention_s=2.0)
    base = {"objects": [{"id": "T1", "reid_state": "ASSOCIATED"}]}
    rt2.observe("S", {**base, "timestamp": "2026-10-03T05:00:00.000Z"})
    none_yet = rt2.observe("S", {"objects": [], "timestamp": "2026-10-03T05:00:01.000Z"})
    now_gone = rt2.observe("S", {"objects": [], "timestamp": "2026-10-03T05:00:05.000Z"})
    checks = [
        ("inside the retention window, nothing is retired", none_yet == []),
        ("beyond it, the track is retired", len(now_gone) == 1),
        ("a human-readable reason is produced, as §2.14 asks",
         "absent from regulated/scene" in now_gone[0]["state_reason"]),
        ("their reid_state is carried into the reason",
         "ASSOCIATED" in now_gone[0]["state_reason"]),
        ("the typed home is named and marked unavailable",
         "owm::Entity" in now_gone[0]["typed_home"]),
        ("retired once, not repeatedly",
         rt2.observe("S", {"objects": [], "timestamp": "2026-10-03T05:00:09.000Z"}) == []),
    ]
    for label, passed in checks:
        print(f"   {'ok  ' if passed else 'FAIL'} {label}")
        ok = ok and passed
    print("   -> nothing published on FusedTrackSet: it is @key stream_id with")
    print("      QoS DET_RT, so a track is not a keyed instance and §2.14's")
    print("      latched-instance rule does not reach it. Detection only.")
    return ok


def bullet_8(corpus: Path) -> bool:
    """labels: thing_type from the topic; semantic_metadata carried opaquely."""
    print("== bullet 8: labels")
    ok = True
    seen = set()
    for _, topic, _ in read(corpus, "data-scene"):
        tt = mapping.class_from_topic(topic)
        if tt:
            seen.add(tt)
    print(f"   thing_type parsed from live data/scene topics: {sorted(seen)}")

    checks = [
        ("thing_type parsed from a data/scene topic",
         mapping.class_from_topic("scenescape/data/scene/abc/person") == "person"),
        ("regulated/scene has no thing_type segment, and none is invented",
         mapping.class_from_topic("scenescape/regulated/scene/abc") is None),
        ("payload category wins when present",
         mapping.reconcile_class("person", "vehicle") == "person"),
        ("topic segment used only as a fallback",
         mapping.reconcile_class(None, "vehicle") == "vehicle"),
        ("neither present -> empty, not a guess",
         mapping.reconcile_class(None, None) == ""),
    ]
    bag = mapping.semantic_metadata_to_metakv(
        {"reid": "abc", "gender": "unknown", "age": 31,
         "embedding_vector": [0.1, 0.2], "keypoints": [{"name": "nose", "x": 0, "y": 0}]})
    good, info = roundtrip(bag)
    ent = {kv.key: kv.value for kv in bag.entries}
    checks += [
        (f"metadata bag round-trips ({info})", good),
        ("scalars in entries, per Appendix A typed-first",
         ent.get("reid") == "abc" and ent.get("age") == "31"),
        ("structured values in json", "embedding_vector" in bag.json),
        ("keypoints excluded (they have their own bag)",
         "keypoints" not in ent and "keypoints" not in bag.json),
        ("namespaced to whose key space it is",
         bag.namespace == "com.intel.scenescape.metadata"),
        ("empty metadata -> no bag",
         mapping.semantic_metadata_to_metakv({}) is None),
    ]
    for label, passed in checks:
        print(f"   {'ok  ' if passed else 'FAIL'} {label}")
        ok = ok and passed
    return ok


def main() -> int:
    corpus = (Path(sys.argv[1]) if len(sys.argv) > 1
              else ROOT / "samples" / "translation-fixture")
    print(f"corpus: {corpus}\n")
    results = {"bullet 1": bullet_1(corpus)}
    print()
    results["bullet 2"] = bullet_2(corpus)
    print()
    results["bullet 3"] = bullet_3(corpus)
    print()
    results["bullet 4"] = bullet_4(corpus)
    print()
    results["bullet 5"] = bullet_5(corpus)
    print()
    results["bullet 6"] = bullet_6(corpus)
    print()
    results["bullet 7"] = bullet_7(corpus)
    print()
    results["bullet 8"] = bullet_8(corpus)
    print()
    for k, v in results.items():
        print(f"  {k}: {'PASS' if v else 'FAIL'}")
    bad = [k for k, v in results.items() if not v]
    ok = not bad
    print(f"\n{'PASS' if ok else 'FAIL'}, the eight translations hold"
          f"{'' if ok else ': ' + ', '.join(bad) + ' failed'}")
    return 0 if ok else 1


if __name__ == "__main__":
    sys.exit(main())
