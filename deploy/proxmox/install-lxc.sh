#!/usr/bin/env bash
# Install Open Workouts inside a Debian 12 LXC container on Proxmox VE (no Docker needed).
#
# On the Proxmox host, create the container first, e.g.:
#   pct create 210 local:vztmpl/debian-12-standard_12.7-1_amd64.tar.zst \
#     --hostname open-workouts --cores 1 --memory 512 --rootfs local-lvm:4 \
#     --net0 name=eth0,bridge=vmbr0,ip=dhcp --unprivileged 1 --features nesting=1
#   pct start 210 && pct exec 210 -- bash -c "$(cat install-lxc.sh)"
#
# Re-running this script upgrades to the latest commit of $REF.
set -euo pipefail
REPO="${REPO:-https://github.com/ernest-it/open-workouts.git}"
REF="${REF:-main}"
PREFIX=/opt/open-workouts
DATA=/var/lib/open-workouts

apt-get update
apt-get install -y --no-install-recommends ca-certificates curl git python3 make g++
if ! command -v node >/dev/null || [ "$(node -p 'process.versions.node.split(".")[0]')" -lt 22 ]; then
  curl -fsSL https://deb.nodesource.com/setup_22.x | bash -
  apt-get install -y nodejs
fi

id -u openworkouts >/dev/null 2>&1 || useradd --system --home "$DATA" --shell /usr/sbin/nologin openworkouts
mkdir -p "$DATA" && chown openworkouts:openworkouts "$DATA"

if [ -d "$PREFIX/.git" ]; then git -C "$PREFIX" fetch --depth 1 origin "$REF" && git -C "$PREFIX" checkout -f FETCH_HEAD
else git clone --depth 1 --branch "$REF" "$REPO" "$PREFIX"; fi
cd "$PREFIX"
npm ci --no-audit --no-fund
npm run build

cat > /etc/systemd/system/open-workouts.service <<UNIT
[Unit]
Description=Open Workouts
After=network-online.target

[Service]
User=openworkouts
Environment=PORT=8080 DATA_DIR=$DATA WEB_DIR=$PREFIX/apps/web/dist NODE_ENV=production
EnvironmentFile=-/etc/default/open-workouts
WorkingDirectory=$PREFIX
ExecStart=/usr/bin/node $PREFIX/apps/server/dist/index.js
Restart=on-failure
NoNewPrivileges=true
ProtectSystem=strict
ReadWritePaths=$DATA

[Install]
WantedBy=multi-user.target
UNIT
systemctl daemon-reload
systemctl enable --now open-workouts
systemctl restart open-workouts
echo "Open Workouts is running on http://$(hostname -I | awk '{print $1}'):8080"
