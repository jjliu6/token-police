// Renders the landing page (docs/index.html) once per language.
//
//   node scripts/build-pages.mjs [outDir]      (default: dist/site)
//
// Output layout (what GitHub Pages serves at token-police.philosophie.ai):
//
//   /            English, plus a tiny inline script that sends readers whose
//                stored choice / browser language is Chinese to /zh/ or
//                French to /fr/, and rewrites the address bar to /en/ for
//                everyone else. Old ?lang=zh / ?lang=fr links keep working
//                through the same script.
//   /en/         English
//   /fr/         French — every data-i18n* element replaced from docs/i18n/fr.mjs
//   /zh/         Chinese — every data-i18n* element replaced from docs/i18n/zh.mjs
//   /<assets>    images, videos, version.json — copied from docs/ unchanged
//
// Static hosting maps URL paths to files, so /fr/ only exists if fr/index.html
// does. That is why these are real files and not a client-side switch: a
// shared /fr/ link must open French for whoever receives it, JavaScript or
// not, and search engines can index each language separately (hreflang).
//
// Zero dependencies on purpose: no HTML parser, so the template keeps to a
// few conventions that a regex can handle safely (checked below — the build
// fails loudly rather than shipping half-translated HTML):
//   - <el ... data-i18n="key" ...>plain text</el>
//   - <el ... data-i18n-html="key" ...>text with <a>/<b>/<code></el>, where
//     the inner HTML never contains another <el> of the same tag name
//   - <meta ... data-i18n-content="key" content="...">
//   - {{placeholder}} tokens listed in PLACEHOLDERS

import { readFileSync, writeFileSync, mkdirSync, readdirSync, statSync, copyFileSync, rmSync } from 'node:fs';
import { resolve, dirname, join } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const docs = join(root, 'docs');
const SITE = 'https://token-police.philosophie.ai';

export const LANGS = {
  en: { htmlLang: 'en', ogLocale: 'en_US', path: '/en/', label: 'EN', switchTitle: 'Switch to English', shareTitle: 'Share this page', assetLang: 'en' },
  fr: { htmlLang: 'fr', ogLocale: 'fr_FR', path: '/fr/', label: 'FR', switchTitle: 'Passer en français', shareTitle: 'Partager cette page', assetLang: 'en' },
  zh: { htmlLang: 'zh-CN', ogLocale: 'zh_CN', path: '/zh/', label: '中文', switchTitle: '切换到中文', shareTitle: '分享这个页面', assetLang: 'zh' },
};

const SKIP = new Set(['index.html', 'i18n']);

function escapeAttr(s) {
  return s.replace(/&/g, '&').replace(/"/g, '"');
}

function langLinks(current) {
  return Object.entries(LANGS).map(([code, info]) => {
    const on = code === current ? ' aria-current="page"' : '';
    return `<a class="lang"${on} href="${info.path}" hreflang="${info.htmlLang}" lang="${info.htmlLang}" title="${escapeAttr(info.switchTitle)}">${info.label}</a>`;
  }).join('');
}

function hreflangLinks() {
  const alts = [
    '<link rel="alternate" hreflang="en" href="https://token-police.philosophie.ai/en/">',
    '<link rel="alternate" hreflang="fr" href="https://token-police.philosophie.ai/fr/">',
    '<link rel="alternate" hreflang="zh-CN" href="https://token-police.philosophie.ai/zh/">',
    '<link rel="alternate" hreflang="x-default" href="https://token-police.philosophie.ai/en/">',
  ];
  return alts.join('\n');
}

function ogLocaleAlternates(current) {
  return Object.entries(LANGS)
    .filter(([code]) => code !== current)
    .map(([, info]) => `<meta property="og:locale:alternate" content="${info.ogLocale}">`)
    .join('\n');
}

function translate(html, dict, lang) {
  const used = new Set();
  const missing = new Set();
  const lookup = (key) => {
    if (dict && key in dict) { used.add(key); return dict[key]; }
    if (dict) missing.add(key);
    return null;
  };

  html = html.replace(
    /<([a-z][a-z0-9]*)((?:\s[^>]*?)?)\sdata-i18n(-html)?="([^"]+)"([^>]*)>([\s\S]*?)<\/\1>/g,
    (whole, tag, before, isHtml, key, after, inner) => {
      if (new RegExp(`<${tag}[\\s>]`, 'i').test(inner)) {
        throw new Error(`data-i18n${isHtml || ''}="${key}": inner HTML contains a nested <${tag}>, which the build cannot handle. Use a different tag or key.`);
      }
      if (!isHtml && /<[a-z]/i.test(inner)) {
        throw new Error(`data-i18n="${key}" contains HTML tags; use data-i18n-html instead.`);
      }
      const val = lookup(key);
      const text = val == null ? inner : val;
      return `<${tag}${before}${after}>${text}</${tag}>`;
    },
  );

  html = html.replace(
    /<meta((?:\s[^>]*?)?)\sdata-i18n-content="([^"]+)"([^>]*?)\scontent="([^"]*)"([^>]*)>/g,
    (whole, before, key, mid, content, after) => {
      const val = lookup(key);
      return `<meta${before}${mid} content="${val == null ? content : escapeAttr(val)}"${after}>`;
    },
  );

  if (dict) {
    const unused = Object.keys(dict).filter((k) => !used.has(k));
    if (missing.size) throw new Error(`${lang}: no translation for ${[...missing].join(', ')}`);
    if (unused.length) throw new Error(`${lang}: translation keys not used by the template: ${unused.join(', ')}`);
  }
  return html;
}

