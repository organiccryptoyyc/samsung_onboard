import { state, connectSolana, connectKeplr, signSolana, signAndBroadcastPocket } from './wallets.js';

const $ = (sel, root = document) => root.querySelector(sel);
const QR_URL = 'https://cdn.jsdelivr.net/npm/qrcode-generator@1.4.4/qrcode.min.js';

// ---------- helpers ----------
function esc(s) {
  return String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]);
}
const short = (a) => (a && a.length > 12 ? `${a.slice(0, 4)}…${a.slice(-4)}` : a);

async function api(path, body = {}) {
  let res;
  try {
    res = await fetch(window.POKT_ONBOARD.apiBase + path, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(body) });
  } catch {
    throw new Error('Could not reach the onboarding service. Check your connection and try again.');
  }
  const data = await res.json().catch(() => ({}));
  if (!res.ok) {
    const e = new Error(data?.error?.message || `Request failed (${res.status})`);
    e.code = data?.error?.code;
    e.details = data?.error?.details;
    throw e;
  }
  return data;
}

function toast(msg) {
  const t = $('#toast');
  t.textContent = msg;
  t.hidden = false;
  clearTimeout(toast.timer);
  toast.timer = setTimeout(() => { t.hidden = true; }, 3500);
}

async function copy(text) {
  try { await navigator.clipboard.writeText(text); toast('Copied'); } catch { toast('Copy failed: select and copy it manually'); }
}

let lastFocus = null;
function openSheet(title, html) {
  lastFocus = document.activeElement;
  $('#sheet-title').textContent = title;
  $('#sheet-body').innerHTML = html;
  $('#sheet').hidden = false;
  $('#sheet-close').focus();
}
function closeSheet() {
  $('#sheet').hidden = true;
  lastFocus?.focus?.();
}
const body = () => $('#sheet-body');

function showError(el, e) {
  el.innerHTML = `<p class="err">${esc(e.message)}</p>`;
}

function quoteTable(q) {
  return `<div class="result"><dl>
    <dt>You pay</dt><dd>${esc(q.input.amount)} ${esc(q.input.symbol ?? '')}</dd>
    <dt>You get (about)</dt><dd>${esc(q.output.amount)} ${esc(q.output.symbol ?? '')}</dd>
    ${q.min_output ? `<dt>Minimum</dt><dd>${esc(q.min_output)}</dd>` : ''}
    <dt>Price impact</dt><dd>${esc(q.price_impact_pct)}%</dd>
    <dt>Route</dt><dd>${esc(q.route.map((r) => r.venue).filter(Boolean).join(', ') || '—')}</dd>
  </dl></div>`;
}
const warnList = (w = []) => w.map((x) => `<p class="warn">${esc(x)}</p>`).join('');

// Sign a swap built by the API and submit it.
async function signAndSubmit(built, out) {
  out.insertAdjacentHTML('beforeend', '<p class="muted" data-status>Waiting for your wallet…</p>');
  const status = out.querySelector('[data-status]');
  try {
    const signed = await signSolana(built.unsigned_transaction);
    status.textContent = 'Submitting…';
    const r = await api('/v1/tx/execute', { signed_transaction: signed, request_id: built.request_id });
    if (r.status !== 'success') throw new Error(r.message || 'The swap did not go through.');
    status.innerHTML = `<span class="ok">Done.</span> <a href="https://solscan.io/tx/${encodeURIComponent(r.signature)}" target="_blank" rel="noopener">View transaction</a>`;
    refreshWallet();
  } catch (e) {
    status.className = 'err';
    status.textContent = e.message;
  }
}

function needSolana(el) {
  if (state.solana) return false;
  el.innerHTML = '<p class="muted">Connect a Solana wallet (Phantom or Solflare) to continue.</p><button class="primary small" type="button" data-connect-sol>Connect</button>';
  el.querySelector('[data-connect-sol]').onclick = onConnectSol;
  return true;
}

// ---------- wallet header ----------
async function onConnectSol() {
  try {
    const r = await connectSolana();
    if (!r.ok) {
      openSheet('Open in your wallet app', `<p>No Solana wallet was found in this browser. On a phone, open this page inside your wallet app:</p>
        <div class="stack">${r.links.map((l) => `<a class="primary" href="${esc(l.url)}">${esc(l.label)}</a>`).join('')}</div>
        <p class="muted">On a computer, install the Phantom or Solflare browser extension.</p>`);
      return;
    }
    $('#connect-sol').textContent = `SOL ${short(r.address)}`;
    $('#connect-sol').classList.add('on');
    refreshWallet();
  } catch (e) { toast(e.message); }
}

