import { config, MINTS, DECIMALS_FALLBACK } from './config.js';
import { getJson } from './http.js';
import { upstream } from './errors.js';
import { fromBaseUnits } from './validate.js';

let rpcId = 0;
export async function rpc(method, params, ttlMs = 0) {
  const r = await getJson('Solana RPC', config.solanaRpc, {
    method: 'POST', body: { jsonrpc: '2.0', id: ++rpcId, method, params }, ttlMs,
  });
  if (r?.error) throw upstream('Solana RPC', r.error.message || 'RPC error', { rpc_method: method });
  return r.result;
}

export async function decimalsOf(mint) {
  if (DECIMALS_FALLBACK[mint] !== undefined) return DECIMALS_FALLBACK[mint];
  const r = await rpc('getTokenSupply', [mint], 3_600_000);
  return r.value.decimals;
}

// SPL balance across all of the owner's token accounts for one mint.
export async function tokenBalance(owner, mint) {
  const r = await rpc('getTokenAccountsByOwner', [owner, { mint }, { encoding: 'jsonParsed' }]);
  let units = 0n;
  let decimals = null;
  for (const acc of r.value) {
    const ta = acc.account.data.parsed.info.tokenAmount;
    units += BigInt(ta.amount);
    decimals = ta.decimals;
  }
  if (decimals === null) decimals = await decimalsOf(mint);
  return { units: units.toString(), amount: fromBaseUnits(units, decimals), decimals, has_token_account: r.value.length > 0 };
}

export async function solBalance(owner) {
  const r = await rpc('getBalance', [owner]);
  return { lamports: String(r.value), amount: fromBaseUnits(r.value, 9) };
}

// Rent is read live: Solana is stepping lamports-per-byte down under SIMD-0437.
export async function rentCosts() {
  const [wallet, token] = await Promise.all([
    rpc('getMinimumBalanceForRentExemption', [0], 600_000),
    rpc('getMinimumBalanceForRentExemption', [165], 600_000),
  ]);
  return {
    wallet_account_sol: fromBaseUnits(wallet, 9),
    token_account_sol: fromBaseUnits(token, 9),
    base_fee_per_signature_sol: '0.000005',
    note: 'Rent is a refundable deposit. Read live from the network.',
  };
}

export async function solanaHoldings(owner) {
  const [sol, usdc, pokt] = await Promise.all([
    solBalance(owner), tokenBalance(owner, MINTS.USDC), tokenBalance(owner, MINTS.POKT),
  ]);
  return {
    address: owner,
    sol,
    usdc: { mint: MINTS.USDC, ...usdc },
    pokt: { mint: MINTS.POKT, ...pokt },
    needs_gas: Number(sol.amount) < config.gaslessSolThreshold,
  };
}

export async function signatureStatus(signature) {
  const r = await rpc('getSignatureStatuses', [[signature], { searchTransactionHistory: true }]);
  const s = r.value[0];
  if (!s) return { found: false };
  return { found: true, confirmation: s.confirmationStatus, failed: s.err !== null, slot: s.slot };
}
