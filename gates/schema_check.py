#!/usr/bin/env python3
"""Are the MCAP's embedded schemas actually readable by a schema-aware reader?

This gate exists because nine channels of a nine-channel file were unopenable
in Foxglove while every other gate was green. Nothing we had looked at the IDL
text: the conservation audit counts messages, the determinism check hashes
bytes, and the round-trip gates decode with our own bindings. The schema
payload was the one part of the file no gate examined, so it was the one part
that was wrong.

Two independent faults, both found by actually opening the file:

  1. **Preprocessor directives.** The payload was the raw `.idl` file, and this
     tree guards its includes rather than its bodies (`#ifndef GUARD` /
     `#define GUARD` / `#include "x.idl"` / `#endif`). Foxglove's omgidl
     grammar implements exactly one directive, `"#" "include"`, so it resolved
     the include, met the next `#ifndef`, and failed with
     `Unexpected NAME token: "ifndef"`.
  2. **Schema naming.** The name was cyclonedds-py's dotted
     `__idl_typename__`. An omgidl reader assembles qualified names from
     nested `module` blocks, so it is looking for `spatial::events::SpatialZone`.
     That one parses and then fails to resolve -- the failure waiting behind
     the first.

What this asserts, per channel:

  * the message encoding is `cdr` and the schema encoding is `omgidl`
  * the schema payload is non-empty
  * it contains **no** preprocessor directives at all
  * the schema name is `::`-qualified, not dotted
  * the name's final component is defined as a `struct` in the payload
  * every `module` the name traverses appears in the payload
  * **no sequence uses an array typedef as its element type** -- the third
    fault, found after the first two were fixed: `sequence<Vec2>` over
    `typedef double Vec2[2]` is legal IDL that idlc accepts and omgidl
    consumers refuse. Fixed in the spec (`Vec2` is now a FINAL struct,
    spec commit a240ae7); asserted here so it cannot come back.
  * `idlc` compiles the payload (optional; skipped when idlc is absent)
  * **the first message on every channel decodes** through the generated
    bindings -- parse alone proves the schema is readable, not that the
    messages match it

The last two together are what makes this the *loadability* gate rather than a
schema linter: a file is loadable when every channel's schema parses and its
first message decodes against that schema.

Usage:  gates/schema_check.py <file.mcap> [--no-idlc]
"""
from __future__ import annotations

import argparse
import re
import shutil
import subprocess
import sys
import tempfile
from pathlib import Path

from mcap.reader import make_reader

ROOT = Path(__file__).resolve().parent.parent
if str(ROOT) not in sys.path:
    sys.path.insert(0, str(ROOT))

# Element types that are array typedefs. A sequence over one of these is the
# construct omgidl consumers refuse; scanning the payload for the typedefs it
# actually declares keeps the check honest as the tree changes.
_TYPEDEF_ARRAY = re.compile(
    r"^\s*typedef\s+\w+\s+(\w+)\s*\[", re.MULTILINE)
_SEQUENCE_OF = re.compile(r"sequence\s*<\s*([\w:]+)")


def array_typedef_sequences(text: str) -> list[str]:
    """Names used both as an array typedef and as a sequence element type."""
    arrays = set(_TYPEDEF_ARRAY.findall(text))
    if not arrays:
        return []
    bad = []
    for elem in _SEQUENCE_OF.findall(text):
        leaf = elem.rsplit("::", 1)[-1]
        if leaf in arrays:
            bad.append(elem)
    return sorted(set(bad))


def resolve_type(qualified: str):
    """`spatial::events::SpatialZone` -> the generated binding class, or None."""
    parts = qualified.split("::")
    if len(parts) < 2:
        return None
    leaf = parts[-1]
    mod = ".".join(parts[:-1])
    import importlib
    for candidate in (f"spatialdds18.{mod}._{parts[-2]}",
                      f"spatialdds18.{mod}._types",
                      f"spatialdds18.{mod}._core"):
        try:
            return getattr(importlib.import_module(candidate), leaf)
        except (ImportError, AttributeError):
            continue
    return None


