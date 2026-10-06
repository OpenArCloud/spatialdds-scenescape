"""SceneScape payloads -> SpatialDDS 1.8 types.

Pure functions, no I/O, so each can be replayed against the recorded corpus
without a bus. `sidecar/translate.py` is the membrane that wires these to MQTT
in and DDS out.

**The contract is the census**, `SpatialDDS-spec/directions/mapping-table-1.8.md`
(Revision 2). Row verdicts are cited inline rather than re-derived. A payload
field with no row is a stop-and-report, not an improvisation.

Two rules that shape everything here:

*Absent stays absent.* Where SceneScape carries nothing, the `has_*` gate stays
false and the field keeps its zero value. Nothing is invented, in particular
no covariance, anywhere: their payloads carry none (census §2,
`position_cov` / `velocity_cov` MISSING-theirs) and a fabricated covariance
would be worse than an absent one, because a consumer cannot tell them apart.

*Their scene frame is COMPOSED.* Where composition scope is expressible, the
scene-frame output is marked `COV_SCOPE_COMPOSED`: the controller has already
folded per-camera observation into a scene-frame estimate. Camera-frame
detections stay `COV_SCOPE_LOCAL`. That is the distinction Intel's own review
raised about their two stages (census §2, CovScope annotation).
"""
from __future__ import annotations

import calendar as _calendar
import datetime as _dt
import math
from typing import Any

from spatialdds18.builtin._types import Time
from spatialdds18.spatial.common._types import (
    CoordConvention, CovScope, FrameRef, KV, MetaKV, ScaleStatus, Vec2)
from spatialdds18.spatial.core._core import (
    Aabb3, BlobRef, CovMatrix, FrameTransform, GeoAnchor, GeoPose, PoseSE3)
from spatialdds18.spatial.semantics._semantics import (
    Detection2D, Detection2DSet, FusedTrack, FusedTrackSet)
from spatialdds18.spatial.events._events import (
    CrossingLine, SpatialEvent, SpatialZone)
from spatialdds18.spatial.events.enums.crossing_direction_enum._events import (
    CrossingDirection)
from spatialdds18.spatial.events.enums.event_state_enum._events import EventState
from spatialdds18.spatial.events.enums.event_type_enum._events import EventType
from spatialdds18.spatial.events.enums.severity_enum._events import Severity
from spatialdds18.spatial.events.enums.zone_kind_enum._events import ZoneKind

SCHEMA_VERSION = "spatial.semantics/1.8"

# No covariance is ever synthesized. COV_NONE is the honest discriminator and
# the one every absent-covariance field gets.
#
# A FUNCTION, not a shared constant. A single CovMatrix instance assigned to
# several fields (position_cov, velocity_cov, observer_cov) across many tracks
# fails to encode -- a union instance cannot be aliased, and the failure
# surfaces as "Failed to encode member position_cov" on a value that encodes
# perfectly well on its own. Each field gets its own.
def cov_absent() -> CovMatrix:
    """An explicitly-absent covariance union: COV_NONE, nothing invented.

    For `observer_cov` only. The measurement covariances on FusedTrack are a
    different shape -- see mat3x3_absent.
    """
    return CovMatrix(none=0)


def mat3x3_absent() -> list[float]:
    """An explicitly-absent 3x3 covariance: nine zeros behind a false gate.

    `FusedTrack.position_cov` and `velocity_cov` are **Mat3x3** (a fixed array
    of nine doubles), not the CovMatrix union -- only `observer_cov` is the
    union. Passing a CovMatrix for them fails to encode, which is how this was
    found: on real data, through the replay test, not at a publish.

    Worth carrying into the census notes: §2 records position_cov /
    velocity_cov as MISSING-theirs with the home existing since 1.7, and the
    home is specifically a 3x3 matrix. The zeros are never read because
    has_position_cov / has_velocity_cov stay false; they are padding, not a
    claim of zero uncertainty.
    """
    return [0.0] * 9


def parse_iso(ts: str | None) -> Time:
    """SceneScape stamps are ISO-8601 with a trailing Z.

    No float anywhere in the path, and that is the whole point of the
    function. The first version went through `datetime.timestamp()`, which
    returns a float64. Near 1.79e9 seconds a float64's resolution is about
    440 ns, so the fractional second cannot survive the trip:

        "2026-10-03T05:09:47.277Z"
        producer states   sec=1791004187  nanosec=277000000
        the old parser    sec=1791004187  nanosec=276999950

    Measured over the v2 corpus, 15,522 of 15,581 stamps came out wrong, a
    median of 59 ns and a maximum of 118 ns off, on every lane. Small, but it
    meant the published stamp was not the producer's stamp, which is the one
    thing a recording of someone else's system has to get right.

    Integer seconds come from `calendar.timegm`, which is UTC by definition.
    `time.mktime` would be the same call in local time and would be wrong by
    the machine's offset, silently and only for people not on UTC.
    Nanoseconds come from `microsecond * 1000`, exact for the millisecond
    stamps SceneScape emits and for anything else up to microsecond
    resolution.

    A stamp without a zone is read as UTC. SceneScape always sends `Z`; this
    says what happens if that ever changes rather than leaving it to
    `utctimetuple`'s default.
    """
    if not ts:
        return Time(sec=0, nanosec=0)
    s = ts.replace("Z", "+00:00")
    try:
        d = _dt.datetime.fromisoformat(s)
    except ValueError:
        return Time(sec=0, nanosec=0)
    if d.tzinfo is None:
        d = d.replace(tzinfo=_dt.timezone.utc)
    return Time(sec=_calendar.timegm(d.utctimetuple()),
                nanosec=d.microsecond * 1000)


def frame_ref_for_scene(scene_id: str, scene_name: str | None = None,
                        meters_per_unit: float | None = None,
                        scale_unknown: bool = False) -> FrameRef:
    """A scene is a frame (census §4, FrameRef GAP, derivable).

    Scale, corrected. The first version emitted `has_scale = False` together
    with `scale_status = SCALE_UNKNOWN`, which is self-contradictory under
    §2.13: absence already *means* metric, and the IDL says in terms that a
    producer which has not established scale "MUST set has_scale = true with
    scale_status = SCALE_UNKNOWN, absence is not the unknown state"
    (`idl/v1.8/types.idl:74-80`). Emitting both said "metric" and "unknown" at
    once. Now:

    * `meters_per_unit = None`, the scene frame is native metric, which
      SceneScape scenes are. Declared explicitly as `SCALE_DECLARED` with 1.0,
      which is the spec's SHOULD and removes the contradiction.
    * `meters_per_unit = s`, a scale recovered from their scene->earth
      similarity transform. `SCALE_DERIVED` is the status the IDL defines for
      exactly this: "recovered (e.g. from a legacy similarity transform)".
    * `scale_unknown = True`, georeferenced, but the map's pixel resolution
      was not available so metres-per-unit could not be recovered. This is the
      state the IDL insists be said out loud: `has_scale = true` with
      `SCALE_UNKNOWN`, never absence.

    `has_coord_convention` stays false. A scene frame is a local frame with an
    arbitrary yaw relative to north, so it is not ENU; the scene->ENU rotation
    is stated once, in `frame_transform`. §2.12's default-to-ENU rule is about
    axis semantics for geographically-defined frames and a consumer reading
    only this FrameRef would be misled, noted in the editorial queue.
    """
    derived = meters_per_unit is not None
    if scale_unknown:
        status, mpu = ScaleStatus.SCALE_UNKNOWN, 0.0
    elif derived:
        status, mpu = ScaleStatus.SCALE_DERIVED, float(meters_per_unit)
    else:
        status, mpu = ScaleStatus.SCALE_DECLARED, 1.0
    return FrameRef(
        uuid=scene_id,
        fqn=f"scenescape/scene/{scene_name or scene_id}",
        has_coord_convention=False,
        # Enum MEMBERS, not ints. A plain 0 encodes but deserializes back as
        # the enum member, so the round-trip compares unequal -- which is the
        # binding round-trip gate's whole point, caught here on real data.
        coord_convention=CoordConvention.ENU,
        has_scale=True,
        scale_status=status,
        meters_per_unit=mpu,
        display_unit="m",
    )


