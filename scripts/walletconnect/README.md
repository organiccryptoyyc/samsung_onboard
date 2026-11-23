# Keplr Mobile (WalletConnect) bundle

`web/vendor/keplr-wc.js` is a self-hosted browser bundle of WalletConnect's
sign client and Keplr's WalletConnect adapter. The app loads it only when
someone taps "Connect Keplr" on a phone with no Keplr extension.

Rebuild (pinned versions):

```sh
mkdir /tmp/wc && cd /tmp/wc && npm init -y
npm i @walletconnect/sign-client@2.26.0 @keplr-wallet/wc-client@0.13.41 events@3.3.0 buffer@6.0.3 esbuild@0.24.0
cp <repo>/scripts/walletconnect/entry.js .
npx esbuild entry.js --bundle --format=esm --platform=browser --minify --target=es2020 \
  --define:global=globalThis --define:process.env.NODE_ENV='"production"' --outfile=keplr-wc.js
cp keplr-wc.js <repo>/web/vendor/keplr-wc.js
```

Needs a free WalletConnect project ID from https://cloud.reown.com in
`web/config.js` (`walletConnectProjectId`), with the site's domain on the
project's allowlist.
