#!/usr/bin/env bash
set -euo pipefail

# Deterministic synthetic timing fixtures. These prove media ingestion and timing
# plumbing only; they are not evidence of athletic-metric accuracy.
out_dir="${1:-test-media/generated}"
mkdir -p "$out_dir"
drawtext_help=$(ffmpeg -hide_banner -h filter=drawtext 2>&1 || true)
drawtext_available=false
if [[ "$drawtext_help" == *"Filter drawtext"* ]]; then
  drawtext_available=true
fi

make_clip() {
  local name="$1"
  local duration="$2"
  local label="$3"
  local video_filter="drawbox=x='min(1180,40+t*180)':y=315:w=60:h=60:color=white:t=fill"
  if [[ "$drawtext_available" == "true" ]]; then
    video_filter+=",drawtext=fontcolor=white:fontsize=42:x=40:y=40:text='${label} | 60 fps | duration ${duration}s'"
  fi
  ffmpeg -y -f lavfi -i "color=c=black:s=1280x720:r=60:d=${duration}" \
    -vf "$video_filter" \
    -an -c:v libx264 -pix_fmt yuv420p "$out_dir/$name.mp4" >/dev/null 2>&1
  shasum -a 256 "$out_dir/$name.mp4" >> "$out_dir/SHA256SUMS"
}

: > "$out_dir/SHA256SUMS"
make_clip soccer-side-sprint 3.20 "Synthetic soccer side timing"
make_clip baseball-behind-pitcher 0.50 "Synthetic baseball pitch timing"
make_clip basketball-open-side-shot 1.10 "Synthetic basketball shot timing"

cat > "$out_dir/manifest.json" <<'JSON'
{
  "provenance": "Generated locally with scripts/generate-synthetic-media-fixtures.sh using FFmpeg color/drawbox/drawtext filters.",
  "license": "CC0-equivalent project-generated test data",
  "limitations": "Synthetic fixtures verify deterministic decode/timing plumbing only. They do not contain athletes and cannot establish CV or athletic-metric accuracy.",
  "clips": [
    { "file": "soccer-side-sprint.mp4", "sport": "soccer", "cameraAngle": "side", "frameRate": 60, "groundTruthSeconds": 3.2 },
    { "file": "baseball-behind-pitcher.mp4", "sport": "baseball", "cameraAngle": "behind-pitcher", "frameRate": 60, "groundTruthSeconds": 0.5 },
    { "file": "basketball-open-side-shot.mp4", "sport": "basketball", "cameraAngle": "open-side", "frameRate": 60, "groundTruthSeconds": 1.1 }
  ]
}
JSON

echo "Generated synthetic fixtures in $out_dir"
