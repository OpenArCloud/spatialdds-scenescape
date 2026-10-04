#!/usr/bin/env python3
"""binding round-trip gate: the generated 1.8 bindings import, and every struct round-trips.

"It compiles" is not the bar. Raw ``idlc -l py`` output compiles and then
fails to import (``name 'CovarianceType' is not defined``), so compilation
proves nothing about usability. This gate is:

  1. every generated module imports;
  2. every IdlStruct in it can be constructed, serialized to CDR, and
     deserialized back equal.

(2) is what catches a binding that imports but whose field types or
annotations are wrong, which is the failure mode a translator would hit at
the first publish, in a container, at the end of a pipeline.
"""
from __future__ import annotations

import collections.abc
import dataclasses
import enum
import importlib
import pkgutil
import sys
import typing
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
sys.path.insert(0, str(ROOT))

from cyclonedds.idl import IdlStruct, IdlUnion            # noqa: E402
import cyclonedds.idl.types as pt                          # noqa: E402

PACKAGE = "spatialdds18"


def _modules() -> list[str]:
    pkg = importlib.import_module(PACKAGE)
    found = [PACKAGE]
    for m in pkgutil.walk_packages(pkg.__path__, PACKAGE + "."):
        found.append(m.name)
    return sorted(found)


def _resolve_ref(dotted: str):
    """Import a quoted absolute ref the way cyclonedds does."""
    mod, name = dotted, ""
    while mod:
        try:
            m = importlib.import_module(mod)
        except ImportError:
            mod, _, head = mod.rpartition(".")
            name = head if not name else f"{head}.{name}"
            continue
        obj = m
        for part in [p for p in name.split(".") if p]:
            obj = getattr(obj, part, None)
            if obj is None:
                return None
        return obj
    return None


def _synth(tp, depth=0):
    """A representative value for an idlc-generated annotation.

    Shapes that matter, all confirmed by introspection rather than by
    string-matching reprs:

      fixed array      Annotated[Sequence[X], typedef[.., array[X, N]]]
                       -> N elements; the length lives ONLY in the metadata,
                          so unwrapping to the base Sequence loses it and
                          produces a 1-element value the encoder rejects.
      bounded sequence Annotated[Sequence[X], sequence[.., max]]  -> 1 element
      typedef          metadata .subtype is itself Annotated; recurse
      union case       Annotated[Optional[X], case[[..], X]]      -> X
    """
    # Generous: the deepest real chain is nine levels (AnchorSetResponse ->
    # AnchorSet -> anchors[] -> AnchorEntry -> geopose -> GeoPose -> cov ->
    # CovMatrix -> case -> uint8). A cap of 8 silently returned None at the
    # bottom and the encoder rejected the whole struct. The IDL types are
    # acyclic, so this only guards against a generator bug, not recursion.
    if depth > 24:
        return None

    # The metadata objects also appear as annotations in their own right,
    # because idlc emits module-level typedefs (Vec3, ZoneKind...) and a
    # field may be annotated with the typedef object directly rather than
    # with Annotated[...]. Without these three branches such fields silently
    # synthesize as None and the encoder rejects them.
    if isinstance(tp, pt.typedef):
        return _synth(tp.subtype, depth + 1)
    if isinstance(tp, pt.array):
        return [_synth(tp.subtype, depth + 1) for _ in range(tp.length)]
    if isinstance(tp, pt.sequence):
        return [_synth(tp.subtype, depth + 1)]

    if typing.get_origin(tp) is typing.Annotated:
        args = typing.get_args(tp)
        for m in args[1:]:
            if isinstance(m, pt.array):
                return [_synth(m.subtype, depth + 1) for _ in range(m.length)]
            if isinstance(m, pt.sequence):
                return [_synth(m.subtype, depth + 1)]
            if isinstance(m, pt.typedef):
                return _synth(m.subtype, depth + 1)
            if m == "char":
                return "a"
        return _synth(args[0], depth + 1)

    origin = typing.get_origin(tp)
    targs = typing.get_args(tp)

    if origin is typing.Union:
        non_none = [a for a in targs if a is not type(None)]
        return _synth(non_none[0], depth + 1) if non_none else None

    if origin in (list, collections.abc.Sequence, typing.Sequence):
        return [_synth(targs[0], depth + 1)] if targs else []

    if isinstance(tp, typing.ForwardRef):
        return _synth(_resolve_ref(tp.__forward_arg__), depth + 1)
    if isinstance(tp, str):
        # A quoted cross-module ref such as
        # 'spatialdds18.spatial.common.FrameRef'. cyclonedds resolves these by
        # importing the absolute path, so the harness must too; treating them
        # as unresolvable makes every nested struct synthesize as None.
        r = _resolve_ref(tp)
        return _synth(r, depth + 1) if r is not None else None
    if tp is bool:
        return True
    if tp is int:
        return 1
    if tp is float:
        return 1.5
    if tp is str:
        return "x"
    if tp is bytes:
        return b"\x01"

    if isinstance(tp, type) and issubclass(tp, enum.Enum):
        return list(tp)[0]

    if isinstance(tp, type) and issubclass(tp, IdlUnion):
        # Not a dataclass. Set exactly one case; cyclonedds derives the
        # discriminator from which case was supplied.
        name, ann = next(iter(tp.__annotations__.items()))
        return tp(**{name: _synth(ann, depth + 1)})

    if isinstance(tp, type) and issubclass(tp, IdlStruct):
        return _build(tp, depth + 1)

    return None


