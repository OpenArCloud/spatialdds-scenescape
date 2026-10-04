#!/usr/bin/env python3
"""Turn on a scene's georeference through SceneScape's documented REST API.

No SceneScape file is touched. Two scene fields are set, `output_lla` and
`map_corners_lla`, which is configuration, not modification. Doing so has two
effects worth knowing: their controller starts adding `lat_long_alt` and
`heading` to every object on `regulated/scene`
(`controller/src/controller/detections_builder.py:91-95`), and their scene
serializer starts returning the computed `trs_matrix`, which it withholds
whenever `output_lla` is false
(`manager/src/manager/serializers.py:623-632`).

**The verb is POST, not PUT or PATCH.** `api.yaml` documents `put` on
`/scene/{uid}` and no `post`; `PATCH` returns 405; `POST` with a JSON body
works and is what their own `RESTClient._update` uses
(`scene_common/src/scene_common/rest_client.py:247`). Recorded as REST
documentation defect 4.3.

**The corners go as a real JSON array.** Their functional test passes
`json.dumps(corners)`, a string, but that call also uploads a map file, so it
goes out as multipart form data where every value must be a string. With no
file, `prepareDataArgs` sends a JSON body (`rest_client.py:187-194`) and the
array is correct.

Corner order follows their own convention: CCW from the minimum corner, pairing
with `(0,0), (xdim,0), (xdim,ydim), (0,ydim)` where `xdim = map_resx / scale`
(`scene_common/src/scene_common/mesh_util.py:249-252`, `:294-297`). That
ordering is not cosmetic, it is what states the scene frame's yaw, and reading
it wrongly cost 4.8 m on the first attempt (see `gates/golden_vector.py`).
"""
from __future__ import annotations

import argparse
import json
import os
import math
import ssl
import sys
import urllib.error
import urllib.request

_A = 6378137.0
_F = 1.0 / 298.257223563
_E2 = _F * (2 - _F)

CTX = ssl.create_default_context()
CTX.check_hostname = False
CTX.verify_mode = ssl.CERT_NONE


def call(method: str, path: str, host: str, token: str | None = None,
         body: object | None = None) -> tuple[int, object]:
    req = urllib.request.Request(f"https://{host}{path}", method=method)
    req.add_header("Content-Type", "application/json")
    if token:
        req.add_header("Authorization", f"Token {token}")
    data = json.dumps(body).encode() if body is not None else None
    try:
        with urllib.request.urlopen(req, data=data, context=CTX, timeout=30) as r:
            raw = r.read()
        return 200, (json.loads(raw) if raw else None)
    except urllib.error.HTTPError as e:
        raw = e.read()
        try:
            return e.code, json.loads(raw)
        except Exception:
            return e.code, raw.decode("utf-8", "replace")[:300]


def corners_for(lat0: float, lon0: float, alt0: float,
                xdim: float, ydim: float, yaw_deg: float) -> list[list[float]]:
    """Map corners for a scene placed at (lat0, lon0) with a given yaw.

    The corners are a *declared placement*, a human says where the map sits, so any self-consistent set is legitimate. Generating them from the map's
    true extents keeps the implied scale at 1.0, which means branch A's
    `meters_per_unit` comes out metric and the corner residual stays near
    zero. Corners entered by hand on a real map typically do not close that
    well: their own test fixture's corners imply 8.973 x 5.115 m of ground on
    a 9.000 x 6.430 m map, a 0.527 m residual their fit absorbs.
    """
    th = math.radians(yaw_deg)
    lat_r = math.radians(lat0)
    s2 = math.sin(lat_r) ** 2
    rn = _A / math.sqrt(1 - _E2 * s2)
    rm = _A * (1 - _E2) / (1 - _E2 * s2) ** 1.5
    out = []
    for x, y in ((0.0, 0.0), (xdim, 0.0), (xdim, ydim), (0.0, ydim)):
        e = x * math.cos(th) - y * math.sin(th)
        n = x * math.sin(th) + y * math.cos(th)
        out.append([round(lat0 + math.degrees(n / rm), 8),
                    round(lon0 + math.degrees(e / (rn * math.cos(lat_r))), 8),
                    alt0])
    return out


