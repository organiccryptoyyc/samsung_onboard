// Jupiter adapter. Everything Jupiter-specific lives here, so moving from the
// Ultra API to Swap V2 changes this file only. Assumed stable (product decision,
// 7 Nov 2026): gasless swaps for wallets under ~0.01 SOL on trades of ~$10+, and
// a `receiver` field that sends the swap output to another address.
import { config, MINTS } from './config.js';
import { getJson } from './http.js';
import { unprocessable, upstream } from './errors.js';
import { decimalsOf } from './solana.js';
import { toBaseUnits, fromBaseUnits } from './validate.js';

const SYMBOL = { [MINTS.USDC]: 'USDC', [MINTS.SOL]: 'SOL', [MINTS.POKT]: 'POKT' };

function headers() {
  return config.jupiterApiKey ? { 'x-api-key': config.jupiterApiKey } : {};
}

// amount is a human decimal string of the input token.
export async function order({ inputMint, outputMint, amount, taker, receiver }) {
  const [inDec, outDec] = await Promise.all([decimalsOf(inputMint), decimalsOf(outputMint)]);
  const qs = new URLSearchParams({ inputMint, outputMint, amount: toBaseUnits(amount, inDec) });
  if (taker) qs.set('taker', taker);
  if (receiver) qs.set('receiver', receiver);
  const r = await getJson('Jupiter', `${config.jupiterBase}/order?${qs}`, { headers: headers() });

  const hasError = r?.errorCode !== undefined && r?.errorCode !== null;
  if (hasError && taker && !r?.transaction) {
    // errorCode 3 = trade too small to run gasless when the wallet has no SOL.
    const tooSmall = Number(r.errorCode) === 3;
    throw unprocessable(
      tooSmall ? 'below_gasless_minimum' : 'swap_not_possible',
      tooSmall
        ? `This wallet has under ${config.gaslessSolThreshold} SOL, so the swap must be about $${config.gaslessMinUsd} or more to run gasless. Send more USDC or add a little SOL.`
        : r.errorMessage || 'Jupiter could not build this swap.',
      { jupiter_error_code: r.errorCode },
    );
  }
  if (!r?.outAmount) throw upstream('Jupiter', 'no route returned', { reply: r });

  // Jupiter reports priceImpactPct as a fraction string ("0.0123" = 1.23%).
  const impact = r.priceImpactPct !== undefined
    ? Math.abs(Number(r.priceImpactPct)) * 100
    : Math.abs(Number(r.priceImpact ?? 0));
  return {
    input: { mint: inputMint, symbol: SYMBOL[inputMint] ?? null, amount: fromBaseUnits(r.inAmount, inDec), units: String(r.inAmount) },
    output: { mint: outputMint, symbol: SYMBOL[outputMint] ?? null, amount: fromBaseUnits(r.outAmount, outDec), units: String(r.outAmount) },
    min_output: r.otherAmountThreshold ? fromBaseUnits(r.otherAmountThreshold, outDec) : null,
    price_impact_pct: Number(impact.toFixed(4)),
    high_impact: impact > config.maxPriceImpactPct,
    route: (r.routePlan || []).map((p) => ({ venue: p.swapInfo?.label ?? null, percent: p.percent ?? null })),
    fee_bps: r.feeBps ?? null,
    gasless: Boolean(r.gasless),
    usd_in: r.inUsdValue ?? null,
    usd_out: r.outUsdValue ?? null,
    request_id: r.requestId ?? null,
    unsigned_transaction: r.transaction || null,
    receiver: receiver ?? null,
  };
}

// Forward a wallet-signed transaction. The service never sees a private key.
export async function execute({ signedTransaction, requestId }) {
  const r = await getJson('Jupiter', `${config.jupiterBase}/execute`, {
    method: 'POST', headers: headers(), body: { signedTransaction, requestId },
  });
  return {
    status: r.status === 'Success' ? 'success' : 'failed',
    signature: r.signature ?? null,
    code: r.code ?? null,
    message: r.error ?? null,
  };
}
