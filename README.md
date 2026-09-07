# Token Police

A Chrome (Manifest V3) browser extension that shows your remaining usage for
**Claude Code, Codex, Grok, Cursor, Grok Bot and Gemini** at a glance — in one popup.

![The Token Police popup showing quota, resets, and burn-rate for Claude Code, Codex, Grok, Cursor, Grok Bot, and Gemini](docs/dashboard.webp)

<sub>Example popup with sample data.</sub>

## Download

[![Download the latest release (.zip)](https://img.shields.io/github/v/release/jjliu6/token-police?style=for-the-badge&label=%E2%AC%87%EF%B8%8F%20Download%20Chrome%20extension%20(.zip)&color=1a73e8)](https://github.com/jjliu6/token-police/releases/latest/download/token-police.zip)
[![Total downloads](https://img.shields.io/github/downloads/jjliu6/token-police/total?style=for-the-badge&label=downloads&color=1f9d7c)](https://github.com/jjliu6/token-police/releases)

The version on the button is the one you get. No GitHub account, no git, no build step —
[download the latest release](https://github.com/jjliu6/token-police/releases/latest/download/token-police.zip),
unzip it, and load the folder in Chrome. See [Install](#install) below. Every release also ships a
versioned copy (`token_police-<version>.zip`) on the
[releases page](https://github.com/jjliu6/token-police/releases) if you want to keep
several versions around.

**Not a GitHub person?** The same download plus step-by-step install instructions live on the
[product landing page](https://token-police.philosophie.ai/) — send that link to
anyone who just wants the extension. It shows the same latest version as the button above.

<sub>Want the newest unreleased code instead? Grab the
[source zip of `main`](https://github.com/jjliu6/token-police/archive/refs/heads/main.zip) —
it installs the same way, just with a few extra development files in the folder.</sub>

## What it does

- One click shows the remaining weekly / short-term quota for all six agents, and when each one resets.
- **Grok Bot** (the weekly Grok Bot quota included in a Cursor plan) gets its own card. It lives on the same
  `cursor.com/dashboard/spending` page as the Cursor quota, so one scrape fills both cards. If your Cursor
  plan has no Grok Bot section, the card says so — untick it in ⚙ to hide it.
- **Gemini** reads `gemini.google.com/usage`: the weekly limit is the main ring, the short-term "Current usage"
  window is the bar below it.
- Once it has a few hours of history, it estimates your burn rate and warns when you'll run out **before** the next reset. Each card also draws a 7-day sparkline of your remaining quota.
- When a tracked agent drops below 15% (and again below 5%) remaining, you get a desktop notification — togglable in settings.
- The toolbar icon has a decorative in-progress ring around the mascot (striped mint arc). It is static artwork, not remaining quota.
- A tiny **hair mascot** floats on the dashboard, loses hair on the sit clock (2 hours normally, 1 hour if a tracked agent burned more than 10% in that window; remaining quota is a ceiling), and can be dragged or left to wander — togglable in settings. When the clock runs out and hair is gone, it asks you to move: a frosted veil covers the quota cards and 2–3 random rest activities appear from a pool of 100. Pick one, go do it, tap Done — the veil lifts, hair grows back, and the numbers are readable again.
- **Move reminder** (on by default, switch in ⚙): when a tracked agent burns more than 10% of its quota within 2 hours, you get a nudge to stand up and touch some grass — at most once every 2 hours per agent. It is a nudge, not a lock: a browser extension can't stop your terminal.
- An hourly **quiet auto-check** re-scrapes your tracked agents in background tabs without stealing focus (togglable). Pages that won't render in a background tab (can happen with Cursor/Grok) just keep their last data — click Refresh for a guaranteed update.
- The ⚙ button lets you pick which agents to track — unchecked ones are skipped by Refresh and hidden from the dashboard.
- If a refresh can't read a page (usually because you're signed out), the card says so and links straight to that product's usage page.
- The bottom of the panel shows the **installed version** (e.g. `v1.2.1`). Once a day it asks GitHub which
  release is the newest; when there is a newer one, that line turns into a **"New version vX.Y.Z available — download ↗"**
  link to the [landing page](https://token-police.philosophie.ai/). That check is the only network request
  the extension makes — it carries no account or usage data — and you can turn it off in ⚙.
- No API and no account linking — it reads the numbers straight off each tool's own usage page that you're already logged into.
- Everything stays local in your browser (`chrome.storage.local`). Your usage data is never sent to any server.

## Install

1. **[Download the extension as a .zip](https://github.com/jjliu6/token-police/releases/latest/download/token-police.zip)**
   (or clone this repository, if you prefer git).
2. **Unzip** the file (double-click on macOS, right-click → **Extract All…** on Windows).
   You'll get a folder with `manifest.json` inside — keep it somewhere permanent
   (not the Downloads folder you might clean up later); Chrome loads the extension from this
   folder every time it starts.
3. Open `chrome://extensions` in Chrome.
4. Turn on **Developer mode** (toggle in the top-right corner).
5. Click **Load unpacked** and select the unzipped folder (the one that contains `manifest.json`).
6. Click the toolbar icon. The dashboard opens in the **side panel** so it stays visible while Refresh scrapes.
7. Click **Refresh** (or open a product's usage page in a normal tab) to populate the data.
8. The dashboard defaults to **English**. Click **中文** / **EN** in the header to switch; the choice is stored locally (`uiLang`) and does not follow Chrome's UI language.

To update later: when the bottom of the panel says a new version is available (or the version on the
Download button above is higher than the `vX.Y.Z` at the bottom of your panel), download the zip again,
replace the folder's contents, then click the ↻ reload button on the extension's card in
`chrome://extensions`. The panel shows the new version right away.

## Files

- `manifest.json` — extension manifest (Manifest V3)
- `agents.js` — shared registry of the six agents (names, colors, usage-page URLs)
- `update.js` — version helpers shared by background and popup (reads the version from the manifest, compares release tags)
- `background.js` — service worker that coordinates the "Refresh" flow
- `content.js` — content script that reads usage numbers from each product page
- `popup.html` / `popup.js` / `i18n.js` / `activities.js` — the side-panel dashboard (English / 中文) and the rest/move activity pool
- `_locales/` — Chrome Store / `chrome://extensions` name and description
- `icons/` — extension icons (`token-police.svg` is the source; `python3 scripts/render-icons.py` writes `mark-*.png`)
- `docs/` — the landing page (`index.html`) published to GitHub Pages, plus README screenshots

## Development

The extension is zero-dependency vanilla JS. The only tooling is dev-time
helpers for validating and packaging it (installed with `npm install`).

- `npm run validate` — check the manifest is valid MV3 and every referenced script parses.
- `npm run build` — package the extension into `dist/token_police-<version>.zip`.
- `npm start` — launch Chrome with the extension loaded for interactive testing (uses `web-ext run -t chromium`).
- After editing `icons/token-police.svg`, run `python3 scripts/render-icons.py`. If the mark changed, also run `python3 scripts/build-og-image.py` (both need Pillow; the icon script also needs cairosvg).

### Releasing

Releases are automatic — just merge to `main`. The Release workflow
(`.github/workflows/release.yml`) runs on every push to `main` that touches the
extension (docs-only changes are skipped): it validates, tests, and builds the
zip with `npm run build`, then publishes it as a GitHub Release with a
stable-named asset `token-police.zip` — which is what the Download button
at the top of this README points to.

Versioning is automatic too: if `manifest.json`'s current version is already
released, the workflow bumps the patch version and commits the bump back to
`main`. For a minor/major release, bump `version` in `manifest.json` and
`package.json` in your PR — that exact version is released when it lands. The
workflow can also be run manually from the Actions tab.

`manifest.json` is the single source of truth for the version: the panel reads
it at runtime (`chrome.runtime.getManifest().version`), `npm run build` puts
it in the zip's filename, and the Release workflow uses it for the `vX.Y.Z` tag
that the Download badge above and the in-panel update check both look at.
`npm test` fails if `package.json` drifts out of sync with it.

### Landing page

`docs/index.html` is the landing page for people who don't use GitHub:
<https://token-police.philosophie.ai/>. It is a template that
`scripts/build-pages.mjs` renders once per language (`npm run build:pages`
→ `dist/site`):

| URL | What it serves |
|---|---|
| `/` | English, plus a tiny script that sends readers whose browser (or last choice) is Chinese to `/zh/`. Old `?lang=zh` links still work. |
| `/en/` | English |
| `/zh/` | Chinese, with the strings from `docs/i18n/zh.mjs` |

Each language is a real file, so a shared `/zh/` link opens Chinese for
whoever receives it, and search engines index the two versions separately
(`hreflang`). To change copy, edit the English in `docs/index.html` and the
matching key in `docs/i18n/zh.mjs`; `npm test` fails if the two drift apart.
Preview locally with `npm run build:pages && npx serve dist/site` (asset paths
are absolute, so open the template through a server rather than as a file).

The Landing page workflow (`.github/workflows/pages.yml`) renders and publishes
the site on every push to `main` that touches `docs/` or the build script, and
again after every successful Release so the version baked into the page is
current. The page's Download button uses the same
`releases/latest/download/token-police.zip` link as the README, and it
fetches the latest version number from GitHub's API when it loads, so it never
needs a manual update. One-time setup: **Settings → Pages → Source: GitHub Actions**.

## Disclaimer

Unofficial and not affiliated with Anthropic, OpenAI, xAI, Cursor, or Google. It only
reads usage numbers already shown on each product's own page.

---

Built by [Junjie Liu](https://www.linkedin.com/in/junjieliu/) at [Philosophie AI](https://philosophie.ai).
