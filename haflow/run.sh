#!/usr/bin/with-contenv bash
set -e

mkdir -p /data/flows
cd /app

exec node server/index.js
