#!/usr/bin/env python3
"""Configure capture-legible regions and a tripwire through SceneScape's REST API.

Configuration, not modification: this calls their documented /auth, /region and
/tripwire endpoints (docs/user-guide/api-docs/api.yaml). No SceneScape file is
touched.

  sudo python3 tools/configure_scene.py [--scene <uid>] [--dry-run]

Placement is derived from corpus v1 rather than guessed. A zone nobody walks
through emits no events, and a tripwire parallel to the direction of travel is
never crossed, either would give a capture with names on screen and nothing
happening. The occupancy map from the recorded corpus says where people
actually go, so the shapes are put there.

NOTE on the `points` format. api.yaml declares
    points: {type: array, items: {type: number, format: double}}
i.e. a flat array. The implementation disagrees: PointsSerializerField
.to_internal_value rejects anything whose elements are not 2-element lists
("Each point must be a list of 2 coordinates"). Nested pairs are what works.
Their spec is wrong here; filed for the Monday notes.
"""
from __future__ import annotations

import argparse
import json
import os
import ssl
import sys
import urllib.error
import urllib.request

BASE = "https://localhost"
CTX = ssl.create_default_context()
CTX.check_hostname = False
CTX.verify_mode = ssl.CERT_NONE   # self-signed cert on the demo deployment


def call(method: str, path: str, token: str | None = None, body=None):
    req = urllib.request.Request(f"{BASE}{path}", method=method)
    req.add_header("Content-Type", "application/json")
    if token:
        req.add_header("Authorization", f"Token {token}")
    data = json.dumps(body).encode() if body is not None else None
    try:
        with urllib.request.urlopen(req, data=data, context=CTX, timeout=30) as r:
            raw = r.read()
            return r.status, (json.loads(raw) if raw else None)
    except urllib.error.HTTPError as e:
        raw = e.read()
        try:
            return e.code, json.loads(raw)
        except Exception:
            return e.code, raw.decode("utf-8", "replace")[:400]


def main() -> int:
    ap = argparse.ArgumentParser()
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
    ap.add_argument("--scene", default=None, help="scene uid (default: busiest)")
    ap.add_argument("--dry-run", action="store_true")
    a = ap.parse_args()

    pw = open(a.password_file).read().strip()
    # Their client posts {'username', 'password'} (scene_common rest_client
    # .authenticate); 'user' is rejected with
    # {'username': ['This field is required.']}.
    st, r = call("POST", "/api/v1/auth", body={"username": a.user, "password": pw})
    if st != 200 or not isinstance(r, dict) or "token" not in r:
        print(f"auth failed: {st} {r}", file=sys.stderr)
        return 1
    token = r["token"]
    print(f"authenticated as {a.user}")

    st, scenes = call("GET", "/api/v1/scenes", token)
    if st != 200:
        print(f"GET /scenes failed: {st} {scenes}", file=sys.stderr)
        return 1
    rows = scenes.get("results", scenes) if isinstance(scenes, dict) else scenes
    print("scenes:")
    for s in rows:
        print(f"  {s.get('uid')}  {s.get('name')!r}")

    # The corpus-derived target. Scene 302cf49a carried 4167 object samples in
    # a north-south corridor at x 2.1..3.9, y 3.7..6.1, busiest at the y>5.4
    # end. Shapes are placed across and within that corridor.
    scene_uid = a.scene or "302cf49a-97ec-402d-a324-c5077b280b7b"
    if not any(s.get("uid") == scene_uid for s in rows):
        print(f"scene {scene_uid} not found on this deployment", file=sys.stderr)
        return 1
    name = next(s.get("name") for s in rows if s.get("uid") == scene_uid)
    print(f"\ntarget scene: {scene_uid}  {name!r}")

    # Named to be read aloud off a screen.
    # Placements re-derived 2026-10-03 from 5,670 recorded track positions in
    # corpus v2, after the first set was measured properly and two of the three
    # turned out never to be touched. The original check tested straddling of
    # the infinite line y=4.8 rather than intersection with the finite segment,
    # so the tripwire was placed 0.2-1.6 m clear of all actual traffic and the
    # Queue Region was placed where zero of 5,670 positions fall. Each figure
    # below is a count against that recording, not a guess:
    #
    #   Keep-Out Zone      418 positions, 15 tracks   (unchanged, it worked)
    #   Queue Region     2,231 positions, 19 tracks   (moved; max 215 samples
    #                                                  on one track ~ 21 s of
    #                                                  dwell at 10 Hz)
    #   Entrance Tripwire   24 crossings, 19 of 24 tracks  (moved)
    regions = [
        {"name": "Keep-Out Zone", "scene": scene_uid, "height": 2.0,
         "points": [[2.0, 3.6], [3.1, 3.6], [3.1, 4.3], [2.0, 4.3]]},
        {"name": "Queue Region", "scene": scene_uid, "height": 2.0,
         "points": [[0.4, 5.1], [1.8, 5.1], [1.8, 6.2], [0.4, 6.2]]},
    ]
    tripwires = [
        # Across the corridor, not along it, so people actually cross.
        {"name": "Entrance Tripwire", "scene": scene_uid, "height": 2.0,
         "points": [[-0.2, 4.8], [2.0, 4.8]]},
    ]

    if a.dry_run:
        print("\n(dry run) would create:")
        for x in regions + tripwires:
            print(f"  {x['name']:20} {x['points']}")
        return 0

    # Idempotent: drop anything already carrying these names first, so a
    # re-run before a retake does not accumulate duplicates.
    for kind, plural in (("region", "regions"), ("tripwire", "tripwires")):
        st, existing = call("GET", f"/api/v1/{plural}", token)
        if st == 200:
            items = existing.get("results", existing) if isinstance(existing, dict) else existing
            wanted = {x["name"] for x in (regions if kind == "region" else tripwires)}
            for it in items or []:
                if it.get("name") in wanted:
                    d, _ = call("DELETE", f"/api/v1/{kind}/{it.get('uid')}", token)
                    print(f"  removed existing {kind} {it.get('name')!r} -> {d}")

    print()
    ok = True
    for kind, items in (("region", regions), ("tripwire", tripwires)):
        for body in items:
            st, resp = call("POST", f"/api/v1/{kind}", token, body)
            if st in (200, 201):
                uid = resp.get("uid") if isinstance(resp, dict) else "?"
                print(f"  created {kind:9} {body['name']:20} uid={uid}")
            else:
                ok = False
                print(f"  FAILED  {kind:9} {body['name']:20} {st} {resp}")

    print("\nverify:")
    for plural in ("regions", "tripwires"):
        st, got = call("GET", f"/api/v1/{plural}", token)
        items = (got.get("results", got) if isinstance(got, dict) else got) or []
        for it in items:
            print(f"  {plural[:-1]:9} {it.get('name'):20} points={it.get('points')}")
    return 0 if ok else 1


if __name__ == "__main__":
    sys.exit(main())
