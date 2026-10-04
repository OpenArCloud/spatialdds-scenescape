# Samples

`queuing-retail-sample.mcap` is a recording from a running SceneScape
2026.1.0 demo deployment, translated to SpatialDDS 1.8. Two scenes, four
cameras, 15,584 samples across nine topics, including two zones, one crossing
line and 80 zone events.

`queuing-retail-sample.layout.json` is a Foxglove layout for it. Open the
MCAP, import the layout. The layout is generated from the file by
`tools/make_foxglove_layout.py` rather than written by hand, so its message
paths cannot reference a topic or field the file does not contain.

`architecture.png` is the diagram used in the top-level README.

`foxglove-screenshot.png` is the sample open in Foxglove with the layout
applied. It was taken before the files were renamed for publication, so the
title bar shows the recording's working name rather than
`queuing-retail-sample`. The contents are the same file.

`render-proof.png` is the output of `gates/render_check.py` against both,
showing a decoded value for every panel path. It is a different thing from the
screenshot: the screenshot is Foxglove, the proof is a headless browser
asserting that each panel path yields a value.

`scene-config.json` is the scene configuration that was in force when the
recording was made, as SceneScape's REST API returned it. It is required to
replay the recording, because zone geometry and camera to scene membership
cannot be recovered from the message bus. The scene and region identifiers in
it match the ones in the MCAP.

`live-geo-samples.json` holds nine paired scene coordinates and latitude and
longitude values taken live from a georeferenced deployment, with the scene
state that produced them. `gates/golden_point.py --recorded` uses it to check
the georeference against the producer's own output without needing a
deployment.
