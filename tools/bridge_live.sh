#!/bin/sh
# Run the live sidecar: their MQTT -> SpatialDDS 1.8, with MCAP recording.
#
# One subscriber, piped into one translator. Nothing is published to their
# broker and nothing inside their tree is written, so stopping this script
# leaves SceneScape exactly as it was -- which is the claim the capture makes
# visually when the right pane dies and the left pane carries on.
#
# The pipe is not incidental. `sidecar/bridge.py` reads the same
# `<ts>|<topic>|<json>` lines that `tools/record_corpus.sh` writes and
# `tools/replay_to_mcap.py` reads, so the live path and the validated replay path
# consume identical bytes through the same `sidecar.route.Router`. Verified:
# over corpus v2 the bridge's output is byte-identical to the replay's on all
# seven live topics (15,581 samples), differing only in the latched
# definitions' timestamps, which is the documented replay-versus-live rule.
#
# Usage:  sudo tools/bridge_live.sh [scene-config.json] [out.mcap]
set -e

HERE=$(cd "$(dirname "$0")" && pwd)
ROOT=$(dirname "$HERE")
# Where your SceneScape checkout and runtime live. Override for your own
# deployment; the defaults match a clone at $SCENESCAPE_ROOT.
SCENESCAPE_ROOT=${SCENESCAPE_ROOT:-/opt/scenescape}
SRC=${SRC:-$SCENESCAPE_ROOT/src}
SECRETS="$SRC/manager/secrets"
CA="$SECRETS/certs/scenescape-ca.pem"
AUTH="${AUTH:-$SECRETS/browser.auth}"
BROKER="${BROKER:-broker.scenescape.intel.com}"
PORT="${PORT:-1883}"
VENV=${VENV:-$SCENESCAPE_ROOT/tools/venv/bin}
IDL=${IDL:-$(cd "$(dirname "$0")/.." && pwd)/idl/v1.8}

CFG="${1:-$ROOT/samples/scene-config-live.json}"
MCAP="${2:-${CORPUS_DIR:-$SCENESCAPE_ROOT/corpus}/live-$(date +%Y%m%dT%H%M%SZ).mcap}"

for f in "$AUTH" "$CA" "$CFG"; do
  [ -f "$f" ] || { echo "missing: $f" >&2; exit 1; }
done

NET=$(docker inspect scenescape-broker-1 \
      -f '{{range $k,$v := .NetworkSettings.Networks}}{{$k}} {{end}}' \
      | tr ' ' '\n' | grep -v '^$' | head -1)
U=$(python3 -c "import json,sys;print(json.load(open(sys.argv[1]))['user'])" "$AUTH")
P=$(python3 -c "import json,sys;print(json.load(open(sys.argv[1]))['password'])" "$AUTH")

echo "== live sidecar"
echo "   broker   $BROKER:$PORT on $NET as $U"
echo "   config   $CFG"
echo "   mcap     $MCAP"
echo "   NOTHING is published to their broker. Ctrl-C to stop."
echo

# Only the four topics the translator consumes. Subscribing to `#` would also
# pull image/camera, which is base64 JPEG frames at video rate -- megabytes a
# second through a pipe, for payloads we deliberately drop.
docker run --rm --network "$NET" \
  -v "$CA:/ca.pem:ro" \
  eclipse-mosquitto:2.0.22 \
  mosquitto_sub -h "$BROKER" -p "$PORT" --cafile /ca.pem \
    -u "$U" -P "$P" -q 1 -F '%U|%t|%p' \
    -t 'scenescape/regulated/scene/+' \
    -t 'scenescape/data/camera/+' \
    -t 'scenescape/data/region/+/+/+' \
    -t 'scenescape/event/+/+/+/+' \
  | PYTHONPATH="$ROOT" "$VENV/python" -u "$ROOT/sidecar/bridge.py" \
      --scene-config "$CFG" --mcap "$MCAP" --idl "$IDL"