def _age_seconds(first_seen: str | None, now: str | None) -> float | None:
    """track_age_s = now - first_seen (census §2, PASS, needs the subtraction)."""
    if not first_seen or not now:
        return None
    a, b = parse_iso(first_seen), parse_iso(now)
    if a.sec == 0 or b.sec == 0:
        return None
    return max(0.0, (b.sec + b.nanosec / 1e9) - (a.sec + a.nanosec / 1e9))


def fused_track(obj: dict[str, Any], stamp_iso: str | None) -> FusedTrack:
    """One `regulated/scene` object -> FusedTrack. Census §2.

    PASS rows filled: track_id, confidence, position, velocity, track_age_s.
    GAP rows derived: source_operators and source_count from `visibility`,
    which is a per-camera map, not operator provenance, so the derivation is
    honest but the row stays a GAP in the census.
    MISSING-theirs left absent: position_cov, velocity_cov, source_modalities,
    observer_cov. No covariance invented.
    """
    vis = obj.get("visibility") or []
    operators = [str(v) for v in vis][:16]

    t = obj.get("translation") or [0.0, 0.0, 0.0]
    v = obj.get("velocity") or [0.0, 0.0, 0.0]
    age = _age_seconds(obj.get("first_seen"), stamp_iso)

    return FusedTrack(
        track_id=str(obj.get("id") or ""),
        # MISMATCH (census §5): their class lives in `category` in the payload
        # AND in the topic's thing_type segment. The payload value is used and
        # the topic segment is reconciled by the caller; neither is a
        # vocabulary, so this row stays a MISMATCH however it is filled.
        object_class=str(obj.get("category") or obj.get("type") or ""),
        confidence=float(obj.get("confidence") or 0.0),
        position=[float(t[0]), float(t[1]), float(t[2] if len(t) > 2 else 0.0)],
        has_position_cov=False,
        position_cov=mat3x3_absent(),
        # has_velocity gates the vector itself. SceneScape always carries a
        # velocity on regulated objects, so the gate is set from presence
        # rather than hardcoded -- an object without one must read as absent,
        # not as a zero vector that looks like "stationary".
        has_velocity=obj.get("velocity") is not None,
        velocity=[float(v[0]), float(v[1]), float(v[2] if len(v) > 2 else 0.0)],
        has_velocity_cov=False,
        velocity_cov=mat3x3_absent(),
        source_operators=operators,
        source_modalities=[],          # MISSING-theirs: single-modality by construction
        source_count=len(operators),   # GAP (derivable) from visibility keys
        track_age_s=age if age is not None else 0.0,
        has_observer_cov=False,        # MISSING-theirs: they publish a pose, not a distribution
        observer_cov=cov_absent(),
        has_observer_cov_scope=True,
        observer_cov_scope=CovScope.COV_SCOPE_COMPOSED,
    )


def fused_track_set(payload: dict[str, Any], scene_id: str,
                    seq: int) -> FusedTrackSet:
    """A whole `regulated/scene/<scene_id>` sample -> FusedTrackSet. Census §2.

    `seq` is supplied by the caller and counted locally: census §2 records
    `FusedTrackSet.seq` as MISSING-theirs because nothing on their wire carries
    a sequence number. A sidecar-minted counter is the honest reading of
    "absent on their side", it says what the sidecar observed, not what
    SceneScape asserted, and the census row does not improve.
    """
    stamp_iso = payload.get("timestamp")
    objs = payload.get("objects") or []
    return FusedTrackSet(
        stream_id=f"scenescape/{scene_id}",
        schema_version=SCHEMA_VERSION,
        frame_ref=frame_ref_for_scene(scene_id, payload.get("name")),
        tracks=[fused_track(o, stamp_iso) for o in objs][:256],
        stamp=parse_iso(stamp_iso),
        source_id=f"scenescape/controller/{scene_id}",
        seq=seq,
    )


# ---------------------------------------------------------------------------
# Bullet 2, the headline translation. Census §4.
#
# SceneScape computes a scene->WGS84 transform (`Scene.trs_xyz_to_lla`, built
# from `map_corners_lla` when `output_lla` is set) and, when enabled, applies
# it to every object as `lat_long_alt` + `heading`. It never publishes the
# transform itself. The census calls this the most actionable row in the
# document: geo-referencing is a publication problem, not a computation one.
#
# Two branches, because both are real deployments:
#
#   A. georeferenced  -> FrameRef + one latched FrameTransform (scene -> ENU)
#                        + one latched GeoAnchor.
#   B. no geography   -> FrameRef ONLY. No GeoAnchor, no earth-bound
#                        FrameTransform.
#
# Branch B is not an error path and not a degraded mode. A deployment with no
# surveyed geography is an ordinary case, and 1.8's frame-scale work (§2.13)
# exists precisely so an honestly local frame is publishable: absent scale
# means metric, so a local metric frame says everything true about itself and
# claims nothing it cannot support. Inventing a latitude to fill the field
# would be strictly worse than leaving it out, because a consumer cannot tell a
# fabricated anchor from a surveyed one, and 1.8 already declines to announce
# a map whose latitude is null, so the fabrication would also be publishing
# something the spec refuses to advertise.
# ---------------------------------------------------------------------------

EARTH_FIXED_FQN = "earth-fixed"


def _geo_available(scene_cfg: dict[str, Any]) -> bool:
    """Does this scene actually carry a georeference?

    Mirrors the controller's own guard: `trs_xyz_to_lla` is None unless
    `output_lla` is set AND map corners in lat/lon are present. Anything less
    is branch B.
    """
    if not scene_cfg.get("output_lla"):
        return False
    corners = (scene_cfg.get("map_corners_lla")
               or scene_cfg.get("map_corners")
               or scene_cfg.get("corners_lla"))
    return bool(corners)


# WGS84, for the local-tangent conversions the georeference needs.
_WGS84_A = 6378137.0
_WGS84_F = 1.0 / 298.257223563
_WGS84_E2 = _WGS84_F * (2 - _WGS84_F)


def _geodetic_radii(lat_deg: float) -> tuple[float, float]:
    """Prime-vertical and meridional radii at a latitude."""
    lat = math.radians(lat_deg)
    s2 = math.sin(lat) ** 2
    rn = _WGS84_A / math.sqrt(1 - _WGS84_E2 * s2)
    rm = _WGS84_A * (1 - _WGS84_E2) / (1 - _WGS84_E2 * s2) ** 1.5
    return rn, rm


def _lla_to_enu(lat: float, lon: float, lat0: float, lon0: float) -> tuple[float, float]:
    rn, rm = _geodetic_radii(lat0)
    e = math.radians(lon - lon0) * rn * math.cos(math.radians(lat0))
    n = math.radians(lat - lat0) * rm
    return e, n


def _enu_to_lla(e: float, n: float, lat0: float, lon0: float) -> tuple[float, float]:
    rn, rm = _geodetic_radii(lat0)
    return (lat0 + math.degrees(n / rm),
            lon0 + math.degrees(e / (rn * math.cos(math.radians(lat0)))))


def _ecef_to_lla(x: float, y: float, z: float) -> tuple[float, float, float]:
    """ECEF -> geodetic, iterated. Mirrors their `convertECEFToLLA`."""
    b = _WGS84_A * (1 - _WGS84_F)
    ep2 = (_WGS84_A * _WGS84_A - b * b) / (b * b)
    p = math.hypot(x, y)
    th = math.atan2(_WGS84_A * z, b * p)
    lon = math.atan2(y, x)
    lat = math.atan2(z + b * ep2 * math.sin(th) ** 3,
                     p - _WGS84_A * _WGS84_E2 * math.cos(th) ** 3)
    for _ in range(5):
        n = _WGS84_A / math.sqrt(1 - _WGS84_E2 * math.sin(lat) ** 2)
        lat = math.atan2(z + n * _WGS84_E2 * math.sin(lat), p)
    n = _WGS84_A / math.sqrt(1 - _WGS84_E2 * math.sin(lat) ** 2)
    return math.degrees(lat), math.degrees(lon), p / math.cos(lat) - n


