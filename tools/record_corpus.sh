#!/usr/bin/env bash
# Record SceneScape's northbound MQTT traffic to a per-topic corpus.
#
#   sudo tools/record_corpus.sh [seconds]        # default 180
#
# Runs ON the SceneScape host, as a container joined to their compose network,
# because `broker.scenescape.intel.com` only resolves there and 1883 is not
# published outside it.
#
# Why these exact topics: they are SceneScape's own canonical templates, read
# from scene_common/src/scene_common/mqtt.py `_TopicTemplates` at pin
# 2026.1.0, with `${placeholders}` replaced by MQTT `+` wildcards. Taking the
# list from their source rather than from a hand-written inventory is what
# makes "a payload with no census row is a stop-and-report" a meaningful rule
#, an unknown topic here is theirs, not an omission of mine.
#
# Auth: their .auth files are JSON {"user","password"} (scene_common PubSub),
# and the CA is manager/secrets/certs/scenescape-ca.pem. browser.auth maps to
# MQTT user `webuser` (tools/authsecrets/Makefile), a read-side identity,
# which is the right one for a recorder.
set -euo pipefail

DUR="${1:-180}"
# Where your SceneScape checkout lives. Override for your own deployment.
SCENESCAPE_ROOT=${SCENESCAPE_ROOT:-/opt/scenescape}
SRC=${SRC:-$SCENESCAPE_ROOT/src}
SECRETS="$SRC/manager/secrets"
CA="$SECRETS/certs/scenescape-ca.pem"
AUTH="${AUTH:-$SECRETS/browser.auth}"
BROKER="${BROKER:-broker.scenescape.intel.com}"
PORT="${PORT:-1883}"
OUT="${OUT:-${CORPUS_DIR:-$SCENESCAPE_ROOT/corpus}/$(date +%Y%m%dT%H%M%SZ)}"

for f in "$CA" "$AUTH"; do
  [ -r "$f" ] || { echo "missing: $f  (run make build-core / init-secrets first)" >&2; exit 1; }
done

# Ask the broker which network carries its alias. Two scenescape networks
# exist and only one does; matching by name picks the wrong one and every
# subscribe returns nothing, silently.
NET=$(docker inspect scenescape-broker-1 \
  -f '{{range $k,$v := .NetworkSettings.Networks}}{{range $v.Aliases}}{{if eq . "broker.scenescape.intel.com"}}{{$k}}{{end}}{{end}}{{end}}' 2>/dev/null)
[ -n "$NET" ] || { echo "cannot find the network carrying broker.scenescape.intel.com" >&2; exit 1; }

USER_=$(python3 -c "import json,sys;print(json.load(open(sys.argv[1]))['user'])" "$AUTH")
PASS_=$(python3 -c "import json,sys;print(json.load(open(sys.argv[1]))['password'])" "$AUTH")

# label -> wildcarded topic filter. Order is the census/brief order: the
# northbound payloads the translator consumes first, then the rest.
TOPICS=(
  "regulated-scene|scenescape/regulated/scene/+"
  "data-scene|scenescape/data/scene/+/+"
  "data-camera|scenescape/data/camera/+"
  "autocalib-cam-pose|scenescape/autocalibration/camera/pose/+"
  "data-region|scenescape/data/region/+/+/+"
  "event|scenescape/event/+/+/+/+"
  "data-sensor|scenescape/data/sensor/+"
  "external|scenescape/external/+/+"
  "analytics-clusters|scenescape/analytics/clusters/+"
  "sys-child-status|scenescape/sys/child/status/+"
  # Recorded for completeness and excluded from replay: base64 JPEG frames,
  # large and not northbound semantics. Control plane (cmd/*) and the
  # request/response transport (channel/*) are out of scope per the census.
  "image-camera|scenescape/image/camera/+"
)

mkdir -p "$OUT"
echo "corpus  $OUT"
echo "broker  $BROKER:$PORT on docker network $NET as $USER_"
echo "window  ${DUR}s per topic, recorded concurrently"
echo

# One subscriber per topic group, all concurrent so the window is wall-clock
# shared and cross-topic timing stays comparable. -F gives a parseable record:
# epoch-with-micros, topic, payload, one line each, so replay can reconstruct
# both content and relative timing.
# Each subscriber writes DIRECTLY to the mounted corpus dir, not to container
# logs. The first version used `docker run --rm` and read `docker logs` after
# the window closed -- but --rm deletes the container the instant
# `mosquitto_sub -W` exits, so the logs were already gone and every file came
# out empty while the bus was demonstrably busy. Write to the volume, and the
# data outlives the container by construction.
for entry in "${TOPICS[@]}"; do
  label="${entry%%|*}"; filt="${entry#*|}"
  docker run -d --name "sc1-$label" --network "$NET" \
    -v "$CA:/ca.pem:ro" -v "$OUT:/out" \
    eclipse-mosquitto:2.0.22 \
    sh -c "mosquitto_sub -h '$BROKER' -p '$PORT' --cafile /ca.pem \
             -u '$USER_' -P '$PASS_' -t '$filt' -v -F '%U|%t|%p' \
             -W '$DUR' > /out/$label.jsonl 2>/dev/null" >/dev/null
  echo "  subscribed  $label  <-  $filt"
done

echo
echo "recording ${DUR}s ..."
sleep "$((DUR + 15))"

for entry in "${TOPICS[@]}"; do
  label="${entry%%|*}"
  docker rm -f "sc1-$label" >/dev/null 2>&1 || true
done

echo
echo "== corpus contents"
for f in "$OUT"/*.jsonl; do
  [ -e "$f" ] || continue
  n=$(wc -l < "$f" | tr -d ' ')
  printf '  %-22s %7s msgs  %8s\n' "$(basename "$f" .jsonl)" "$n" "$(du -h "$f" | cut -f1)"
done
echo
echo "== distinct topics actually seen (a topic here with no census row is a stop-and-report)"
cat "$OUT"/*.jsonl 2>/dev/null | awk -F'|' '{print $2}' | sort -u | sed 's|^|  |'
echo
echo "$OUT" > "$(dirname "$OUT")/LATEST"
