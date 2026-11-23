import { Buffer } from 'buffer';
if (!globalThis.Buffer) globalThis.Buffer = Buffer;
export { default as SignClient } from '@walletconnect/sign-client';
export { KeplrWalletConnectV2 } from '@keplr-wallet/wc-client';
