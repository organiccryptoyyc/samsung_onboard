import { config } from './config.js';
import { getJson } from './http.js';
import { fromBaseUnits } from './validate.js';

const lcd = (path, opts = {}) => getJson('Pocket LCD', `${config.pocketLcd}${path}`, opts);
const coin = (c) =>
  c ? { denom: c.denom, units: c.amount, pokt: c.denom === 'upokt' ? fromBaseUnits(c.amount, 6) : null } : null;

// Governance parameters, read live and cached for five minutes. Never hard-coded.
export async function stakeParams() {
  const [supplier, application, shared, staking] = await Promise.all([
    lcd('/pokt-network/poktroll/supplier/params', { ttlMs: 300_000 }),
    lcd('/pokt-network/poktroll/application/params', { ttlMs: 300_000 }),
    lcd('/pokt-network/poktroll/shared/params', { ttlMs: 300_000 }),
    lcd('/cosmos/staking/v1beta1/params', { ttlMs: 300_000 }),
  ]);
  return {
    supplier_min_stake: coin(supplier?.params?.min_stake),
    application_min_stake: coin(application?.params?.min_stake),
    supplier_unbonding_sessions: shared?.params?.supplier_unbonding_period_sessions ?? null,
    blocks_per_session: shared?.params?.num_blocks_per_session ?? null,
    validator_unbonding_time: staking?.params?.unbonding_time ?? null,
  };
}

export async function bondedValidators() {
  const r = await lcd('/cosmos/staking/v1beta1/validators?status=BOND_STATUS_BONDED&pagination.limit=300', { ttlMs: 300_000 });
  return (r?.validators || [])
    .filter((v) => !v.jailed)
    .map((v) => ({
      operator_address: v.operator_address,
      moniker: v.description?.moniker ?? '',
      commission_pct: Number((Number(v.commission?.commission_rates?.rate ?? 0) * 100).toFixed(2)),
      voting_power_pokt: fromBaseUnits(String(v.tokens).split('.')[0], 6),
    }))
    .sort((a, b) => Number(b.voting_power_pokt) - Number(a.voting_power_pokt));
}

// Returns null when the address has never received funds (not yet on chain).
export async function account(address) {
  const r = await lcd(`/cosmos/auth/v1beta1/accounts/${address}`, { allow404: true });
  if (!r) return null;
  const a = r.account?.base_account ?? r.account;
  return { account_number: String(a.account_number), sequence: String(a.sequence ?? '0') };
}

export async function balances(address) {
  const r = await lcd(`/cosmos/bank/v1beta1/balances/${address}`);
  const out = {};
  for (const b of r?.balances || []) out[b.denom] = b.amount;
  return { pokt: fromBaseUnits(out.upokt ?? '0', 6), upokt: out.upokt ?? '0', mact: fromBaseUnits(out.umact ?? '0', 6) };
}

export async function services() {
  const r = await lcd('/pokt-network/poktroll/service/service?pagination.limit=1000', { ttlMs: 300_000 });
  return (r?.service || r?.services || []).map((s) => ({
    id: s.id,
    name: s.name,
    compute_units_per_relay: s.compute_units_per_relay ?? null,
  }));
}