async function onConnectKeplr() {
  try {
    const r = await connectKeplr();
    if (!r.ok) return toast(r.message);
    $('#connect-keplr').textContent = `POKT ${short(r.address)}`;
    $('#connect-keplr').classList.add('on');
  } catch (e) { toast(e.message); }
}

async function refreshWallet() {
  if (!state.solana) return;
  try {
    const a = await api('/v1/account', { solana: state.solana });
    state.holdings = a.solana;
    $('#gas-notice').hidden = !a.solana.needs_gas || Number(a.solana.usdc.amount) === 0;
  } catch { /* balances are optional for the menu */ }
}

// ---------- disclosures ----------
function disclosuresHtml(d) {
  if (!d) return '';
  return `<details class="legal"><summary>Disclosures</summary>${d.items.map((i) => `<p>${esc(i.text)}</p>`).join('')}<p class="muted">Version ${esc(d.version)}</p></details>`;
}

async function showDisclosures() {
  openSheet('Disclosures', '<p class="muted">Loading…</p>');
  try {
    const g = await api('/v1/guide', {});
    body().innerHTML = g.disclosures.items.map((i) => `<p>${esc(i.text)}</p>`).join('') + `<p class="muted">Version ${esc(g.disclosures.version)}</p>`;
  } catch (e) { showError(body(), e); }
}

// ---------- guide (Samsung onboarding) ----------
async function showGuide() {
  openSheet('Get started', '<p class="muted">Loading your guide…</p>');
  try {
    const g = await api('/v1/guide', { goal: 'pokt', ...(state.solana ? { solana: state.solana } : {}) });
    body().innerHTML = `
      <p class="muted">${esc(g.reading_time_min)} minute read. Your wallet signs every step.</p>
      <ol class="steps">${g.steps.map((s) => `<li id="step-${esc(s.id)}"><h3>${esc(s.title)}</h3><p>${esc(s.body)}</p>
        ${(s.links || []).map((l) => (l.url.endsWith('/mcp')
          ? `<button class="ghost small" type="button" data-copy-url="${esc(l.url)}">Copy connector address</button>`
          : `<a href="${esc(l.url)}" target="_blank" rel="noopener">${esc(l.label)}</a>`)).join(' ')}</li>`).join('')}</ol>
      <div class="stack" id="fund"></div>
      ${disclosuresHtml(g.disclosures)}`;
    body().querySelectorAll('[data-copy-url]').forEach((b) => { b.onclick = () => copy(b.dataset.copyUrl); });
    renderFund($('#fund'));
  } catch (e) { showError(body(), e); }
}

function renderFund(el) {
  if (needSolana(el)) return;
  el.innerHTML = `<h3>Send USDC from Samsung Wallet</h3>
    <form id="fund-form"><label>How much do you want to buy, in dollars?<input name="buy" inputmode="decimal" value="25" required></label>
    <label>What do you want?<select name="target"><option value="pokt">POKT</option><option value="sol">SOL</option><option value="native-pokt">Native POKT to stake</option></select></label>
    <button class="primary" type="submit">Show me what to send</button></form><div id="fund-out"></div>`;
  $('#fund-form').onsubmit = async (ev) => {
    ev.preventDefault();
    const f = new FormData(ev.target);
    const out = $('#fund-out');
    out.innerHTML = '<p class="muted">Working it out…</p>';
    try {
      const p = await api('/v1/samsung/fund-plan', { owner: state.solana, buy_usd: f.get('buy'), target: f.get('target') });
      out.innerHTML = `<div class="result"><p><strong>Send ${esc(p.send_usdc)} USDC</strong> on Solana from Samsung Wallet to:</p>
        <p class="mono">${esc(p.deposit_address)}</p>
        <div class="row"><button class="ghost" type="button" data-copy>Copy address</button></div></div>
        <div class="qr" id="qr" aria-label="QR code of your wallet address"></div>
        <p class="muted">${esc(p.user_note)}</p>
        <button class="primary" type="button" id="check">I've sent it: check</button><div id="check-out"></div>`;
      out.querySelector('[data-copy]').onclick = () => copy(p.deposit_address);
      drawQr($('#qr'), p.qr.plain_address);
      $('#check').onclick = async () => {
        const c = $('#check-out');
        try {
          const d = await api('/v1/deposit/check', { owner: state.solana, expected_usdc: p.send_usdc });
          c.innerHTML = d.arrived
            ? `<p class="ok">Arrived: ${esc(d.usdc)} USDC.</p><button class="primary small" type="button" id="next">${d.needs_gas ? 'Next: get gas' : 'Next: buy'}</button>`
            : `<p class="muted">Not there yet (${esc(d.usdc)} USDC). Transfers usually take under a minute.</p>`;
          const n = $('#next');
          if (n) n.onclick = () => (d.needs_gas ? showGas() : showTile('buy'));
        } catch (e) { showError(c, e); }
      };
    } catch (e) { showError(out, e); }
  };
}

