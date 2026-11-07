// A fake Solana RPC, Jupiter, Pocket LCD and Agentic Portal so the API can be
// tested offline. Shapes follow the real APIs; numbers are made up.
import http from 'node:http';

export const USDC = 'EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v';
export const SOL = 'So11111111111111111111111111111111111111112';
export const POKT = '6CAsXfiCXZfP8APCG6Vma2DFMindopxiqYQN4LSQfhoC';
export const OWNER_NO_SOL = '7xKXtg2CW87d97TXJSDpbD5jBkheTqA83TZRuJosgAsU'; // 50 USDC, 0 SOL
export const OWNER_WITH_SOL = '9WzDXwBbmkg8ZTbNMqUxvQRAyrZzDsGYdLVL9zYtAWWM'; // 1 SOL, 1000 POKT
export const SAMSUNG = 'whirLbMiicVdio4qvUfM5KAg6Ct8VwpYzGff3uctyCc';

// bech32 encoder for test addresses
const CHARSET = 'qpzry9x8gf2tvdw0s3jn54khce6mua7l';
function polymod(values) {
  const G = [0x3b6a57b2, 0x26508e6d, 0x1ea119fa, 0x3d4233dd, 0x2a1462b3];
  let chk = 1;
  for (const v of values) {
    const b = chk >> 25;
    chk = ((chk & 0x1ffffff) << 5) ^ v;
    for (let i = 0; i < 5; i++) if ((b >> i) & 1) chk ^= G[i];
  }
  return chk;
}
export function bech32(hrp, bytes) {
  const data = [];
  let acc = 0, bits = 0;
  for (const b of bytes) {
    acc = (acc << 8) | b; bits += 8;
    while (bits >= 5) { bits -= 5; data.push((acc >> bits) & 31); }
  }
  if (bits) data.push((acc << (5 - bits)) & 31);
  const exp = [...[...hrp].map((c) => c.charCodeAt(0) >> 5), 0, ...[...hrp].map((c) => c.charCodeAt(0) & 31)];
  const mod = polymod([...exp, ...data, 0, 0, 0, 0, 0, 0]) ^ 1;
  const chk = [0, 1, 2, 3, 4, 5].map((i) => (mod >> (5 * (5 - i))) & 31);
  return `${hrp}1${[...data, ...chk].map((d) => CHARSET[d]).join('')}`;
}
export const POKT_FUNDED = bech32('pokt', Array.from({ length: 20 }, (_, i) => i + 1));
export const POKT_NEW = bech32('pokt', Array.from({ length: 20 }, (_, i) => 200 - i));
export const VALOPER = bech32('poktvaloper', Array.from({ length: 20 }, (_, i) => i + 1));

const PRICE = { // USD per whole token
  [USDC]: 1, [SOL]: 150, [POKT]: 0.025,
};
const DEC = { [USDC]: 6, [SOL]: 9, [POKT]: 6 };

function json(res, status, obj) {
  res.writeHead(status, { 'content-type': 'application/json' });
  res.end(JSON.stringify(obj));
}

function tokenAccounts(owner, mint) {
  const holdings = { [OWNER_NO_SOL]: { [USDC]: '50000000' }, [OWNER_WITH_SOL]: { [POKT]: '1000000000', [USDC]: '5000000' } };
  const amt = holdings[owner]?.[mint];
  if (!amt) return [];
  return [{ account: { data: { parsed: { info: { tokenAmount: { amount: amt, decimals: DEC[mint] } } } } } }];
}

function rpc(req) {
  const p = req.params;
  switch (req.method) {
    case 'getBalance': return { value: p[0] === OWNER_WITH_SOL ? 1_000_000_000 : 0 };
    case 'getTokenAccountsByOwner': return { value: tokenAccounts(p[0], p[1].mint) };
    case 'getTokenSupply': return { value: { decimals: DEC[p[0]] ?? 6 } };
    case 'getMinimumBalanceForRentExemption': return (128 + p[0]) * 5080;
    case 'getSignatureStatuses': return { value: [p[0][0] === 'known' ? { slot: 1, confirmationStatus: 'finalized', err: null } : null] };
    default: return null;
  }
}

