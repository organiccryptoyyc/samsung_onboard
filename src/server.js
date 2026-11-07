// POKT onboarding API: a Pocket Network REST service.
// Relay rules followed here (pocket-service-builder design rules):
//  - every body is a JSON object, errors included; never HTML or empty 200s
//  - all inputs come from the JSON request body; headers and query are ignored
//  - no caller auth, no compression; 4xx + JSON for bad input; no 5xx for upstream trouble
import http from 'node:http';
import { pathToFileURL } from 'node:url';
import { config } from './config.js';
import { ApiError } from './errors.js';
import * as h from './handlers.js';

export const ROUTES = {
  'POST /v1/guide': h.guide,
  'POST /v1/menu': h.menu,
  'POST /v1/services': h.services,
  'POST /v1/marketplace': h.marketplace,
  'POST /v1/ai/connect': h.aiConnect,
  'POST /v1/ai/packs': h.aiPacks,
  'POST /v1/account': h.account,
  'POST /v1/quote/buy': h.quoteBuy,
  'POST /v1/quote/sell': h.quoteSell,
  'POST /v1/quote/swap': h.quoteSwap,
  'POST /v1/tx/swap': h.txSwap,
  'POST /v1/tx/execute': h.txExecute,
  'POST /v1/gas/starter': h.gasStarter,
  'POST /v1/samsung/fund-plan': h.samsungFundPlan,
  'POST /v1/samsung/payout': h.samsungPayout,
  'POST /v1/deposit/check': h.depositCheck,
  'POST /v1/route/native': h.routeNative,
  'POST /v1/route/status': h.routeStatus,
  'POST /v1/stake/options': h.stakeOptions,
  'POST /v1/tx/delegate': h.txDelegate,
  'POST /v1/tx/send': h.txSend,
  'GET /v1/version': async () => ({ service: config.serviceId, version: config.version }),
  'GET /v1/health': async () => ({ status: 'ok' }),
};

// CORS lets the web app call the API directly over HTTPS. Pocket relays ignore
// response headers, so this only matters for browser clients.
function cors(req) {
  const origin = req.headers.origin;
  if (!origin) return {};
  const allowed = config.corsOrigins.includes('*') || config.corsOrigins.includes(origin);
  return allowed
    ? { 'access-control-allow-origin': config.corsOrigins.includes('*') ? '*' : origin, 'access-control-allow-methods': 'GET, POST, OPTIONS', 'access-control-allow-headers': 'content-type', 'access-control-max-age': '86400', vary: 'origin' }
    : {};
}

function send(res, status, obj) {
  const body = JSON.stringify(obj);
  res.writeHead(status, { 'content-type': 'application/json', 'content-length': Buffer.byteLength(body), ...(res.corsHeaders || {}) });
  res.end(body);
}

function readBody(req) {
  return new Promise((resolve, reject) => {
    const chunks = [];
    let size = 0;
    req.on('data', (c) => {
      size += c.length;
      if (size > config.maxBodyBytes) {
        reject(new ApiError(413, 'body_too_large', `Request body over ${config.maxBodyBytes} bytes`));
        req.destroy();
      } else chunks.push(c);
    });
    req.on('end', () => resolve(Buffer.concat(chunks).toString('utf8')));
    req.on('error', reject);
  });
}

export async function handle(req, res) {
  const path = new URL(req.url, 'http://x').pathname.replace(/\/+$/, '') || '/';
  res.corsHeaders = cors(req);
  if (req.method === 'OPTIONS') {
    res.writeHead(204, res.corsHeaders);
    return res.end();
  }
  const fn = ROUTES[`${req.method} ${path}`];
  try {
    if (!fn) {
      const exists = Object.keys(ROUTES).some((k) => k.endsWith(` ${path}`));
      throw exists
        ? new ApiError(405, 'method_not_allowed', `Use ${Object.keys(ROUTES).find((k) => k.endsWith(` ${path}`)).split(' ')[0]} for ${path}`)
        : new ApiError(404, 'not_found', `No endpoint ${path}`, { endpoints: Object.keys(ROUTES) });
    }
    let body = {};
    if (req.method === 'POST') {
      const raw = await readBody(req);
      if (raw.trim()) {
        try {
          body = JSON.parse(raw);
        } catch {
          throw new ApiError(400, 'invalid_json', 'Request body must be a JSON object');
        }
        if (typeof body !== 'object' || body === null || Array.isArray(body)) throw new ApiError(400, 'invalid_json', 'Request body must be a JSON object');
      }
    }
    send(res, 200, await fn(body));
  } catch (e) {
    if (e instanceof ApiError) return send(res, e.status, { error: { code: e.code, message: e.message, ...(e.details ? { details: e.details } : {}) } });
    console.error(e);
    // A bug on our side. 500 is correct here: it is unpaid, and gateways should route around us.
    send(res, 500, { error: { code: 'internal', message: 'Unexpected error' } });
  }
}

export function createServer() {
  return http.createServer(handle);
}

if (import.meta.url === pathToFileURL(process.argv[1] ?? '').href) {
  createServer().listen(config.port, config.host, () => console.log(`${config.serviceId} ${config.version} listening on ${config.host}:${config.port}`));
}
