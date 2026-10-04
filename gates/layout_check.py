#!/usr/bin/env python3
"""Does every message path in a Foxglove layout resolve against the MCAP?

Held to the same standard as the rest of the evidence: a layout is a claim
about the file's contents, so it gets checked mechanically rather than by
opening it and looking. A layout that references a topic that is not there, or
a field that was renamed, produces an empty panel -- which is exactly the
failure mode the layout exists to prevent, and which no amount of "it loaded
fine" would reveal.

Deliberately independent of `tools/make_foxglove_layout.py`. It re-derives
everything from the layout JSON and the MCAP and never imports the generator,
so a generator bug cannot be self-confirming. This is the same reason the
replay and live paths were made to disagree before being trusted.

For every path it extracts, it checks:

  * the topic exists in the MCAP
  * each `.field` step exists on the decoded message at that point
  * each `[N]` index is in range on a real message
  * each `[:]{field=="value"}` filter names a real field **and matches at least
    one element** -- an unmatched filter is a silently empty plot, which is the
    subtlest way a layout can be wrong
  * every panel id in the mosaic tree has a config, and vice versa

Message path syntax supported is the subset the layouts use: `topic`,
`.field`, `[N]`, `[:]`, and `[:]{field=="value"}`.

Usage:  gates/layout_check.py <layout.json> <file.mcap>
"""
from __future__ import annotations

import argparse
import json
import re
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
if str(ROOT) not in sys.path:
    sys.path.insert(0, str(ROOT))

from mcap.reader import make_reader                            # noqa: E402

_STEP = re.compile(
    r"""\.(?P<field>\w+)            # .field
      | \[(?P<index>\d+)\]          # [3]
      | \[:\](?:\{(?P<fkey>\w+)\s*==\s*"(?P<fval>[^"]*)"\})?   # [:] or [:]{k=="v"}
    """,
    re.VERBOSE,
)


def collect_paths(doc: dict) -> list[tuple[str, str]]:
    """(panel id, message path) for every path a panel config references."""
    out: list[tuple[str, str]] = []
    for pid, cfg in (doc.get("configById") or {}).items():
        if not isinstance(cfg, dict):
            continue
        tp = cfg.get("topicPath")
        if isinstance(tp, str) and tp.strip():
            out.append((pid, tp))
        for key in ("paths", "series"):
            for entry in (cfg.get(key) or []):
                if isinstance(entry, dict):
                    v = entry.get("value")
                    if isinstance(v, str) and v.strip():
                        out.append((pid, v))
                elif isinstance(entry, str) and entry.strip():
                    out.append((pid, entry))
        for key in ("path", "diffTopicPath"):
            v = cfg.get(key)
            if isinstance(v, str) and v.strip():
                out.append((pid, v))
    return out


def panel_ids(node) -> list[str]:
    """Panel ids referenced by the mosaic tree."""
    if isinstance(node, str):
        return [node]
    if isinstance(node, dict):
        return panel_ids(node.get("first")) + panel_ids(node.get("second"))
    return []


def split_topic(path: str, topics: set[str]) -> tuple[str, str] | None:
    """Longest topic prefix that is a real topic, plus the remaining steps."""
    for t in sorted(topics, key=len, reverse=True):
        if path == t:
            return t, ""
        if path.startswith(t) and path[len(t)] in ".[":
            return t, path[len(t):]
    return None


def getfield(obj, name: str):
    return getattr(obj, name)


def walk(obj, steps: str) -> tuple[bool, str]:
    """Follow the steps against a decoded message. (ok, detail)."""
    pos = 0
    cur = obj
    while pos < len(steps):
        m = _STEP.match(steps, pos)
        if not m:
            return False, f"unparsable path at {steps[pos:]!r}"
        pos = m.end()
        if m.group("field"):
            name = m.group("field")
            if isinstance(cur, list):
                return False, f".{name} applied to a sequence; need [N] or [:]"
            try:
                cur = getfield(cur, name)
            except AttributeError:
                have = sorted(getattr(cur, "__dataclass_fields__", {}) or {})
                return False, (f"no field {name!r} on "
                               f"{type(cur).__name__}; has {have[:8]}"
                               + ("..." if len(have) > 8 else ""))
        elif m.group("index") is not None:
            i = int(m.group("index"))
            if not isinstance(cur, (list, tuple)):
                return False, f"[{i}] applied to {type(cur).__name__}"
            if i >= len(cur):
                return False, f"[{i}] out of range (len {len(cur)})"
            cur = cur[i]
        else:
            if not isinstance(cur, (list, tuple)):
                return False, f"[:] applied to {type(cur).__name__}"
            key, val = m.group("fkey"), m.group("fval")
            if key is None:
                if not cur:
                    return False, "[:] over an empty sequence"
                cur = cur[0]
            else:
                if not cur:
                    return False, f'[:]{{{key}=="{val}"}} over an empty sequence'
                try:
                    getfield(cur[0], key)
                except AttributeError:
                    return False, (f"filter field {key!r} not on "
                                   f"{type(cur[0]).__name__}")
                hit = [e for e in cur if str(getfield(e, key)) == val]
                if not hit:
                    return False, (f'filter {key}=="{val}" matched nothing '
                                   f"in this message")
                cur = hit[0]
    return True, type(cur).__name__