def _enu_from_ecef_rot(lat_deg: float, lon_deg: float) -> list[list[float]]:
    """Rotation taking an ECEF vector into the local ENU frame."""
    la, lo = math.radians(lat_deg), math.radians(lon_deg)
    return [
        [-math.sin(lo), math.cos(lo), 0.0],
        [-math.sin(la) * math.cos(lo), -math.sin(la) * math.sin(lo), math.cos(la)],
        [math.cos(la) * math.cos(lo), math.cos(la) * math.sin(lo), math.sin(la)],
    ]


def _quat_from_matrix(r: list[list[float]]) -> list[float]:
    """Rotation matrix -> [x, y, z, w]. Shepperd's branch on the largest term.

    Built from the full 3x3 rather than a yaw angle so that a transform with
    any tilt in it survives. The corner-fit path can only recover yaw -- four
    points on a plane carry no more -- but their `trs_matrix` can carry tilt
    and discarding it silently would be the identity-quaternion mistake again,
    one level down.
    """
    tr = r[0][0] + r[1][1] + r[2][2]
    if tr > 0:
        s = math.sqrt(tr + 1.0) * 2
        return [(r[2][1] - r[1][2]) / s, (r[0][2] - r[2][0]) / s,
                (r[1][0] - r[0][1]) / s, 0.25 * s]
    if r[0][0] > r[1][1] and r[0][0] > r[2][2]:
        s = math.sqrt(1.0 + r[0][0] - r[1][1] - r[2][2]) * 2
        return [0.25 * s, (r[0][1] + r[1][0]) / s, (r[0][2] + r[2][0]) / s,
                (r[2][1] - r[1][2]) / s]
    if r[1][1] > r[2][2]:
        s = math.sqrt(1.0 + r[1][1] - r[0][0] - r[2][2]) * 2
        return [(r[0][1] + r[1][0]) / s, 0.25 * s, (r[1][2] + r[2][1]) / s,
                (r[0][2] - r[2][0]) / s]
    s = math.sqrt(1.0 + r[2][2] - r[0][0] - r[1][1]) * 2
    return [(r[0][2] + r[2][0]) / s, (r[1][2] + r[2][1]) / s, 0.25 * s,
            (r[1][0] - r[0][1]) / s]


def _georef_from_trs(trs: Any) -> dict[str, Any] | None:
    """Their own published `trs_matrix` -> anchor, orientation, scale.

    The preferred source, and the reason is not convenience: this is the exact
    matrix their controller applies to produce `lat_long_alt`, so consuming it
    makes agreement with their numbers true by construction instead of true by
    validation. It is served on `GET /api/v1/scene/<uid>` but **only when
    `output_lla` is true** (`manager/src/manager/serializers.py:623-632`), so
    its absence means "not georeferenced", not "not available".

    The matrix is scene -> **ECEF**, 4x4 row-major, and is a similarity:
    `cv2.estimateAffine3D(..., force_rotation=False)` composed with
    `scale * identity` (`scene_common/earth_lla.py:96-104`). Verified on this
    deployment -- all three column norms agreed to six decimal places.
    """
    try:
        m = [[float(trs[r][c]) for c in range(3)] for r in range(3)]
        tv = [float(trs[r][3]) for r in range(3)]
    except (TypeError, ValueError, IndexError):
        return None
    norms = [math.sqrt(sum(m[r][c] ** 2 for r in range(3))) for c in range(3)]
    if min(norms) <= 0.0:
        return None
    scale = sum(norms) / 3.0
    # A similarity has one scale. If the columns disagree materially the
    # producer's transform is NOT a similarity and a single meters_per_unit
    # would misstate it -- say so rather than averaging it away.
    anisotropy = (max(norms) - min(norms)) / scale
    lat, lon, alt = _ecef_to_lla(*tv)
    rot = [[m[r][c] / scale for c in range(3)] for r in range(3)]
    enu = _enu_from_ecef_rot(lat, lon)
    local = [[sum(enu[i][k] * rot[k][j] for k in range(3)) for j in range(3)]
             for i in range(3)]
    return {
        "lat": lat, "lon": lon, "alt": alt,
        "quat": _quat_from_matrix(local),
        "yaw_rad": math.atan2(local[1][0], local[0][0]),
        "scale": scale, "corner_residual_m": None,
        "scale_unknown": False,
        "anisotropy": anisotropy,
        "source": "trs_matrix",
    }


def _similarity_2d(src: list[tuple[float, float]],
                   dst: list[tuple[float, float]]) -> tuple[float, float, float, float, float]:
    """Least-squares 2D similarity src -> dst: (yaw_rad, scale, tx, ty, max_resid).

    Closed-form Umeyama in two dimensions. Rotation plus ONE uniform scale is
    not a simplification chosen for convenience: it is exactly what SceneScape
    computes. Their `convertToCartesianTRS` calls
    `cv2.estimateAffine3D(..., force_rotation=False)` and then composes the
    result with `scale * identity` (`scene_common/earth_lla.py:96-104`), i.e. a
    similarity. Fitting anything richer would model detail their own transform
    discards, and fitting less loses metres, see the errata note.
    """
    n = len(src)
    sx = sum(p[0] for p in src) / n
    sy = sum(p[1] for p in src) / n
    dx = sum(q[0] for q in dst) / n
    dy = sum(q[1] for q in dst) / n
    a = b = den = 0.0
    for (px, py), (qx, qy) in zip(src, dst):
        ux, uy = px - sx, py - sy
        vx, vy = qx - dx, qy - dy
        a += ux * vx + uy * vy
        b += ux * vy - uy * vx
        den += ux * ux + uy * uy
    theta = math.atan2(b, a)
    scale = math.hypot(a, b) / den if den else 1.0
    ct, st = math.cos(theta), math.sin(theta)
    tx = dx - scale * (ct * sx - st * sy)
    ty = dy - scale * (st * sx + ct * sy)
    resid = 0.0
    for (px, py), (qx, qy) in zip(src, dst):
        ex = scale * (ct * px - st * py) + tx - qx
        ey = scale * (st * px + ct * py) + ty - qy
        resid = max(resid, math.hypot(ex, ey))
    return theta, scale, tx, ty, resid


def _map_extents_m(scene_cfg: dict[str, Any]) -> tuple[float, float] | None:
    """Scene map extents in metres: pixels / scale, as their own code does.

    `extractMeshFromImage` sets `xdim = map_resx / scale`, `ydim = map_resy /
    scale` (`scene_common/mesh_util.py:249-252`), and
    `getMeshAxisAlignedProjectionToXY` then pairs the map corners with
    `(0,0), (xdim,0), (xdim,ydim), (0,ydim)`, CCW from the minimum corner
    (`:294-297`).

    **The pixel resolution is not in their scene REST payload.** It has to be
    supplied, which is why reading their published `trs_matrix` is the better
    path when it is available. Carried here as `map_resolution` so a caller can
    provide what the API does not.
    """
    res = (scene_cfg.get("map_resolution") or scene_cfg.get("map_resolution_px")
           or scene_cfg.get("resolution"))
    scale = scene_cfg.get("scale")
    if not res or not scale:
        return None
    try:
        w, h = float(res[0]), float(res[1])
        s = float(scale)
        if s <= 0 or w <= 0 or h <= 0:
            return None
        return w / s, h / s
    except (TypeError, ValueError, IndexError):
        return None


