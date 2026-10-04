# spatialdds-scenescape

A northbound translator that publishes Intel SceneScape's scene analytics as
typed SpatialDDS 1.8 samples. It runs beside SceneScape as an ordinary MQTT
client. It does not modify SceneScape, and it never publishes back to it.

```
  +-------------------------------------------------+
  |  SceneScape 2026.1.0, stock, unmodified          |
  |                                                  |
  |   cameras -> DL Streamer -> scene controller     |
  |                      |                           |
  |                      v                           |
  |              Mosquitto broker                    |
  +----------------------|--------------------------+
                         |
                         |  subscribe only
                         |  regulated/scene, data/camera,
                         |  data/region, event
                         v
              +---------------------------+
              |  sidecar                  |
              |                           |
              |  route.Router             |
              |  mapping                  |
              +------------+--------------+
                           |
                           |  publish
                           v
              SpatialDDS 1.8 over DDS, and MCAP

              FusedTrackSet     SpatialZone
              Detection2DSet    CrossingLine
              SpatialEvent      GeoAnchor
                                FrameTransform
                           |
                           v
              watcher, Foxglove, any DDS reader
```

There is no arrow back into SceneScape. That is the point of the design, not
an omission from the diagram. The sidecar holds one MQTT subscription and one
read-only REST call for scene configuration. Stopping it stops the DDS side
and leaves SceneScape running untouched.

One read of SceneScape's REST API is required and cannot be avoided. Zone and
crossing line geometry, camera to scene membership, and the georeference are
not discoverable from the message bus. A zone that nobody walks into publishes
nothing at all, so listening can never tell you it exists.

## What it is

The mappings, each from a SceneScape payload or configuration object to a
1.8 type:

| SceneScape | SpatialDDS 1.8 |
|---|---|
| `regulated/scene` | `FusedTrackSet` |
| `data/camera/<id>` | `Detection2DSet` |
| `event/region/...`, `event/tripwire/...` | `SpatialEvent` |
| scene regions | `SpatialZone` |
| scene tripwires | `CrossingLine` |
| scene georeference | `GeoAnchor` and `FrameTransform` |

Zones, lines, anchors and transforms are latched. They are published once with
RELIABLE and TRANSIENT_LOCAL durability, so a reader that joins late still
learns the layout.

Rollback is `docker stop` on the sidecar process, or Ctrl-C if you run it in a
terminal. Nothing in SceneScape changes state when it goes away.

## Status

Read this before you rely on it.

**Built against pinned versions.** SceneScape at tag `2026.1.0`, commit
`91afcb747dc9b9985ccaa036c760f18a71ef19a2`. SpatialDDS 1.8 at spec commit
`424a8b3d8e0c3fab24c32de9fa146f8b9180a8f2`. The generated bindings in
`spatialdds18/` carry that spec commit in `_provenance.py`.

**Validated by replay against recorded traffic.** Two recordings totalling
52,861 real MQTT messages from a running deployment were replayed through the
translator and reconciled against their inputs message by message. The sample
in this repository is the translated output of the larger of the two, 30,701
input messages becoming 15,584 typed samples. Live dry runs confirmed the same
code path against a live broker, in runs lasting tens of seconds.

**1.8 is a draft.** It is open to amendment, and this adapter has already
caused two amendments to it. If the draft changes, the bindings here need
regenerating and the wire format may move with them.

**Not long soaked.** The longest continuous live run to date is measured in
minutes, not days. There is no evidence here about memory behaviour, broker
reconnection over hours, or what happens across a SceneScape restart while the
sidecar is attached.

**One known consumer quirk.** `Vec2` is declared APPENDABLE rather than FINAL
so that its elements are delimited on the wire. FINAL would be correct under
XCDR2 and four octets per vertex smaller, but a widely used omgidl
deserializer requires a delimiter on every nested struct element regardless of
declared extensibility, and rejects the FINAL form. The reasoning is recorded
in the IDL beside the type.

## Quickstart

### See the data in 30 seconds, no setup

The repository ships a recorded sample and a matching Foxglove layout.

1. Open `samples/queuing-retail-sample.mcap` in Foxglove.
2. Import `samples/queuing-retail-sample.layout.json` from the layout menu.
3. Press play.

You get raw `FusedTrackSet` and `SpatialEvent` messages, a plot of one
person's position through the scene, the zone events as a timeline band, and
the latched zone and crossing line definitions. `samples/render-proof.png`
shows what it should look like.

The sample is 15,584 samples across nine topics from two scenes and four
cameras, including two zones, one crossing line and 80 zone events. Encoding
is CDR with omgidl schemas carrying the IDL, so any schema aware reader
decodes it without code from this repository.

### Run it against your own SceneScape

You need a working SceneScape deployment. Follow their own getting started
guide first and confirm their demo produces detections before adding anything
here.

