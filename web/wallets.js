// Wallet connections. Signing libraries load only when the user signs, so the
// app stays light. Versions are pinned.
const WEB3_URL = 'https://cdn.jsdelivr.net/npm/@solana/web3.js@1.95.3/+esm';
const STARGATE_URL = 'https://cdn.jsdelivr.net/npm/@cosmjs/stargate@0.32.4/+esm';

const cfg = () => window.POKT_ONBOARD;

export const state = { solana: null, pokt: null, solProvider: null };

function solanaProvider() {
  if (window.phantom?.solana?.isPhantom) return window.phantom.solana;
  if (window.solflare?.isSolflare) return window.solflare;
  if (window.solana) return window.solana;
  return null;
}

// On phones without an injected wallet, reopen this page inside the wallet app.
export function mobileWalletLinks() {
  const url = encodeURIComponent(location.href);
  const ref = encodeURIComponent(location.origin);
  return [
    { label: 'Open in Phantom', url: `https://phantom.app/ul/browse/${url}?ref=${ref}` },
    { label: 'Open in Solflare', url: `https://solflare.com/ul/v1/browse/${url}?ref=${ref}` },
  ];
}

export async function connectSolana() {
  const p = solanaProvider();
  if (!p) return { ok: false, links: mobileWalletLinks() };
  const r = await p.connect();
  state.solProvider = p;
  state.solana = (r?.publicKey ?? p.publicKey).toString();
  return { ok: true, address: state.solana };
}

export async function connectKeplr() {
  if (!window.keplr) return { ok: false, message: 'Keplr not found. Install the Keplr extension, or open this page in the Keplr mobile app browser.' };
  await window.keplr.enable(cfg().pocketChainId);
  const key = await window.keplr.getKey(cfg().pocketChainId);
  state.pokt = key.bech32Address;
  return { ok: true, address: state.pokt };
}

const b64ToBytes = (b64) => Uint8Array.from(atob(b64), (c) => c.charCodeAt(0));
const bytesToB64 = (bytes) => btoa(String.fromCharCode(...bytes));

// Sign a base64 Solana transaction from the API; returns the signed base64.
export async function signSolana(unsignedB64) {
  if (!state.solProvider) throw new Error('Connect a Solana wallet first.');
  const { VersionedTransaction } = await import(WEB3_URL);
  const tx = VersionedTransaction.deserialize(b64ToBytes(unsignedB64));
  const signed = await state.solProvider.signTransaction(tx);
  return bytesToB64(signed.serialize());
}

// Sign and broadcast a native POKT transaction built by /v1/tx/delegate or /v1/tx/send.
export async function signAndBroadcastPocket(built) {
  if (!state.pokt) throw new Error('Connect Keplr first.');
  const { SigningStargateClient } = await import(STARGATE_URL);
  const signer = window.keplr.getOfflineSigner(cfg().pocketChainId);
  const client = await SigningStargateClient.connectWithSigner(cfg().pocketRpc, signer);
  const res = await client.signAndBroadcast(state.pokt, built.messages, built.fee, built.memo || '');
  if (res.code !== 0) throw new Error(res.rawLog || `Transaction failed with code ${res.code}`);
  return res.transactionHash;
}
