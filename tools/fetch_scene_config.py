#!/usr/bin/env python3
"""Read the scene configuration out of SceneScape's REST API.

A northbound read, and the sidecar genuinely needs it. Three things it carries
cannot be learned from the bus however long you listen:

* **Zone and line geometry.** Their region and tripwire streams are
  occupancy-triggered -- a zone nobody enters publishes nothing at all -- so on
  the bus a never-occupied zone is indistinguishable from one that does not
  exist. Measured: of three zones configured, only the one with traffic ever
  published (NOTES).
* **Camera membership.** `data/camera/<id>` names no scene. Guessing put 4,794
  of 9,554 detections in the wrong scene frame before this was fixed.
* **The georeference.** `map_corners_lla` and the computed `trs_matrix`, the
  latter served only when `output_lla` is true.

Writes the list of full scene objects as the bridge and the replay both expect.
"""
from __future__ import annotations

import argparse
import json
import os
import ssl
import sys
import urllib.error
import urllib.request
from pathlib import Path

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


def main() -> int:
    ap = argparse.ArgumentParser()
    ap.add_argument("--out", type=Path, required=True)
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
    ap.add_argument("--resolution", nargs=3, action="append", default=[],
                    metavar=("SCENE", "W", "H"),
                    help="map pixel size for a scene uid; their payload omits "
                         "it and metres-per-unit cannot be recovered without "
                         "it. Repeatable. Unneeded when trs_matrix is served.")
    a = ap.parse_args()

    pw = open(a.password_file).read().strip()
    st, r = call("POST", "/api/v1/auth", a.host, None,
                 {"username": a.user, "password": pw})
    if st != 200 or not isinstance(r, dict) or "token" not in r:
        print(f"auth failed: {st} {r}", file=sys.stderr)
        return 1
    token = r["token"]

    st, scenes = call("GET", "/api/v1/scenes", a.host, token)
    if st != 200:
        print(f"scene list failed: {st} {scenes}", file=sys.stderr)
        return 1
    rows = scenes.get("results", scenes) if isinstance(scenes, dict) else scenes

    res = {s[0]: [float(s[1]), float(s[2])] for s in a.resolution}
    full = []
    for s in rows:
        st, d = call("GET", f"/api/v1/scene/{s['uid']}", a.host, token)
        if st != 200:
            print(f"scene {s['uid']} failed: {st}", file=sys.stderr)
            return 1
        obj = d.get("results", d) if isinstance(d, dict) else d
        # Their serializer is non-null, so empty lists are omitted entirely.
        # The consumers index these, so normalise rather than special-case.
        for k in ("regions", "tripwires", "cameras", "sensors"):
            obj.setdefault(k, [])
        if obj["uid"] in res:
            obj["map_resolution"] = res[obj["uid"]]
        full.append(obj)

    a.out.write_text(json.dumps(full, indent=1))
    print(f"wrote {a.out}  ({len(full)} scene(s))")
    for s in full:
        print(f"  {s['uid'][:8]} {str(s.get('name')):10} "
              f"cameras={[c.get('name') for c in s['cameras']]} "
              f"regions={len(s['regions'])} tripwires={len(s['tripwires'])} "
              f"output_lla={s.get('output_lla')} "
              f"trs_matrix={'yes' if s.get('trs_matrix') else 'no'} "
              f"map_resolution={s.get('map_resolution', 'absent')}")
    return 0


if __name__ == "__main__":
    sys.exit(main())