```sh
# 1. capture the scene configuration the translator needs
python3 tools/fetch_scene_config.py --out samples/scene-config-live.json \
    --resolution <scene-uid> <map-width-px> <map-height-px>

# 2. run the translator; it subscribes, maps, publishes DDS and writes MCAP
sudo tools/bridge_live.sh samples/scene-config-live.json out.mcap

# 3. in another terminal, watch the typed output come back off DDS
PYTHONPATH=. python3 -m sidecar.watch --scene <scene-uid> \
    --cameras <cam1>,<cam2>
```

`SCENESCAPE_ROOT` points at your SceneScape checkout and defaults to
`/opt/scenescape`. The password file argument refers to SceneScape's own
superuser credential file, which these tools read and never write.

Optional setup, both through SceneScape's documented REST API:

```sh
python3 tools/configure_scene.py --scene <scene-uid>        # regions, tripwires
python3 tools/enable_georeference.py --scene <scene-uid> \
    --resolution <w> <h> --lat <lat> --lon <lon> --yaw <deg>
```

Turning the georeference on makes the translator publish `GeoAnchor` and
`FrameTransform`, and switches tracks from a local frame to one anchored on
the earth.

### Requirements

Python 3.10 or later, `cyclonedds` with its Python bindings, and the `mcap`
package. The render gate additionally needs Node and Playwright, and skips
cleanly when they are absent.

## Evidence

The gates below are how the numbers in this README were produced. Six of them
run on the shipped sample with no deployment at all:

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

| gate | what it establishes |
|---|---|
| `bindings_roundtrip` | all 103 generated structs import and round trip through CDR |
| `golden_vector` | the georeference reproduces SceneScape's own published worked example to 0.0018 m |
| `golden_point` | it reproduces their live per object latitude and longitude to 0.009 mm, on recorded samples |
| `schema_check` | every embedded schema is self contained, correctly named, and compiles, and every channel's first message decodes |
| `layout_check` | every message path in the Foxglove layout resolves against the file |
| `render_check` | a headless browser decodes the file with Foxglove's own libraries and renders a value for all nine panel paths |

Three more gates need a recorded corpus rather than an MCAP, because they
reconcile the translator's output against its input. Record one from your own
deployment with `tools/record_corpus.sh`, then:

```sh
PYTHONPATH=. python3 tools/replay_to_mcap.py <corpus-dir> \
    --scene-config samples/scene-config.json --label replay
PYTHONPATH=. python3 gates/conservation_audit.py <corpus-dir> <corpus-dir>/replay.mcap
PYTHONPATH=. python3 gates/determinism.py <corpus-dir> \
    --scene-config samples/scene-config.json
PYTHONPATH=. python3 gates/route_regress.py <corpus-dir> \
    --scene-config samples/scene-config.json
```

| gate | what it establishes |
|---|---|
| `conservation_audit` | every input topic is accounted for, and every one to one mapping is exact. It imports neither the translator nor the bindings, so it is an independent count |
| `determinism` | two replays of the same input produce byte identical content, hashing topic, schema, timestamp and body |
| `route_regress` | four specific past defects stay fixed: camera to scene attribution, dwell values taken from the event rather than joined from another topic, per scene sequence numbering, and the exit event payload shape |

The render gate drives Foxglove's own `@mcap/core`, `@foxglove/omgidl-parser`
and `@foxglove/omgidl-serialization` in headless Chromium. It does not drive
the Foxglove application, so it cannot confirm that every panel setting in the
layout is one the application honours. It does confirm that the schemas parse
and the messages decode, which is where the real failures were.

## Repository layout

```
sidecar/        the translator: router, mapping, bridge, MCAP writer, watcher
spatialdds18/   generated Python bindings, with the spec commit recorded
idl/v1.8/       the SpatialDDS IDL the bindings were generated from
tools/          recording, replay, scene configuration, layout generation
gates/          everything in the evidence section
samples/        the sample recording, its layout, render proof, scene config
```

Regenerate the bindings after a spec change with
`python3 tools/generate_bindings.py`. It writes the spec commit into
`spatialdds18/_provenance.py` so a binding tree can always be traced back.

## Credits

Intel SceneScape is the source system. Their 2026.1.0 release, their demo data
and their functional test suite were used throughout. The worked georeference
example in their test suite found a real bug in this adapter, which is the
best argument for shipping test vectors that we know of.

SpatialDDS 1.8's observer pose covariance work, including the `CovScope`
composition guard, came out of review with the SceneScape team. Their
fused tracks carry observer uncertainty that had no home in 1.7.

Pinned versions, both verifiable:

- SceneScape `2026.1.0`, commit `91afcb747dc9b9985ccaa036c760f18a71ef19a2`
- SpatialDDS spec commit `424a8b3d8e0c3fab24c32de9fa146f8b9180a8f2`

## Licence

MIT, see `LICENSE`. The SpatialDDS IDL under `idl/` comes from the SpatialDDS
specification repository and carries its own SPDX headers.
