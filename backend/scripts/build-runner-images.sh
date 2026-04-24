#!/usr/bin/env sh
set -eu

SCRIPT_DIR="$(CDPATH= cd -- "$(dirname -- "$0")" && pwd)"
ROOT_DIR="$(dirname "$SCRIPT_DIR")"

echo "Building CodeForge runner images..."

docker build -t codeforge/runner-python3:latest "$ROOT_DIR/runners/python3"
docker build -t codeforge/runner-nodejs20:latest "$ROOT_DIR/runners/nodejs20"
docker build -t codeforge/runner-java17:latest "$ROOT_DIR/runners/java17"
docker build -t codeforge/runner-cpp20:latest "$ROOT_DIR/runners/cpp20"

echo "All runner images built successfully."
