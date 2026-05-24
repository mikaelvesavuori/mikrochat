#!/usr/bin/env bash
set -euo pipefail
npm run build
npm run sbom
npm run scan
npm run licenses
npm run release:assets -- "${1:-}"