async function drawQr(el, text) {
  try {
    if (!window.qrcode) {
      await new Promise((ok, fail) => {
        const s = document.createElement('script');
        s.src = QR_URL; s.onload = ok; s.onerror = fail;
        document.head.appendChild(s);
      });
    }
    const qr = window.qrcode(0, 'M');
    qr.addData(text);
    qr.make();
    el.innerHTML = qr.createImgTag(6, 8, 'Wallet address QR code');
  } catch { el.remove(); }
}

// ---------- gas starter ----------
async function showGas() {
  openSheet('Get gas', '');
  if (needSolana(body())) return;
  body().innerHTML = '<p class="muted">Checking your wallet…</p>';
  try {
    const g = await api('/v1/gas/starter', { owner: state.solana });
    if (!g.needed) { body().innerHTML = `<p class="ok">${esc(g.message)}</p>`; return; }
    body().innerHTML = `<p>Swap <strong>${esc(g.spend_usdc)} USDC</strong> for about <strong>${esc(g.expected_sol)} SOL</strong>.</p>
      <p class="muted">${esc(g.message)} A new token account needs a refundable deposit of ${esc(g.rent.token_account_sol)} SOL.</p>
      <button class="primary" type="button" id="sign">Approve in wallet</button><div id="gas-out"></div>`;
    $('#sign').onclick = () => signAndSubmit(g, $('#gas-out'));
  } catch (e) { showError(body(), e); }
}

// ---------- tiles ----------
const TOKENS = ['USDC', 'SOL', 'POKT'];
const tokenSelect = (name, sel) => `<select name="${name}">${TOKENS.map((t) => `<option${t === sel ? ' selected' : ''}>${t}</option>`).join('')}</select>`;

function swapForm({ title, input, output, amountLabel, extra = '' }) {
  openSheet(title, `<form id="swap-form">
    <div class="row"><label>From${tokenSelect('input', input)}</label><label>To${tokenSelect('output', output)}</label></div>
    <label>${esc(amountLabel)}<input name="amount" inputmode="decimal" required placeholder="0.00"></label>
    ${extra}
    <button class="primary" type="submit">Get quote</button></form><div id="swap-out" class="stack"></div>`);
  $('#swap-form').onsubmit = async (ev) => {
    ev.preventDefault();
    const f = Object.fromEntries(new FormData(ev.target));
    const out = $('#swap-out');
    out.innerHTML = '<p class="muted">Getting a live quote…</p>';
    try {
      const q = await api('/v1/quote/swap', { input: f.input, output: f.output, amount: f.amount });
      out.innerHTML = quoteTable(q.quote) + warnList(q.warnings) + '<div id="swap-act"></div>';
      const act = $('#swap-act');
      if (needSolana(act)) return;
      act.innerHTML = '<button class="primary" type="button" id="do-swap">Swap in wallet</button>';
      $('#do-swap').onclick = async () => {
        try {
          const payout = f.samsung && f.output === 'USDC';
          const built = payout
            ? await api('/v1/samsung/payout', { owner: state.solana, samsung_address: f.samsung, pokt_amount: f.amount })
            : await api('/v1/tx/swap', { owner: state.solana, input: f.input, output: f.output, amount: f.amount, accept_high_impact: q.quote.high_impact });
          await signAndSubmit(built, act);
        } catch (e) {
          if (e.code === 'below_gasless_minimum') act.innerHTML = `<p class="err">${esc(e.message)}</p><button class="primary small" type="button" id="to-gas">Get gas first</button>`;
          else showError(act, e);
          $('#to-gas')?.addEventListener('click', showGas);
        }
      };
    } catch (e) { showError(out, e); }
  };
}

