"""SceneScape state as `spatial.owm/0.1` entities. Phase 2, additive lane.

Built from the module's published IDL and prose alone. Where the module is
ambiguous the ambiguity is recorded as a finding and resolved by the smallest
adapter convention that closes it, never by copying another implementation.

**This lane is the slow tier.** Per-frame pose stays on the semantics lane,
where `FusedTrackSet` already carries it at detection rate. An `Entity` is
published only when the rest state changes: the entity appears, or it retires.
Measured against the reference corpus that is 90 samples where the semantics
lane carries 5,947, a ratio of about 1 to 66. A lane publishing at frame rate
would be wrong even if every sample were individually correct, which is what
the tempo gate exists to catch.

**ModelPose is deliberately not published.** The module offers it as the fast
tier of its two-tier pattern, and this adapter's fast tier is `FusedTrackSet`,
which carries the same pose with covariance and track provenance the module's
pose lane has nowhere to put. Publishing both would be two writers describing
one physical thing, which Appendix M.2 forbids for exactly the reason it would
be wrong here. Recorded as not-exercised in the census rather than faked.

**ModelCommand is not published either.** The sidecar is northbound only and
issues no commands, so the keyed-command surface and its decline discipline go
unexercised. Also recorded, not simulated.
"""
from __future__ import annotations

from typing import Any

from spatialdds18.spatial.common._types import KV
from spatialdds18.spatial.core._core import Aabb3
from spatialdds18.spatial.owm._owm import (
    Basis, Entity, LifecycleState, ModelLayer, MODULE_ID)

from sidecar.mapping import frame_ref_for_scene, parse_iso

# ---------------------------------------------------------------------------
# Identity. Mechanical, per the brief: no stitching, no merge behaviour.
# ---------------------------------------------------------------------------

def entity_id_for_track(scene_id: str, track_id: str) -> str:
    """A tracked thing's entity id, namespaced like every other id we mint.

    Mechanical by design. If SceneScape's re-identification retires one track
    id and introduces a successor, that is two entity lifecycles on this lane
    and a witness note in the report. Stitching them would be an identity
    decision, and identity semantics are reserved by the module.
    """
    return f"scenescape/{scene_id}/track/{track_id}"


def entity_id_for_region(scene_id: str, region_uid: str) -> str:
    """A declared region's entity id.

    Deliberately derived from the same region uid that `SpatialZone.zone_id`
    carries on the events lane, so the two are joinable. The join is also
    stated explicitly on the wire, in `properties`; see `footprint_kv`.
    """
    return f"scenescape/{scene_id}/region/{region_uid}"


# ---------------------------------------------------------------------------
# Conventions this adapter adds, each because the module leaves a gap.
# ---------------------------------------------------------------------------

#: §2.11 asks producers of provisional types to mark data provisional with a
#: `MetaKV` entry, `namespace = "schema"`, `stability = "provisional"`.
#: `owm::Entity` has no `MetaKV` field. It has `sequence<KV, 32> properties`,
#: whose `KV` is a flat key/value pair with no namespace of its own, and the
#: other route §2.11 offers, `caps.features` on `Announce`, is a type this
#: sidecar does not publish. So the closest conforming form available on the
#: type itself is a namespace-prefixed key in `properties`. Recorded as a
#: finding: the module cannot satisfy §2.11 as written.
SCHEMA_STABILITY_KV = KV(key="schema.stability", value="provisional")

#: The module id, carried per sample because `owm::Entity` has no
#: `schema_version` field. §2.11 says latched and durable types carry one and
#: `Entity` is RELIABLE + TRANSIENT_LOCAL, so this is a written disagreement
#: between the convention and the module. Carrying the module id in
#: `properties` keeps a recording self-describing about which provisional
#: revision produced it, which matters more than usual for a module whose
#: layout may change incompatibly between revisions.
MODULE_KV = KV(key="schema.module", value=MODULE_ID)