def main() -> int:
    ap = argparse.ArgumentParser()
    ap.add_argument("--scene", required=True, help="scene uid")
    ap.add_argument("--host", default="localhost")
    ap.add_argument("--user", default="admin")
    ap.add_argument("--password-file",
                    default=os.environ.get(
                        "SCENESCAPE_SUPASS",
                        os.path.join(os.environ.get("SCENESCAPE_ROOT",
                                                    "/opt/scenescape"),
                                     "supass")),
                    help="file holding the SceneScape web superuser "
                         "password; this is their own credential file, "
                         "read not written")
    ap.add_argument("--resolution", nargs=2, type=float, required=True,
                    metavar=("W", "H"),
                    help="map image pixel size; their scene payload omits it")
    ap.add_argument("--lat", type=float, required=True)
    ap.add_argument("--lon", type=float, required=True)
    ap.add_argument("--alt", type=float, default=0.0)
    ap.add_argument("--yaw", type=float, default=0.0,
                    help="degrees from east, counter-clockwise, for scene +x")
    ap.add_argument("--dry-run", action="store_true")
    a = ap.parse_args()

    pw = open(a.password_file).read().strip()
    st, r = call("POST", "/api/v1/auth", a.host, None,
                 {"username": a.user, "password": pw})
    if st != 200 or not isinstance(r, dict) or "token" not in r:
        print(f"auth failed: {st} {r}", file=sys.stderr)
        return 1
    token = r["token"]

    st, scene = call("GET", f"/api/v1/scene/{a.scene}", a.host, token)
    if st != 200:
        print(f"scene read failed: {st} {scene}", file=sys.stderr)
        return 1
    s = scene.get("results", scene) if isinstance(scene, dict) else scene
    scale = float(s.get("scale") or 0.0)
    if scale <= 0:
        print(f"scene has no usable scale: {s.get('scale')!r}", file=sys.stderr)
        return 1

    xdim, ydim = a.resolution[0] / scale, a.resolution[1] / scale
    corners = corners_for(a.lat, a.lon, a.alt, xdim, ydim, a.yaw)

    print(f"scene {a.scene}  {s.get('name')!r}  map {s.get('map')!r}")
    print(f"  scale {scale}  ->  extents {xdim:.4f} x {ydim:.4f} m")
    print(f"  yaw {a.yaw} deg about up, scene +x measured from east")
    for (x, y), c in zip(((0, 0), (xdim, 0), (xdim, ydim), (0, ydim)), corners):
        print(f"    mesh ({x:6.3f},{y:6.3f}) -> {c[0]:.8f}, {c[1]:.8f}, {c[2]}")
    if a.dry_run:
        print("\n(dry run) nothing sent")
        return 0

    st, resp = call("POST", f"/api/v1/scene/{a.scene}", a.host, token,
                    {"output_lla": True, "map_corners_lla": corners})
    print(f"\n  POST output_lla + map_corners_lla -> {st}")
    if st not in (200, 201):
        print(f"  {json.dumps(resp)[:400]}", file=sys.stderr)
        return 1

    st, back = call("GET", f"/api/v1/scene/{a.scene}", a.host, token)
    b = back.get("results", back) if isinstance(back, dict) else back
    trs = b.get("trs_matrix")
    print(f"  output_lla = {b.get('output_lla')}")
    print(f"  trs_matrix = {'PRESENT' if trs else 'ABSENT'}")
    if trs:
        print(f"  TRS={json.dumps(trs)}")
        print("\n  Feed this back to the sidecar: with trs_matrix in the scene")
        print("  config, `mapping._georef` consumes their transform directly")
        print("  instead of re-fitting the corners, which makes agreement with")
        print("  their lat_long_alt true by construction.")
    elif b.get("output_lla"):
        print("  output_lla is set but no trs_matrix, their controller could "
              "not build one.\n  Check that the scene has a processed map.")
    return 0


if __name__ == "__main__":
    sys.exit(main())
