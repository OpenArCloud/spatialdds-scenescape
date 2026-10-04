// Browser-side render harness for the tier-3 loadability check.
//
// Decodes the MCAP with *Foxglove's own* libraries -- @mcap/core for the file,
// @foxglove/omgidl-parser for the schema text, @foxglove/omgidl-serialization
// for the CDR bodies -- then evaluates every message path in the layout and
// renders the values into the DOM. Playwright reads the DOM back and
// screenshots it.
//
// Why these libraries rather than the Studio app: the hosted app requires a
// login, and no open-source Studio image is publicly pullable (both ghcr paths
// deny anonymous access). But the parser here is the exact package that
// produced the error James saw --
//
//   "We do not support composing variable length arrays with typedefs:
//    spatial::events::SpatialZone::polygon referencing spatial::common::Vec2"
//
// is thrown by @foxglove/omgidl-parser, reproduced locally against the
// pre-fix schema. So a pass here is a pass by the code that failed, which is
// the part of Studio that was actually rejecting our file.

import { McapIndexedReader, McapStreamReader } from "@mcap/core";
// Our MCAPs use zstd chunk compression, which @mcap/core does not decompress
// on its own -- it takes a handler, exactly as Foxglove Studio supplies one.
// Without this the file reports "Unsupported compression zstd", which is a
// reader-configuration issue rather than a defect in the file.
//
// `fzstd` rather than Foxglove's `@foxglove/wasm-zstd`: the latter needs node
// shims and a .wasm loader to bundle for the browser, and decompression is not
// the thing under test here. The parts that matter -- the schema parser and
// the CDR deserializer -- remain Foxglove's own. Swapping the decompressor
// cannot mask a schema or decode fault, because a wrong decompression would
// corrupt every message rather than quietly pass one.
import { decompress as fzstdDecompress } from "fzstd";
import { parseIDL } from "@foxglove/omgidl-parser";
import { MessageReader } from "@foxglove/omgidl-serialization";

const MAX_MESSAGES = 4000;

function stepsOf(path) {
  // .field | [N] | [:] | [:]{key=="value"}
  const re = /\.(\w+)|\[(\d+)\]|\[:\](?:\{(\w+)\s*==\s*"([^"]*)"\})?/g;
  const out = [];
  let m;
  while ((m = re.exec(path)) !== null) {
    if (m[1] !== undefined) out.push({ kind: "field", name: m[1] });
    else if (m[2] !== undefined) out.push({ kind: "index", i: Number(m[2]) });
    else out.push({ kind: "each", key: m[3], val: m[4] });
  }
  return out;
}

// Foxglove's deserializer returns a fixed-size IDL array as a TYPED ARRAY --
// `double[3]` comes back as a Float64Array, not a JS Array. An `Array.isArray`
// guard therefore rejects `position[0]`, which is how this harness first
// reported the position plot as EMPTY when the data was in fact there and
// indexable. Sequences of structs do come back as real Arrays, so both shapes
// have to be accepted.
function isIndexable(v) {
  return Array.isArray(v) || ArrayBuffer.isView(v);
}

function walk(value, steps) {
  let cur = value;
  for (const s of steps) {
    if (cur == null) return undefined;
    if (s.kind === "field") {
      if (isIndexable(cur)) return undefined;
      cur = cur[s.name];
    } else if (s.kind === "index") {
      if (!isIndexable(cur) || s.i >= cur.length) return undefined;
      cur = cur[s.i];
    } else {
      if (!isIndexable(cur) || cur.length === 0) return undefined;
      if (s.key == null) cur = cur[0];
      else {
        const hit = Array.from(cur).find((e) => String(e?.[s.key]) === s.val);
        if (hit === undefined) return undefined;
        cur = hit;
      }
    }
  }
  return cur;
}

function collectPaths(layout) {
  const out = [];
  for (const [pid, cfg] of Object.entries(layout.configById ?? {})) {
    if (typeof cfg !== "object" || cfg == null) continue;
    if (typeof cfg.topicPath === "string" && cfg.topicPath.trim())
      out.push([pid, cfg.topicPath]);
    for (const key of ["paths", "series"])
      for (const e of cfg[key] ?? [])
        if (e && typeof e.value === "string" && e.value.trim())
          out.push([pid, e.value]);
    if (typeof cfg.path === "string" && cfg.path.trim())
      out.push([pid, cfg.path]);
  }
  return out;
}

