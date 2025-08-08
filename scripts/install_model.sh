#!/usr/bin/env bash
set -euo pipefail

if [ "$#" -ne 2 ]; then
  echo "Usage: $0 <model_path> <output_dir>" >&2
  exit 1
fi

MODEL_PATH="$1"
OUTPUT_DIR="$2"

REPO="$(dirname "$MODEL_PATH")"
FILE="$(basename "$MODEL_PATH")"

PRIMARY_URL="https://huggingface.co/${REPO}/resolve/main/${FILE}"
MIRROR_URL="https://huggingface.co/bartowski/${REPO}/resolve/main/${FILE}"

mkdir -p "$OUTPUT_DIR"
OUT_FILE="${OUTPUT_DIR}/${FILE}"

_download() {
  local url="$1"
  echo "Downloading ${FILE} from ${url}"
  if curl -fL "$url" -o "$OUT_FILE"; then
    echo "Saved model to ${OUT_FILE}"
    return 0
  fi
  return 1
}

if _download "$PRIMARY_URL"; then
  exit 0
elif _download "$MIRROR_URL"; then
  exit 0
else
  echo "Failed to download ${FILE} from primary and mirror URLs." >&2
  exit 1
fi
