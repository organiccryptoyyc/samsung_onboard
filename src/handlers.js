// One handler per endpoint. Each takes the parsed JSON body and returns a plain
// object; the server wraps it. Nothing here holds keys or moves funds: the API
// returns quotes, plans and unsigned transactions, and the user's wallet signs.
import { config, MINTS } from './config.js';
import { getJson } from './http.js';
import { bad, unprocessable } from './errors.js';
import * as v from './validate.js';
import * as sol from './solana.js';
import * as jup from './jupiter.js';
import * as pocket from './pocket.js';
import * as cosmos from './cosmos.js';
import * as cat from './catalog.js';

const MINT_BY_SYMBOL = { USDC: MINTS.USDC, SOL: MINTS.SOL, POKT: MINTS.POKT };

function mintFrom(value, field) {
  if (MINT_BY_SYMBOL[String(value).toUpperCase()]) return MINT_BY_SYMBOL[String(value).toUpperCase()];
  if (v.isSolanaAddress(value)) return value;
  throw bad(`"${field}" must be USDC, SOL, POKT or a Solana mint address`, { field });
}

function warnings(q) {
  const w = [];
  if (q.high_impact) w.push(`Price impact is ${q.price_impact_pct}%, above ${config.maxPriceImpactPct}%. POKT on Solana has thin liquidity; consider a smaller amount or splitting the order.`);
  return w;
}

// ---------------- menu & catalogue ----------------

export async function menu(body) {
  const wallet = v.oneOf(body, 'wallet', Object.keys(cat.WALLETS), 'none');
  const w = cat.WALLETS[wallet];
  return {
    wallet,
    layout: { columns: 2, unit: 'tile', note: 'Agent Marketplace spans both columns (2 units); every other tile is 1 unit.' },
    tiles: cat.TILES.map((t) => ({
      ...t,
      mode: w.signs.includes(t.id) ? 'sign' : w.guided.includes(t.id) ? 'guided' : t.id === 'ai_packs' ? 'planned' : 'info',
    })),
  };
}

export async function services(body) {
  const filter = body?.filter ? String(body.filter).toLowerCase() : '';
  const list = (await pocket.services())
    .filter((s) => !filter || s.id.toLowerCase().includes(filter) || String(s.name).toLowerCase().includes(filter))
    .map((s) => ({ ...s, icon_png: cat.iconUrl(s.id), explorer: `${cat.LINKS.explorer}/services` }));
  return { count: list.length, services: list, source: 'Pocket chain (service module), read live' };
}

export async function marketplace(body) {
  const q = body?.query ? String(body.query).toLowerCase() : '';
  const category = body?.category ? String(body.category).toLowerCase() : '';
  const raw = await getJson('Agentic Portal', `${config.portalBase}/services.json`, { ttlMs: 600_000 });
  const arr = Array.isArray(raw) ? raw : raw?.services || [];
  const list = arr
    .map((s) => ({
      id: s.serviceId ?? s.id ?? s.slug,
      name: s.displayName ?? s.name ?? s.serviceId,
      category: s.category ?? null,
      price_usd: s.priceUsd ?? s.price ?? '0.005000',
      call: s.resourceUrl ?? `${config.portalBase}/v1/${s.serviceId ?? s.id}`,
      page: s.page ?? null,
    }))
    .filter((s) => s.id)
    .filter((s) => !category || String(s.category).toLowerCase() === category)
    .filter((s) => !q || `${s.id} ${s.name} ${s.category}`.toLowerCase().includes(q));
  return {
    count: list.length,
    services: list.slice(0, 200),
    how_to_pay: { x402: 'USDC on Base (eip155:8453)', mpp: 'USDC.e on Tempo (eip155:4217)', api_key: false },
    mcp: cat.AI_CONNECT.hosted_mcp.url,
  };
}

export async function aiConnect(body) {
  const client = v.oneOf(body, 'client', ['claude', 'cursor', 'other'], 'other');
  return { ...cat.AI_CONNECT, config: cat.aiConfigSnippet(client) };
}

export async function aiPacks() {
  return { packs: cat.AI_PACKS, note: 'Tool packs are planned and not yet downloadable.' };
}

// ---------------- balances ----------------