function splitTopic(path, topics) {
  const sorted = [...topics].sort((a, b) => b.length - a.length);
  for (const t of sorted) {
    if (path === t) return [t, ""];
    if (path.startsWith(t) && (path[t.length] === "." || path[t.length] === "["))
      return [t, path.slice(t.length)];
  }
  return null;
}

function fmt(v) {
  if (v === undefined) return ", ";
  if (v === null) return "null";
  if (typeof v === "number") return Number.isInteger(v) ? String(v) : v.toFixed(6);
  if (typeof v === "bigint") return String(v);
  if (typeof v === "string") return v;
  if (Array.isArray(v) || ArrayBuffer.isView(v))
    return `[${v.length}] ` + Array.from(v).slice(0, 3).map(fmt).join(", ");
  if (typeof v === "object") {
    const keys = Object.keys(v).slice(0, 4);
    return `{${keys.map((k) => `${k}: ${fmt(v[k])}`).join(", ")}}`;
  }
  return String(v);
}

async function readAll(buf) {
  // Indexed read where possible; fall back to a stream read.
  const bytes = new Uint8Array(buf);
  const out = [];
  const channels = new Map();
  const schemas = new Map();
  const decompressHandlers = {
    // fzstd's second argument is the OUTPUT BUFFER, not a size hint -- passing
    // the number straight through fails with "out.subarray is not a function".
    zstd: (compressed, decompressedSize) =>
      fzstdDecompress(compressed, new Uint8Array(Number(decompressedSize))),
  };
  try {
    const reader = await McapIndexedReader.Initialize({
      readable: {
        size: async () => BigInt(bytes.length),
        read: async (offset, length) =>
          bytes.subarray(Number(offset), Number(offset + length)),
      },
      decompressHandlers,
    });
    for (const s of reader.schemasById.values()) schemas.set(s.id, s);
    for (const c of reader.channelsById.values()) channels.set(c.id, c);
    let n = 0;
    for await (const msg of reader.readMessages()) {
      out.push(msg);
      if (++n >= MAX_MESSAGES) break;
    }
    return { messages: out, channels, schemas, mode: "indexed" };
  } catch (err) {
    const sr = new McapStreamReader({ includeChunks: true,
                                      decompressHandlers });
    sr.append(bytes);
    let rec;
    while ((rec = sr.nextRecord()) != null) {
      if (rec.type === "Schema") schemas.set(rec.id, rec);
      else if (rec.type === "Channel") channels.set(rec.id, rec);
      else if (rec.type === "Message" && out.length < MAX_MESSAGES) out.push(rec);
    }
    return { messages: out, channels, schemas, mode: "stream" };
  }
}

