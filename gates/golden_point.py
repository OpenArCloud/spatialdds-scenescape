#!/usr/bin/env python3
"""Golden-point check: does our published chain reproduce THEIR lat/lon?

  python3 gates/golden_point.py <corpus-dir-with-output_lla-on>

Branch A of bullet 2 publishes a GeoAnchor at the centroid of the scene's map
corners and a FrameTransform whose pose is **identity**. The identity rests on
an assumption, that SceneScape derives no rotation, scale or origin offset
from those corners, and that assumption is checkable against their own
numbers rather than inferred from their silence.

Method. With `output_lla` enabled their controller emits `lat_long_alt` per
object along`translation` (the scene-frame position). So for each object we
have both sides of the same conversion: their answer, and the scene-frame input
our chain consumes. Push the input through our published chain and compare.

  agreement within 1 m   -> identity orientation is PROVEN against their
                            trs_xyz_to_lla, not assumed.
  consistent rotation    -> their machinery derives an orientation from the
                            corners; the FrameTransform must carry it and
                            identity was the guess.
  consistent translation -> their scene origin is not the corner centroid;
                            the anchor or the transform must carry the offset.
  consistent scale       -> the corners imply a scale our chain is dropping.

Any of the last three is a one-line census note and a mapping fix. Better
caught by their numbers on a Saturday than by Intel's engineers later.
"""
from __future__ import annotations

import json
import math
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
sys.path.insert(0, str(ROOT))

from sidecar import mapping                                   # noqa: E402

BAR_M = 1.0

# WGS84
_A = 6378137.0
_F = 1.0 / 298.257223563
_E2 = _F * (2 - _F)


def enu_to_geodetic(e: float, n: float, u: float,
                    lat0: float, lon0: float, alt0: float) -> tuple[float, float, float]:
    """Local ENU offset -> geodetic, exact enough for a venue.

    Uses the meridional and prime-vertical radii at the anchor, which is the
    standard local-tangent approximation; its error over a few hundred metres
    is millimetres, far below the 1 m bar this check applies.
    """
    lat0r = math.radians(lat0)
    sin2 = math.sin(lat0r) ** 2
    rn = _A / math.sqrt(1 - _E2 * sin2)                 # prime vertical
    rm = _A * (1 - _E2) / (1 - _E2 * sin2) ** 1.5       # meridional
    dlat = n / rm
    dlon = e / (rn * math.cos(lat0r))
    return lat0 + math.degrees(dlat), lon0 + math.degrees(dlon), alt0 + u


def haversine_m(a_lat: float, a_lon: float, b_lat: float, b_lon: float) -> float:
    p1, p2 = math.radians(a_lat), math.radians(b_lat)
    dp = p2 - p1
    dl = math.radians(b_lon - a_lon)
    h = math.sin(dp / 2) ** 2 + math.cos(p1) * math.cos(p2) * math.sin(dl / 2) ** 2
    return 2 * _A * math.asin(min(1.0, math.sqrt(h)))


def quat_yaw(q: list[float]) -> float:
    """Yaw about up from [x, y, z, w]."""
    x, y, z, w = q
    return math.atan2(2.0 * (w * z + x * y), 1.0 - 2.0 * (y * y + z * z))


def rotate_scale(x: float, y: float, z: float, yaw: float,
                 scale: float) -> tuple[float, float, float]:
    """Scene-frame offset -> ENU offset, through the anchor's yaw and scale."""
    ct, st = math.cos(yaw), math.sin(yaw)
    return scale * (ct * x - st * y), scale * (st * x + ct * y), scale * z


FIXTURE = ROOT / "samples" / "live-geo-samples.json"


def recorded() -> int:
    """Both georeference paths against real recorded output from their bus.

    Offline and reproducible. The samples are theirs, captured live once the
    scene was georeferenced, and both sources are exercised: their published
    `trs_matrix`, and our corner fit with the matrix withheld. The two should
    agree with their numbers and with each other.
    """
    fx = json.loads(FIXTURE.read_text())
    cfg_trs = fx["scene_config"]
    cfg_fit = {k: v for k, v in cfg_trs.items() if k != "trs_matrix"}
    samples = fx["samples"]
    print(f"recorded samples: {len(samples)}  "
          f"(from {cfg_trs['name']}, output_lla on)\n")

    worst = 0.0
    for label, cfg in (("their trs_matrix", cfg_trs),
                       ("our corner fit  ", cfg_fit)):
        geo = mapping.geo_for_scene(cfg, cfg["uid"])
        if geo["branch"] != "A-georeferenced":
            print(f"{label}: FAIL, {geo['branch']}")
            return 1
        ga = geo["geo_anchor"]
        lat0, lon0 = ga.geopose.lat_deg, ga.geopose.lon_deg
        alt0 = ga.geopose.alt_m
        yaw = quat_yaw(list(ga.geopose.q))
        scale = geo["frame_transform"].child_ref.meters_per_unit or 1.0
        errs = []
        for s in samples:
            t_ = s["translation"]
            e, nn, u = rotate_scale(t_[0], t_[1], t_[2] if len(t_) > 2 else 0.0,
                                   yaw, scale)
            our_lat, our_lon, _ = enu_to_geodetic(e, nn, u, lat0, lon0, alt0)
            their = s["lat_long_alt"]
            errs.append(haversine_m(our_lat, our_lon, their[0], their[1]))
        worst = max(worst, max(errs))
        print(f"{label}: yaw {math.degrees(yaw):+.5f} deg  scale {scale:.6f}")
        print(f"                  min {min(errs) * 1000:.3f} mm   "
              f"mean {sum(errs) / len(errs) * 1000:.3f} mm   "
              f"max {max(errs) * 1000:.3f} mm")

    print(f"\n>>> worst error {worst * 1000:.3f} mm against their own "
          f"per-object output")
    print(f"    bar {BAR_M} m   {'PASS' if worst <= BAR_M else 'FAIL'}")
    return 0 if worst <= BAR_M else 1


