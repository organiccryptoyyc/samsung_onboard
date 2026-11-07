// All settings come from the environment so suppliers can point at their own
// RPC, LCD and Jupiter endpoints. Nothing here is a governance parameter: those
// are always read live from the chain.
const env = (k, d) => (process.env[k] === undefined || process.env[k] === '' ? d : process.env[k]);
const num = (k, d) => Number(env(k, d));

export const config = {
  port: num('PORT', 8080),
  host: env('HOST', '0.0.0.0'),
  version: '0.1.0',
  serviceId: env('SERVICE_ID', 'pokt-onboard'),
  upstreamDeadlineMs: num('UPSTREAM_DEADLINE_MS', 8000),
  maxBodyBytes: num('MAX_BODY_BYTES', 1_000_000),

  // Pocket Shannon (Cosmos SDK) REST endpoint.
  pocketLcd: env('POCKET_LCD_URL', 'https://sauron-api.infra.pocket.network'),
  pocketChainId: env('POCKET_CHAIN_ID', 'pocket'),
  pocketDenom: 'upokt',
  // Keplr chain registry lists 0.01 for low/average/high (checked 2026-11-07).
  pocketGasPrice: num('POCKET_GAS_PRICE', 0.01),
  pocketExplorerTx: env('POCKET_EXPLORER_TX', 'https://explorer.pocket.network/pocket-mainnet/tx/'),

  solanaRpc: env('SOLANA_RPC_URL', 'https://api.mainnet-beta.solana.com'),

  // Jupiter swap API. Kept behind src/jupiter.js so a version change touches one file.
  jupiterBase: env('JUPITER_BASE_URL', 'https://api.jup.ag/ultra/v1'),
  jupiterApiKey: env('JUPITER_API_KEY', ''),
  // Jupiter gasless needs roughly this trade size in USD (Jupiter says it is dynamic).
  gaslessMinUsd: num('GASLESS_MIN_USD', 10),
  // Jupiter applies gasless when the taker holds less than this many SOL.
  gaslessSolThreshold: num('GASLESS_SOL_THRESHOLD', 0.01),
  gasStarterSol: num('GAS_STARTER_SOL', 0.02),
  maxPriceImpactPct: num('MAX_PRICE_IMPACT_PCT', 1),

  portalBase: env('PORTAL_BASE_URL', 'https://agent.pocket.network'),
  iconBaseUrl: env('ICON_BASE_URL', ''),
  // Public URL of the web app, shown in the guide.
  webAppUrl: env('WEB_APP_URL', ''),
  // Origins allowed to call the API from a browser (comma-separated, or *).
  corsOrigins: env('CORS_ORIGINS', '*').split(',').map((o) => o.trim()),
};

export const MINTS = {
  USDC: 'EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v',
  SOL: 'So11111111111111111111111111111111111111112',
  // Wormhole-bridged POKT. The only POKT mint this service will route.
  POKT: env('POKT_SOLANA_MINT', '6CAsXfiCXZfP8APCG6Vma2DFMindopxiqYQN4LSQfhoC'),
};

export const DECIMALS_FALLBACK = { [MINTS.USDC]: 6, [MINTS.SOL]: 9 };