def _georef(scene_cfg: dict[str, Any]) -> dict[str, Any] | None:
    """The scene->earth similarity, or None when it cannot be established.

    Returns the anchor at the **scene frame's origin** -- mesh (0,0), their
    minimum map corner -- not the centroid of the corners. The first version
    anchored at the centroid while still claiming an identity pose, which
    placed every track half a map away; on their own functional-test fixture
    that was 4.8 m of error against their published expected point.
    """
    # Their own transform first: agreement by construction beats agreement by
    # validation. Falls through to the corner fit when it is not served.
    trs = scene_cfg.get("trs_matrix")
    if trs:
        from_trs = _georef_from_trs(trs)
        if from_trs is not None:
            return from_trs

    corners = (scene_cfg.get("map_corners_lla") or scene_cfg.get("map_corners")
               or scene_cfg.get("corners_lla"))
    if not corners:
        return None
    pts = [c for c in corners if isinstance(c, (list, tuple)) and len(c) >= 2]
    if len(pts) < 3:
        return None
    lat0_c = sum(float(c[0]) for c in pts) / len(pts)
    lon0_c = sum(float(c[1]) for c in pts) / len(pts)
    extents = _map_extents_m(scene_cfg)
    if extents is None:
        # No pixel resolution, so the metres-per-scene-unit cannot be
        # recovered -- but the geography still can, and discarding it would
        # throw away more than the gap costs. Their corner convention pins
        # both of the things that do not need extents: corner 0 IS mesh
        # (0,0), the scene origin, and corner 0 -> corner 1 IS the scene's +x
        # axis on the ground. So the anchor and the yaw are exact; only the
        # scale is unknown, and it is reported as unknown rather than assumed
        # to be 1.0. Falling back to branch B here would be the worse lie.
        e1, n1 = _lla_to_enu(float(pts[1][0]), float(pts[1][1]),
                             float(pts[0][0]), float(pts[0][1]))
        return {
            "lat": float(pts[0][0]), "lon": float(pts[0][1]),
            "alt": (float(pts[0][2]) if len(pts[0]) >= 3 else 0.0),
            "yaw_rad": math.atan2(n1, e1),
            "quat": _yaw_quat(math.atan2(n1, e1)),
            "scale": None, "corner_residual_m": None,
            "scale_unknown": True,
            "anisotropy": None,
            "source": "corners-no-resolution",
        }
    xdim, ydim = extents
    mesh = [(0.0, 0.0), (xdim, 0.0), (xdim, ydim), (0.0, ydim)][:len(pts)]

    lat0 = sum(float(c[0]) for c in pts) / len(pts)
    lon0 = sum(float(c[1]) for c in pts) / len(pts)
    alt = (sum(float(c[2]) for c in pts) / len(pts)
           if all(len(c) >= 3 for c in pts) else 0.0)
    enu = [_lla_to_enu(float(c[0]), float(c[1]), lat0, lon0) for c in pts]

    theta, scale, tx, ty, resid = _similarity_2d(mesh, enu)
    # Scene origin: the similarity applied to (0,0) is the translation itself.
    olat, olon = _enu_to_lla(tx, ty, lat0, lon0)
    return {
        "lat": olat, "lon": olon, "alt": alt,
        "yaw_rad": theta, "quat": _yaw_quat(theta),
        "scale": scale, "corner_residual_m": resid,
        "scale_unknown": False,
        "anisotropy": None,
        "source": "corners",
    }


def _yaw_quat(theta: float) -> list[float]:
    """Rotation about up, as [x, y, z, w]."""
    return [0.0, 0.0, math.sin(theta / 2.0), math.cos(theta / 2.0)]


def _corner_centroid(corners: Any) -> tuple[float, float, float] | None:
    """Scene origin in lat/lon/alt, as the centroid of the map corners.

    Their corners are a list of [lat, lon] or [lat, lon, alt]. The centroid is
    a defensible origin for the scene frame and is what the anchor's GeoPose
    reports; the per-corner detail stays in their config, which is where it is
    authoritative.
    """
    try:
        pts = [c for c in corners if isinstance(c, (list, tuple)) and len(c) >= 2]
        if not pts:
            return None
        lat = sum(float(c[0]) for c in pts) / len(pts)
        lon = sum(float(c[1]) for c in pts) / len(pts)
        alt = (sum(float(c[2]) for c in pts) / len(pts)
               if all(len(c) >= 3 for c in pts) else 0.0)
        return lat, lon, alt
    except (TypeError, ValueError, IndexError):
        return None


def geo_anchor(scene_cfg: dict[str, Any], scene_id: str,
               stamp_iso: str | None = None) -> GeoAnchor | None:
    """Scene georeference -> GeoAnchor. None on branch B. Census §4.

    `cov` is COV_NONE: 1.8 added optional positional covariance on the anchor
    (`core.idl:300`) and SceneScape asserts no uncertainty on its scene->LLA
    transform, so the field stays absent, census §4, MISSING-theirs.
    """
    if not _geo_available(scene_cfg):
        return None
    geo = _georef(scene_cfg)
    if geo is None:
        return None
    lat, lon, alt = geo["lat"], geo["lon"], geo["alt"]
    return GeoAnchor(
        anchor_id=f"scenescape/scene/{scene_id}",
        map_id=str(scene_cfg.get("map") or scene_id),
        frame_ref=frame_ref_for_scene(scene_id, scene_cfg.get("name"),
                                      meters_per_unit=geo["scale"],
                                      scale_unknown=geo.get("scale_unknown", False)),
        geopose=GeoPose(
            lat_deg=lat, lon_deg=lon, alt_m=alt,
            # The scene frame's yaw relative to the local tangent frame, from
            # the correspondence between their map-corner ordering and the
            # lat/lon they carry. The first version put identity here with a
            # comment that SceneScape "states" no rotation. It does state one:
            # the corner ORDER is the statement -- corner 0 is mesh (0,0) and
            # corner 1 is mesh (xdim,0), so corner0->corner1 is the scene's +x
            # axis on the ground. On their own test fixture that axis points
            # due north, a 90 deg rotation, and ignoring it cost 4.8 m against
            # their published expected point. Deriving it is not a guess;
            # discarding it was the error.
            q=geo["quat"],
            stamp=parse_iso(stamp_iso),
            cov=cov_absent(),
        ),
        # Their georeference comes from map corners a human entered, so it is a
        # declared placement, not a survey or a GNSS fix. "Surveyed" would
        # overclaim; the spec's examples admit a free string here.
        method="SceneConfigCorners",
        confidence=0.0,
        checksum="",
        cov=cov_absent(),
    )


def frame_transform(scene_cfg: dict[str, Any], scene_id: str,
                    stamp_iso: str | None = None) -> FrameTransform | None:
    """Scene -> earth-fixed transform. None on branch B. Census §4.

    This is the row the census calls most actionable: the transform exists in
    their code and is published in no form. Here it becomes one latched sample.

    The parent frame is ENU *at the anchor*, so the translation is zero and the
    rotation is the scene's yaw. This is the single authoritative statement of
    the rotation; the anchor's GeoPose repeats it because a GeoPose must carry
    an orientation, and the two are built from one fit so they cannot drift
    apart. The geography stays in the anchor, the axes stay here.

    The uniform scale does NOT fit in `T_parent_child`: `PoseSE3` is rigid, and
    SceneScape's scene->earth transform is a similarity. 1.8 has the right
    place for it -- `meters_per_unit` on the child FrameRef with
    `SCALE_DERIVED`, whose IDL comment names this very case. So the similarity
    is expressible, but split across two fields rather than one matrix, which
    is worth saying out loud to a consumer author.
    """
    if not _geo_available(scene_cfg):
        return None
    geo = _georef(scene_cfg)
    if geo is None:
        return None
    anchor = geo_anchor(scene_cfg, scene_id, stamp_iso)
    if anchor is None:
        return None
    g = anchor.geopose
    parent = FrameRef(
        uuid="",
        fqn=f"{EARTH_FIXED_FQN}/ENU@{g.lat_deg:.7f},{g.lon_deg:.7f},{g.alt_m:.2f}",
        has_coord_convention=True,
        coord_convention=CoordConvention.ENU,
        # The local tangent frame is native metric, declared rather than left
        # to the absence rule so nothing reads as "unknown".
        has_scale=True,
        scale_status=ScaleStatus.SCALE_DECLARED,
        meters_per_unit=1.0,
        display_unit="m",
    )
    return FrameTransform(
        transform_id=f"scenescape/{scene_id}->ENU",
        parent_ref=parent,
        child_ref=frame_ref_for_scene(scene_id, scene_cfg.get("name"),
                                      meters_per_unit=geo["scale"],
                                      scale_unknown=geo.get("scale_unknown", False)),
        T_parent_child=PoseSE3(t=[0.0, 0.0, 0.0], q=geo["quat"]),
        stamp=parse_iso(stamp_iso),
        cov=cov_absent(),
    )


