#!/bin/sh
set -eu

verify_model() {
  model_path="$1"
  expected_checksum="$2"
  label="$3"

  if [ -z "$model_path" ] || [ ! -r "$model_path" ] || [ ! -s "$model_path" ]; then
    printf '{"level":"fatal","event":"worker-model-invalid","model":"%s","reason":"missing-or-unreadable"}\n' "$label" >&2
    exit 78
  fi
  if [ -z "$expected_checksum" ]; then
    printf '{"level":"fatal","event":"worker-model-invalid","model":"%s","reason":"checksum-not-configured"}\n' "$label" >&2
    exit 78
  fi

  actual_checksum=$(sha256sum "$model_path" | cut -d ' ' -f 1)
  if [ "$actual_checksum" != "$expected_checksum" ]; then
    printf '{"level":"fatal","event":"worker-model-invalid","model":"%s","reason":"checksum-mismatch"}\n' "$label" >&2
    exit 78
  fi
}

verify_model "${VISION_PERSON_MODEL:-}" "${VISION_PERSON_MODEL_SHA256:-}" "person"
verify_model "${VISION_POSE_MODEL:-}" "${VISION_POSE_MODEL_SHA256:-}" "pose"
verify_model "${VISION_OBJECT_MODEL:-}" "${VISION_OBJECT_MODEL_SHA256:-}" "object"
verify_model "${VISION_REID_MODEL:-}" "${VISION_REID_MODEL_SHA256:-}" "reid"
/opt/venv/bin/python -c 'import cv2, numpy as np, os, torch, ultralytics; from vision_core.reid import OnnxAppearanceEmbedder; assert hasattr(cv2, "aruco"); model=OnnxAppearanceEmbedder(os.environ["VISION_REID_MODEL"]); embedding=model.embed(np.zeros((256,128,3),dtype=np.uint8),(0,0,1,1)); assert embedding is not None and embedding.shape == (768,)' >/dev/null

if [ "${1:-}" = "--check" ]; then
  exit 0
fi

exec npm run worker