def main() -> int:
    ap = argparse.ArgumentParser()
    ap.add_argument("layout", type=Path)
    ap.add_argument("mcap", type=Path)
    a = ap.parse_args()

    doc = json.loads(a.layout.read_text())

    # Decode one message per topic, and keep a few for filtered paths: a
    # track-id filter only matches while that track is in frame, so checking a
    # single arbitrary message would report a false failure.
    import importlib

    def resolve(qualified: str):
        parts = qualified.split("::")
        leaf, mod = parts[-1], ".".join(parts[:-1])
        for cand in (f"spatialdds18.{mod}._{parts[-2]}",
                     f"spatialdds18.{mod}._types",
                     f"spatialdds18.{mod}._core"):
            try:
                return getattr(importlib.import_module(cand), leaf)
            except (ImportError, AttributeError):
                continue
        return None

    # EVERY message, not a prefix. The first version sampled the opening 400
    # per topic and reported a track-id filter as matching nothing -- which was
    # true of the opening but false of the file, since that track appears a
    # third of the way in. A prefix sample can fail a good path and, worse,
    # pass a bad one, so the window is the whole recording.
    #
    # Position within the file is kept as well as presence: a path that only
    # resolves late is not a dead path, but it IS a panel that is blank when
    # playback starts, and that distinction is the whole point of the layout.
    samples: dict[str, list] = {}
    schema_of: dict[str, str] = {}
    index: dict[str, list[int]] = {}
    with open(a.mcap, "rb") as f:
        for sch, ch, msg in make_reader(f).iter_messages():
            schema_of[ch.topic] = sch.name
            got = samples.setdefault(ch.topic, [])
            idx = index.setdefault(ch.topic, [])
            cls = resolve(sch.name)
            if cls is not None:
                try:
                    got.append(cls.deserialize(msg.data))
                    idx.append(len(idx))
                except Exception:
                    pass
    topics = set(schema_of)

    print(f"layout {a.layout}")
    print(f"mcap   {a.mcap}")
    print(f"       {len(topics)} topic(s)\n")

    ok = True

    # Structural: mosaic ids and configs must correspond exactly.
    ids_tree = set(panel_ids(doc.get("layout")))
    ids_cfg = set((doc.get("configById") or {}).keys())
    for extra in sorted(ids_tree - ids_cfg):
        print(f"  FAIL panel {extra} is in the layout tree with no config")
        ok = False
    for extra in sorted(ids_cfg - ids_tree):
        print(f"  FAIL panel {extra} has a config but is not in the layout")
        ok = False
    if ids_tree == ids_cfg:
        print(f"  ok   {len(ids_tree)} panel(s), tree and configs agree")

    for pid, path in collect_paths(doc):
        split = split_topic(path, topics)
        if split is None:
            guess = [t for t in topics if path.startswith(t.split("/")[0])]
            print(f"  FAIL {pid}: no such topic in this file")
            print(f"       path {path}")
            if guess:
                print(f"       file has {len(guess)} topic(s) with that prefix")
            ok = False
            continue
        topic, steps = split
        msgs = samples.get(topic) or []
        if not msgs:
            print(f"  FAIL {pid}: topic present but no message decoded")
            print(f"       {topic}")
            ok = False
            continue
        results = [walk(m, steps) for m in msgs]
        where = [i for i, r in enumerate(results) if r[0]]
        if where:
            kind = next(r[1] for r in results if r[0])
            n = len(msgs)
            if len(where) == n:
                scope = f"all {n} message(s)"
            else:
                scope = (f"{len(where)}/{n} message(s), "
                         f"first at {where[0]} of {n}")
            print(f"  ok   {pid}: {kind} in {scope}")
            print(f"       {path}")
            # A path that first resolves well into the recording leaves its
            # panel empty at t=0. Not a dead path, so not a failure -- but it
            # defeats the layout's purpose, so it is called out loudly.
            if where[0] > max(1, int(n * 0.05)):
                print(f"       WARN panel is blank for the first "
                      f"{where[0]} message(s) of {n}; a reviewer pressing "
                      f"Play sees nothing until then")
                ok = False
        else:
            print(f"  FAIL {pid}: {results[0][1]}")
            print(f"       {path}")
            ok = False

    print(f"\n{'PASS' if ok else 'FAIL'}, layout "
          f"{'references only what the file contains' if ok else 'has dead paths'}")
    return 0 if ok else 1


if __name__ == "__main__":
    sys.exit(main())
