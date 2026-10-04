"""Write the sidecar's typed output stream to MCAP. the MCAP recording step.

**Encoding: CDR with omgidl schemas.** One schema per IDL type, carrying the
`.idl` source text; one channel per topic, `message_encoding="cdr"`; each
message the exact bytes `sample.serialize()` puts on the wire. So the file
holds the same octets DDS carried, and a schema-aware reader decodes it
without any of our code, which is the claim the addendum wants to be able to
make in the Intel email.

Relationship to the demo repo's recorder. `SpatialDDS-demo/bridges/mcap_bridge/
recorder.py` writes **JSON with jsonschema** instead, and its docstring says
why: "MCAP tooling (`mcap cat`, Foxglove) reads it without a plugin, and that
is worth more here than byte-for-byte CDR fidelity." That trade was right for
its purpose. It is the wrong one here, for two reasons:

  1. The point of this run is that the traffic *is* typed 1.8 CDR. A JSON
     transcription is evidence about our serializer, not about the wire.
  2. omgidl + CDR is read natively by current Foxglove, so the plugin argument
     that motivated JSON no longer costs what it did.

The schema registry here is therefore deliberately NOT the demo's, it carries
IDL text rather than generated JSON Schema, and nothing is copied from it.
Cited because the addendum asked which path was taken: this is the other one,
on purpose.
"""
from __future__ import annotations

import time
from pathlib import Path
from typing import Any

from mcap.writer import Writer

# Which .idl file defines each module, so a schema can carry its own source.
_IDL_FOR_MODULE = {
    "spatial.core": "core.idl",
    "spatial.common": "types.idl",
    "spatial.semantics": "semantics.idl",
    "spatial.events": "events.idl",
    "spatial.disco": "discovery.idl",
    "builtin": "types.idl",
}


