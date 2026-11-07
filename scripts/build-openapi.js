// Writes openapi.json from the endpoint table below. Run: node scripts/build-openapi.js
import { writeFileSync } from 'node:fs';

const S = (type, description, extra = {}) => ({ type, description, ...extra });
const solAddr = S('string', 'Solana address (base58)');
const poktAddr = S('string', 'Pocket address (pokt1...)');
const amount = S('string', 'Decimal amount as a string, e.g. "25.5"');
const token = S('string', 'USDC, SOL, POKT or a Solana mint address');

const E = [
  ['/v1/guide', 'Get-started guide for Samsung Wallet USDC users: Solana and Pocket, step by step', { audience: S('string', 'Who the guide is for', { enum: ['samsung'] }), goal: S('string', 'What the person wants', { enum: ['pokt', 'sol', 'stake'] }), solana: solAddr }, []],
  ['/v1/menu', 'Menu layout for a wallet', { wallet: S('string', 'Wallet in use', { enum: ['phantom', 'solflare', 'keplr', 'leap', 'soothe', 'metamask', 'samsung', 'none'] }) }, []],
  ['/v1/marketplace', 'Agentic Portal services (the Agent Marketplace bar)', { query: S('string', 'Text filter'), category: S('string', 'Category filter') }, []],
  ['/v1/services', 'Every Pocket service, live from chain, with PNG icon URLs', { filter: S('string', 'Text filter') }, []],
  ['/v1/ai/connect', 'MCP, OpenAPI and llms.txt links plus a client config snippet', { client: S('string', 'AI client', { enum: ['claude', 'cursor', 'other'] }) }, []],
  ['/v1/ai/packs', 'AI tool pack manifest (planned)', {}, []],
  ['/v1/account', 'Balances: SOL, USDC and POKT on Solana; native POKT and account status on Pocket', { solana: solAddr, pokt: poktAddr }, []],
  ['/v1/quote/buy', 'Quote USDC (or another token) to POKT on Solana', { pay_token: token, amount }, ['amount']],
  ['/v1/quote/sell', 'Quote POKT to USDC (or another token) on Solana', { receive_token: token, amount }, ['amount']],
  ['/v1/quote/swap', 'Quote any token to or from POKT', { input: token, output: token, amount }, ['input', 'output', 'amount']],
  ['/v1/tx/swap', 'Unsigned Solana swap transaction for the owner to sign', { owner: solAddr, input: token, output: token, amount, receiver: solAddr, accept_high_impact: S('boolean', 'Allow price impact above the limit') }, ['owner', 'input', 'output', 'amount']],
  ['/v1/tx/execute', 'Submit a wallet-signed swap transaction', { signed_transaction: S('string', 'Base64 signed transaction'), request_id: S('string', 'request_id from the swap') }, ['signed_transaction', 'request_id']],
  ['/v1/gas/starter', 'Buy a little SOL with USDC (gasless) so a USDC-only wallet can pay fees', { owner: solAddr, target_sol: amount }, ['owner']],
  ['/v1/samsung/fund-plan', 'How much USDC to send from Samsung Wallet, with QR and steps', { owner: solAddr, buy_usd: amount, target: S('string', 'What to end up with', { enum: ['pokt', 'sol', 'native-pokt'] }) }, ['owner', 'buy_usd']],
  ['/v1/deposit/check', 'Has the USDC from Samsung Wallet arrived?', { owner: solAddr, expected_usdc: amount }, ['owner']],
  ['/v1/samsung/payout', 'Sell POKT and deliver USDC to a Samsung Wallet address (unsigned)', { owner: solAddr, samsung_address: solAddr, pokt_amount: amount }, ['owner', 'samsung_address', 'pokt_amount']],
  ['/v1/route/native', 'Step-by-step bridge route to native POKT', { from_chain: S('string', 'Where the POKT is now', { enum: ['solana', 'base', 'arbitrum', 'ethereum'] }), dest: poktAddr, amount }, ['from_chain', 'dest', 'amount']],
  ['/v1/route/status', 'Status of a Solana transaction', { signature: S('string', 'Transaction signature') }, ['signature']],
  ['/v1/stake/options', 'Live staking minimums, validators and staking paths', { validators_limit: S('integer', 'Max validators returned (default 25, max 100)') }, []],
  ['/v1/tx/delegate', 'Unsigned MsgDelegate for Keplr or Leap', { delegator: poktAddr, validator: S('string', 'poktvaloper1... address'), amount, memo: S('string', 'Optional memo') }, ['delegator', 'validator', 'amount']],
  ['/v1/tx/send', 'Unsigned MsgSend of native POKT for Keplr or Leap', { from: poktAddr, to: poktAddr, amount, memo: S('string', 'Optional memo') }, ['from', 'to', 'amount']],
];

const errorRef = { $ref: '#/components/schemas/Error' };
const responses = {
  200: { description: 'Result', content: { 'application/json': { schema: { type: 'object' } } } },
  400: { description: 'Invalid input', content: { 'application/json': { schema: errorRef } } },
  422: { description: 'Valid input that cannot be done (e.g. below gasless minimum, high price impact)', content: { 'application/json': { schema: errorRef } } },
  424: { description: 'An upstream (Jupiter, Solana RPC, Pocket chain, Agentic Portal) failed', content: { 'application/json': { schema: errorRef } } },
};

const paths = {
  '/v1/version': { get: { summary: 'Service identity probe', responses: { 200: responses[200] } } },
  '/v1/health': { get: { summary: 'Readiness probe', responses: { 200: responses[200] } } },
};
for (const [path, summary, props, required] of E) {
  paths[path] = {
    post: {
      summary,
      operationId: path.slice(4).replace(/[/-](\w)/g, (_, c) => c.toUpperCase()),
      requestBody: { required: required.length > 0, content: { 'application/json': { schema: { type: 'object', properties: props, ...(required.length ? { required } : {}) } } } },
      responses,
    },
  };
}

const doc = {
  openapi: '3.0.3',
  info: {
    title: 'POKT Onboarding API',
    version: '0.1.0',
    description: 'Quotes, bridge routes and unsigned transactions for buying, moving and staking POKT, including funding from Samsung Wallet USDC. Non-custodial: the user\'s wallet signs everything. Every response is JSON.',
  },
  servers: [{ url: 'https://YOUR-SUPPLIER-HOST' }],
  paths,
  components: {
    schemas: {
      Error: { type: 'object', properties: { error: { type: 'object', properties: { code: { type: 'string' }, message: { type: 'string' }, details: { type: 'object' } }, required: ['code', 'message'] } } },
    },
  },
};
writeFileSync(new URL('../openapi.json', import.meta.url), JSON.stringify(doc, null, 2) + '\n');
console.log(`openapi.json: ${Object.keys(paths).length} paths`);