def geo_for_scene(scene_cfg: dict[str, Any], scene_id: str,
                  stamp_iso: str | None = None) -> dict[str, Any]:
    """Everything bullet 2 emits for one scene, and what branch it took.

    Returned rather than published so the replay test can assert the branch
    without a bus.
    """
    ft = frame_transform(scene_cfg, scene_id, stamp_iso)
    ga = geo_anchor(scene_cfg, scene_id, stamp_iso)
    return {
        "branch": "A-georeferenced" if ga is not None else "B-local-only",
        "frame_ref": frame_ref_for_scene(scene_id, scene_cfg.get("name")),
        "frame_transform": ft,
        "geo_anchor": ga,
    }


# ---------------------------------------------------------------------------
# Bullet 3, camera detections, and the observer position that is not there.
# Census §3, §7.
# ---------------------------------------------------------------------------

def detection2d_set(payload: dict[str, Any], camera_id: str) -> Detection2DSet:
    """`data/camera/<camera_id>` -> Detection2DSet. Census §3, 2D bbox PASS.

    Their camera payload is **2D only**: each detection carries
    `bounding_box_px {x, y, width, height}`, a `category`, a `confidence` and a
    frame-local integer `id`. The schema requires only `bounding_box_px`
    (`tracker/schema/camera-data.schema.json`, `detection.required`).

    Two shape details worth knowing, neither recorded in the census before:

    *`objects` is a dict keyed by category here*, not a list, `{"person":
    [...]}`, whereas `regulated/scene` carries a list. A translator that
    assumes one shape across both topics breaks on the other.

    *`id` is frame-local and explicitly not persistent* ("Frame-local detection
    ID (not persistent across frames)"), so it is NOT a track id. It is
    namespaced per camera and stamp here rather than passed through, because a
    consumer seeing a bare `1` would reasonably read it as an identity.
    """
    stamp_iso = payload.get("timestamp")
    stamp = parse_iso(stamp_iso)
    objs = payload.get("objects") or {}

    dets: list[Detection2D] = []
    # Accept both shapes: the dict-keyed-by-category form this deployment
    # emits, and a plain list, so the mapping does not depend on which.
    groups = objs.items() if isinstance(objs, dict) else [(None, objs)]
    for category, items in groups:
        for d in items or []:
            bb = d.get("bounding_box_px") or {}
            x = float(bb.get("x", 0.0))
            y = float(bb.get("y", 0.0))
            w = float(bb.get("width", 0.0))
            h = float(bb.get("height", 0.0))
            dets.append(Detection2D(
                det_id=f"{camera_id}/{stamp.sec}.{stamp.nanosec}/{d.get('id')}",
                node_id="",
                camera_id=camera_id,
                # §5 MISMATCH stands: the payload `category` is used, and the
                # topic's thing_type segment is reconciled by the caller.
                # Neither is a vocabulary.
                class_id=str(d.get("category") or category or ""),
                score=float(d.get("confidence") or 0.0),
                # BBox2D is [x, y, w, h] in pixels, per §2.10's ordering rule.
                bbox=[x, y, w, h],
                has_mask=False,
                mask_blob_id="",
                stamp=stamp,
                source_id=f"scenescape/camera/{camera_id}",
            ))

    return Detection2DSet(
        set_id=f"{camera_id}/{stamp.sec}.{stamp.nanosec}",
        node_id="",
        camera_id=camera_id,
        dets=dets[:256],
        stamp=stamp,
        source_id=f"scenescape/camera/{camera_id}",
    )


def observer_position_from_pose(pose_payload: dict[str, Any]) -> list[float] | None:
    """`autocalibration/camera/pose/<camera_id>` -> Detection3D.observer_position.

    **Not exercisable at pin 2026.1.0.** Implemented so a deployment that does
    publish camera pose is served, and so the shape of the claim is on the
    record, but see the census correction in NOTES: at this pin the topic is
    declared and unimplemented. `DATA_AUTOCALIB_CAM_POSE` appears in the topic
    table (`scene_common/.../mqtt.py:54`), an ACL config, the API-docs enum and
    a Django migration's choices list, and **nowhere as a publisher**. There is
    no schema for its payload among the repo's six schemas, the controller does
    not consume it, and 420 s of recording across two corpora produced nothing.

    So this function cannot be validated against their documented schema,
    because there is no documented schema. It accepts the shapes a camera pose
    plausibly takes and returns None rather than guessing when it recognises
    none of them. A sidecar that cannot read a pose publishes no observer
    position; it does not invent one.

    `observer_cov` stays absent regardless: a pose is not a distribution over
    a pose (census §3, observer_cov MISSING-theirs).
    """
    if not isinstance(pose_payload, dict):
        return None
    for key in ("translation", "position", "camera_position", "t"):
        v = pose_payload.get(key)
        if isinstance(v, (list, tuple)) and len(v) >= 3:
            try:
                return [float(v[0]), float(v[1]), float(v[2])]
            except (TypeError, ValueError):
                return None
    pose = pose_payload.get("pose")
    if isinstance(pose, dict):
        return observer_position_from_pose(pose)
    return None


# ---------------------------------------------------------------------------
# Bullets 4 and 5, where the 1.8 Batch 3 types land on real traffic.
# Census §6.
# ---------------------------------------------------------------------------

EVENTS_SCHEMA = "spatial.events/1.8"


def _xy(p: Any) -> tuple[float, float]:
    """(x, y) from either a bare pair or a `Vec2` struct.

    Both shapes are live: the geometry helpers work on bare pairs because
    winding and area are arithmetic, while anything read back off a published
    `SpatialZone` or `CrossingLine` carries `Vec2` structs since spec commit
    a240ae7. Accepting both here means a caller checking a *published* ring --
    the bullet-4 gate does exactly that -- does not need to know which it has.
    """
    if isinstance(p, (list, tuple)):
        return float(p[0]), float(p[1])
    return float(p.x), float(p.y)


def _signed_area(ring: list[Any]) -> float:
    """Twice the signed area. Positive is counter-clockwise.

    Takes bare pairs or `Vec2` structs; see `_xy`.
    """
    pts = [_xy(p) for p in ring]
    s = 0.0
    for (x1, y1), (x2, y2) in zip(pts, pts[1:] + pts[:1]):
        s += x1 * y2 - x2 * y1
    return s


def _vec2(pts: list[list[float]]) -> list[Vec2]:
    """Plain (x, y) pairs -> `Vec2` structs, at the point of construction.

    `common::Vec2` became `@extensibility(FINAL) struct Vec2 {double x; double y;}`
    in spec commit a240ae7, replacing `typedef double Vec2[2]`. The geometry
    helpers below keep working on bare pairs -- winding, signed area and
    bounding boxes are arithmetic and gain nothing from the struct -- so the
    conversion happens here, once, where a ring or a path is handed to a
    1.8 type.

    The change is wire-compatible by construction: a FINAL struct of two
    doubles encodes identically to `double[2]`, so every `SpatialZone` and
    `CrossingLine` this adapter has already published remains byte-for-byte
    what it was. That is asserted, not assumed -- the MCAP content digests are
    unchanged across the regeneration.
    """
    return [Vec2(x=float(a), y=float(b)) for a, b in pts]


