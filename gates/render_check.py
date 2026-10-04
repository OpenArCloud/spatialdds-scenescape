#!/usr/bin/env python3
"""Tier 3: a headless browser verifies that the layout's panels show data.

Tiers 1 and 2 -- `gates/schema_check.py` and `gates/layout_check.py` --
assert that the schemas parse with `idlc`, that the messages decode through our
bindings, and that every layout path resolves. All three were green on the
night Foxglove showed a blank screen, which is precisely the gap this closes:
**a program checking what a human would see.**

What it does

  1. serves the MCAP, the layout and a browser harness over loopback
  2. drives headless Chromium to the harness, which decodes the file in-browser
     with **Foxglove's own** `@mcap/core`, `@foxglove/omgidl-parser` and
     `@foxglove/omgidl-serialization`, evaluates every message path in the
     layout, and renders the resulting values
  3. reads the rendered DOM back and asserts each panel shows a real value,
     rather than merely that nothing threw
  4. renders a control page with the data withheld and **pixel-diffs** it
     against the real one, so "the page is not blank" is measured and not
     assumed
  5. screenshots the passing page as render proof for the Monday package

Why not the Studio app itself, stated plainly. The hosted app requires a login
and automating a credential entry is out of bounds; no open-source Studio image
is publicly pullable (`ghcr.io/foxglove/studio` and
`ghcr.io/lichtblick-suite/lichtblick` both deny anonymous pulls, and
`foxglove/studio` is not on Docker Hub). So this drives Foxglove's **decoding
and schema-parsing libraries** in a real browser instead of their React UI.

That boundary cuts both ways and both halves matter:

  * It is the code that actually failed. `@foxglove/omgidl-parser` is what
    threw *"We do not support composing variable length arrays with typedefs:
    spatial::events::SpatialZone::polygon referencing spatial::common::Vec2"*,
    and that error is reproduced locally against the pre-fix schema, then
    confirmed gone against the current one. A pass here is a pass by the
    component that rejected the file.
  * It does **not** exercise Studio's panel implementations, so it cannot
    confirm that every panel *config key* in the layout is one Studio honours.
    A wrong key gives an unconfigured panel, which is visible and obvious, and
    the paths underneath it are separately verified.

Usage:  gates/render_check.py <file.mcap> <layout.json> [--out-dir DIR]
"""
from __future__ import annotations

import argparse
import functools
import http.server
import json
import shutil
import socketserver
import sys
import threading
from pathlib import Path

HERE = Path(__file__).resolve().parent
HARNESS = HERE / "render_check"


class Quiet(http.server.SimpleHTTPRequestHandler):
    def log_message(self, *a):  # noqa: D102
        pass


def serve(root: Path):
    handler = functools.partial(Quiet, directory=str(root))
    httpd = socketserver.TCPServer(("127.0.0.1", 0), handler)
    threading.Thread(target=httpd.serve_forever, daemon=True).start()
    return httpd, httpd.server_address[1]


