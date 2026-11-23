// Deployment settings for the web app.
// On a real host the API sits behind the same web server at ./api/
// (see deploy/), so no address needs editing. Local development uses port 8080.
const local = ['localhost', '127.0.0.1'].includes(location.hostname);
window.POKT_ONBOARD = {
  apiBase: local ? 'http://localhost:8080' : new URL('api', location.href.split('#')[0].replace(/[^/]*$/, '')).href.replace(/\/$/, ''),
  // Pocket RPC used by Keplr to broadcast native POKT transactions
  // (Keplr's chain registry lists https://rpc-pocket.keplr.app).
  pocketRpc: 'https://rpc-pocket.keplr.app',
  pocketChainId: 'pocket',
  // Free project ID from https://cloud.reown.com (WalletConnect). Lets phones
  // connect the Keplr Mobile app. Public value; leave empty to turn it off.
  walletConnectProjectId: '4449c4c1c614db7ac50b1fc918e23956',
};
