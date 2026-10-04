"""SpatialDDS 1.8 topic names for the sidecar.

Constructed per §3.3.1 `spatialdds/<domain>/<stream>/<type>/<version>`, with
the `<type>` segment taken from the §3.3.2 Typed Topics Registry so the
human-readable hint and the authoritative `TopicMeta.type` agree. §3.3.1 is
explicit that the name is a hint and the manifest entry is authoritative, but
having them disagree would be gratuitously confusing.

`<domain>` is the SceneScape scene id, one SceneScape scene is one logical
app domain, which is also what makes a multi-scene deployment separable
without renaming anything.
"""

# Well-known discovery topics (§3.3 tables), not application topics.
TOPIC_DISCOVERY_ANNOUNCE_V1 = "spatialdds/discovery/announce/v1"
TOPIC_DISCOVERY_DEPART_V1 = "spatialdds/discovery/depart/v1"


def fused_track(scene: str, stream: str = "tracker") -> str:
    """FusedTrackSet, registry type `fused_track`."""
    return f"spatialdds/{scene}/{stream}/fused_track/v1"


def detection3d(scene: str, camera_id: str) -> str:
    """Detection3DSet, registry type `detection3d`. Per camera."""
    return f"spatialdds/{scene}/{camera_id}/detection3d/v1"


def detection2d(scene: str, camera_id: str) -> str:
    """Detection2DSet, registry type `detection2d`. Per camera.

    Their camera lane is 2D only (`bounding_box_px`), so this is the lane the
    camera detections actually ride; `detection3d` stays for a producer that
    emits metric 3D.
    """
    return f"spatialdds/{scene}/{camera_id}/detection2d/v1"


def spatial_zone(scene: str) -> str:
    """SpatialZone, registry type `spatial_zone`. Latched."""
    return f"spatialdds/{scene}/regions/spatial_zone/v1"


def crossing_line(scene: str) -> str:
    """CrossingLine, registry type `crossing_line` (added 1.8). Latched."""
    return f"spatialdds/{scene}/regions/crossing_line/v1"


def spatial_event(scene: str) -> str:
    """SpatialEvent, registry type `spatial_event`."""
    return f"spatialdds/{scene}/events/spatial_event/v1"


def frame_transform(scene: str) -> str:
    """FrameTransform, registry type `frame_transform`. Latched, published once."""
    return f"spatialdds/{scene}/frames/frame_transform/v1"


def geo_anchor(scene: str) -> str:
    """GeoAnchor, registry type `geo_anchor`. Latched, published once."""
    return f"spatialdds/{scene}/frames/geo_anchor/v1"


# What the watcher follows, and what the two-pane capture's right-hand pane shows.
def all_for_scene(scene: str, cameras: list[str]) -> dict[str, str]:
    # No "announce" row. `discovery/announce` has no publisher in this build:
    # Announce is not among the brief's eight translation bullets and adding it
    # late would be scope, not polish. Watching a topic that cannot fire for
    # reasons unrelated to the deployment would put a permanently empty line in
    # the capture and read as a gap in the demo rather than a deliberate
    # omission. The omission is recorded in NOTES instead, which is where it
    # belongs. `TOPIC_DISCOVERY_ANNOUNCE_V1` stays defined for whoever adds it.
    t = {
        "frame_transform": frame_transform(scene),
        "geo_anchor": geo_anchor(scene),
        "spatial_zone": spatial_zone(scene),
        "crossing_line": crossing_line(scene),
        "fused_track": fused_track(scene),
        "spatial_event": spatial_event(scene),
    }
    # detection2d, not detection3d. This producer's cameras are 2D only --
    # `bounding_box_px` and nothing metric (bullet 3) -- so the sidecar
    # publishes Detection2DSet and a detection3d reader would sit empty
    # forever. It did, through the first live dry run: the watcher subscribed
    # to detection3d while the bridge published detection2d, and DDS gives no
    # error for that, it just never matches. Exactly the silent failure the
    # dry run exists to catch.
    for c in cameras:
        t[f"detection2d:{c}"] = detection2d(scene, c)
    return t