_GLOBALNS = None


def _globalns():
    """Namespace that can resolve the generated quoted forward refs.

    nest_packages rewrites nested refs to absolute dotted paths
    ('spatialdds18.spatial.common.Mat3x3') because cyclonedds resolves them
    with import_module, not against module globals. get_type_hints resolves
    against globals, so it needs the top package bound by name or every hint
    lookup raises NameError.
    """
    global _GLOBALNS
    if _GLOBALNS is None:
        _GLOBALNS = {PACKAGE: importlib.import_module(PACKAGE)}
    return _GLOBALNS


def _build(cls, depth=0):
    kwargs = {}
    try:
        hints = typing.get_type_hints(cls, globalns=_globalns(), include_extras=True)
    except Exception:
        hints = {}
    for f in dataclasses.fields(cls):
        kwargs[f.name] = _synth(hints.get(f.name, f.type), depth)
    return cls(**kwargs)


def main() -> int:
    mods = _modules()
    total_structs = 0
    failures: list[str] = []
    per_mod: list[tuple[str, int]] = []

    for name in mods:
        try:
            mod = importlib.import_module(name)
        except Exception as e:
            failures.append(f"{name}: IMPORT FAILED {type(e).__name__}: {e}")
            continue
        structs = [
            o for n, o in vars(mod).items()
            if isinstance(o, type) and issubclass(o, IdlStruct)
            and o is not IdlStruct and o.__module__ == name
        ]
        ok = 0
        for s in structs:
            try:
                inst = _build(s)
                raw = inst.serialize()
                back = type(inst).deserialize(raw)
                if back != inst:
                    failures.append(f"{name}.{s.__name__}: round-trip MISMATCH")
                else:
                    ok += 1
            except Exception as e:
                failures.append(f"{name}.{s.__name__}: {type(e).__name__}: {e}")
        total_structs += len(structs)
        if structs:
            per_mod.append((name, ok))

    print(f"modules imported: {len(mods) - len([f for f in failures if 'IMPORT FAILED' in f])}/{len(mods)}")
    for n, ok in per_mod:
        print(f"  {n:46} {ok} struct(s) round-tripped")
    print(f"structs: {total_structs} found")
    if failures:
        print(f"\nFAILURES ({len(failures)}):")
        for f in failures[:40]:
            print("  " + f)
        return 1
    print("\nbinding round-trip gate PASS, imports clean, every struct round-trips CDR")
    return 0


if __name__ == "__main__":
    sys.exit(main())