export async function account(body) {
  const solana = v.solAddr(body, 'solana', false);
  const pokt = v.poktAddr(body, 'pokt', false);
  if (!solana && !pokt) throw bad('Give at least one of "solana" or "pokt"');
  const out = {};
  const jobs = [];
  if (solana) jobs.push(sol.solanaHoldings(solana).then((h) => { out.solana = h; }));
  if (pokt) {
    jobs.push(Promise.all([pocket.account(pokt), pocket.balances(pokt)]).then(([acct, bal]) => {
      out.pocket = { address: pokt, on_chain: acct !== null, ...bal, ...(acct ? {} : { activate: `Send any amount (the Soothe guide uses 1 MACT from ${cat.LINKS.faucet}) to create this account on chain.` }) };
    }));
  }
  await Promise.all(jobs);
  return out;
}

// ---------------- swaps (Solana) ----------------

export async function quoteBuy(body) {
  const pay = mintFrom(body?.pay_token ?? 'USDC', 'pay_token');
  const amount = v.positiveAmount(body, 'amount');
  const q = await jup.order({ inputMint: pay, outputMint: MINTS.POKT, amount });
  return { side: 'buy', quote: { ...q, unsigned_transaction: undefined }, warnings: warnings(q) };
}

export async function quoteSell(body) {
  const receive = mintFrom(body?.receive_token ?? 'USDC', 'receive_token');
  const amount = v.positiveAmount(body, 'amount');
  const q = await jup.order({ inputMint: MINTS.POKT, outputMint: receive, amount });
  return { side: 'sell', quote: { ...q, unsigned_transaction: undefined }, warnings: warnings(q) };
}

export async function quoteSwap(body) {
  const input = mintFrom(v.need(body, 'input'), 'input');
  const output = mintFrom(v.need(body, 'output'), 'output');
  if (input !== MINTS.POKT && output !== MINTS.POKT) {
    throw unprocessable('pokt_only', `One side must be POKT (Wormhole mint ${MINTS.POKT}). Other tokens calling themselves POKT are not routed.`);
  }
  const q = await jup.order({ inputMint: input, outputMint: output, amount: v.positiveAmount(body, 'amount') });
  return { side: 'swap', quote: { ...q, unsigned_transaction: undefined }, warnings: warnings(q) };
}

// Returns an unsigned Solana transaction for the user's wallet to sign.
export async function txSwap(body) {
  const owner = v.solAddr(body, 'owner');
  const input = mintFrom(v.need(body, 'input'), 'input');
  const output = mintFrom(v.need(body, 'output'), 'output');
  if (![input, output].includes(MINTS.POKT) && output !== MINTS.SOL) {
    throw unprocessable('pokt_only', 'One side must be POKT, or the output must be SOL (for gas).');
  }
  const receiver = v.solAddr(body, 'receiver', false);
  const q = await jup.order({ inputMint: input, outputMint: output, amount: v.positiveAmount(body, 'amount'), taker: owner, receiver });
  if (q.high_impact && body?.accept_high_impact !== true) {
    throw unprocessable('high_price_impact', `Price impact ${q.price_impact_pct}% is above ${config.maxPriceImpactPct}%. Resend with "accept_high_impact": true to continue, or use a smaller amount.`, { quote: { ...q, unsigned_transaction: undefined } });
  }
  return {
    ...q,
    sign_with: ['phantom', 'solflare'],
    next: 'Sign unsigned_transaction (base64) in the wallet, then POST it to /v1/tx/execute with request_id.',
    warnings: warnings(q),
  };
}

export async function txExecute(body) {
  const signed = v.need(body, 'signed_transaction');
  const requestId = v.need(body, 'request_id');
  if (typeof signed !== 'string' || !/^[A-Za-z0-9+/=]+$/.test(signed)) throw bad('"signed_transaction" must be base64');
  return jup.execute({ signedTransaction: signed, requestId: String(requestId) });
}

export async function routeStatus(body) {
  const signature = v.need(body, 'signature');
  return { chain: 'solana', signature, ...(await sol.signatureStatus(String(signature))) };
}

// ---------------- gas starter ----------------