class McapOut:
    """One MCAP file, channels created on first use of a (topic, type) pair."""

    def __init__(self, path: Path, idl_dir: Path, run_label: str) -> None:
        self._path = Path(path)
        self._idl_dir = Path(idl_dir)
        self._fh = open(self._path, "wb")
        self._w = Writer(self._fh)
        self._w.start(profile="x-spatialdds", library="scenescape-sidecar")
        self._schemas: dict[str, int] = {}
        self._channels: dict[tuple[str, str], int] = {}
        self._seq: dict[int, int] = {}
        self.counts: dict[str, int] = {}
        self._run_label = run_label

    # -- schemas ---------------------------------------------------------
    def _flatten(self, fname: str, seen: set[str] | None = None) -> list[str]:
        """One IDL file plus its includes, inlined, with no directives left.

        **Why this is flattened here rather than shipped verbatim.** Foxglove's
        omgidl parser implements exactly one preprocessor rule --
        `importDcl -> "#" "include"` -- and has no production for `#ifndef`,
        `#define` or `#endif`. This tree guards its *includes* rather than its
        file bodies:

            #ifndef SPATIAL_CORE_INCLUDED
            #define SPATIAL_CORE_INCLUDED
            #include "core.idl"
            #endif

        so a reader that resolves the include then meets the next guard and
        fails with `Unexpected NAME token: "ifndef"`. Shipping the raw file
        made every channel in the MCAP unreadable in Foxglove -- nine errors on
        a nine-channel file -- while `mcap` and our own round-trip gates were
        perfectly happy, because neither of them parses the IDL.

        Resolving the includes ourselves and dropping every `#` line gives a
        single self-contained translation unit with no preprocessor in it at
        all. That is strictly more useful as a schema payload too: the text
        now carries every type the struct references instead of pointing at
        files a reader does not have.

        Depth-first, dependencies before dependents, each file once.
        """
        if seen is None:
            seen = set()
        if fname in seen:
            return []
        seen.add(fname)
        path = self._idl_dir / fname
        if not path.is_file():
            return []

        body: list[str] = []
        deps: list[str] = []
        for line in path.read_text().splitlines():
            stripped = line.lstrip()
            if stripped.startswith("#"):
                # The only directive that carries meaning for us is include;
                # guards exist to make the C preprocessor idempotent and we
                # achieve the same thing with `seen`.
                if stripped.startswith("#include"):
                    q = stripped.find('"')
                    if q != -1:
                        end = stripped.find('"', q + 1)
                        if end != -1:
                            deps.extend(self._flatten(stripped[q + 1:end], seen))
                continue
            body.append(line)
        return deps + [f"// ---- {fname} ----"] + body

    def _idl_text(self, typename: str) -> bytes:
        """The IDL source for a type, flat and self-contained."""
        module = typename.rsplit(".", 1)[0]
        fname = _IDL_FOR_MODULE.get(module)
        if fname is None:
            return b""
        lines = self._flatten(fname)
        if not lines:
            return b""
        header = [
            "// Flattened for the MCAP schema payload: includes resolved and",
            "// preprocessor directives removed, so this is a single",
            "// self-contained translation unit. Generated by",
            "// sidecar/mcap_out.py; the authoritative sources are the",
            "// SpatialDDS 1.8 idl/ tree.",
            "",
        ]
        return ("\n".join(header + lines) + "\n").encode()

    @staticmethod
    def schema_name(typename: str) -> str:
        """`spatial.events.SpatialZone` -> `spatial::events::SpatialZone`.

        The dotted form is cyclonedds-py's `__idl_typename__`. MCAP's omgidl
        encoding wants the **fully-qualified IDL type name**, and IDL's scope
        separator is `::` -- which is also what a reader gets when it parses
        the schema text and assembles qualified names from nested `module`
        blocks. A dotted name parses fine and then fails to resolve, which
        would have been the next failure after the preprocessor one.

        The dotted form is not lost: it stays on the channel as
        `spatialdds_type` metadata, so anything that wants cyclonedds'
        spelling still has it, and switching back is a one-line change if a
        given reader turns out to prefer dots.
        """
        return typename.replace(".", "::")

    def _schema_id(self, typename: str) -> int:
        sid = self._schemas.get(typename)
        if sid is None:
            sid = self._w.register_schema(
                name=self.schema_name(typename), encoding="omgidl",
                data=self._idl_text(typename))
            self._schemas[typename] = sid
        return sid

    def _channel_id(self, topic: str, typename: str) -> int:
        key = (topic, typename)
        cid = self._channels.get(key)
        if cid is None:
            cid = self._w.register_channel(
                topic=topic,
                message_encoding="cdr",
                schema_id=self._schema_id(typename),
                metadata={
                    "spatialdds_version": "1.8",
                    "spatialdds_type": typename,
                    "producer": "scenescape-sidecar",
                    "run": self._run_label,
                },
            )
            self._channels[key] = cid
            self._seq[cid] = 0
        return cid

    # -- messages --------------------------------------------------------
    def write(self, topic: str, sample: Any, log_time_ns: int | None = None) -> None:
        """Append one typed sample. `log_time` is the sample's own stamp when
        it has one, so the file's timeline is the data's, not the writer's."""
        typename = getattr(type(sample), "__idl_typename__", None) or \
            f"{type(sample).__module__.split('._')[0]}.{type(sample).__name__}"
        cid = self._channel_id(topic, typename)
        data = sample.serialize()
        now = time.time_ns()
        stamp = log_time_ns if log_time_ns is not None else now
        self._seq[cid] += 1
        self._w.add_message(channel_id=cid, log_time=stamp, data=data,
                            publish_time=now, sequence=self._seq[cid])
        self.counts[topic] = self.counts.get(topic, 0) + 1

    def close(self) -> dict[str, int]:
        self._w.finish()
        self._fh.close()
        return dict(self.counts)

    def __enter__(self) -> "McapOut":
        return self

    def __exit__(self, *exc: object) -> None:
        self.close()