def _as_ccw(ring: list[list[float]]) -> list[list[float]]:
    """Return the ring counter-clockwise, reversing if needed.

    1.8 requires the polygon ring CCW (`idl/v1.8/events.idl:149`). SceneScape's
    UI and REST accept either winding, so the orientation is **checked and
    corrected**, not assumed. Publishing a clockwise ring would satisfy the
    field and violate the stated convention, which is the kind of error no
    validator catches and every consumer inherits.
    """
    return ring if _signed_area(ring) >= 0 else list(reversed(ring))


def _aabb(pts: list[list[float]], z_min: float, z_max: float) -> Aabb3:
    """Axis-aligned box enclosing the points.

    `Aabb3` is a STRUCT of two Vec3 (`min_xyz`, `max_xyz`) -- not the flat
    six-element `Aabb3D` typedef, which is a different type with a confusingly
    similar name. Passing a flat list fails to encode.
    """
    xs = [p[0] for p in pts]
    ys = [p[1] for p in pts]
    return Aabb3(min_xyz=[min(xs), min(ys), z_min],
                 max_xyz=[max(xs), max(ys), z_max])


def _aabb_empty() -> Aabb3:
    return Aabb3(min_xyz=[0.0, 0.0, 0.0], max_xyz=[0.0, 0.0, 0.0])


def _blob_absent() -> BlobRef:
    """An explicitly-absent blob reference. `None` is not encodable."""
    return BlobRef(blob_id="", role="", checksum="")


def spatial_zone(region_cfg: dict[str, Any], scene_id: str,
                 scene_name: str | None = None,
                 stamp_iso: str | None = None) -> SpatialZone:
    """A SceneScape region -> SpatialZone with a polygon ring. Census §6.

    **This is the flip.** S.3 scored region geometry MISMATCH-structural because
    `Aabb3` cannot hold an arbitrary polygon: the bounding box of a region
    either over-claims ground the venue did not forbid, or under-claims it.
    1.8's polygon ring (`events.idl:153-156`) holds their point list exactly.

    `bounds` is still populated, and that is normative rather than belt-and-
    braces: when `has_polygon` is true, `bounds` MUST carry the polygon's
    axis-aligned bounding box so a box-only consumer degrades gracefully
    (`events.idl:145-148`). So the box is published *and* demoted, present for
    coarse filtering, never the containment test.

    `kind` is RESTRICTED when the region's name reads like a keep-out and
    MONITORING otherwise. SceneScape has no zone-kind concept, so this is a
    derivation from the operator's own naming and the census row stays a GAP, it is not promoted by being filled plausibly.
    """
    pts = [[float(a), float(b)] for a, b in (region_cfg.get("points") or [])]
    height = float(region_cfg.get("height") or 0.0)
    z_min, z_max = 0.0, height
    ring = _as_ccw(pts)
    name = str(region_cfg.get("name") or region_cfg.get("title") or "")

    lowered = name.lower()
    kind = (ZoneKind.RESTRICTED
            if any(w in lowered for w in ("keep-out", "keep out", "restricted",
                                          "hazard", "no-entry", "no entry"))
            else ZoneKind.MONITORING)

    return SpatialZone(
        zone_id=str(region_cfg.get("uid") or region_cfg.get("uuid") or ""),
        name=name,
        kind=kind,
        frame_ref=frame_ref_for_scene(scene_id, scene_name),
        has_bounds=bool(ring),
        bounds=_aabb(ring, z_min, z_max) if ring else _aabb_empty(),
        has_geopose=False,          # GAP (derivable) via their transform; see §4
        geopose=GeoPose(lat_deg=0.0, lon_deg=0.0, alt_m=0.0,
                        q=[0.0, 0.0, 0.0, 1.0],
                        stamp=parse_iso(stamp_iso), cov=cov_absent()),
        has_speed_limit_mps=False, speed_limit_mps=0.0,
        has_capacity=False, capacity=0,
        # Their region carries no dwell LIMIT -- `dwell` in their payload is a
        # measurement, not a threshold. Conflating the two would turn an
        # observation into a rule.
        has_dwell_limit_sec=False, dwell_limit_sec=0.0,
        class_filter=[],
        has_schedule=False, schedule="",
        provider_id=f"scenescape/scene/{scene_id}",
        stamp=parse_iso(stamp_iso),
        attributes=[],
        schema_version=EVENTS_SCHEMA,
        has_polygon=bool(ring),
        polygon=_vec2(ring),
        z_min=z_min,
        z_max=z_max,
    )


def crossing_line(tripwire_cfg: dict[str, Any], scene_id: str,
                  scene_name: str | None = None,
                  stamp_iso: str | None = None) -> CrossingLine:
    """A SceneScape tripwire -> CrossingLine. Census §6, the residual closed.

    Their tripwires are **open polylines** and S.3 recorded them as the part of
    the polygon win that the polygon could not absorb: a closed ring cannot
    represent an unclosed path, and degenerating one into a sliver is the
    over/under-claiming the polygon work removed. `CrossingLine`
    (`events.idl:189`) is the type for it.

    **Vertex order is preserved exactly**, never normalised or reversed. Under
    §2.16 the sides derive from the published order, LEFT is the half-plane
    toward the normal `(-dy, dx)`, so reversing the path would silently invert
    the meaning of every crossing direction ever reported against this line.
    That is the opposite of the polygon rule above, where the winding must be
    corrected; here it must be left alone. The two look similar and are not.
    """
    pts = [[float(a), float(b)] for a, b in (tripwire_cfg.get("points") or [])]
    height = float(tripwire_cfg.get("height") or 0.0)
    return CrossingLine(
        line_id=str(tripwire_cfg.get("uid") or tripwire_cfg.get("uuid") or ""),
        name=str(tripwire_cfg.get("name") or tripwire_cfg.get("title") or ""),
        frame_ref=frame_ref_for_scene(scene_id, scene_name),
        path=_vec2(pts),
        has_vertical_band=height > 0.0,
        z_min=0.0,
        z_max=height,
        has_bounds=bool(pts),
        bounds=_aabb(pts, 0.0, height) if pts else _aabb_empty(),
        class_filter=[],
        provider_id=f"scenescape/scene/{scene_id}",
        stamp=parse_iso(stamp_iso),
        attributes=[],
        schema_version=EVENTS_SCHEMA,
    )


def _event_trigger(entered: list, exited: list,
                   objects: list) -> tuple[dict | None, float | None]:
    """The object that triggered an event, and its dwell if the event states one.

    Their two lists are shaped differently:

        entered: [ {id, category, translation, confidence...}... ]
        exited:  [ {"dwell": <seconds>, "object": {id, category...}}... ]

    So an exit's object is one level down and its dwell is a sibling of it.
    Returning both together keeps the asymmetry in one place instead of
    letting it leak into every field accessor.
    """
    if entered:
        first = entered[0]
        return (first if isinstance(first, dict) else None), None
    if exited:
        first = exited[0]
        if isinstance(first, dict) and isinstance(first.get("object"), dict):
            d = first.get("dwell")
            try:
                dwell = float(d) if d is not None else None
            except (TypeError, ValueError):
                dwell = None
            return first["object"], dwell
        return (first if isinstance(first, dict) else None), None
    if objects:
        first = objects[0]
        return (first if isinstance(first, dict) else None), None
    return None, None


