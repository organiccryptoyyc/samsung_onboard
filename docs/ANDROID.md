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

## Step 2: Trusted Web Activity on Google Play (beta, current domain)

A TWA wraps the same PWA in a thin Android app, so there is one codebase and
every web deploy updates the app without a store review. The beta keeps
`onboard.organiccryptoyyc.com`; moving domains later means a new app version
with a new `host` (same package id), plus asset links on the new domain.

- `android/` is the Bubblewrap project (package `app.poktpal.yyc`).
  `android/twa-manifest.json` is the source of truth; bump `appVersionCode`
  (and `appVersionName`) for every Play upload, and mirror them in
  `android/app/build.gradle`.
- `.github/workflows/android.yml` builds an **unsigned** release bundle on any
  push touching `android/` and attaches it to a GitHub pre-release named
  `android-<version>-<sha>`.
- The **upload key** lives only on the developer's PC, in a git-ignored
  folder `pocket-agentic-services/pokt-pal-android-signing/` (keystore
  `upload-key.jks`, alias `upload`, password in the text file beside it).
  Sign the bundle there:
  `jarsigner -sigalg SHA256withRSA -digestalg SHA-256 -keystore upload-key.jks -storepass <pw> pokt-pal-unsigned.aab upload`
  If the key is lost, Play support can reset an upload key (Play App Signing
  holds the real app signing key).
- `web/.well-known/assetlinks.json` lists the SHA-256 fingerprints Chrome
  trusts to hide the URL bar: the upload key, and after the first Play upload
  also the **app signing key** from Play Console > Test and release > App
  integrity. Without the Play one, Play-installed copies show a URL bar.
- Store listing text and graphics: `docs/play-store/`.
- Privacy policy: `web/privacy.html`.

Store policy notes (rules change, re-read them before submitting): Google
Play's cryptocurrency policy allows non-custodial apps in most regions;
exchange or custodial features need licences in some countries. Pokt Pal holds
no keys and executes swaps the user signs in their own wallet. New personal
developer accounts must run a closed test with enough opted-in testers for 14
days before they can apply for production; internal testing has no such wait.
The Samsung Galaxy Store can take the same signed bundle later.

## Domain

The app is currently served at a subdomain of the developer's personal domain.
The UI no longer shows it, but the address bar (and the TWA's asset links) do.
Suggested neutral domains, availability not yet checked: `poktpal.app`
(HTTPS-only TLD, good fit for a PWA), `poktpal.xyz`, `getpoktpal.com`.
The web app uses relative paths, so moving only needs a new Caddy site block,
`WEB_APP_URL` / `CORS_ORIGINS` in `.env`, and a redirect from the old host.
Also update the QR on cue card 1.