function order(q) {
  const inMint = q.get('inputMint'), outMint = q.get('outputMint');
  const inUnits = BigInt(q.get('amount'));
  const usd = Number(inUnits) / 10 ** DEC[inMint] * PRICE[inMint];
  const taker = q.get('taker');
  const takerHasSol = taker === OWNER_WITH_SOL;
  if (taker && !takerHasSol && usd < 10) {
    return { inAmount: String(inUnits), outAmount: '0', errorCode: 3, errorMessage: 'Insufficient funds for gasless', transaction: null };
  }
  const outUnits = Math.floor(usd / PRICE[outMint] * 10 ** DEC[outMint]);
  return {
    inputMint: inMint, outputMint: outMint,
    inAmount: String(inUnits), outAmount: String(outUnits),
    otherAmountThreshold: String(Math.floor(outUnits * 0.995)),
    priceImpactPct: usd > 400 ? '0.031' : '0.002',
    routePlan: [{ swapInfo: { label: 'Orca' }, percent: 100 }],
    feeBps: taker && !takerHasSol ? 25 : 5,
    gasless: Boolean(taker && !takerHasSol),
    inUsdValue: usd, outUsdValue: usd,
    requestId: 'req-123',
    transaction: taker ? Buffer.from(`tx:${inMint}->${outMint}:${q.get('receiver') ?? taker}`).toString('base64') : null,
  };
}

const LCD = {
  '/pokt-network/poktroll/supplier/params': { params: { min_stake: { denom: 'upokt', amount: '59500000000' } } },
  '/pokt-network/poktroll/application/params': { params: { min_stake: { denom: 'upokt', amount: '100000000' } } },
  '/pokt-network/poktroll/shared/params': { params: { num_blocks_per_session: '60', supplier_unbonding_period_sessions: '1' } },
  '/cosmos/staking/v1beta1/params': { params: { unbonding_time: '1814400s' } },
  '/cosmos/staking/v1beta1/validators': {
    validators: [
      { operator_address: VALOPER, jailed: false, tokens: '5000000000000', description: { moniker: 'Alpha' }, commission: { commission_rates: { rate: '0.050000000000000000' } } },
      { operator_address: 'x', jailed: true, tokens: '1', description: { moniker: 'Jailed' }, commission: { commission_rates: { rate: '0.1' } } },
    ],
  },
  '/pokt-network/poktroll/service/service': { service: [{ id: 'eth', name: 'Ethereum', compute_units_per_relay: '1' }, { id: 'solana', name: 'Solana', compute_units_per_relay: '1' }, { id: 'mystery', name: 'Mystery', compute_units_per_relay: '3' }] },
};

export function startMock() {
  const server = http.createServer(async (req, res) => {
    const url = new URL(req.url, 'http://x');
    let raw = '';
    for await (const c of req) raw += c;
    if (url.pathname === '/rpc') {
      const r = JSON.parse(raw);
      return json(res, 200, { jsonrpc: '2.0', id: r.id, result: rpc(r) });
    }
    if (url.pathname === '/jup/order') return json(res, 200, order(url.searchParams));
    if (url.pathname === '/jup/execute') {
      const b = JSON.parse(raw);
      return json(res, 200, b.requestId === 'req-123' ? { status: 'Success', signature: 'sig-abc' } : { status: 'Failed', code: -1, error: 'unknown request' });
    }
    if (url.pathname === '/portal/services.json') {
      return json(res, 200, { services: [
        { serviceId: 'akash', displayName: 'Akash Network CometBFT and LCD', category: 'blockchain', priceUsd: '0.005000', resourceUrl: 'https://agent.pocket.network/v1/akash' },
        { serviceId: 'clinical-trials', displayName: 'Clinical Trials Search', category: 'health', priceUsd: '0.005000' },
      ] });
    }
    const p = url.pathname.replace(/^\/lcd/, '');
    if (LCD[p]) return json(res, 200, LCD[p]);
    if (p.startsWith('/cosmos/auth/v1beta1/accounts/')) {
      const addr = p.split('/').pop();
      if (addr === POKT_FUNDED) return json(res, 200, { account: { '@type': '/cosmos.auth.v1beta1.BaseAccount', address: addr, account_number: '42', sequence: '7' } });
      return json(res, 404, { code: 5, message: 'account not found' });
    }
    if (p.startsWith('/cosmos/bank/v1beta1/balances/')) {
      const addr = p.split('/').pop();
      return json(res, 200, { balances: addr === POKT_FUNDED ? [{ denom: 'upokt', amount: '2500000000' }, { denom: 'umact', amount: '1000000' }] : [] });
    }
    json(res, 404, { error: 'mock: no route ' + url.pathname });
  });
  return new Promise((resolve) => server.listen(0, () => resolve(server)));
}
