# pokt-onboard: the POKT Onboarding API

A Pocket Network REST service that turns the POKT wallet menu into an API. It gives quotes, bridge routes and **unsigned** transactions for buying, moving and staking POKT. That includes funding from USDC held in Samsung Wallet. The user's own wallet signs everything, and the service never holds keys or user funds.

Design review: https://claude.ai/artifact/FBxykyt5Ze9mgGNiSDWTgH

## Run it

```bash
cp .env.example .env      # point at your RPC / LCD / Jupiter key
node --env-file=.env src/server.js
npm test                  # 21 API tests against mocked upstreams, no network needed
node test/web-e2e.mjs     # browser check of the web app (needs Playwright)
node scripts/build-openapi.js   # regenerate openapi.json after changing endpoints
```

The service needs Node 20 or later and has no dependencies. Docker: `docker build -t pokt-onboard . && docker run -p 8080:8080 --env-file .env pokt-onboard`.

## Endpoints

Every endpoint is `POST` with a JSON body, except the two probes. Every reply is JSON. See `openapi.json` for the schemas.

| Menu tile | Endpoint | What it returns | Signer |
|---|---|---|---|
| Get started | `/v1/guide` | Step-by-step guide for Samsung Wallet USDC users (Solana + Pocket); with a `solana` address it adds live balances and the next step. The $0.005 product agents buy | n/a |
| (all) | `/v1/menu` | Tile layout; Agent Marketplace = 2 units; sign / guided / info per wallet | n/a |
| Agent Marketplace | `/v1/marketplace` | Agentic Portal services, how to pay (x402 / MPP) | n/a |
| Buy / Sell / Swap | `/v1/quote/buy`, `/v1/quote/sell`, `/v1/quote/swap` | Jupiter quote, price impact, thin-liquidity warning | n/a |
| Buy / Sell / Swap | `/v1/tx/swap`, then `/v1/tx/execute` | Unsigned Solana tx, then forwards the signed tx | Phantom, Solflare |
| Gas | `/v1/gas/starter` | USDC to about 0.02 SOL, gasless, for USDC-only wallets | Phantom, Solflare |
| Samsung | `/v1/samsung/fund-plan` | How much USDC to send (buy + about $10 gas), Solana Pay QR, steps | Samsung Wallet sends |
| Samsung | `/v1/deposit/check` | Has the USDC arrived; next step | n/a |
| Samsung | `/v1/samsung/payout` | Unsigned POKT to USDC swap delivered to the Samsung address | Phantom, Solflare |
| Native | `/v1/route/native`, `/v1/route/status` | Two-hop bridge plan through Ethereum; Solana tx status | per hop |
| Native | `/v1/account` | SOL / USDC / POKT on Solana; native POKT, and whether the `pokt1` account exists | n/a |
| Stake | `/v1/stake/options` | Live minimums, bonded validators, staking paths | n/a |
| Stake | `/v1/tx/delegate`, `/v1/tx/send` | Amino sign doc + CosmJS messages for chain `pocket` | Keplr, Leap |
| Services | `/v1/services` | Every Pocket service from chain, PNG icon URL | n/a |
| AI Connect / Packs | `/v1/ai/connect`, `/v1/ai/packs` | MCP, npm, OpenAPI links + config snippet; pack manifest (planned) | n/a |
| probes | `GET /v1/version`, `GET /v1/health` | Identity, readiness | n/a |

## Web app