#: SceneScape's class strings are not a vocabulary. Phase 1 passes `category`
#: through unchanged and records that as a census MISMATCH. `type_uris` asks
#: for borrowed vocabularies, so one has to be chosen here; COCO is the
#: vocabulary SceneScape's own detectors are trained against, which makes it
#: the least invented option available. Flagged for review: this is the
#: adapter choosing a vocabulary the producer never stated.
_COCO = "http://cocodataset.org/#explore?cat="

_CLASS_URIS = {
    "person": f"{_COCO}person",
    "vehicle": f"{_COCO}car",
    "bicycle": f"{_COCO}bicycle",
}


def type_uris_for_class(object_class: str) -> list[str]:
    """Borrowed-vocabulary URIs for a SceneScape class string.

    Returns an empty sequence for a class with no mapping rather than minting
    a URI in a namespace nobody owns. An absent type is honest; an invented
    one is not.
    """
    cls = (object_class or "").strip().lower()
    uri = _CLASS_URIS.get(cls)
    return [uri] if uri else []


def footprint_kv(zone_id: str) -> KV:
    """The declared join from a region entity to its `SpatialZone` footprint.

    **This is an adapter convention, pending a module decision.** The module
    says area entities "describe their footprint with `events::SpatialZone`"
    and adds no zone type of its own, but `Entity` has no field that can
    reference one: not `content_refs`, whose canonical form is a
    `spatialdds://` manifest URI for catalogue assets, and not a relationship,
    which 0.1 explicitly reserves. So the reference is carried as a declared
    property whose value is exactly the `SpatialZone.zone_id` published on the
    events lane.

    Stated on the wire rather than left to this repository's documentation, so
    a consumer who has never read our README still sees an explicit reference.
    Migration to a typed field, if one lands in 0.2, is mechanical.
    """
    return KV(key="footprint_zone_id", value=zone_id)


def _base_properties(extra: list[KV] | None = None) -> list[KV]:
    props = [SCHEMA_STABILITY_KV, MODULE_KV]
    if extra:
        props.extend(extra)
    return props


# ---------------------------------------------------------------------------
# Observed entities: SceneScape fused tracks.
# ---------------------------------------------------------------------------

def entity_for_track(track: dict[str, Any], scene_id: str,
                     scene_name: str | None, stamp_iso: str | None) -> Entity:
    """A fused track's rest state. Basis OBSERVED, state ACTIVE.

    OBSERVED because SceneScape's tracker saw it. Nobody declared it, nobody
    authored it, and it was not derived from another model's output, so the
    other three basis values would each be a different and false claim.

    `layer` is FAST: the thing itself moves at detection rate even though this
    record is republished only on lifecycle change. The hint describes the
    entity's tempo, not this lane's.
    """
    pos = track.get("translation") or []
    has_pos = len(pos) >= 2
    return Entity(
        entity_id=entity_id_for_track(scene_id, str(track.get("id") or "")),
        basis=Basis.OBSERVED,
        type_uris=type_uris_for_class(str(track.get("category") or "")),
        layer=ModelLayer.FAST,
        frame_ref=frame_ref_for_scene(scene_id, scene_name),
        has_pose=has_pos,
        pose=_pose(pos),
        # No extent. SceneScape gives a `size` on the track, but an axis
        # aligned box built from it would assert an orientation the producer
        # never states. Absent beats over-claimed.
        has_extent=False,
        extent=_aabb_empty(),
        properties=_base_properties([
            KV(key="scenescape.track_id", value=str(track.get("id") or "")),
            KV(key="scenescape.reid_state",
               value=str(track.get("reid_state") or "")),
        ]),
        external_refs=[],
        content_refs=[],
        state=LifecycleState.ACTIVE,
        state_reason="",
        source_id=f"scenescape/controller/{scene_id}",
        stamp=parse_iso(stamp_iso),
    )


