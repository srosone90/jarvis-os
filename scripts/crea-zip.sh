#!/usr/bin/env bash
# Crea jarvis-dist.zip dal contenuto di dist/ (i file direttamente alla radice
# dello zip): sul server si scompatta in /config/www/jarvis/.
set -euo pipefail
cd "$(dirname "$0")/.."
test -f dist/index.html -a -f dist/sw.js || { echo "dist/ incompleta: lancia prima npm run build"; exit 1; }
rm -f jarvis-dist.zip
(cd dist && zip -qr ../jarvis-dist.zip .)
echo "jarvis-dist.zip pronto:"
unzip -l jarvis-dist.zip