def spatial_event(topic: str, payload: dict[str, Any],
                  dwell_s: float | None = None) -> SpatialEvent | None:
    """A region or tripwire event -> SpatialEvent. Census §6.

    Their topic is `event/<region_type>/<scene>/<region>/<event_type>`, so the
    classification lives in the topic rather than the payload -- the §5
    MISMATCH, here reconciled by parsing the topic and putting the result in a
    typed field.

    `entered` / `exited` decide the type: a sample with arrivals is a
    ZONE_ENTRY, one with only departures a ZONE_EXIT. A `count` sample carries
    occupancy and no transition, so it becomes an occupancy report rather than
    being forced into a transition type it does not describe.

    `measured_dwell_sec` comes from the **event itself**, corrected. An earlier
    version took it from the `data/region` stream's per-object
    `regions[<uid>].dwell` and had the caller pass it in. That was the wrong
    source twice over: the region stream's dwell is a *running* value that
    starts at 0.0 and grows while the object is inside, so it answers "how long
    so far", whereas an exit event wants the final figure -- and the exit event
    already carries exactly that, on itself. The caller parameter is kept for
    callers that still supply one, but the payload wins when present.

    **The shapes of `entered` and `exited` differ, and that cost four fields.**
    `entered` holds bare object dicts. `exited` holds `{"dwell", "object"}`
    wrappers. Reading `exited[0]` as an object therefore found no `id`, no
    `translation`, no `category` and no `confidence`, so every ZONE_EXIT lost
    its position, track id, class and confidence as well as its dwell -- 40 of
    the 80 events in corpus v2. Normalised by `_event_trigger` below.
    """
    segs = topic.split("/")
    if len(segs) < 6:
        return None
    region_type, scene_id, region_id, event_kind = segs[2], segs[3], segs[4], segs[5]

    entered = payload.get("entered") or []
    exited = payload.get("exited") or []
    counts = payload.get("counts") or {}
    occupancy = sum(int(v) for v in counts.values()) if counts else 0

    if event_kind == "count" and not entered and not exited:
        etype, severity = EventType.OTHER, Severity.INFO
    elif entered:
        etype, severity = EventType.ZONE_ENTRY, Severity.INFO
    elif exited:
        etype, severity = EventType.ZONE_EXIT, Severity.INFO
    else:
        etype, severity = EventType.OTHER, Severity.INFO

    trigger, payload_dwell = _event_trigger(entered, exited,
                                            payload.get("objects") or [])
    if payload_dwell is not None:
        dwell_s = payload_dwell
    stamp_iso = payload.get("timestamp")
    stamp = parse_iso(stamp_iso)

    pos = (trigger or {}).get("translation") if isinstance(trigger, dict) else None
    is_tripwire = region_type == "tripwire"

    return SpatialEvent(
        event_id=f"scenescape/{scene_id}/{region_id}/{event_kind}/{stamp.sec}.{stamp.nanosec}",
        # LINE_CROSS already existed in the enum; a tripwire event is that.
        type=EventType.LINE_CROSS if is_tripwire else etype,
        severity=severity,
        state=EventState.ACTIVE,
        # A crossing line is not a zone, so its id does NOT go in zone_id --
        # that is why crossing_line_id exists as its own field.
        has_zone_id=not is_tripwire,
        zone_id="" if is_tripwire else region_id,
        has_position=bool(pos and len(pos) >= 2),
        position=[float(pos[0]), float(pos[1]),
                  float(pos[2] if len(pos) > 2 else 0.0)] if pos and len(pos) >= 2
                 else [0.0, 0.0, 0.0],
        frame_ref=frame_ref_for_scene(scene_id, payload.get("scene_name")),
        has_trigger_det_id=False, trigger_det_id="",
        has_trigger_track_id=bool(trigger and isinstance(trigger, dict)
                                  and trigger.get("id")),
        trigger_track_id=str(trigger.get("id")) if isinstance(trigger, dict)
                         and trigger.get("id") else "",
        trigger_class_id=str(trigger.get("category")) if isinstance(trigger, dict)
                         and trigger.get("category") else "",
        has_secondary_det_id=False, secondary_det_id="",
        has_measured_speed_mps=False, measured_speed_mps=0.0,
        has_measured_dwell_sec=dwell_s is not None,
        measured_dwell_sec=float(dwell_s) if dwell_s is not None else 0.0,
        has_measured_distance_m=False, measured_distance_m=0.0,
        has_zone_occupancy=bool(counts),
        zone_occupancy=occupancy,
        confidence=float(trigger.get("confidence")) if isinstance(trigger, dict)
                   and trigger.get("confidence") is not None else 0.0,
        has_evidence=False, evidence=_blob_absent(),
        has_description=False, description="",
        event_start=stamp,
        stamp=stamp,
        source_id=f"scenescape/controller/{scene_id}",
        attributes=[],
        schema_version=EVENTS_SCHEMA,
        participant_ids=[],
        has_crossing_line_id=is_tripwire,
        crossing_line_id=region_id if is_tripwire else "",
        # Their tripwire event payload carries a direction we have never
        # observed (no tripwire event has ever fired on this deployment -- see
        # NOTES). CROSSING_UNKNOWN is the honest fill under §2.16: it means
        # "a crossing was seen, direction unresolved", which is exactly our
        # state, and is distinct from leaving has_crossing false, which would
        # mean we said nothing about crossing at all.
        has_crossing=is_tripwire,
        crossing_direction=CrossingDirection.CROSSING_UNKNOWN,
    )


def dwell_by_object(region_payload: dict[str, Any]) -> dict[tuple[str, str], float]:
    """`data/region` -> {(object_id, region_uid): dwell_seconds}.

    Their dwell measurement rides on the per-object `regions` map in the
    data/region stream, keyed by region uid. Census §6 scored region dwell GAP
    on the grounds that 1.7 had no field; erratum 2 corrected that --
    `measured_dwell_sec` has existed since 1.7 -- so this row is a PASS and the
    only work is finding where the number lives.
    """
    out: dict[tuple[str, str], float] = {}
    for o in region_payload.get("objects") or []:
        oid = str(o.get("id") or "")
        for ruid, info in (o.get("regions") or {}).items():
            if isinstance(info, dict) and info.get("dwell") is not None:
                try:
                    out[(oid, str(ruid))] = float(info["dwell"])
                except (TypeError, ValueError):
                    pass
    return out


# ---------------------------------------------------------------------------
# Bullet 6, keypoints. Census §3, and a correction to it.
# ---------------------------------------------------------------------------
#
# The brief expected a field-for-field map onto `Detection3D.keypoints`. It is
# not available, for a structural reason, and Batch 3's own prose predicted
# exactly this producer:
#
#   Their keypoints are 2D, NORMALIZED to image space (0..1), named by string,
#   and carry neither confidence nor visibility -- `name`, `x`, `y`, all three
#   required, nothing else (`controller/src/schema/metadata.schema.json`,
#   definitions.keypoint). 1.8's Keypoint3D is a METRIC 3D position in the
#   detection's frame with a per-joint confidence.
#
# Turning theirs into 1.8's needs camera intrinsics, a depth estimate and the
# camera pose. Intrinsics are in their database and not on the bus (census §7,
# GAP); camera pose is declared and unpublished at this pin (Revision 3
# correction). So the conversion is not merely unimplemented, it is not
# computable from what this producer emits.
#
# Appendix D already states the answer: "Detection2D gets no keypoint block in
# this release... Where a producer carries image-space keypoints today, they
# ride in the metadata bag (§2.15) until a second producer makes the shape
# worth fixing." SceneScape is a producer of exactly that kind, with a real
# documented schema.
#
# And it answers the question that note left open. Appendix D said adding a 2D
# block "would mean deciding whether pixel keypoints carry their own confidence
# and visibility separately from their 3D counterparts -- a question no
# reviewed producer needed answered." This producer answers it: **neither**.
# That is new evidence for the open design question, not just confirmation.

KEYPOINT_NS = "com.intel.scenescape.keypoints"


