// Lightweight validator for this Chrome (Manifest V3) extension.
// Chrome-only, zero-dependency vanilla JS, so `web-ext lint` (Firefox-oriented)
// is not a good pass/fail gate. Instead we validate the manifest structure and
// check that every referenced JavaScript file is syntactically valid.

import { readFileSync, existsSync } from 'node:fs';
import { execFileSync } from 'node:child_process';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const problems = [];

function fail(msg) {
  problems.push(msg);
}

function readJson(rel) {
  const abs = resolve(root, rel);
  if (!existsSync(abs)) {
    fail(`Missing required file: ${rel}`);
    return null;
  }
  try {
    return JSON.parse(readFileSync(abs, 'utf8'));
  } catch (err) {
    fail(`Invalid JSON in ${rel}: ${err.message}`);
    return null;
  }
}

const manifest = readJson('manifest.json');
const jsFiles = new Set();

if (manifest) {
  if (manifest.manifest_version !== 3) {
    fail(`manifest_version must be 3 (found ${JSON.stringify(manifest.manifest_version)}).`);
  }
  for (const key of ['name', 'version', 'action']) {
    if (!manifest[key]) fail(`manifest.json is missing required key "${key}".`);
  }
  if (typeof manifest.version === 'string' && /^\d+\.\d+\.\d+$/.test(manifest.version)) {
    const patch = Number(manifest.version.split('.')[2]);
    if (patch >= 10) {
      fail(`version patch must stay 1–9 (got ${manifest.version}); bump minor instead, e.g. 1.6.10 → 1.7.1`);
    }
  }

  if (manifest.action?.default_popup) jsFiles.add(manifest.action.default_popup.replace(/\.html$/, '.js'));
  if (manifest.background?.service_worker) jsFiles.add(manifest.background.service_worker);
  for (const cs of manifest.content_scripts ?? []) {
    for (const js of cs.js ?? []) jsFiles.add(js);
  }

  const iconSet = { ...(manifest.icons ?? {}), ...(manifest.action?.default_icon ?? {}) };
  for (const [size, path] of Object.entries(iconSet)) {
    if (!existsSync(resolve(root, path))) fail(`Icon (${size}) referenced but missing: ${path}`);
  }
}

// popup.js is loaded via popup.html, agents.js via popup.html + importScripts.
jsFiles.add('popup.js');
jsFiles.add('i18n.js');
jsFiles.add('agents.js');
jsFiles.add('activities.js');
jsFiles.add('update.js');
jsFiles.add('capture-logs.js');
if (manifest && !manifest.default_locale) fail('manifest.json is missing default_locale (required for i18n).');
if (!existsSync(resolve(root, '_locales/en/messages.json'))) fail('Missing _locales/en/messages.json');
if (!existsSync(resolve(root, '_locales/zh_CN/messages.json'))) fail('Missing _locales/zh_CN/messages.json');
if (!existsSync(resolve(root, '_locales/fr/messages.json'))) fail('Missing _locales/fr/messages.json');
if (!existsSync(resolve(root, '_locales/fr_FR/messages.json'))) fail('Missing _locales/fr_FR/messages.json');

for (const rel of jsFiles) {
  const abs = resolve(root, rel);
  if (!existsSync(abs)) {
    fail(`Referenced script not found: ${rel}`);
    continue;
  }
  try {
    execFileSync(process.execPath, ['--check', abs], { stdio: 'pipe' });
  } catch (err) {
    fail(`Syntax error in ${rel}:\n${err.stderr?.toString() ?? err.message}`);
  }
}

if (problems.length) {
  console.error(`Validation failed with ${problems.length} problem(s):`);
  for (const p of problems) console.error(`  - ${p}`);
  process.exit(1);
}

console.log('Validation passed: manifest is valid MV3 and all referenced scripts parse.');
