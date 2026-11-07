// Static content: menu layout, AI integration links, tool packs, bridge routes.
// Links here were checked on 7 Nov 2026; anything numeric comes from live calls instead.
import { config } from './config.js';

export const TILES = [
  { id: 'marketplace', label: 'Agent Marketplace', size: 2, endpoint: '/v1/marketplace' },
  { id: 'buy', label: 'Buy', size: 1, endpoint: '/v1/quote/buy' },
  { id: 'sell', label: 'Sell', size: 1, endpoint: '/v1/quote/sell' },
  { id: 'swap', label: 'Swap', size: 1, endpoint: '/v1/quote/swap' },
  { id: 'native', label: 'Native', size: 1, endpoint: '/v1/route/native' },
  { id: 'stake', label: 'Stake', size: 1, endpoint: '/v1/stake/options' },
  { id: 'services', label: 'Services', size: 1, endpoint: '/v1/services' },
  { id: 'ai_packs', label: 'AI Tool Packs', size: 1, endpoint: '/v1/ai/packs' },
  { id: 'ai_connect', label: 'AI Connect', size: 1, endpoint: '/v1/ai/connect' },
];

// Which tiles a wallet can complete end to end, and which are guided only.
export const WALLETS = {
  phantom: { family: 'solana', signs: ['buy', 'sell', 'swap'], guided: ['native'] },
  solflare: { family: 'solana', signs: ['buy', 'sell', 'swap'], guided: ['native'] },
  keplr: { family: 'cosmos', signs: ['stake'], guided: ['native'] },
  leap: { family: 'cosmos', signs: ['stake'], guided: ['native'] },
  soothe: { family: 'evm+pocket', signs: [], guided: ['native', 'stake'] },
  metamask: { family: 'evm', signs: [], guided: ['native'] },
  samsung: { family: 'funding', signs: [], guided: ['buy', 'sell'] },
  none: { family: 'none', signs: [], guided: [] },
};

export const ICONS = new Set(('akash arb-one arb-sepolia-testnet atomone avax base-sepolia-testnet base bera blast boba bsc celo cheqd chihuahua eth-sepolia-testnet eth fantom fetch fraxtal fuse giwa-sepolia-testnet gnosis harmony hyperliquid ink iotex juno kaia kava linea metis moonbeam moonriver near oasys op-sepolia-testnet op opbnb osmosis persistence pocket poly-amoy-testnet poly-zkevm poly scroll seda sei shentu solana sonic sui taiko tron unichain xrplevm-testnet xrplevm zklink-nova zksync-era').split(' '));

export const iconUrl = (id) => (config.iconBaseUrl && ICONS.has(id) ? `${config.iconBaseUrl.replace(/\/$/, '')}/${id}.png` : null);

export const AI_CONNECT = {
  hosted_mcp: { url: 'https://agent.pocket.network/mcp', transport: 'streamable-http' },
  npm_mcp: { package: '@pocket-network/agentic-portal-mcp', run: 'npx -y @pocket-network/agentic-portal-mcp', env: ['POCKET_PRIVATE_KEY', 'POCKET_MAX_TOTAL_ATOMIC'] },
  mcp_registry_name: 'network.pocket/agentic-portal-mcp',
  openapi: 'https://agent.pocket.network/openapi.json',
  llms_txt: 'https://agent.pocket.network/llms.txt',
  integration_guide: 'https://agent.pocket.network/agent-integration',
  source: 'https://github.com/pokt-network/agentic-portal-mcp',
};

export function aiConfigSnippet(client) {
  const server = { command: 'npx', args: ['-y', '@pocket-network/agentic-portal-mcp'], env: { POCKET_MAX_TOTAL_ATOMIC: '1000000' } };
  if (client === 'claude') return { file: 'claude_desktop_config.json', json: { mcpServers: { 'pocket-agentic-portal': server } } };
  if (client === 'cursor') return { file: '.cursor/mcp.json', json: { mcpServers: { 'pocket-agentic-portal': server } } };
  return { file: null, json: { url: AI_CONNECT.hosted_mcp.url } };
}

export const AI_PACKS = [
  { id: 'agent-pack', name: 'Agent Pack', status: 'planned', contents: ['Portal MCP client', 'service search', 'spend cap'] },
  { id: 'chain-rpc-pack', name: 'Chain RPC Pack', status: 'planned', contents: ['Pocket RPC endpoints for every served chain'] },
  { id: 'agent-spend-wallet', name: 'Agent Spend Wallet', status: 'planned', contents: ['USDC on Base for x402', 'hard caps'] },
  { id: 'builder-pack', name: 'Builder Pack', status: 'planned', contents: ['service-builder templates', 'card validator'] },
];

const BRIDGE_WORMHOLE = 'https://bridge.pocket.network';
const BRIDGE_WPOKT = 'https://wpokt.network';

// Every non-Ethereum chain reaches native POKT through Ethereum (docs.pocket.network/token/bridge/).
export function nativeRoute(fromChain) {
  const toEth = {
    id: 'to-ethereum',
    action: `Bridge POKT from ${fromChain} to wPOKT on Ethereum`,
    url: BRIDGE_WORMHOLE,
    from_chain: fromChain,
    to_chain: 'ethereum',
    sign_with: fromChain === 'solana' ? ['phantom', 'solflare'] : ['metamask', 'soothe'],
    gas: fromChain === 'solana' ? 'SOL on Solana to send; ETH on Ethereum to claim' : `ETH on ${fromChain} to send; ETH on Ethereum to claim`,
    reversible: false,
  };
  const toNative = {
    id: 'to-native',
    action: 'Bridge wPOKT on Ethereum to native POKT on Pocket',
    url: BRIDGE_WPOKT,
    from_chain: 'ethereum',
    to_chain: 'pocket',
    sign_with: ['metamask', 'soothe'],
    gas: 'ETH on Ethereum',
    reversible: false,
  };
  return fromChain === 'ethereum' ? [toNative] : [toEth, toNative];
}

export const LINKS = {
  keplr_staking: 'https://wallet.keplr.app/chains/pocket-network?modal=staking&chain=pocket&step_id=2',
  staking_docs: 'https://docs.pocket.network/token/',
  soothe: 'https://soothe.pocket.network/',
  faucet: 'https://faucet.pocket.network',
  explorer: 'https://explorer.pocket.network',
};
