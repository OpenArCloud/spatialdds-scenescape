#!/usr/bin/env python3
"""Branch A against SceneScape's own published golden vector.

`gates/golden_point.py` validates the georeference against a *live* deployment's
`lat_long_alt`. This is the complement and it needs no deployment at all: their
functional test ships a worked example -- map corners, map resolution, map
scale, an input scene coordinate and the expected latitude/longitude it must
produce. Driving our own `sidecar.mapping` through those numbers is the
strongest branch-A check available offline, because the expected value is
theirs, not ours.

Source, at the pin (`2026.1.0` = `91afcb74`):
`tests/functional/test_geospatial_ingest_publish.py:39-45`.

This is the check that caught the identity-rotation bug. The first
implementation anchored the GeoAnchor at the centroid of the map corners and
set an identity orientation, reasoning that SceneScape states no rotation. It
states one implicitly, in the order of the corners, and the error was 4.8 m --
about half the map. Run with `--show-broken` to reproduce that number.
"""
from __future__ import annotations

import argparse
import math
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
sys.path.insert(0, str(ROOT))

from sidecar import mapping                                   # noqa: E402

# --- their numbers, verbatim ---------------------------------------------
DETECTION_XYZ = [3.8679791719486474, 2.7517397452609087, 1.1225254457301852e-19]
EXPECTED_LLA = [37.38688947231117, -121.96410520894621, 8.068826778282563]
MAP_CORNERS_LLA = [[37.38685435, -121.96408120, 8.0], [37.38693520, -121.96408120, 8.0],
                   [37.38693520, -121.96413896, 8.0], [37.38685435, -121.96413896, 8.0]]
MAP_RESOLUTION = [900, 643]
MAP_SCALE = 100.0

SCENE_ID = "3bc091c7-e449-46a0-9540-29c499bca18c"
BAR_M = 1.0


def quat_yaw(q: list[float]) -> float:
    """Yaw about up from [x, y, z, w]."""
    x, y, z, w = q
    return math.atan2(2.0 * (w * z + x * y), 1.0 - 2.0 * (y * y + z * z))


def apply(anchor_lat: float, anchor_lon: float, yaw: float, scale: float,
          xyz: list[float]) -> tuple[float, float]:
    """What a consumer does with a GeoAnchor plus the child frame's scale."""
    ct, st = math.cos(yaw), math.sin(yaw)
    e = scale * (ct * xyz[0] - st * xyz[1])
    n = scale * (st * xyz[0] + ct * xyz[1])
    return mapping._enu_to_lla(e, n, anchor_lat, anchor_lon)


def main() -> int:
    ap = argparse.ArgumentParser()
    ap.add_argument("--show-broken", action="store_true",
                    help="also report what the centroid/identity version gave")
    a = ap.parse_args()

    cfg = {
        "uid": SCENE_ID,
        "name": "Retail",
        "output_lla": True,
        "map": "HazardZoneSceneLarge.png",
        "scale": MAP_SCALE,
        "map_resolution": MAP_RESOLUTION,
        "map_corners_lla": MAP_CORNERS_LLA,
    }

    out = mapping.geo_for_scene(cfg, SCENE_ID, "2026-10-03T12:00:00.000Z")
    print(f"branch: {out['branch']}")
    if not out["branch"].startswith("A"):
        print("FAIL, branch A expected; the georeference was not recognised")
        return 1

    ga, ft = out["geo_anchor"], out["frame_transform"]
    g = ga.geopose
    yaw = quat_yaw(list(g.q))
    scale = ft.child_ref.meters_per_unit
    xdim, ydim = MAP_RESOLUTION[0] / MAP_SCALE, MAP_RESOLUTION[1] / MAP_SCALE

    print(f"map extents        {xdim:.4f} x {ydim:.4f} m  (res/scale, their rule)")
    print(f"anchor             {g.lat_deg:.9f}, {g.lon_deg:.9f}, {g.alt_m:.2f}")
    print(f"yaw (scene -> ENU) {math.degrees(yaw):+.4f} deg")
    print(f"child scale        {scale:.6f} m/unit  status={ft.child_ref.scale_status}")
    print(f"transform rotation {math.degrees(quat_yaw(list(ft.T_parent_child.q))):+.4f} deg"
          f"  t={list(ft.T_parent_child.t)}")

    got_lat, got_lon = apply(g.lat_deg, g.lon_deg, yaw, scale, DETECTION_XYZ)
    err = _haversine(got_lat, got_lon, EXPECTED_LLA[0], EXPECTED_LLA[1])
    print(f"\ninput scene xyz    {DETECTION_XYZ[0]:.6f}, {DETECTION_XYZ[1]:.6f}")
    print(f"consumer computes  {got_lat:.9f}, {got_lon:.9f}")
    print(f"they expect        {EXPECTED_LLA[0]:.9f}, {EXPECTED_LLA[1]:.9f}")
    print(f"\n>>> error {err:.4f} m   bar {BAR_M:.1f} m   "
          f"{'PASS' if err <= BAR_M else 'FAIL'}")

    if a.show_broken:
        lat_c = sum(c[0] for c in MAP_CORNERS_LLA) / 4
        lon_c = sum(c[1] for c in MAP_CORNERS_LLA) / 4
        bl, bo = mapping._enu_to_lla(DETECTION_XYZ[0], DETECTION_XYZ[1], lat_c, lon_c)
        berr = _haversine(bl, bo, EXPECTED_LLA[0], EXPECTED_LLA[1])
        print(f"\nfor comparison, the superseded centroid/identity version:")
        print(f"    {bl:.9f}, {bo:.9f}   error {berr:.3f} m  "
              f"(half the map diagonal is {math.hypot(xdim, ydim) / 2:.3f} m)")

    # The corner residual is their fit's, not ours: it is what a similarity
    # cannot absorb when the entered corners disagree with the map's own
    # aspect ratio and scale. Reported because it bounds branch A's accuracy.
    geo = mapping._georef(cfg)
    print(f"\ncorner residual of the similarity fit: {geo['corner_residual_m']:.3f} m")
    print("  (their own fixture's corners imply 8.973 x 5.115 m of ground on a")
    print("   9.000 x 6.430 m map, so a uniform scale cannot hit all four; their")
    print("   cv2-based fit discards the same detail, which is why we match.)")

    return 0 if err <= BAR_M else 1


def _haversine(a_lat: float, a_lon: float, b_lat: float, b_lon: float) -> float:
    p1, p2 = math.radians(a_lat), math.radians(b_lat)
    dp = p2 - p1
    dl = math.radians(b_lon - a_lon)
    h = math.sin(dp / 2) ** 2 + math.cos(p1) * math.cos(p2) * math.sin(dl / 2) ** 2
    return 2 * 6378137.0 * math.asin(min(1.0, math.sqrt(h)))


if __name__ == "__main__":
    sys.exit(main())
