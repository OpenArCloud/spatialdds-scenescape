# spatialdds-scenescape

Publishes Intel SceneScape's scene analytics as typed SpatialDDS 1.8 samples.
It runs beside SceneScape as an ordinary MQTT client. It changes nothing in
SceneScape and never publishes back to it. Stop it and their stack carries on.

![SceneScape publishes MQTT, the sidecar translates, SpatialDDS comes out](samples/architecture.png)

Here is what comes out, in Foxglove, from the sample recording in this
repository. Every value on screen was decoded by Foxglove from the schemas the
file carries. Nothing from here is running.

![The sample recording open in Foxglove with the shipped layout](samples/foxglove-screenshot.png)

## Try it in 30 seconds

1. Open `samples/queuing-retail-sample.mcap` in Foxglove.
2. Import `samples/queuing-retail-sample.layout.json` from the layout menu.
3. Press play.

15,584 typed samples from a running deployment: two scenes, four cameras, two
zones, one crossing line, 80 zone events. CDR with omgidl schemas, so any
schema aware reader decodes it without code from this repository.

## How it fits

The sidecar holds one MQTT subscription and one read-only REST call. The REST
call cannot be avoided: zone geometry, camera to scene membership and the
georeference are not discoverable from the bus. A zone nobody walks into
publishes nothing at all, so listening can never tell you it exists.

| SceneScape | SpatialDDS 1.8 |
|---|---|
| `regulated/scene` | `FusedTrackSet` |
| `data/camera/<id>` | `Detection2DSet` |
| `event/region/...`, `event/tripwire/...` | `SpatialEvent` |
| scene regions | `SpatialZone` |
| scene tripwires | `CrossingLine` |
| scene georeference | `GeoAnchor`, `FrameTransform` |

Zones, lines, anchors and transforms are latched: published once, RELIABLE and
TRANSIENT_LOCAL, so a late reader still gets the layout.

## Status

Built against [Intel SceneScape][ss] `2026.1.0`, commit
[`91afcb747dc9b9985ccaa036c760f18a71ef19a2`][sspin], and [SpatialDDS 1.8][sd]
at spec commit
[`424a8b3d8e0c3fab24c32de9fa146f8b9180a8f2`][sdpin]. Both pins are also
recorded in `idl/PROVENANCE` and `spatialdds18/_provenance.py`.

Validated by replay. Two recordings totalling 52,861 real MQTT messages were
translated and reconciled against their inputs. The sample here is the output
of the larger one: 30,701 messages in, 15,584 typed samples out. The live path
has been run against a real broker, in runs lasting tens of seconds.

Not long soaked. Nothing here tells you about memory over hours, broker
reconnection, or a SceneScape restart underneath a running sidecar.

1.8 is a draft. This adapter has already caused two amendments to it. If it
changes again the bindings need regenerating, and the wire may move with them.

One oddity worth knowing: `Vec2` is APPENDABLE rather than FINAL, so its
elements are delimited. FINAL is correct under XCDR2 and four octets smaller
per vertex, but a widely used omgidl deserializer wants a delimiter on every
nested struct element whatever the schema says, and rejects the FINAL form.
The reasoning is in the IDL beside the type.

## Run it against your own SceneScape

Get their demo working first and confirm it produces detections.

```sh
# the scene configuration the translator needs
python3 tools/fetch_scene_config.py --out samples/scene-config-live.json \
    --resolution <scene-uid> <map-width-px> <map-height-px>

# subscribe, translate, publish DDS, write MCAP
sudo tools/bridge_live.sh samples/scene-config-live.json out.mcap

# in another terminal, read the typed output back off DDS
PYTHONPATH=. python3 -m sidecar.watch --scene <scene-uid> --cameras <cam1>,<cam2>
```

`SCENESCAPE_ROOT` points at your SceneScape checkout, default
`/opt/scenescape`. The password file argument names SceneScape's own superuser
credential file, which these tools read and never write.

Optional, both through their documented REST API:

```sh
python3 tools/configure_scene.py --scene <scene-uid>
python3 tools/enable_georeference.py --scene <scene-uid> \
    --resolution <w> <h> --lat <lat> --lon <lon> --yaw <deg>
```

Georeferencing makes the sidecar publish `GeoAnchor` and `FrameTransform`, and
moves tracks from a local frame onto the earth.

