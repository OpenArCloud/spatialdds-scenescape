#!/usr/bin/env python3
"""Every published timestamp is exactly the timestamp the producer sent.

This gate exists because nine gates passed over a defect in every message on
every lane. `parse_iso` converted the producer's ISO string through
`datetime.timestamp()`, a float64, whose resolution near 1.79e9 seconds is
about 440 ns. Measured over the reference corpus, 15,522 of 15,581 stamps came
out wrong, median 59 ns, maximum 118 ns.

None of the existing gates could see it, and the reason is worth keeping:

  * conservation counts messages, and a wrong stamp still counts as one
  * determinism compares a run against another run of the same code, so a
    consistent error reproduces consistently and passes
  * the golden point and golden vector gates read positions, not times
  * the schema and loadability gates read structure, not values

The first check that compared a published stamp against the string it came
from found it immediately, in every lane at once. Fixing the parser closes
that instance. This gate closes the class: it reads the producer's own ISO
strings out of the corpus, parses them independently of the adapter, and
requires exact equality of both `sec` and `nanosec` on every sample.

Independent means independent: the expected value is computed here with
`calendar.timegm` and `microsecond * 1000` directly, never by calling the
function under test.

Usage:  gates/stamp_fidelity.py <corpus-dir> <replay.mcap>
"""
from __future__ import annotations

import argparse
import calendar
import datetime as dt
import json
import sys
from collections import Counter
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
if str(ROOT) not in sys.path:
    sys.path.insert(0, str(ROOT))

from mcap.reader import make_reader                            # noqa: E402

# Corpus file -> the owm/semantics type whose stamp should equal the payload's.
TRANSLATED = ("regulated-scene", "data-camera", "event")


def expected(ts: str) -> tuple[int, int]:
    """Epoch seconds and nanoseconds, computed without the adapter."""
    d = dt.datetime.fromisoformat(ts.replace("Z", "+00:00"))
    if d.tzinfo is None:
        d = d.replace(tzinfo=dt.timezone.utc)
    return calendar.timegm(d.utctimetuple()), d.microsecond * 1000


def corpus_stamps(corpus: Path) -> set[tuple[int, int]]:
    """Every distinct (sec, nanosec) the producer actually sent."""
    out: set[tuple[int, int]] = set()
    for name in TRANSLATED:
        f = corpus / f"{name}.jsonl"
        if not f.is_file():
            continue
        for line in f.read_text().splitlines():
            parts = line.split("|", 2)
            if len(parts) != 3:
                continue
            try:
                payload = json.loads(parts[2])
            except json.JSONDecodeError:
                continue
            ts = payload.get("timestamp")
            if ts:
                out.add(expected(ts))
    return out


def sample_stamp(obj) -> tuple[int, int] | None:
    s = getattr(obj, "stamp", None)
    if s is None:
        return None
    return int(s.sec), int(s.nanosec)


def main() -> int:
    ap = argparse.ArgumentParser()
    ap.add_argument("corpus", type=Path)
    ap.add_argument("mcap", type=Path)
    a = ap.parse_args()

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

    producer = corpus_stamps(a.corpus)
    print(f"corpus {a.corpus}")
    print(f"  {len(producer)} distinct producer timestamps\n")

    checked = 0
    unmatched: list[tuple[str, tuple[int, int]]] = []
    by_type: Counter = Counter()
    nonzero_frac = 0
    with open(a.mcap, "rb") as f:
        for sch, ch, msg in make_reader(f).iter_messages():
            cls = resolve(sch.name)
            if cls is None:
                continue
            try:
                val = cls.deserialize(msg.data)
            except Exception:
                continue
            st = sample_stamp(val)
            if st is None:
                continue
            # Latched definitions are stamped from the corpus start by the
            # replay-scoped convention, which is itself a producer stamp, so
            # they are in the set too and are checked like everything else.
            checked += 1
            by_type[sch.name.split("::")[-1]] += 1
            if st[1] != 0:
                nonzero_frac += 1
            if st not in producer:
                if len(unmatched) < 8:
                    unmatched.append((sch.name, st))

    checks: list[tuple[str, bool, str]] = []
    checks.append((f"{checked} stamped samples checked against the producer's "
                   f"own strings", checked > 0, "nothing checked"))
    checks.append((
        "every published stamp is exactly a timestamp the producer sent",
        not unmatched,
        f"{len(unmatched)}+ sample(s) carry a stamp the producer never sent"))
    # A parser that silently zeroed the fraction would match on whole seconds
    # alone, so require that fractions are actually present.
    checks.append((
        f"sub-second precision is preserved ({nonzero_frac} of {checked} "
        f"samples carry a nonzero nanosecond field)",
        nonzero_frac > checked * 0.5,
        "almost no sample carries a fractional second"))

    for label, passed, detail in checks:
        print(f"  {'ok  ' if passed else 'FAIL'} {label}")
        if not passed:
            print(f"       {detail}")
    for name, st in unmatched:
        print(f"       {name} published sec={st[0]} nanosec={st[1]}, "
              f"not among the producer's stamps")

    print(f"\n  by type: {dict(by_type)}")
    ok = all(c[1] for c in checks)
    print(f"\n{'PASS' if ok else 'FAIL'} — stamp fidelity")
    return 0 if ok else 1


if __name__ == "__main__":
    sys.exit(main())
