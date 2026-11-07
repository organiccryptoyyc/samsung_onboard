import { bad } from './errors.js';

// ---- bech32 (BIP-173) checksum check for pokt1 / poktvaloper1 addresses ----
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
function hrpExpand(hrp) {
  const out = [];
  for (const c of hrp) out.push(c.charCodeAt(0) >> 5);
  out.push(0);
  for (const c of hrp) out.push(c.charCodeAt(0) & 31);
  return out;
}
export function isBech32(addr, hrp) {
  if (typeof addr !== 'string' || addr !== addr.toLowerCase()) return false;
  const pos = addr.lastIndexOf('1');
  if (pos < 1 || addr.slice(0, pos) !== hrp || addr.length - pos - 1 < 6) return false;
  const data = [];
  for (const c of addr.slice(pos + 1)) {
    const d = CHARSET.indexOf(c);
    if (d === -1) return false;
    data.push(d);
  }
  return polymod([...hrpExpand(hrp), ...data]) === 1;
}

// ---- base58 decode for Solana public keys (must be exactly 32 bytes) ----
const B58 = '123456789ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz';
export function isSolanaAddress(addr) {
  if (typeof addr !== 'string' || addr.length < 32 || addr.length > 44) return false;
  let n = 0n;
  for (const c of addr) {
    const i = B58.indexOf(c);
    if (i === -1) return false;
    n = n * 58n + BigInt(i);
  }
  let bytes = 0;
  while (n > 0n) { n >>= 8n; bytes++; }
  let zeros = 0;
  while (addr[zeros] === '1') zeros++;
  return bytes + zeros === 32;
}

export const isEvmAddress = (a) => typeof a === 'string' && /^0x[0-9a-fA-F]{40}$/.test(a);

// ---- request field helpers ----
export function need(body, field) {
  const v = body?.[field];
  if (v === undefined || v === null || v === '') throw bad(`"${field}" is required`, { field });
  return v;
}
export function solAddr(body, field, required = true) {
  const v = required ? need(body, field) : body?.[field];
  if (v === undefined) return undefined;
  if (!isSolanaAddress(v)) throw bad(`"${field}" is not a valid Solana address`, { field });
  return v;
}
export function poktAddr(body, field, required = true) {
  const v = required ? need(body, field) : body?.[field];
  if (v === undefined) return undefined;
  if (!isBech32(v, 'pokt')) throw bad(`"${field}" is not a valid pokt1 address`, { field });
  return v;
}
export function valoperAddr(body, field) {
  const v = need(body, field);
  if (!isBech32(v, 'poktvaloper')) throw bad(`"${field}" is not a valid poktvaloper1 address`, { field });
  return v;
}
export function positiveAmount(body, field, required = true) {
  const v = required ? need(body, field) : body?.[field];
  if (v === undefined) return undefined;
  const s = String(v);
  if (!/^\d+(\.\d+)?$/.test(s) || Number(s) <= 0) throw bad(`"${field}" must be a positive decimal number, e.g. "25.5"`, { field });
  return s;
}
export function oneOf(body, field, options, dflt) {
  const v = body?.[field] ?? dflt;
  if (!options.includes(v)) throw bad(`"${field}" must be one of: ${options.join(', ')}`, { field, options });
  return v;
}

// ---- decimal <-> base units, exact (no floats) ----
export function toBaseUnits(decimalStr, decimals) {
  const [whole, frac = ''] = String(decimalStr).split('.');
  if (frac.length > decimals) throw bad(`too many decimal places (max ${decimals})`);
  return (BigInt(whole) * 10n ** BigInt(decimals) + BigInt((frac + '0'.repeat(decimals)).slice(0, decimals) || '0')).toString();
}
export function fromBaseUnits(units, decimals) {
  const n = BigInt(units);
  const d = 10n ** BigInt(decimals);
  const frac = (n % d).toString().padStart(decimals, '0').replace(/0+$/, '');
  return frac ? `${n / d}.${frac}` : `${n / d}`;
}
