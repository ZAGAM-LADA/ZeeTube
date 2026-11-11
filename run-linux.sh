#!/usr/bin/env bash
set -euo pipefail
cd "$(dirname "$(realpath "$0")")"

if ! command -v node >/dev/null 2>&1; then
  echo "Node.js is required. Install Node.js 20.19+ or 22.12+ and run this script again."
  exit 1
fi
if ! command -v npm >/dev/null 2>&1; then
  echo "npm is required. Install npm with Node.js and run this script again."
  exit 1
fi

node - <<'NODE'
const [major, minor] = process.versions.node.split('.').map(Number);
const supported = (major === 20 && minor >= 19) || (major === 22 && minor >= 12) || major > 22;
if (!supported) {
  console.error(`Detected Node.js ${process.versions.node}. Use Node.js 20.19+ or 22.12+.`);
  process.exit(1);
}
console.log(`Using Node.js ${process.versions.node}`);
NODE

if [ ! -f .env ]; then
  cp .env.example .env
  echo "Created .env from .env.example. Remote downloads remain disabled until you configure authorized hosts."
fi

if [ ! -d node_modules ]; then
  echo "Installing project dependencies..."
  npm install
fi

echo "Starting ZeeTube. Open http://127.0.0.1:5173 when Vite is ready."
npm run dev
