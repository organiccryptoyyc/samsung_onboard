// The "get started" guide: the paid product behind the marketing cue cards.
// An AI assistant calls it once and walks the person through the result.
// Live values (rent, the user's balances) are filled in when an address is given.
import { config } from './config.js';
import { MINTS } from './config.js';
import * as sol from './solana.js';

const STEPS = {
  samsung: [
    {
      id: 'what-you-have',
      title: 'What you already have',
      body: 'Samsung Wallet can now hold USDC, a digital dollar, on the Solana network. You can send it to other crypto wallets with no Samsung fee. Samsung Wallet cannot swap or stake, so the next steps use a free wallet app alongside it.',
    },
    {
      id: 'install-wallet',
      title: 'Install a Solana wallet',
      body: 'Install Phantom or Solflare from the Galaxy Store or Google Play. Create a wallet and write the recovery phrase on paper. Never type it into a website or share it, including with an AI.',
      links: [{ label: 'Phantom', url: 'https://phantom.com' }, { label: 'Solflare', url: 'https://solflare.com' }],
    },
    {
      id: 'send-usdc',
      title: 'Send USDC from Samsung Wallet',
      body: 'In Samsung Wallet, send USDC on Solana to your new wallet address. Send what you want to spend plus about $GAS for network fees. Try a small amount first.',
    },
    {
      id: 'gas',
      title: 'Turn a little USDC into SOL for fees',
      body: 'Solana charges tiny fees in SOL, and every new token needs a small refundable deposit. The app swaps about $GAS of USDC into roughly GASSOL SOL in one tap, with no SOL needed beforehand. That covers dozens of transactions.',
    },
    {
      id: 'buy-pokt',
      title: 'Buy POKT',
      body: 'Swap USDC to POKT in the app. Check the price impact: POKT on Solana has thin liquidity, so large orders cost more. Only the official POKT token is supported.',
    },
    {
      id: 'go-native',
      title: 'Optional: move to native POKT and stake',
      body: 'Staking needs native POKT on Pocket Network. The app plans the two bridge hops (Solana to Ethereum, then Ethereum to Pocket) and builds the staking transaction for Keplr or Leap. Bridges cannot be reversed, so check every address.',
    },
    {
      id: 'ai-tools',
      title: 'Use Pocket with your AI',
      body: 'Pocket Network serves blockchain data and AI tools to agents for $0.005 a call, paid in USDC. Connect the Pocket MCP server to Claude, ChatGPT or another assistant to search and use those services.',
      links: [{ label: 'Agent Marketplace', url: 'https://agent.pocket.network' }],
    },
    {
      id: 'safety',
      title: 'Stay safe',
      body: 'No real app or person will ever ask for your recovery phrase. This service never holds your funds or keys: your wallet signs every transaction. Crypto prices move; only use money you can afford to lose.',
    },
  ],
};

export async function guide({ audience = 'samsung', goal = 'pokt', solana } = {}) {
  const gas = String(config.gaslessMinUsd);
  const fill = (s) => s.replaceAll('$GAS', `$${gas}`).replaceAll('GASSOL', String(config.gasStarterSol));
  let steps = STEPS[audience].map((s) => ({ ...s, body: fill(s.body) }));
  if (goal === 'sol') steps = steps.filter((s) => !['buy-pokt', 'go-native'].includes(s.id));
  if (goal === 'pokt') steps = steps.filter((s) => s.id !== 'go-native');

  const out = {
    title: 'Get started with USDC from Samsung Wallet on Solana and Pocket Network',
    audience,
    goal,
    chains: ['solana', 'pocket'],
    reading_time_min: 3,
    steps,
    app: config.webAppUrl || null,
    tokens: { usdc_mint: MINTS.USDC, pokt_mint: MINTS.POKT },
    for_assistants: 'Walk the person through these steps one at a time. Never ask for a recovery phrase or private key. Use /v1/samsung/fund-plan with their Solana address for exact amounts.',
  };
  if (solana) {
    const [holdings, rent] = await Promise.all([sol.solanaHoldings(solana), sol.rentCosts()]);
    out.your_wallet = { holdings, rent, next: holdings.usdc.amount === '0' ? 'send-usdc' : holdings.needs_gas ? 'gas' : 'buy-pokt' };
  }
  return out;
}