// Buys a small amount of SOL with USDC so a wallet funded only with USDC
// (for example from Samsung Wallet) can pay Solana fees and rent.
export async function gasStarter(body) {
  const owner = v.solAddr(body, 'owner');
  const targetSol = Number(v.positiveAmount(body, 'target_sol', false) ?? config.gasStarterSol);
  const [holdings, rent] = await Promise.all([sol.solanaHoldings(owner), sol.rentCosts()]);
  if (!holdings.needs_gas) {
    return { needed: false, holdings, rent, message: `Wallet already holds ${holdings.sol.amount} SOL; no gas starter needed.` };
  }
  // Price the target SOL in USDC, then respect Jupiter's gasless minimum.
  const probe = await jup.order({ inputMint: MINTS.SOL, outputMint: MINTS.USDC, amount: String(targetSol) });
  const costUsd = Number(probe.output.amount);
  const spendUsd = Math.max(Math.ceil(costUsd * 100) / 100, config.gaslessMinUsd);
  if (Number(holdings.usdc.amount) < spendUsd) {
    throw unprocessable('not_enough_usdc', `The gas starter needs about ${spendUsd} USDC (Jupiter's gasless minimum is about $${config.gaslessMinUsd}). Wallet holds ${holdings.usdc.amount} USDC.`, { holdings, required_usdc: String(spendUsd) });
  }
  const q = await jup.order({ inputMint: MINTS.USDC, outputMint: MINTS.SOL, amount: spendUsd.toFixed(2), taker: owner });
  return {
    needed: true,
    spend_usdc: spendUsd.toFixed(2),
    expected_sol: q.output.amount,
    gasless: q.gasless,
    request_id: q.request_id,
    unsigned_transaction: q.unsigned_transaction,
    rent,
    sign_with: ['phantom', 'solflare'],
    message: q.gasless
      ? 'Jupiter pays this transaction\'s fees and rent and takes them from the swap. The SOL received then covers later swaps and the bridge.'
      : 'Jupiter did not mark this swap gasless; the wallet must already hold a little SOL to sign it.',
  };
}

// ---------------- Samsung Wallet ----------------

function solanaPayUri(recipient, amountUsdc, label) {
  const qs = new URLSearchParams({ amount: amountUsdc, 'spl-token': MINTS.USDC, label });
  return `solana:${recipient}?${qs}`;
}

// Samsung Wallet has no developer API: funding works by sending USDC to an address.
export async function samsungFundPlan(body) {
  const owner = v.solAddr(body, 'owner');
  const buyUsd = Number(v.positiveAmount(body, 'buy_usd'));
  const target = v.oneOf(body, 'target', ['pokt', 'sol', 'native-pokt'], 'pokt');
  const [holdings, rent] = await Promise.all([sol.solanaHoldings(owner), sol.rentCosts()]);
  const gasUsd = holdings.needs_gas ? config.gaslessMinUsd : 0;
  const total = (buyUsd + gasUsd).toFixed(2);
  const steps = [
    { id: 'send-from-samsung', where: 'Samsung Wallet', action: `Send ${total} USDC on Solana to ${owner}`, note: 'Samsung charges no transfer fee for sends to external wallets.' },
  ];
  if (gasUsd) steps.push({ id: 'gas-starter', endpoint: '/v1/gas/starter', action: `Swap about ${gasUsd} USDC to SOL for fees and rent (gasless, one signature)` });
  if (target !== 'sol') steps.push({ id: 'buy', endpoint: '/v1/tx/swap', action: `Swap ${buyUsd} USDC to POKT on Solana` });
  if (target === 'sol') steps.push({ id: 'buy', endpoint: '/v1/tx/swap', action: `Swap ${buyUsd} USDC to SOL` });
  if (target === 'native-pokt') steps.push({ id: 'native', endpoint: '/v1/route/native', action: 'Bridge POKT to native POKT (two hops through Ethereum; needs ETH for the Ethereum leg)' });
  return {
    deposit_address: owner,
    send_usdc: total,
    includes_gas_usd: gasUsd,
    qr: { solana_pay_uri: solanaPayUri(owner, total, 'POKT onboarding'), plain_address: owner, note: 'Show the plain address too; Solana Pay QR support in Samsung Wallet is untested.' },
    user_note: gasUsd
      ? `Send what you want to buy plus about $${gasUsd} for gas. That buys about ${config.gasStarterSol} SOL, which covers your POKT token account and dozens of transactions. Unused SOL stays in your wallet.`
      : 'Your wallet already has SOL for fees.',
    rent,
    holdings,
    steps,
  };
}