const ROOT_REDIRECT = `<script>
/* Root URL only. Pick a language page: ?lang= in the URL, then the choice
   remembered from the header link, then the browser language. Chinese goes
   to /zh/, French to /fr/; everyone else stays on this (English) page but
   the address bar is rewritten to /en/ so copied links always name the
   language. */
(function () {
  var allowed = { en: 1, zh: 1, fr: 1 };
  var pick = null;
  try { pick = new URLSearchParams(location.search).get('lang'); } catch (e) {}
  if (!allowed[pick]) {
    try { pick = localStorage.getItem('uiLang'); } catch (e) {}
  }
  if (!allowed[pick]) {
    var nav = String(navigator.language || '').toLowerCase();
    pick = nav.indexOf('zh') === 0 ? 'zh' : nav.indexOf('fr') === 0 ? 'fr' : 'en';
  }
  if (pick === 'zh') { location.replace('/zh/' + location.hash); return; }
  if (pick === 'fr') { location.replace('/fr/' + location.hash); return; }
  try { history.replaceState(null, '', '/en/' + location.hash); } catch (e) {}
})();
</script>`;

export function render(template, { lang, dict, root: isRoot = false }) {
  const me = LANGS[lang];
  const canonical = SITE + me.path;
  const values = {
    lang,
    htmlLang: me.htmlLang,
    ogLocale: me.ogLocale,
    canonical,
    assetLang: me.assetLang,
    shareTitle: me.shareTitle,
    langLinks: langLinks(lang),
    hreflangLinks: hreflangLinks(),
    ogLocaleAlternates: ogLocaleAlternates(lang),
  };
  let html = template.replace(/<!--\n\s*TEMPLATE[\s\S]*?-->\n/, '');
  html = translate(html, dict, lang);
  html = html.replace(/\{\{(\w+)\}\}/g, (whole, name) => {
    if (!(name in values)) throw new Error(`unknown placeholder {{${name}}}`);
    return values[name];
  });
  html = html.replace('<!-- build:root-redirect -->\n', isRoot ? ROOT_REDIRECT + '\n' : '');
  return html;
}

function copyAssets(from, to) {
  for (const name of readdirSync(from)) {
    if (SKIP.has(name)) continue;
    const src = join(from, name);
    const dst = join(to, name);
    if (statSync(src).isDirectory()) { mkdirSync(dst, { recursive: true }); copyAssets(src, dst); }
    else copyFileSync(src, dst);
  }
}

export async function build(outDir) {
  const template = readFileSync(join(docs, 'index.html'), 'utf8');
  const zh = (await import(pathToFileURL(join(docs, 'i18n', 'zh.mjs')).href)).default;
  const fr = (await import(pathToFileURL(join(docs, 'i18n', 'fr.mjs')).href)).default;

  rmSync(outDir, { recursive: true, force: true });
  mkdirSync(outDir, { recursive: true });
  copyAssets(docs, outDir);

  const pages = {
    'index.html': render(template, { lang: 'en', dict: null, root: true }),
    'en/index.html': render(template, { lang: 'en', dict: null }),
    'fr/index.html': render(template, { lang: 'fr', dict: fr }),
    'zh/index.html': render(template, { lang: 'zh', dict: zh }),
  };
  for (const [rel, html] of Object.entries(pages)) {
    const abs = join(outDir, rel);
    mkdirSync(dirname(abs), { recursive: true });
    writeFileSync(abs, html);
  }
  return Object.keys(pages);
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const outDir = resolve(root, process.argv[2] || 'dist/site');
  const pages = await build(outDir);
  console.log(`Landing page rendered to ${outDir}:\n  ${pages.join('\n  ')}`);
}