def retire_entity(retirement: dict[str, Any], scene_name: str | None,
                  stamp_iso: str | None) -> Entity:
    """The terminal sample for a track that has gone. State RETIRED.

    §2.14's removal discipline for a keyed instance: a final sample carrying
    the terminal state and a human-readable reason, then dispose. Phase 1
    already computed this reason and tagged it `typed_home: owm::Entity`
    because there was nowhere typed to put it; this is that home.

    RETIRED rather than UNOBSERVED. UNOBSERVED means the thing was here and
    nothing can currently see it, which is a claim about the world's contents.
    SceneScape tells us only that a track left its tracker after a retention
    window, which is a claim about the tracker. Asserting the stronger of the
    two from the weaker evidence is exactly the over-claim this adapter
    refuses elsewhere, so UNOBSERVED is left unexercised and said so.
    """
    scene_id = str(retirement.get("scene_id") or "")
    return Entity(
        entity_id=entity_id_for_track(scene_id,
                                      str(retirement.get("track_id") or "")),
        basis=Basis.OBSERVED,
        type_uris=[],
        layer=ModelLayer.FAST,
        frame_ref=frame_ref_for_scene(scene_id, scene_name),
        has_pose=False,
        pose=_pose([]),
        has_extent=False,
        extent=_aabb_empty(),
        properties=_base_properties(),
        external_refs=[],
        content_refs=[],
        state=LifecycleState.RETIRED,
        state_reason=str(retirement.get("state_reason") or ""),
        source_id=f"scenescape/controller/{scene_id}",
        stamp=parse_iso(stamp_iso),
    )


# ---------------------------------------------------------------------------
# Declared entities: SceneScape regions.
# ---------------------------------------------------------------------------

def entity_for_region(region_cfg: dict[str, Any], scene_id: str,
                      scene_name: str | None, stamp_iso: str | None) -> Entity:
    """A configured region. Basis DECLARED, state ACTIVE, extent + footprint.

    DECLARED because an operator drew it in scene configuration. It is a claim
    about intent, not an observation, and the module's basis field exists
    precisely so a consumer can tell the two apart.

    Tripwires are NOT given entities. A crossing line is not an area: 0.1 has
    no line shape and no footprint reference, and an axis-aligned box drawn
    around a line asserts an area the operator never drew. `CrossingLine`
    stays on the events lane where it is already correct.
    """
    pts = [[float(a), float(b)] for a, b in (region_cfg.get("points") or [])]
    height = float(region_cfg.get("height") or 0.0)
    uid = str(region_cfg.get("uid") or region_cfg.get("uuid") or "")
    return Entity(
        entity_id=entity_id_for_region(scene_id, uid),
        basis=Basis.DECLARED,
        type_uris=[],
        layer=ModelLayer.STATIC,
        frame_ref=frame_ref_for_scene(scene_id, scene_name),
        has_pose=False,
        pose=_pose([]),
        # The axis-aligned fallback the module names. The true polygon rides
        # on the SpatialZone this entity points at, which is why the box here
        # is a fallback rather than a loss.
        has_extent=bool(pts),
        extent=_aabb(pts, 0.0, height) if pts else _aabb_empty(),
        properties=_base_properties([
            footprint_kv(uid),
            KV(key="scenescape.region_name",
               value=str(region_cfg.get("name") or "")),
        ]),
        external_refs=[],
        content_refs=[],
        state=LifecycleState.ACTIVE,
        state_reason="",
        source_id=f"scenescape/scene/{scene_id}",
        stamp=parse_iso(stamp_iso),
    )


# ---------------------------------------------------------------------------

def _pose(pos: list[float]):
    from spatialdds18.spatial.core._core import PoseSE3
    if len(pos) >= 2:
        return PoseSE3(t=[float(pos[0]), float(pos[1]),
                          float(pos[2] if len(pos) > 2 else 0.0)],
                       q=[0.0, 0.0, 0.0, 1.0])
    return PoseSE3(t=[0.0, 0.0, 0.0], q=[0.0, 0.0, 0.0, 1.0])


def _aabb(pts: list[list[float]], z_min: float, z_max: float) -> Aabb3:
    xs = [p[0] for p in pts]
    ys = [p[1] for p in pts]
    return Aabb3(min_xyz=[min(xs), min(ys), z_min],
                 max_xyz=[max(xs), max(ys), z_max])


def _aabb_empty() -> Aabb3:
    return Aabb3(min_xyz=[0.0, 0.0, 0.0], max_xyz=[0.0, 0.0, 0.0])