def keypoints_to_metakv(metadata: dict[str, Any]) -> MetaKV | None:
    """Their image-space keypoints -> the §2.15 metadata bag.

    Carried opaquely and namespaced, with the lossiness explicit: a consumer
    gets the bag, not a contract (§2.15). One honest enrichment is performed --
    their `keypoint_connections` is a flat list of keypoint *names*, and the
    indices into the keypoint array are recoverable, so index pairs are
    provided alongside. That is the shape 1.8 uses for `keypoint_links`, so a
    consumer that later gains 3D keypoints does not have to re-derive it.
    """
    kps = metadata.get("keypoints")
    if not isinstance(kps, list) or not kps:
        return None

    entries = [KV(key="schema", value="metadata.schema.json#/definitions/keypoints"),
               KV(key="coordinate_space", value="image-normalized-0..1"),
               KV(key="count", value=str(len(kps)))]

    names = [str(k.get("name") or "") for k in kps if isinstance(k, dict)]
    index_of = {n: i for i, n in enumerate(names)}
    conns = metadata.get("keypoint_connections")
    if isinstance(conns, list) and len(conns) >= 2:
        pairs = []
        for a, b in zip(conns[0::2], conns[1::2]):
            ia, ib = index_of.get(str(a)), index_of.get(str(b))
            if ia is not None and ib is not None:
                pairs.append(f"{ia}:{ib}")
        if pairs:
            entries.append(KV(key="links_by_index", value=",".join(pairs)))
            entries.append(KV(key="links_source", value="name-pairs, converted"))

    # The joints themselves stay in `json`: they are genuinely free-form
    # relative to any vocabulary we could name, and §2.15/Appendix A reserve
    # `json` for exactly that while keeping scalars in `entries`.
    import json as _json
    return MetaKV(
        namespace=KEYPOINT_NS,
        json=_json.dumps({"keypoints": kps,
                          "keypoint_connections": conns if isinstance(conns, list) else []}),
        entries=entries,
    )


# ---------------------------------------------------------------------------
# Bullet 7, track disappearance. And why §2.14 does not reach it here.
# ---------------------------------------------------------------------------
#
# The brief asked for the §2.14 removal convention on track disappearance:
# terminal sample with a reason, then dispose. That cannot be done on
# `FusedTrackSet`, for two independent reasons:
#
#   1. A track is not a keyed instance. `FusedTrackSet` is `@key stream_id`
#      (`semantics.idl:202`) and `FusedTrack` carries no @key at all -- it is a
#      member of a sequence. There is no instance to dispose.
#   2. §2.14 governs **latched** keyed instances (RELIABLE + TRANSIENT_LOCAL).
#      `fused_track` is registered with QoS `DET_RT`
#      (`02-idl-profiles.md:780`), live data rather than latched state, so the
#      rule does not apply to it at all.
#
# So a track vanishing from the set is precisely the *silence* §2.14 declines
# to read as removal -- and on this topic there is no typed way to say "this
# track retired, and why".
#
# The typed home exists: `owm::Entity` is keyed per entity, latched
# RELIABLE + TRANSIENT_LOCAL KEEP_LAST(1), and carries `LifecycleState`
# (ACTIVE / UNOBSERVED / RETIRED / SUPERSEDED) with `state_reason`, with its
# removal tied to §2.14 explicitly (`appendix-e.md:430`). But `spatial.owm` is
# **provisional** and is deliberately not in this sidecar's generated bindings,
# which cover the stable tree only.
#
# Therefore: detect retirement (the hard part, and real), publish nothing
# fabricated, and record where it would go. A terminal sample invented on a
# non-latched stream-keyed topic would be a §2.14 gesture with none of its
# meaning.


class TrackRetirement:
    """Detects tracks that have gone, after a stated retention window.

    Deliberately *detection only*. See the note above: the result has no typed
    home on `FusedTrackSet`, and the sidecar does not invent one.

    Their `reid_state` and `previous_ids_chain` are the nearest source material
    for a *reason* (census §2, removal row, GAP-derivable), so the last-seen
    reid_state is carried on the record rather than discarded.
    """

    def __init__(self, retention_s: float = 5.0) -> None:
        self.retention_s = retention_s
        self._last: dict[tuple[str, str], tuple[float, str]] = {}

    def observe(self, scene_id: str, payload: dict[str, Any]) -> list[dict[str, Any]]:
        """Feed one regulated/scene sample; get back the tracks now retired."""
        stamp = parse_iso(payload.get("timestamp"))
        now = stamp.sec + stamp.nanosec / 1e9
        if now == 0.0:
            return []
        seen = set()
        for o in payload.get("objects") or []:
            tid = str(o.get("id") or "")
            if not tid:
                continue
            seen.add(tid)
            self._last[(scene_id, tid)] = (now, str(o.get("reid_state") or ""))

        retired = []
        for (sid, tid), (last_seen, reid) in list(self._last.items()):
            if sid != scene_id or tid in seen:
                continue
            if now - last_seen > self.retention_s:
                retired.append({
                    "scene_id": sid,
                    "track_id": tid,
                    "last_seen_s": last_seen,
                    "gone_for_s": now - last_seen,
                    # A human-readable reason, as §2.14 requires of a terminal
                    # sample -- stated here even though there is nowhere typed
                    # to put it, so the information is not lost if owm lands.
                    "state_reason": (
                        f"absent from regulated/scene for "
                        f"{now - last_seen:.1f}s (retention {self.retention_s}s)"
                        + (f"; last reid_state {reid}" if reid else "")),
                    "typed_home": "owm::Entity (provisional, not published here)",
                })
                del self._last[(sid, tid)]
        return retired


# ---------------------------------------------------------------------------
# Bullet 8, labels. Census §5, unchanged as a MISMATCH.
# ---------------------------------------------------------------------------

def class_from_topic(topic: str) -> str | None:
    """The `thing_type` segment of a `data/scene/<scene>/<thing_type>` topic.

    Census §5's first label problem: the class lives in the topic, not the
    payload, so a consumer must parse the topic to learn it. Reconciling it
    into a typed field is what a sidecar can do; it does not make the row a
    PASS, because neither the topic segment nor the payload `category` is a
    vocabulary. The MISMATCH is about the absence of a key space, and moving an
    unconstrained string from one place to another does not create one.
    """
    segs = topic.split("/")
    if len(segs) >= 5 and segs[1] == "data" and segs[2] == "scene":
        return segs[4]
    return None


def reconcile_class(payload_category: str | None, topic_thing_type: str | None) -> str:
    """Prefer the payload, fall back to the topic, and never silently disagree."""
    if payload_category:
        return str(payload_category)
    return str(topic_thing_type or "")


def semantic_metadata_to_metakv(metadata: dict[str, Any]) -> MetaKV | None:
    """Their open `metadata` bag -> MetaKV, carried opaquely per §2.15.

    Their own schema says it plainly: "Optional per-detection metadata (e.g.,
    reid, gender, age). **Keys and values are detector-defined.**" So this is
    an honest carry, not an interoperable one: the consumer gets the bag, not a
    contract. Scalars go in `entries` and anything structured in `json`, per
    Appendix A's typed-first rule, and the namespace marks whose key space it
    is.

    Keypoints are excluded -- they have their own namespaced bag with the
    index-pair enrichment (see keypoints_to_metakv).
    """
    if not isinstance(metadata, dict) or not metadata:
        return None
    skip = {"keypoints", "keypoint_connections"}
    scalars, structured = [], {}
    for k, v in metadata.items():
        if k in skip:
            continue
        if isinstance(v, (str, int, float, bool)):
            scalars.append(KV(key=str(k), value=str(v)))
        else:
            structured[k] = v
    if not scalars and not structured:
        return None
    import json as _json
    return MetaKV(
        namespace="com.intel.scenescape.metadata",
        json=_json.dumps(structured) if structured else "",
        entries=scalars[:16],
    )
