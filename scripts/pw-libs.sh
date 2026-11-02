#!/usr/bin/env bash
# Playwright browser libs without root (WSL): unpacks them to a stable folder for LD_LIBRARY_PATH.
set -euo pipefail

target="${1:-$HOME/.cache/skillproof/pwlibs}"
mkdir -p "$target/debs" "$target/root"
cd "$target/debs"
apt-get download libnspr4 libnss3 libatk1.0-0t64 libatk-bridge2.0-0t64 libcups2t64 libxkbcommon0 \
  libatspi2.0-0t64 libxcomposite1 libxdamage1 libxfixes3 libxrandr2 libgbm1 libasound2t64 libdrm2 \
  libwayland-server0 libxi6 libxrender1 libavahi-client3 libavahi-common3
for deb in *.deb; do dpkg -x "$deb" ../root; done
echo "LD_LIBRARY_PATH=$target/root/usr/lib/x86_64-linux-gnu"
