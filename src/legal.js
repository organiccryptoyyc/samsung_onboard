// Standard disclosures returned with the guide and shown in the app and on cards.
// DRAFT: have a lawyer licensed where you sell review these before launch.
// Bracketed values are placeholders for the operator's details.
export const OPERATOR = '[OPERATOR LEGAL NAME]';

export const DISCLOSURES = {
  version: '2026-11-07-draft',
  short: 'Independent, non-custodial software. Not affiliated with Samsung, Anthropic, OpenAI, Solana Foundation or Pocket Network Foundation. Not financial advice. Crypto assets are volatile and can lose value.',
  items: [
    { id: 'independent', text: `POKT Onboard is independent software operated by ${OPERATOR}. It is not affiliated with, endorsed by or sponsored by Samsung Electronics Co., Ltd., Anthropic PBC, OpenAI, the Solana Foundation, the Pocket Network Foundation, Phantom, Solflare, Keplr or Jupiter. Samsung Wallet and other names are trademarks of their owners and are used only to describe compatibility.` },
    { id: 'non-custodial', text: 'POKT Onboard is non-custodial. It never holds your funds, private keys or recovery phrase, and it cannot move assets without your approval in your own wallet. You are responsible for the security of your wallet and recovery phrase.' },
    { id: 'no-advice', text: 'Information provided is general and educational. It is not financial, investment, tax or legal advice, and nothing here is an offer or recommendation to buy or sell any asset.' },
    { id: 'risk', text: 'Crypto assets, including USDC, SOL and POKT, involve risk. Prices can fall sharply, liquidity can be thin, and transactions and bridge transfers usually cannot be reversed. Only use money you can afford to lose.' },
    { id: 'fees', text: 'The getting-started guide costs $0.005 (half a cent) per request when bought through an AI assistant, at the current price, which may change. Network, swap, bridge and third-party fees are separate, vary, and are shown before you approve.' },
    { id: 'samsung', text: 'Samsung Wallet USDC features are provided by Samsung and its partners under their own terms, and are available only to eligible users (as of November 2026: U.S. residents 18+, excluding New York, on compatible Galaxy devices). POKT Onboard does not control them.' },
    { id: 'availability', text: 'Not available where prohibited. You are responsible for complying with the laws that apply to you, including tax reporting.' },
    { id: 'third-party', text: 'Swaps, bridges, wallets and AI assistants are third-party services with their own terms and risks. POKT Onboard links to them but does not operate them.' },
  ],
};