`web/` is a static web app (installable PWA, no build step) with the full menu, the Samsung onboarding flow, gas starter, swaps, native route, staking with Keplr, services, marketplace and AI connect. It calls the API directly over HTTPS (the API sends CORS headers; set `CORS_ORIGINS` to the app's origin in production). Wallet signing libraries (`@solana/web3.js`, `@cosmjs/stargate`) and the QR library load from jsDelivr only when needed.

- Set `apiBase` in `web/config.js` to the API's public HTTPS address.
- Host `web/` on any static host (Cloudflare Pages, Vercel, GitHub Pages). On phones without a wallet extension, the app offers "Open in Phantom / Solflare" links that reopen it inside the wallet's browser.
- Deep links for marketing: `/#start` opens the guide, `/?tile=buy` opens a tile.
- The palette and the "P" icon are placeholders until Pocket Network Foundation brand colours and sign-off are in hand.

## Deploy

1. **API:** `docker build -t pokt-onboard .` and run it on any small server with Caddy or nginx in front for TLS. Set `.env` (RPC, LCD, Jupiter key, `WEB_APP_URL`, `CORS_ORIGINS`).
2. **Web app:** publish `web/` to a static host; point `apiBase` at step 1.
3. **Pocket Beta:** register `pokt-onboard`, stake a supplier and run the RelayMiner in front of the same API (steps below), test with `pocket-ap`.
4. **MainNet:** re-fetch fees and minimums, register and stake on MainNet, publish the gateway entry.
5. **Agent Marketplace:** get the service (especially `/v1/guide`) listed at agent.pocket.network so assistants can buy the guide for $0.005.

## Pocket relay rules this code follows

- Every body is a JSON object, including errors. PNG icons are served from `ICON_BASE_URL`, outside the relay.
- All input comes from the JSON body. Headers and the query string are ignored, and no caller auth is used.
- Bad input returns 400 or 422 with a JSON error. That is paid and not retried.
- A failure at Jupiter, an RPC, the LCD or the portal returns **424** `upstream_failed`, never 5xx. Only real bugs return 500.
- Upstream calls are capped at 8 s (`UPSTREAM_DEADLINE_MS`), and nothing streams.
- Success bodies avoid the words gateways scan for, such as "timeout".
- Quotes differ between suppliers, so the card says `results: variable`.

## Assumptions to know about

- **Jupiter API:** this targets Jupiter's Ultra `order` / `execute` API. It assumes the gasless mode (wallet under 0.01 SOL, trade about $10 or more) and the `receiver` field stay available in Swap V2. All Jupiter code is in `src/jupiter.js`, so a version change only touches that file. Set `JUPITER_API_KEY` if Jupiter requires one.
- **Samsung Wallet** has no developer API, so it is connected by address only: the user sends USDC to the address in the fund plan. Before launch, test one small round trip from Samsung Wallet to Phantom and back. Solana Pay QR support in Samsung Wallet is untested; the plain address is always returned too.
- **Governance values** (minimum stakes, session length, rent) are read live and never hard-coded. The fee gas price (0.01 upokt) comes from Keplr's chain registry, and the gas limits (250k delegate, 100k send) are estimates to tune on Beta.
- The **POKT mint** is fixed to the Wormhole mint `6CAsXfiCXZfP8APCG6Vma2DFMindopxiqYQN4LSQfhoC`. Swaps that involve neither POKT nor SOL-for-gas are refused.
- **Not built yet:** the integrator-paid fee fallback for gas starters under about $10, which needs a fee-payer key to co-sign. Also not built: Soothe signing for native POKT (no API is documented) and wPOKT balances on EVM.

## Register and deploy on Pocket

Follow the Pocket service-builder toolkit (`pokt-network/pocket-network-resources`, `service-builder/`):

1. Check the ID: `python scripts/check_catalog.py pokt-onboard --both`.
2. Fetch the live fee and pricing: `python scripts/live_params.py --network beta --pricing`.
3. Fill in `card.json`: copy the `schema` value from the toolkit's `templates/card.json`, publish `openapi.json` and set its URL, then run `python scripts/validate_card.py card.json`.
4. Check the backend: `python scripts/lint_backend.py --base-url http://localhost:8080 --card ./card.json`.
5. Register on Beta: `pocketd tx service add-service pokt-onboard "POKT Onboarding" <cu_per_relay> --card-file card.json --network=beta --gas auto --gas-prices 1upokt --gas-adjustment 1.5`.
6. Stake a supplier from a separate operator account, run the RelayMiner with TLS in front, and test with `pocket-ap`.
7. Agentic Portal listing: email portal@pokt.foundation. Their admission process is not public.
