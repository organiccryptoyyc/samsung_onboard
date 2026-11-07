import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import * as m from './mock-upstream.js';

let mock, api, base;

before(async () => {
  mock = await m.startMock();
  const up = `http://127.0.0.1:${mock.address().port}`;
  process.env.SOLANA_RPC_URL = `${up}/rpc`;
  process.env.JUPITER_BASE_URL = `${up}/jup`;
  process.env.POCKET_LCD_URL = `${up}/lcd`;
  process.env.PORTAL_BASE_URL = `${up}/portal`;
  process.env.ICON_BASE_URL = 'https://cdn.example/icons';
  const { createServer } = await import('../src/server.js');
  api = createServer();
  await new Promise((r) => api.listen(0, r));
  base = `http://127.0.0.1:${api.address().port}`;
});

after(() => {
  api.close();
  mock.close();
});

async function call(path, body, method = 'POST') {
  const res = await fetch(base + path, { method, headers: { 'content-type': 'application/json' }, body: method === 'POST' ? JSON.stringify(body ?? {}) : undefined });
  const text = await res.text();
  // Pocket gateway rule: every body starts with { or [
  assert.match(text.trimStart(), /^[{[]/, `${path} must return JSON, got: ${text.slice(0, 80)}`);
  return { status: res.status, body: JSON.parse(text), text };
}

// SAGE scans the first 2 KB of success bodies for these words.
const ERROR_WORDS = /timeout|connection refused|connection reset|bad gateway|service unavailable|gateway timeout/i;

test('probes: version, health, functional menu', async () => {
  assert.deepEqual((await call('/v1/version', null, 'GET')).body, { service: 'pokt-onboard', version: '0.1.0' });
  assert.deepEqual((await call('/v1/health', null, 'GET')).body, { status: 'ok' });
  const menu = await call('/v1/menu', {});
  assert.equal(menu.status, 200);
  assert.equal(menu.body.tiles[0].id, 'marketplace');
  assert.equal(menu.body.tiles[0].size, 2);
  assert.ok(menu.body.tiles.slice(1).every((t) => t.size === 1));
});

test('menu modes follow the wallet', async () => {
  const k = (await call('/v1/menu', { wallet: 'keplr' })).body.tiles;
  assert.equal(k.find((t) => t.id === 'stake').mode, 'sign');
  const p = (await call('/v1/menu', { wallet: 'phantom' })).body.tiles;
  assert.equal(p.find((t) => t.id === 'buy').mode, 'sign');
  assert.equal((await call('/v1/menu', { wallet: 'nokia' })).status, 400);
});

test('errors are JSON 4xx, not HTML or 5xx', async () => {
  assert.equal((await call('/v1/nope', {})).status, 404);
  assert.equal((await call('/v1/menu', null, 'GET')).status, 405);
  const r = await fetch(base + '/v1/quote/buy', { method: 'POST', body: '{not json' });
  assert.equal(r.status, 400);
  assert.equal((await r.json()).error.code, 'invalid_json');
  assert.equal((await call('/v1/quote/buy', { amount: '-3' })).status, 400);
});

test('buy quote: USDC to POKT with price impact warning on large orders', async () => {
  const small = await call('/v1/quote/buy', { amount: '20' });
  assert.equal(small.status, 200);
  assert.equal(small.body.quote.output.symbol, 'POKT');
  assert.equal(small.body.quote.output.amount, '800');
  assert.equal(small.body.quote.unsigned_transaction, undefined);
  assert.equal(small.body.warnings.length, 0);
  assert.doesNotMatch(small.text.slice(0, 2048), ERROR_WORDS);
  const big = await call('/v1/quote/buy', { amount: '500' });
  assert.equal(big.body.quote.high_impact, true);
  assert.equal(big.body.warnings.length, 1);
});

test('swap refuses pairs without POKT', async () => {
  const r = await call('/v1/quote/swap', { input: 'USDC', output: 'SOL', amount: '5' });
  assert.equal(r.status, 422);
  assert.equal(r.body.error.code, 'pokt_only');
});

test('tx/swap returns an unsigned transaction and blocks high impact unless accepted', async () => {
  const ok = await call('/v1/tx/swap', { owner: m.OWNER_WITH_SOL, input: 'USDC', output: 'POKT', amount: '5' });
  assert.equal(ok.status, 200);
  assert.ok(ok.body.unsigned_transaction);
  assert.equal(ok.body.request_id, 'req-123');
  const hi = await call('/v1/tx/swap', { owner: m.OWNER_NO_SOL, input: 'USDC', output: 'POKT', amount: '450' });
  assert.equal(hi.body.error.code, 'high_price_impact');
  const accepted = await call('/v1/tx/swap', { owner: m.OWNER_NO_SOL, input: 'USDC', output: 'POKT', amount: '450', accept_high_impact: true });
  assert.equal(accepted.status, 200);
  assert.equal((await call('/v1/tx/swap', { owner: 'bad', input: 'USDC', output: 'POKT', amount: '5' })).status, 400);
});

test('tx/execute forwards a signed transaction', async () => {
  const r = await call('/v1/tx/execute', { signed_transaction: 'AAAA', request_id: 'req-123' });
  assert.deepEqual(r.body, { status: 'success', signature: 'sig-abc', code: null, message: null });
});

test('gas starter buys SOL gasless for a USDC-only wallet', async () => {
  const r = await call('/v1/gas/starter', { owner: m.OWNER_NO_SOL });
  assert.equal(r.status, 200);
  assert.equal(r.body.needed, true);
  assert.equal(r.body.spend_usdc, '10.00'); // 0.02 SOL costs $3 here, raised to the $10 gasless minimum
  assert.equal(r.body.gasless, true);
  assert.ok(r.body.unsigned_transaction);
  assert.equal(r.body.rent.token_account_sol, '0.00148844');
  const has = await call('/v1/gas/starter', { owner: m.OWNER_WITH_SOL });
  assert.equal(has.body.needed, false);
});

test('below the gasless minimum the user gets a clear 422', async () => {
  const r = await call('/v1/tx/swap', { owner: m.OWNER_NO_SOL, input: 'USDC', output: 'SOL', amount: '3' });
  assert.equal(r.status, 422);
  assert.equal(r.body.error.code, 'below_gasless_minimum');
});

test('Samsung fund plan adds gas money and a Solana Pay QR', async () => {
  const r = await call('/v1/samsung/fund-plan', { owner: m.OWNER_NO_SOL, buy_usd: '50', target: 'native-pokt' });
  assert.equal(r.status, 200);
  assert.equal(r.body.send_usdc, '60.00');
  assert.match(r.body.qr.solana_pay_uri, /^solana:7xKX.*spl-token=EPjFWdd5/);
  assert.deepEqual(r.body.steps.map((s) => s.id), ['send-from-samsung', 'gas-starter', 'buy', 'native']);
  const funded = await call('/v1/samsung/fund-plan', { owner: m.OWNER_WITH_SOL, buy_usd: '50' });
  assert.equal(funded.body.send_usdc, '50.00');
});

test('deposit check and Samsung payout', async () => {
  const d = await call('/v1/deposit/check', { owner: m.OWNER_NO_SOL, expected_usdc: '40' });
  assert.equal(d.body.arrived, true);
  assert.equal(d.body.next, '/v1/gas/starter');
  const p = await call('/v1/samsung/payout', { owner: m.OWNER_WITH_SOL, samsung_address: m.SAMSUNG, pokt_amount: '400' });
  assert.equal(p.status, 200);
  assert.equal(p.body.receiver, m.SAMSUNG);
  assert.equal(p.body.output.amount, '10');
  assert.match(Buffer.from(p.body.unsigned_transaction, 'base64').toString(), new RegExp(m.SAMSUNG));
  const same = await call('/v1/samsung/payout', { owner: m.OWNER_WITH_SOL, samsung_address: m.OWNER_WITH_SOL, pokt_amount: '1' });
  assert.equal(same.status, 400);
});

test('account reads Solana and Pocket balances', async () => {
  const r = await call('/v1/account', { solana: m.OWNER_WITH_SOL, pokt: m.POKT_NEW });
  assert.equal(r.body.solana.sol.amount, '1');
  assert.equal(r.body.solana.pokt.amount, '1000');
  assert.equal(r.body.pocket.on_chain, false);
  assert.ok(r.body.pocket.activate);
  assert.equal((await call('/v1/account', {})).status, 400);
});

test('native route goes through Ethereum', async () => {
  const r = await call('/v1/route/native', { from_chain: 'solana', dest: m.POKT_FUNDED, amount: '100' });
  assert.deepEqual(r.body.steps.map((s) => s.to_chain), ['ethereum', 'pocket']);
  assert.equal(r.body.steps[1].destination, m.POKT_FUNDED);
  const eth = await call('/v1/route/native', { from_chain: 'ethereum', dest: m.POKT_FUNDED, amount: '1' });
  assert.equal(eth.body.steps.length, 1);
  assert.equal((await call('/v1/route/native', { from_chain: 'solana', dest: 'pokt1bad', amount: '1' })).status, 400);
});

test('stake options read live params and skip jailed validators', async () => {
  const r = await call('/v1/stake/options', {});
  assert.equal(r.body.params.supplier_min_stake.pokt, '59500');
  assert.equal(r.body.validators.length, 1);
  assert.equal(r.body.validators[0].commission_pct, 5);
});

test('delegate builds a Keplr-signable sign doc', async () => {
  const r = await call('/v1/tx/delegate', { delegator: m.POKT_FUNDED, validator: m.VALOPER, amount: '12.5' });
  assert.equal(r.status, 200);
  const doc = r.body.amino_sign_doc;
  assert.equal(doc.chain_id, 'pocket');
  assert.equal(doc.account_number, '42');
  assert.equal(doc.sequence, '7');
  assert.equal(doc.msgs[0].type, 'cosmos-sdk/MsgDelegate');
  assert.deepEqual(doc.msgs[0].value.amount, { denom: 'upokt', amount: '12500000' });
  assert.deepEqual(doc.fee, { amount: [{ denom: 'upokt', amount: '2500' }], gas: '250000' });
  assert.equal(r.body.messages[0].typeUrl, '/cosmos.staking.v1beta1.MsgDelegate');
  const fresh = await call('/v1/tx/send', { from: m.POKT_NEW, to: m.POKT_FUNDED, amount: '1' });
  assert.equal(fresh.body.error.code, 'account_not_on_chain');
});

test('services and marketplace catalogues', async () => {
  const s = await call('/v1/services', {});
  assert.equal(s.body.count, 3);
  assert.equal(s.body.services.find((x) => x.id === 'eth').icon_png, 'https://cdn.example/icons/eth.png');
  assert.equal(s.body.services.find((x) => x.id === 'mystery').icon_png, null);
  const mk = await call('/v1/marketplace', { query: 'clinical' });
  assert.equal(mk.body.count, 1);
  assert.equal(mk.body.services[0].call, `${process.env.PORTAL_BASE_URL}/v1/clinical-trials`);
  const ai = await call('/v1/ai/connect', { client: 'claude' });
  assert.equal(ai.body.npm_mcp.package, '@pocket-network/agentic-portal-mcp');
  assert.ok(ai.body.config.json.mcpServers);
});

test('route status reads Solana signature status', async () => {
  assert.equal((await call('/v1/route/status', { signature: 'known' })).body.confirmation, 'finalized');
  assert.equal((await call('/v1/route/status', { signature: 'unknown' })).body.found, false);
});

test('upstream failure is a JSON 424, never a 5xx', async () => {
  const { config } = await import('../src/config.js');
  const old = config.pocketLcd;
  config.pocketLcd = 'http://127.0.0.1:1';
  const { clearCache } = await import('../src/http.js');
  clearCache();
  const r = await call('/v1/stake/options', {});
  config.pocketLcd = old;
  assert.equal(r.status, 424);
  assert.equal(r.body.error.code, 'upstream_failed');
});

test('openapi.json documents exactly the served routes', async () => {
  const { readFileSync } = await import('node:fs');
  const { ROUTES } = await import('../src/server.js');
  const spec = JSON.parse(readFileSync(new URL('../openapi.json', import.meta.url)));
  const documented = Object.entries(spec.paths).flatMap(([p, ops]) => Object.keys(ops).map((m) => `${m.toUpperCase()} ${p}`)).sort();
  assert.deepEqual(documented, Object.keys(ROUTES).sort());
});
