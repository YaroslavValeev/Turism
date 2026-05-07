#!/usr/bin/env bash
set -euo pipefail

echo "== placeholder =="
curl -fsSI https://mywavetour.ru/images/placeholders/program-card.svg | sed -n '1,8p'

echo "== api/media proxy =="
curl -fsSI 'https://mywavetour.ru/api/media?url=https%3A%2F%2Fimages.unsplash.com%2Fphoto-1506905925346-21bda4d32df4%3Fw%3D200' | sed -n '1,8p'

echo "== home =="
curl -fsS https://mywavetour.ru/ >/dev/null
echo "home: ok"

echo "smoke_media: OK"