export async function depositCheck(body) {
  const owner = v.solAddr(body, 'owner');
  const expected = v.positiveAmount(body, 'expected_usdc', false);
  const h = await sol.solanaHoldings(owner);
  return {
    owner,
    usdc: h.usdc.amount,
    sol: h.sol.amount,
    arrived: expected ? Number(h.usdc.amount) >= Number(expected) : Number(h.usdc.amount) > 0,
    needs_gas: h.needs_gas,
    next: h.needs_gas ? '/v1/gas/starter' : '/v1/tx/swap',
  };
}

// Sell POKT and deliver USDC straight to the user's Samsung Wallet address.
export async function samsungPayout(body) {
  const owner = v.solAddr(body, 'owner');
  const samsung = v.solAddr(body, 'samsung_address');
  const amount = v.positiveAmount(body, 'pokt_amount');
  if (samsung === owner) throw bad('"samsung_address" must be the Samsung Wallet USDC address, not the selling wallet');
  const q = await jup.order({ inputMint: MINTS.POKT, outputMint: MINTS.USDC, amount, taker: owner, receiver: samsung });
  return {
    ...q,
    sign_with: ['phantom', 'solflare'],
    warnings: [
      ...warnings(q),
      'Send a small test amount to this Samsung Wallet address first. Samsung only promises transfers from "compatible external crypto wallets".',
    ],
  };
}

// ---------------- native POKT ----------------

export async function routeNative(body) {
  const from = v.oneOf(body, 'from_chain', ['solana', 'base', 'arbitrum', 'ethereum']);
  const dest = v.poktAddr(body, 'dest');
  const amount = v.positiveAmount(body, 'amount');
  const acct = await pocket.account(dest);
  const steps = cat.nativeRoute(from);
  return {
    from_chain: from,
    to: dest,
    amount_pokt: amount,
    destination_on_chain: acct !== null,
    steps: steps.map((s, i) => ({ step: i + 1, ...s, ...(s.to_chain === 'pocket' ? { destination: dest } : {}) })),
    warnings: [
      'Bridge transfers cannot be reversed. Check the destination address on every step.',
      'There is no direct route from Solana, Base or Arbitrum to native POKT; every route passes through Ethereum.',
    ],
    status_endpoint: '/v1/route/status',
  };
}

export async function stakeOptions(body) {
  const limit = Math.min(Number(body?.validators_limit ?? 25) || 25, 100);
  const [params, validators] = await Promise.all([pocket.stakeParams(), pocket.bondedValidators()]);
  return {
    params,
    validators: validators.slice(0, limit),
    validator_count: validators.length,
    paths: [
      { id: 'delegate', label: 'Delegate to a validator', endpoint: '/v1/tx/delegate', sign_with: ['keplr', 'leap'], keplr_page: cat.LINKS.keplr_staking },
      { id: 'pools-and-node-runners', label: 'Staking pools, node runners, Igniter', docs: cat.LINKS.staking_docs },
      { id: 'own-supplier', label: 'Run your own supplier', docs: 'https://docs.pocket.network/services/deploy/' },
    ],
    source: 'Pocket chain, read live',
  };
}

async function requireAccount(address) {
  const acct = await pocket.account(address);
  if (!acct) throw unprocessable('account_not_on_chain', `${address} has never received funds, so it cannot sign yet. Fund it first.`, { faucet: cat.LINKS.faucet });
  return acct;
}

export async function txDelegate(body) {
  const delegator = v.poktAddr(body, 'delegator');
  const validator = v.valoperAddr(body, 'validator');
  const units = v.toBaseUnits(v.positiveAmount(body, 'amount'), 6);
  const acct = await requireAccount(delegator);
  return { ...cosmos.delegateTx({ delegator, validator, units, acct, memo: String(body?.memo ?? '') }), sign_with: ['keplr', 'leap'], explorer_tx: config.pocketExplorerTx };
}

export async function txSend(body) {
  const from = v.poktAddr(body, 'from');
  const to = v.poktAddr(body, 'to');
  const units = v.toBaseUnits(v.positiveAmount(body, 'amount'), 6);
  const acct = await requireAccount(from);
  return { ...cosmos.sendTx({ from, to, units, acct, memo: String(body?.memo ?? '') }), sign_with: ['keplr', 'leap'], explorer_tx: config.pocketExplorerTx };
}