async function listSheet(title, loader) {
  openSheet(title, '<p class="muted">Loading…</p>');
  try { body().innerHTML = await loader(); } catch (e) { showError(body(), e); }
}

const TILES = {
  buy: () => swapForm({ title: 'Buy POKT', input: 'USDC', output: 'POKT', amountLabel: 'Amount of USDC' }),
  sell: () => swapForm({
    title: 'Sell POKT', input: 'POKT', output: 'USDC', amountLabel: 'Amount of POKT',
    extra: '<label>Send the USDC to your Samsung Wallet (optional)<input name="samsung" placeholder="Samsung Wallet USDC address" autocomplete="off"></label><p class="muted">Send a small test amount the first time.</p>',
  }),
  swap: () => swapForm({ title: 'Swap', input: 'SOL', output: 'POKT', amountLabel: 'Amount' }),

  native: () => {
    openSheet('Move to native POKT', `<p class="muted">Staking needs native POKT on Pocket Network. Every route passes through Ethereum, and bridges cannot be reversed.</p>
      <form id="nat"><label>Where is your POKT now?<select name="from_chain"><option value="solana">Solana</option><option value="base">Base</option><option value="arbitrum">Arbitrum</option><option value="ethereum">Ethereum</option></select></label>
      <label>Your Pocket address (pokt1…)<input name="dest" required value="${esc(state.pokt ?? '')}" autocomplete="off"></label>
      <label>Amount of POKT<input name="amount" inputmode="decimal" required></label>
      <button class="primary" type="submit">Plan the route</button></form><div id="nat-out" class="stack"></div>`);
    $('#nat').onsubmit = async (ev) => {
      ev.preventDefault();
      const out = $('#nat-out');
      try {
        const r = await api('/v1/route/native', Object.fromEntries(new FormData(ev.target)));
        out.innerHTML = `<ol class="steps">${r.steps.map((s) => `<li><h3>${esc(s.action)}</h3><p>Sign with ${esc(s.sign_with.join(' or '))}. Gas: ${esc(s.gas)}.</p><a href="${esc(s.url)}" target="_blank" rel="noopener">Open ${esc(new URL(s.url).host)}</a></li>`).join('')}</ol>${warnList(r.warnings)}
          ${r.destination_on_chain ? '' : '<p class="warn">This Pocket address has not received funds yet. It will be created when the bridge delivers.</p>'}`;
      } catch (e) { showError(out, e); }
    };
  },

  stake: async () => {
    openSheet('Stake POKT', '<p class="muted">Loading live staking options…</p>');
    try {
      const o = await api('/v1/stake/options', { validators_limit: 20 });
      const p = o.params;
      body().innerHTML = `<div class="result"><dl>
          <dt>Validator unbonding</dt><dd>${esc(p.validator_unbonding_time ?? '—')}</dd>
          <dt>Supplier minimum stake</dt><dd>${esc(p.supplier_min_stake?.pokt ?? '—')} POKT</dd>
          <dt>Application minimum stake</dt><dd>${esc(p.application_min_stake?.pokt ?? '—')} POKT</dd></dl></div>
        <form id="del"><label>Validator<select name="validator">${o.validators.map((v) => `<option value="${esc(v.operator_address)}">${esc(v.moniker || short(v.operator_address))} · ${esc(v.commission_pct)}% fee</option>`).join('')}</select></label>
        <label>Amount of POKT to delegate<input name="amount" inputmode="decimal" required></label>
        <button class="primary" type="submit">Delegate with Keplr</button></form><div id="del-out"></div>
        <p class="muted">Other ways to stake: ${o.paths.filter((x) => x.docs).map((x) => `<a href="${esc(x.docs)}" target="_blank" rel="noopener">${esc(x.label)}</a>`).join(' · ')}</p>`;
      $('#del').onsubmit = async (ev) => {
        ev.preventDefault();
        const out = $('#del-out');
        try {
          if (!state.pokt) await onConnectKeplr();
          if (!state.pokt) return;
          const f = Object.fromEntries(new FormData(ev.target));
          const built = await api('/v1/tx/delegate', { delegator: state.pokt, validator: f.validator, amount: f.amount });
          out.innerHTML = '<p class="muted">Approve in Keplr…</p>';
          const hash = await signAndBroadcastPocket(built);
          out.innerHTML = `<p class="ok">Delegated.</p><a href="${esc(built.explorer_tx + hash.toUpperCase())}" target="_blank" rel="noopener">View transaction</a>`;
        } catch (e) { showError(out, e); }
      };
    } catch (e) { showError(body(), e); }
  },

  services: () => listSheet('Services on Pocket', async () => {
    const s = await api('/v1/services', {});
    return `<p class="muted">${esc(s.count)} services, read live from Pocket Network.</p><ul class="list">${s.services.map((x) => `<li>
      <img src="icons/services/${esc(x.id)}.png" alt="" onerror="this.style.visibility='hidden'">
      <div class="grow"><div class="name">${esc(x.name)}</div><div class="muted mono">${esc(x.id)}</div></div></li>`).join('')}</ul>`;
  }),

  marketplace: () => {
    openSheet('Agent Marketplace', `<p class="muted">AI-ready services on Pocket Network. Agents pay $0.005 per call in USDC; no account or API key.</p>
      <form id="mk"><label>Search<input name="query" placeholder="e.g. ethereum, search, sec filings"></label><button class="primary" type="submit">Search</button></form><div id="mk-out"></div>`);
    const run = async (query = '') => {
      const out = $('#mk-out');
      try {
        const m = await api('/v1/marketplace', { query });
        out.innerHTML = `<p class="muted">${esc(m.count)} services</p><ul class="list">${m.services.map((x) => `<li><div class="grow"><div class="name">${esc(x.name)}</div><div class="muted">${esc(x.category ?? '')} · $${esc(Number(x.price_usd).toFixed(3))}/call</div></div>${x.page ? `<a href="${esc(x.page)}" target="_blank" rel="noopener">Open</a>` : ''}</li>`).join('')}</ul>`;
      } catch (e) { showError(out, e); }
    };
    $('#mk').onsubmit = (ev) => { ev.preventDefault(); run(new FormData(ev.target).get('query')); };
    run();
  },

  ai_connect: () => listSheet('AI Connect', async () => {
    const a = await api('/v1/ai/connect', { client: 'claude' });
    return `<p>Give your AI assistant Pocket's tools through MCP.</p>
      <div class="result"><dl><dt>Hosted MCP</dt><dd class="mono">${esc(a.hosted_mcp.url)}</dd><dt>npm</dt><dd class="mono">${esc(a.npm_mcp.package)}</dd></dl></div>
      <p class="muted">Claude Desktop config (${esc(a.config.file)}):</p><pre>${esc(JSON.stringify(a.config.json, null, 2))}</pre>
      <p><a href="${esc(a.openapi)}" target="_blank" rel="noopener">OpenAPI</a> · <a href="${esc(a.llms_txt)}" target="_blank" rel="noopener">llms.txt</a> · <a href="${esc(a.integration_guide)}" target="_blank" rel="noopener">Integration guide</a></p>`;
  }),

  ai_packs: () => listSheet('AI Tool Packs', async () => {
    const p = await api('/v1/ai/packs', {});
    return `<p class="muted">${esc(p.note)}</p><ul class="list">${p.packs.map((x) => `<li><div class="grow"><div class="name">${esc(x.name)}</div><div class="muted">${esc(x.contents.join(', '))}</div></div><span class="muted">Planned</span></li>`).join('')}</ul>`;
  }),
};

function showTile(id) { TILES[id]?.(); }

// ---------- wire up ----------
$('#connect-sol').onclick = onConnectSol;
$('#connect-keplr').onclick = onConnectKeplr;
$('#start').onclick = showGuide;
$('#gas-btn').onclick = showGas;
$('#disclosures').onclick = showDisclosures;
$('#sheet-close').onclick = closeSheet;
$('#sheet').addEventListener('click', (e) => { if (e.target.id === 'sheet') closeSheet(); });
document.addEventListener('keydown', (e) => { if (e.key === 'Escape' && !$('#sheet').hidden) closeSheet(); });
document.querySelectorAll('[data-tile]').forEach((b) => { b.onclick = () => showTile(b.dataset.tile); });

if ('serviceWorker' in navigator && location.protocol === 'https:') navigator.serviceWorker.register('sw.js').catch(() => {});

// Deep link: ?tile=buy or #start opens a screen directly (used by the cue card QR codes).
const params = new URLSearchParams(location.search);
if (params.get('tile')) showTile(params.get('tile'));
else if (location.hash === '#start') showGuide();