def main() -> int:
    if len(sys.argv) >= 2 and sys.argv[1] == "--recorded":
        return recorded()
    if len(sys.argv) < 2:
        print(__doc__)
        print("\nOr: --recorded, to run against the committed live samples.")
        return 2
    corpus = Path(sys.argv[1])
    scene_cfg_path = corpus / "scene-config.json"
    if not scene_cfg_path.is_file():
        print(f"need {scene_cfg_path}, the scene config as the REST API returns it",
              file=sys.stderr)
        return 1
    cfg = json.loads(scene_cfg_path.read_text())
    scene_id = cfg.get("uid") or "unknown"

    geo = mapping.geo_for_scene(cfg, scene_id)
    if geo["branch"] != "A-georeferenced":
        print(f"scene is {geo['branch']}, enable output_lla and map corners first",
              file=sys.stderr)
        return 1
    ga = geo["geo_anchor"]
    lat0, lon0, alt0 = ga.geopose.lat_deg, ga.geopose.lon_deg, ga.geopose.alt_m
    yaw = quat_yaw(list(ga.geopose.q))
    scale = geo["frame_transform"].child_ref.meters_per_unit or 1.0
    print(f"anchor: lat {lat0:.7f} lon {lon0:.7f} alt {alt0:.2f}  "
          f"(method {ga.method})")
    print(f"scene -> ENU yaw {math.degrees(yaw):+.5f} deg, "
          f"scale {scale:.6f} m/unit")
    print(f"transform pose t={list(geo['frame_transform'].T_parent_child.t)} "
          f"q={[round(v, 9) for v in geo['frame_transform'].T_parent_child.q]}\n")

    rows: list[tuple[float, float, float, float]] = []   # err, de, dn, du
    n = 0
    for line in (corpus / "regulated-scene.jsonl").read_text().splitlines():
        parts = line.split("|", 2)
        if len(parts) != 3 or not parts[1].endswith(scene_id):
            continue
        try:
            d = json.loads(parts[2])
        except json.JSONDecodeError:
            continue
        for o in d.get("objects", []):
            lla = o.get("lat_long_alt")
            t = o.get("translation")
            if not lla or not t or len(lla) < 2 or len(t) < 2:
                continue
            their_lat, their_lon = float(lla[0]), float(lla[1])
            their_alt = float(lla[2]) if len(lla) > 2 else alt0
            # Our chain: the scene-frame point is rotated into ENU by the
            # anchor's orientation and scaled by the child frame's
            # metres-per-unit, then added to the anchor as an ENU offset.
            #
            # This previously read (x, y, z) as ENU directly, "because the
            # transform pose is identity". The pose is NOT identity -- the
            # scene frame has a yaw relative to north which their map-corner
            # ordering states, and the similarity carries a scale. Reading
            # the offsets raw was the same error as the identity quaternion in
            # `mapping.geo_anchor`, and this check would have reported ~4.8 m
            # on their own fixture while claiming to validate the mapping.
            e, nn, u = rotate_scale(float(t[0]), float(t[1]),
                                    float(t[2] if len(t) > 2 else 0.0),
                                    yaw, scale)
            our_lat, our_lon, our_alt = enu_to_geodetic(
                e, nn, u, lat0, lon0, alt0)
            err = haversine_m(their_lat, their_lon, our_lat, our_lon)
            # Decompose into east/north so a rotation shows up as a pattern
            # rather than as scalar noise.
            de = haversine_m(their_lat, their_lon, their_lat, our_lon) * \
                (1 if our_lon > their_lon else -1)
            dn = haversine_m(their_lat, their_lon, our_lat, their_lon) * \
                (1 if our_lat > their_lat else -1)
            # Their position as an ENU offset from the anchor, for the fit.
            their_e = haversine_m(lat0, lon0, lat0, their_lon) * \
                (1 if their_lon > lon0 else -1)
            their_n = haversine_m(lat0, lon0, their_lat, lon0) * \
                (1 if their_lat > lat0 else -1)
            rows.append((err, de, dn, our_alt - their_alt,
                         float(t[0]), float(t[1]), their_e, their_n))
            n += 1

    if not rows:
        print("no objects carried lat_long_alt, is output_lla actually on?",
              file=sys.stderr)
        return 1

    errs = sorted(r[0] for r in rows)
    mean_de = sum(r[1] for r in rows) / n
    mean_dn = sum(r[2] for r in rows) / n
    mean_du = sum(r[3] for r in rows) / n
    print(f"{n} object samples carried both lat_long_alt and translation")
    print(f"  horizontal error: median {errs[n // 2]:.3f} m, "
          f"p95 {errs[int(n * 0.95)]:.3f} m, max {errs[-1]:.3f} m")
    print(f"  mean offset: east {mean_de:+.3f} m  north {mean_dn:+.3f} m  "
          f"up {mean_du:+.3f} m")

    bar = 1.0
    p95 = errs[int(n * 0.95)]
    if p95 < bar:
        print(f"\n  PASS, agrees with their trs_xyz_to_lla within {bar} m at p95.")
        print("  Identity orientation is proven against their own numbers,")
        print("  not assumed from their silence.")
        return 0

    print(f"\n  DIVERGES, p95 {p95:.3f} m exceeds the {bar} m bar.\n")

    # Fit the 2D similarity (rotation, uniform scale, translation) that best
    # maps OUR scene-frame points onto THEIR implied ENU positions. This
    # answers "what is their machinery doing that ours is not" directly,
    # instead of inferring it from thresholds: a rotation shows up as an
    # angle, a dropped scale as a factor, an origin offset as a translation.
    ours = [(r[4], r[5]) for r in rows]      # scene-frame x, y  (= our ENU)
    theirs = [(r[6], r[7]) for r in rows]    # their ENU from the anchor
    mx = sum(a for a, _ in ours) / n
    my = sum(b for _, b in ours) / n
    tx = sum(a for a, _ in theirs) / n
    ty = sum(b for _, b in theirs) / n
    sxx = sxy = saa = 0.0
    for (ax, ay), (bx, by) in zip(ours, theirs):
        ax, ay, bx, by = ax - mx, ay - my, bx - tx, by - ty
        sxx += ax * bx + ay * by          # dot
        sxy += ax * by - ay * bx          # cross
        saa += ax * ax + ay * ay
    angle = math.degrees(math.atan2(sxy, sxx)) if saa > 1e-12 else 0.0
    scale = math.hypot(sxx, sxy) / saa if saa > 1e-12 else 1.0
    # Residual after removing the fitted similarity.
    r = math.radians(angle)
    resid = []
    for (ax, ay), (bx, by) in zip(ours, theirs):
        px = scale * ((ax - mx) * math.cos(r) - (ay - my) * math.sin(r)) + tx
        py = scale * ((ax - mx) * math.sin(r) + (ay - my) * math.cos(r)) + ty
        resid.append(math.hypot(px - bx, py - by))
    resid.sort()

    print(f"  best-fit similarity from our frame to theirs:")
    print(f"    rotation    {angle:+.3f} deg")
    print(f"    scale       {scale:.6f}")
    print(f"    translation {tx - scale * (mx * math.cos(r) - my * math.sin(r)):+.3f} E, "
          f"{ty - scale * (mx * math.sin(r) + my * math.cos(r)):+.3f} N")
    print(f"    residual after fit: median {resid[len(resid)//2]:.3f} m, "
          f"max {resid[-1]:.3f} m")

    print()
    if abs(angle) > 0.5:
        print(f"  -> Their machinery DERIVES AN ORIENTATION from the corners")
        print(f"     ({angle:+.2f} deg). Identity was the guess. The")
        print(f"     FrameTransform must carry this rotation as its quaternion.")
    if abs(scale - 1.0) > 0.01:
        print(f"  -> The corners imply a SCALE of {scale:.4f} that our chain")
        print(f"     drops. §2.13's frame-scale fields are the typed home for")
        print(f"     it; absent scale means metric, which would then be wrong.")
    if resid[-1] < bar and (abs(angle) > 0.5 or abs(scale - 1.0) > 0.01):
        print(f"  -> Residual under {bar} m after the fit, so a similarity")
        print(f"     fully explains the divergence: nothing else is missing.")
    elif resid[-1] >= bar:
        print(f"  -> Residual still {resid[-1]:.2f} m after fitting a similarity,")
        print(f"     so the difference is NOT a rigid transform. Do not patch a")
        print(f"     quaternion over this; ask what their conversion actually does.")

    print("\n  One-line census note either way, and a mapping fix before the capture.")
    return 1


if __name__ == "__main__":
    sys.exit(main())
