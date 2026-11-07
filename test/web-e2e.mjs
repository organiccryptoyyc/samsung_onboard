// Browser check of the web app against the API and mocked upstreams.
// Needs Playwright (not a dependency): `node test/web-e2e.mjs [screenshot-dir]`.
// Wallet signing libraries are stubbed: this checks the app's flow, not real signing.
import http from 'node:http';
import { readFile } from 'node:fs/promises';
import { extname, join } from 'node:path';
import { createRequire } from 'node:module';
import assert from 'node:assert/strict';
import * as m from './mock-upstream.js';

const require = createRequire(import.meta.url);
const { chromium } = require('playwright');
const shots = process.argv[2];

const mock = await m.startMock();
const up = `http://127.0.0.1:${mock.address().port}`;
Object.assign(process.env, { SOLANA_RPC_URL: `${up}/rpc`, JUPITER_BASE_URL: `${up}/jup`, POCKET_LCD_URL: `${up}/lcd`, PORTAL_BASE_URL: `${up}/portal` });
const { createServer } = await import('../src/server.js');
const api = createServer();
await new Promise((r) => api.listen(0, r));
const apiBase = `http://127.0.0.1:${api.address().port}`;

const webRoot = new URL('../web/', import.meta.url).pathname;
const TYPES = { '.html': 'text/html', '.js': 'text/javascript', '.css': 'text/css', '.svg': 'image/svg+xml', '.png': 'image/png', '.webmanifest': 'application/manifest+json' };
const web = http.createServer(async (req, res) => {
  const p = new URL(req.url, 'http://x').pathname;
  try {
    let data = await readFile(join(webRoot, p === '/' ? 'index.html' : p));
    if (p === '/config.js') data = Buffer.from(data.toString().replace("'http://localhost:8080'", `'${apiBase}'`));
    res.writeHead(200, { 'content-type': TYPES[extname(p)] || (p === '/' ? 'text/html' : 'application/octet-stream') });
    res.end(data);
  } catch { res.writeHead(404); res.end(); }
});
await new Promise((r) => web.listen(0, r));
const site = `http://127.0.0.1:${web.address().port}/`;

const browser = await chromium.launch();
const errors = [];
async function page(viewport, colorScheme = 'light') {
  const ctx = await browser.newContext({ viewport, colorScheme, deviceScaleFactor: 1 });
  const pg = await ctx.newPage();
  pg.on('pageerror', (e) => errors.push(e.message));
  // Stub CDN libraries (no network here) and a Phantom wallet for OWNER_NO_SOL.
  await pg.route('https://cdn.jsdelivr.net/npm/@solana/web3.js@1.95.3/+esm', (r) => r.fulfill({ contentType: 'text/javascript', body: 'export const VersionedTransaction = { deserialize: (b) => ({ serialize: () => b }) };' }));
  await pg.route('https://cdn.jsdelivr.net/npm/qrcode-generator@1.4.4/qrcode.min.js', (r) => r.fulfill({ contentType: 'text/javascript', body: "window.qrcode = () => ({ addData(){}, make(){}, createImgTag(){ return '<img alt=\"qr\" src=\"data:image/gif;base64,R0lGODlhAQABAAAAACw=\">'; } });" }));
  await pg.addInitScript((owner) => {
    window.phantom = { solana: { isPhantom: true, publicKey: { toString: () => owner }, connect: async () => ({ publicKey: { toString: () => owner } }), signTransaction: async (tx) => tx } };
  }, m.OWNER_NO_SOL);
  await pg.goto(site);
  return pg;
}

try {
  // Phone, light theme: Samsung onboarding flow end to end.
  const pg = await page({ width: 390, height: 844 });
  if (shots) await pg.screenshot({ path: `${shots}/home-phone.png`, fullPage: true });
  // Layout: marketplace tile is twice the width of the others.
  const [wide, one] = await Promise.all([pg.locator('[data-tile=marketplace]').boundingBox(), pg.locator('[data-tile=buy]').boundingBox()]);
  assert.ok(wide.width > one.width * 2 - 1 && wide.width < one.width * 2 + 20, 'marketplace spans two tiles');
  assert.ok(Math.abs(wide.height - one.height * 2) < 20, 'marketplace is two tiles tall');
  const scrollW = await pg.evaluate(() => document.documentElement.scrollWidth);
  assert.ok(scrollW <= 390, 'no horizontal scroll on a phone');

  await pg.click('#connect-sol');
  await pg.waitForSelector('#gas-notice:not([hidden])');
  await pg.click('#start');
  await pg.waitForSelector('#step-gas');
  await pg.waitForSelector('#step-connect-ai [data-copy-url]');
  await pg.waitForSelector('details.legal');
  await pg.fill('#fund-form [name=buy]', '40');
  await pg.click('#fund-form button');
  await pg.waitForSelector('text=Send 50.00 USDC');
  if (shots) await pg.screenshot({ path: `${shots}/fund-plan-phone.png`, fullPage: false });
  await pg.click('#check');
  await pg.waitForSelector('text=Arrived: 50 USDC.');
  await pg.click('#next');
  await pg.waitForSelector('text=Approve in wallet');
  await pg.click('#sign');
  await pg.waitForSelector('#gas-out .ok');
  if (shots) await pg.screenshot({ path: `${shots}/gas-done-phone.png` });

  // Buy: quote, then swap signs and executes.
  await pg.click('#sheet-close');
  await pg.click('[data-tile=buy]');
  await pg.fill('#swap-form [name=amount]', '20');
  await pg.click('#swap-form button');
  await pg.waitForSelector('text=800 POKT');
  await pg.click('#do-swap');
  await pg.waitForSelector('#swap-act .ok');

  // Native route and stake options render.
  await pg.click('#sheet-close');
  await pg.click('[data-tile=native]');
  await pg.fill('#nat [name=dest]', m.POKT_FUNDED);
  await pg.fill('#nat [name=amount]', '100');
  await pg.click('#nat button');
  await pg.waitForSelector('text=Bridge wPOKT on Ethereum to native POKT on Pocket');
  await pg.click('#sheet-close');
  await pg.click('[data-tile=stake]');
  await pg.waitForSelector('text=59500 POKT');
  await pg.click('#sheet-close');
  await pg.click('[data-tile=services]');
  await pg.waitForSelector('text=Ethereum');
  await pg.click('#sheet-close');
  await pg.click('[data-tile=marketplace]');
  await pg.waitForSelector('text=Clinical Trials Search');

  await pg.click('#sheet-close');
  await pg.click('#disclosures');
  await pg.waitForSelector('text=non-custodial', { state: 'attached' });
  await pg.click('#sheet-close');

  // Desktop, dark theme screenshot.
  const dk = await page({ width: 1280, height: 900 }, 'dark');
  if (shots) await dk.screenshot({ path: `${shots}/home-desktop-dark.png` });

  assert.deepEqual(errors, []);
  console.log('web e2e: all checks passed');
} finally {
  await browser.close();
  api.close(); web.close(); mock.close();
}
