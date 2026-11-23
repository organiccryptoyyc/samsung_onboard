# Pokt Pal on Android

Pokt Pal ships first as an installable web app (PWA). Android is next; Apple is
out of scope for now so that swapping can stay live in the app.

## Step 1: PWA (this release)

- `web/manifest.webmanifest`: name, maskable icon, shortcuts (Buy, Swap,
  Agent Marketplace, Get started) and store-style screenshots.
- `web/sw.js`: app shell works offline and updates in the background.
  `/api/` calls are never cached.
- Android Chrome and Samsung Internet show an **Install app** button in the
  header (`beforeinstallprompt`). Installed, it opens full screen with its own
  icon, like a native app.

## Step 2: Trusted Web Activity (Play Store and Galaxy Store)

A TWA wraps the same PWA in a thin Android app, so there is one codebase and
every web deploy updates the app without a store review.

1. Move to the final domain first (see below). The app's identity is tied to
   the domain through Digital Asset Links, so changing it later means a new
   store listing.
2. `npx @bubblewrap/cli init --manifest https://<domain>/manifest.webmanifest`
   then `bubblewrap build`. Suggested package id: `app.poktpal.twa`.
3. Publish `/.well-known/assetlinks.json` on the domain with the signing key's
   SHA-256 fingerprint (Play App Signing shows it), so Chrome hides the URL bar.
4. Upload the `.aab` to Google Play (internal testing track first), and the
   same build to the Samsung Galaxy Store, which suits Samsung Wallet users.
5. Direct APK download is possible for the community trial (`bubblewrap build`
   also outputs an `.apk`), but users must allow unknown sources.

Store policy notes to check before submitting (rules change, re-read them):
Google Play's cryptocurrency policy allows non-custodial wallet-connect apps in
most regions; exchange or custodial features need licences in some countries.
Pokt Pal holds no keys and executes swaps the user signs in their own wallet,
which is the non-custodial case. Wallet deep links (Phantom, Solflare) work
inside a TWA because they open the wallet app by intent.

## Domain

The app is currently served at a subdomain of the developer's personal domain.
The UI no longer shows it, but the address bar (and the TWA's asset links) do.
Suggested neutral domains, availability not yet checked: `poktpal.app`
(HTTPS-only TLD, good fit for a PWA), `poktpal.xyz`, `getpoktpal.com`.
The web app uses relative paths, so moving only needs a new Caddy site block,
`WEB_APP_URL` / `CORS_ORIGINS` in `.env`, and a redirect from the old host.
Also update the QR on cue card 1.