Needs Python 3.10 or later, `cyclonedds` with its Python bindings, and `mcap`.
The render gate also wants Node and Playwright, and skips cleanly without them.

## Evidence

These produced the numbers above. Six run on the shipped sample, no deployment
needed:

```sh
PYTHONPATH=. python3 gates/bindings_roundtrip.py
PYTHONPATH=. python3 gates/golden_vector.py
PYTHONPATH=. python3 gates/golden_point.py --recorded
PYTHONPATH=. python3 gates/schema_check.py samples/queuing-retail-sample.mcap
PYTHONPATH=. python3 gates/layout_check.py \
    samples/queuing-retail-sample.layout.json samples/queuing-retail-sample.mcap
PYTHONPATH=. python3 gates/render_check.py \
    samples/queuing-retail-sample.mcap samples/queuing-retail-sample.layout.json
```

| gate | what it shows |
|---|---|
| `bindings_roundtrip` | 103 generated structs import and round trip through CDR |
| `golden_vector` | the georeference matches SceneScape's own worked example to 0.0018 m |
| `golden_point` | and their live per object latitude and longitude to 0.009 mm |
| `schema_check` | every embedded schema is self contained, named correctly, compiles, and its first message decodes |
| `layout_check` | every path in the Foxglove layout resolves against the file |
| `render_check` | a headless browser decodes the file with Foxglove's own libraries and renders all nine panel paths |

Three more need a recording rather than an MCAP, because they reconcile output
against input. Make one with `tools/record_corpus.sh`, then:

```sh
PYTHONPATH=. python3 tools/replay_to_mcap.py <corpus-dir> \
    --scene-config samples/scene-config.json --label replay
PYTHONPATH=. python3 gates/conservation_audit.py <corpus-dir> <corpus-dir>/replay.mcap
PYTHONPATH=. python3 gates/determinism.py <corpus-dir> \
    --scene-config samples/scene-config.json
PYTHONPATH=. python3 gates/route_regress.py <corpus-dir> \
    --scene-config samples/scene-config.json
```

| gate | what it shows |
|---|---|
| `conservation_audit` | every input topic accounted for, every one to one mapping exact. Imports neither the translator nor the bindings, so the count is independent |
| `determinism` | two replays of the same input give byte identical content |
| `route_regress` | four past defects stay fixed: camera to scene attribution, dwell read from the event rather than joined, per scene sequence numbers, and the exit event payload shape |

`render_check` drives Foxglove's `@mcap/core`, `@foxglove/omgidl-parser` and
`@foxglove/omgidl-serialization` in headless Chromium. It is not the Foxglove
application, so it cannot tell you that every panel setting is one the app
honours. It does tell you the schemas parse and the messages decode, which is
where the failures were.

## Layout

```
sidecar/        router, mapping, bridge, MCAP writer, watcher
spatialdds18/   generated bindings, with the spec commit recorded
idl/v1.8/       the IDL they came from, and its PROVENANCE
tools/          recording, replay, scene config, layout generation
gates/          everything above
samples/        the recording, its layout, screenshots, scene config
```

`python3 tools/generate_bindings.py` regenerates the bindings from `idl/`. It
reproduces `spatialdds18/` byte for byte.

## Credits

[Intel SceneScape][ss] is the source system. Their release, their demo data
and their functional tests were used throughout. The worked georeference
example in their test suite found a real bug in this adapter, which is the
best argument for shipping test vectors we know of.

[SpatialDDS][sd] 1.8's observer pose covariance work, including the `CovScope`
composition guard, came out of review with the SceneScape team. Their fused
tracks carry observer uncertainty that had nowhere to go in 1.7.

## Licence

MIT, see `LICENSE`. The IDL under `idl/` comes from the [SpatialDDS
specification][sd] and keeps its own SPDX headers.

[ss]: https://github.com/open-edge-platform/scenescape
[sspin]: https://github.com/open-edge-platform/scenescape/commit/91afcb747dc9b9985ccaa036c760f18a71ef19a2
[sd]: https://github.com/OpenArCloud/SpatialDDS-spec
[sdpin]: https://github.com/OpenArCloud/SpatialDDS-spec/commit/424a8b3d8e0c3fab24c32de9fa146f8b9180a8f2
