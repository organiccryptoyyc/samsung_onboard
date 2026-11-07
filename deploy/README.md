# Deploy to onboard.organiccryptoyyc.com (Hetzner)

Public addresses:

- Web app: `https://onboard.organiccryptoyyc.com/`
- Start page (QR on cue card 1): `https://onboard.organiccryptoyyc.com/#start`
- API (same origin, for the web app and health checks): `https://onboard.organiccryptoyyc.com/api/v1/health`

DNS: Cloudflare A record `onboard` → `135.181.248.55`, DNS only.
The server's Caddy runs in Docker (managed by PSM), so use `deploy/onboard.caddy`
as its own site file and bind the API to the Docker host address (`HOST=172.18.0.1`).
`nginx-onboard.conf` and `Caddyfile.onboard` are path-based alternatives (`/onboard/`).

The web app finds the API at `./api/` by itself, so `web/config.js` needs no edit.

## Steps (Ubuntu/Debian, Node 20+)

```sh
sudo useradd --system --home /opt/pokt-onboard pokt-onboard || true
sudo git clone https://github.com/organiccryptoyyc/samsung_onboard /opt/pokt-onboard   # or git pull
sudo cp /opt/pokt-onboard/.env.example /opt/pokt-onboard/.env   # then edit, see below
sudo chown -R pokt-onboard: /opt/pokt-onboard
sudo cp /opt/pokt-onboard/deploy/pokt-onboard.service /etc/systemd/system/
sudo systemctl daemon-reload && sudo systemctl enable --now pokt-onboard
sudo mkdir -p /var/www/pokt-onboard && sudo rsync -a --delete /opt/pokt-onboard/web/ /var/www/pokt-onboard/
```

Then add `deploy/nginx-onboard.conf` (or `deploy/Caddyfile.onboard`) to the
existing organiccryptoyyc.com site, test the config (`nginx -t`) and reload.

`.env` values to set: `PORT=8080`, `HOST=127.0.0.1`, `WEB_APP_URL=https://onboard.organiccryptoyyc.com/`,
`CORS_ORIGINS=https://onboard.organiccryptoyyc.com`, `SOLANA_RPC_URL` (a paid RPC is
recommended), `JUPITER_API_KEY` if you have one.

The API listens on 127.0.0.1:8080 only behind the web server. For the Pocket
Beta supplier, point the RelayMiner backend at `http://127.0.0.1:8080`.