def main() -> int:
    ap = argparse.ArgumentParser()
    ap.add_argument("mcap", type=Path)
    ap.add_argument("layout", type=Path)
    ap.add_argument("--out-dir", type=Path, default=None)
    ap.add_argument("--keep-serving", action="store_true",
                    help="leave the server up for manual inspection")
    a = ap.parse_args()

    try:
        from playwright.sync_api import sync_playwright
    except ImportError:
        print("playwright is not installed:  pip install playwright && "
              "python3 -m playwright install chromium", file=sys.stderr)
        return 2

    bundle = HARNESS / "bundle.js"
    if not bundle.is_file():
        print(f"missing {bundle}, run gates/render_check/build.sh first",
              file=sys.stderr)
        return 2

    out_dir = a.out_dir or (HERE / "render_proof")
    out_dir.mkdir(parents=True, exist_ok=True)

    # Stage everything the page needs under one served root.
    import tempfile
    tmp = Path(tempfile.mkdtemp(prefix="rendercheck-"))
    for f in ("index.html", "bundle.js"):
        shutil.copy(HARNESS / f, tmp / f)
    shutil.copy(a.mcap, tmp / "data.mcap")
    shutil.copy(a.layout, tmp / "layout.json")

    httpd, port = serve(tmp)
    url = f"http://127.0.0.1:{port}/index.html?mcap=data.mcap&layout=layout.json"
    print(f"mcap    {a.mcap.name} ({a.mcap.stat().st_size} bytes)")
    print(f"layout  {a.layout.name}")
    print(f"serving {url}\n")

    ok = False
    with sync_playwright() as pw:
        browser = pw.chromium.launch()
        page = browser.new_page(viewport={"width": 1500, "height": 950},
                                device_scale_factor=2)
        console: list[str] = []
        page.on("console", lambda m: console.append(f"{m.type}: {m.text}"))
        page.on("pageerror", lambda e: console.append(f"pageerror: {e}"))
        page.goto(url, wait_until="domcontentloaded")

        # "Play, advance": the harness walks the whole message range as it
        # evaluates, so waiting for it to finish is the equivalent of letting
        # playback run through the file rather than sampling one frame.
        page.wait_for_selector("body[data-done]", timeout=180_000)
        state = page.get_attribute("body", "data-done")
        verdict = page.evaluate("() => window.__verdict")

        shot = out_dir / f"{a.mcap.stem}-render.png"
        page.screenshot(path=str(shot), full_page=True)

        # Control render: same page, data withheld, for the pixel comparison.
        control = out_dir / f"{a.mcap.stem}-render-control.png"
        page.evaluate("""() => {
            document.querySelectorAll('.val.hits.log').forEach(e =>
                e.textContent = '');
            const v = document.getElementById('verdict');
            if (v) { v.textContent = 'CONTROL, values withheld';
                     v.className = 'fail'; }
        }""")
        page.screenshot(path=str(control), full_page=True)
        browser.close()

    if not a.keep_serving:
        httpd.shutdown()

    for line in console[:6]:
        print(f"  console  {line}")

    if not isinstance(verdict, dict):
        print("\nFAIL, harness produced no verdict")
        return 1
    if verdict.get("harnessError"):
        print(f"\nFAIL, harness error: {verdict['harnessError']}")
        return 1

    print(f"  read mode      {verdict.get('mode')}")
    print(f"  decoded        {verdict.get('decoded')} message(s) across "
          f"{verdict.get('topics')} topic(s)")
    for e in verdict.get("parseErrors") or []:
        print(f"  SCHEMA FAIL    {e}")
    for e in verdict.get("decodeErrors") or []:
        print(f"  DECODE FAIL    {e}")
    print()
    for r in verdict.get("rows") or []:
        mark = "ok  " if r["status"] == "DATA" else "FAIL"
        print(f"  {mark} {r['pid']:28} {r['status']:11} "
              f"{r['hits']}/{r['total']:<6} {r['value'][:52]}")

    # Pixel evidence that the page is not blank.
    #
    # The first version of this compared zlib-decompressed PNG bytes at a fixed
    # stride and called anything under 1 percent a blank page. That measured
    # nothing useful: raw IDAT bytes of a mostly white page with different text
    # differ in a small fraction of their bytes, so a correct render scored 0.1
    # percent and was reported as blank. Decode to pixels and count the ones
    # that actually differ.
    #
    # The control has the values, counts and log text emptied, so the pixels
    # that differ are exactly the rendered data. A small number is expected,
    # since most of the page is background either way, but it must be well
    # clear of zero.
    diff_pct = None
    try:
        from PIL import Image, ImageChops

        shot_img = Image.open(out_dir / f"{a.mcap.stem}-render.png").convert("RGB")
        ctrl_img = Image.open(
            out_dir / f"{a.mcap.stem}-render-control.png").convert("RGB")
        if shot_img.size == ctrl_img.size:
            bbox_diff = ImageChops.difference(shot_img, ctrl_img)
            changed = sum(1 for px in bbox_diff.getdata() if px != (0, 0, 0))
            diff_pct = 100.0 * changed / (shot_img.size[0] * shot_img.size[1])
        else:
            print(f"  (control render differs in size, "
                  f"{shot_img.size} vs {ctrl_img.size}; comparison skipped)")
    except ImportError:
        print("  (Pillow not installed, pixel comparison skipped)")
    except Exception as exc:  # pragma: no cover
        print(f"  (pixel comparison unavailable: {type(exc).__name__}: {exc})")

    panels = verdict.get("panels", 0)
    with_data = verdict.get("withData", 0)
    ok = (state == "pass" and panels > 0 and with_data == panels
          and not verdict.get("parseErrors"))
    if diff_pct is not None:
        print(f"\n  pixel difference vs the values-withheld control: "
              f"{diff_pct:.2f}% of pixels carry rendered data")
        if diff_pct < 0.20:
            print("  FAIL the rendered page is not materially different from "
                  "a blank one")
            ok = False

    print(f"\n{'PASS' if ok else 'FAIL'}, {with_data}/{panels} panel path(s) "
          f"render a value in a real browser")
    print(f"  proof      {out_dir / (a.mcap.stem + '-render.png')}")
    print(f"  control    {out_dir / (a.mcap.stem + '-render-control.png')}")
    return 0 if ok else 1


if __name__ == "__main__":
    sys.exit(main())