def main() -> int:
    ap = argparse.ArgumentParser()
    ap.add_argument("mcap", type=Path)
    ap.add_argument("--no-idlc", action="store_true")
    a = ap.parse_args()

    with open(a.mcap, "rb") as f:
        reader = make_reader(f)
        summary = reader.get_summary()
        schemas = {s.id: s for s in summary.schemas.values()}
        channels = list(summary.channels.values())
        # First message per channel, for the decode half of the gate.
        first: dict[int, bytes] = {}
        for _sch, ch, msg in reader.iter_messages():
            first.setdefault(ch.id, msg.data)

    print(f"mcap {a.mcap}")
    print(f"  {len(channels)} channel(s), {len(schemas)} schema(s)\n")

    idlc = shutil.which("idlc") if not a.no_idlc else None
    if not a.no_idlc and idlc is None:
        print("  note: idlc not on PATH, skipping the compile check\n")

    ok = True
    compiled: dict[int, bool] = {}
    for ch in sorted(channels, key=lambda c: c.topic):
        sch = schemas.get(ch.schema_id)
        checks: list[tuple[str, bool]] = []
        if sch is None:
            print(f"  FAIL {ch.topic}: no schema")
            ok = False
            continue
        text = sch.data.decode("utf-8", "replace")
        directives = [l for l in text.splitlines() if l.lstrip().startswith("#")]
        leaf = sch.name.split("::")[-1]
        mods = sch.name.split("::")[:-1]

        checks.append(("message encoding is cdr", ch.message_encoding == "cdr"))
        checks.append(("schema encoding is omgidl", sch.encoding == "omgidl"))
        checks.append(("schema payload is non-empty", bool(text.strip())))
        checks.append((f"no preprocessor directives ({len(directives)} found)",
                       not directives))
        checks.append(("schema name is ::-qualified, not dotted",
                       "::" in sch.name and "." not in sch.name))
        checks.append((f"struct {leaf} is defined in the payload",
                       re.search(rf"\bstruct\s+{re.escape(leaf)}\b", text) is not None))
        for m in mods:
            checks.append((f"module {m} appears in the payload",
                           re.search(rf"\bmodule\s+{re.escape(m)}\b", text) is not None))

        bad_seq = array_typedef_sequences(text)
        checks.append((f"no sequence over an array typedef"
                       + (f" (found {', '.join(bad_seq)})" if bad_seq else ""),
                       not bad_seq))

        if idlc is not None:
            if sch.id not in compiled:
                with tempfile.TemporaryDirectory() as td:
                    p = Path(td) / "schema.idl"
                    p.write_text(text)
                    r = subprocess.run([idlc, "-l", "c", p.name], cwd=td,
                                       capture_output=True)
                    compiled[sch.id] = r.returncode == 0
                    if r.returncode != 0:
                        err = (r.stderr or r.stdout).decode("utf-8", "replace")
                        print(f"  idlc stderr for {sch.name}:\n"
                              + "\n".join("      " + l for l in err.splitlines()[:4]))
            checks.append(("idlc compiles the payload", compiled[sch.id]))

        # The decode half. A schema that parses proves the file is *readable*;
        # it does not prove the messages match it. Decoding the first message
        # on each channel and re-encoding it closes that gap, and would catch a
        # schema that is valid but describes the wrong type -- the failure a
        # linter cannot see.
        raw = first.get(ch.id)
        if raw is None:
            checks.append(("channel carries at least one message", False))
        else:
            cls = resolve_type(sch.name)
            if cls is None:
                checks.append((f"binding resolvable for {sch.name}", False))
            else:
                try:
                    val = cls.deserialize(raw)
                    rt = cls.serialize(val) == raw
                    checks.append((f"first message decodes ({len(raw)} B)", True))
                    checks.append(("and re-encodes to the same bytes", rt))
                except Exception as exc:
                    checks.append((f"first message decodes "
                                   f"({type(exc).__name__}: {exc})", False))

        bad = [c for c in checks if not c[1]]
        status = "ok  " if not bad else "FAIL"
        print(f"  {status} {ch.topic}")
        print(f"       schema {sch.name}  ({len(text.splitlines())} lines)")
        for label, passed in checks:
            if not passed:
                print(f"       FAIL {label}")
        ok = ok and not bad

    print(f"\n{'PASS' if ok else 'FAIL'}, {len(channels)} channel(s): schemas "
          f"{'are self-contained and resolvable' if ok else 'are not readable'}")
    return 0 if ok else 1


if __name__ == "__main__":
    sys.exit(main())