async function run() {
  const log = [];
  const say = (s) => log.push(s);
  const params = new URLSearchParams(location.search);
  const mcapUrl = params.get("mcap") ?? "data.mcap";
  const layoutUrl = params.get("layout") ?? "layout.json";

  const [mcapBuf, layout] = await Promise.all([
    fetch(mcapUrl).then((r) => r.arrayBuffer()),
    fetch(layoutUrl).then((r) => r.json()),
  ]);

  const { messages, channels, schemas, mode } = await readAll(mcapBuf);
  say(`mcap read via ${mode}: ${messages.length} message(s), ` +
      `${channels.size} channel(s), ${schemas.size} schema(s)`);

  // Foxglove's parser + deserializer, one per schema.
  const readers = new Map();
  const parseErrors = [];
  for (const sch of schemas.values()) {
    const text = new TextDecoder().decode(sch.data);
    try {
      const defs = parseIDL(text);
      readers.set(sch.id, new MessageReader(sch.name, defs));
      say(`schema OK  ${sch.name}  (${defs.length} definitions)`);
    } catch (e) {
      parseErrors.push(`${sch.name}: ${String(e.message).split("\n")[0]}`);
      say(`schema FAIL ${sch.name}: ${String(e.message).split("\n")[0]}`);
    }
  }

  // Decode, grouped by topic.
  const byTopic = new Map();
  const topicOf = new Map();
  for (const [id, ch] of channels) topicOf.set(id, ch.topic);
  let decoded = 0;
  const decodeErrors = [];
  for (const msg of messages) {
    const ch = channels.get(msg.channelId);
    if (!ch) continue;
    const rd = readers.get(ch.schemaId);
    if (!rd) continue;
    try {
      const v = rd.readMessage(msg.data);
      if (!byTopic.has(ch.topic)) byTopic.set(ch.topic, []);
      byTopic.get(ch.topic).push(v);
      decoded++;
    } catch (e) {
      if (decodeErrors.length < 3)
        decodeErrors.push(`${ch.topic}: ${String(e.message).split("\n")[0]}`);
    }
  }
  say(`decoded ${decoded} message(s) across ${byTopic.size} topic(s)`);

  // Evaluate the layout's paths.
  const topics = new Set(topicOf.values());
  const rows = [];
  for (const [pid, path] of collectPaths(layout)) {
    const split = splitTopic(path, topics);
    if (!split) {
      rows.push({ pid, path, status: "NO TOPIC", value: ", ", hits: 0, total: 0 });
      continue;
    }
    const [topic, rest] = split;
    const msgs = byTopic.get(topic) ?? [];
    const steps = stepsOf(rest);
    let firstIdx = -1;
    let hits = 0;
    let shown;
    msgs.forEach((m, i) => {
      const v = walk(m, steps);
      if (v !== undefined) {
        hits++;
        if (firstIdx < 0) {
          firstIdx = i;
          shown = v;
        }
      }
    });
    rows.push({
      pid, path,
      status: hits > 0 ? "DATA" : (msgs.length ? "EMPTY" : "NO MESSAGES"),
      value: fmt(shown), hits, total: msgs.length, firstIdx,
    });
  }

  // Render.
  const el = document.getElementById("out");
  el.innerHTML = "";
  const h = document.createElement("div");
  h.className = "log";
  h.textContent = log.join("\n");
  el.appendChild(h);

  const table = document.createElement("table");
  table.innerHTML =
    "<thead><tr><th>panel</th><th>status</th><th>value at first match</th>" +
    "<th>matches</th><th>path</th></tr></thead>";
  const tb = document.createElement("tbody");
  for (const r of rows) {
    const tr = document.createElement("tr");
    tr.className = r.status === "DATA" ? "ok" : "bad";
    tr.innerHTML =
      `<td class="pid">${r.pid}</td>` +
      `<td class="status">${r.status}</td>` +
      `<td class="val">${r.value}</td>` +
      `<td class="hits">${r.hits}/${r.total}` +
      (r.firstIdx > 0 ? ` <span class="dim">first@${r.firstIdx}</span>` : "") +
      `</td>` +
      `<td class="path">${r.path}</td>`;
    tb.appendChild(tr);
  }
  table.appendChild(tb);
  el.appendChild(table);

  const verdict = {
    parseErrors, decodeErrors,
    panels: rows.length,
    withData: rows.filter((r) => r.status === "DATA").length,
    rows: rows.map((r) => ({ pid: r.pid, status: r.status, hits: r.hits,
                             total: r.total, value: r.value })),
    decoded, topics: byTopic.size, mode,
  };
  const pass = parseErrors.length === 0 && verdict.withData === verdict.panels;
  const banner = document.createElement("div");
  banner.id = "verdict";
  banner.className = pass ? "pass" : "fail";
  banner.textContent = pass
    ? `RENDER OK, ${verdict.withData}/${verdict.panels} panel paths show data`
    : `RENDER FAIL, ${verdict.withData}/${verdict.panels} panel paths show data`
      + (parseErrors.length ? `, ${parseErrors.length} schema parse error(s)` : "");
  el.insertBefore(banner, h);

  window.__verdict = verdict;
  document.body.setAttribute("data-done", pass ? "pass" : "fail");
}

run().catch((e) => {
  document.getElementById("out").textContent = "HARNESS ERROR: " + e.stack;
  window.__verdict = { harnessError: String(e.message) };
  document.body.setAttribute("data-done", "error");
});
