#!/bin/sh
# Bundle the browser harness. Dependencies are installed into a work directory
# rather than the repo, so the sidecar tree stays free of node_modules; the
# bundle.js this produces is self-contained and is what the check serves.
#
# Pinned on purpose: @foxglove/omgidl-parser is the package whose error message
# James saw, so the version matters to what a pass here means.
set -e
HERE=$(cd "$(dirname "$0")" && pwd)
WORK=${WORK:-/tmp/fgcheck}
mkdir -p "$WORK"
cd "$WORK"
[ -f package.json ] || npm init -y >/dev/null
npm install --silent \
  @foxglove/omgidl-parser@1.2.2 \
  @foxglove/omgidl-serialization@1.2.5 \
  @mcap/core@2.3.0 \
  fzstd@0.1.1 \
  esbuild >/dev/null
cp "$HERE/harness.mjs" "$WORK/harness.mjs"
npx esbuild "$WORK/harness.mjs" --bundle --format=esm \
  --outfile="$HERE/bundle.js" --log-level=warning
echo "built $HERE/bundle.js ($(wc -c < "$HERE/bundle.js") bytes)"
