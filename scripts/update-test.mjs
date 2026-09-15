// update.js 的纯函数测试：版本号解析、比较、"有没有新版"的判断（不需要浏览器）。

import { readFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import vm from 'node:vm';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const manifest = JSON.parse(readFileSync(resolve(root, 'manifest.json'), 'utf8'));
const pkg = JSON.parse(readFileSync(resolve(root, 'package.json'), 'utf8'));

const ctxObj = { chrome: { runtime: { getManifest: () => ({ version: manifest.version }) } } };
const ctx = vm.createContext(ctxObj);
vm.runInContext(readFileSync(resolve(root, 'update.js'), 'utf8'), ctx, { filename: 'update.js' });

const problems = [];
const eq = (what, got, want) => { if (got !== want) problems.push(`${what}: expected ${JSON.stringify(want)}, got ${JSON.stringify(got)}`); };

// manifest.json 和 package.json 的版本号必须一致（发布流程两边都会改，改漏就对不上）
eq('manifest/package version in sync', pkg.version, manifest.version);
if (!/^\d+\.\d+\.\d+$/.test(manifest.version)) problems.push(`manifest version should look like 1.2.3, got ${manifest.version}`);
{
  const patch = Number(manifest.version.split('.')[2]);
  if (patch >= 10) {
    problems.push(`patch must stay 1–9 (got ${manifest.version}); bump minor instead, e.g. 1.6.10 → 1.7.1`);
  }
}
eq('currentVersion() reads the manifest', ctx.currentVersion(), manifest.version);

// tag 解析
eq('parse "v1.2.1"', ctx.parseVersionTag('v1.2.1'), '1.2.1');
eq('parse "1.2.1"', ctx.parseVersionTag('1.2.1'), '1.2.1');
eq('parse " V2.0 "', ctx.parseVersionTag(' V2.0 '), '2.0');
eq('parse garbage', ctx.parseVersionTag('latest'), null);
eq('parse empty', ctx.parseVersionTag(''), null);
eq('parse undefined', ctx.parseVersionTag(undefined), null);
eq('parse "v1.2.1-beta" (pre-release tags are not released versions)', ctx.parseVersionTag('v1.2.1-beta'), null);

// 比较：按段比数字，不是按字符串
eq('1.2.10 > 1.2.9', ctx.cmpVersion('1.2.10', '1.2.9'), 1);
eq('1.2.9 < 1.2.10', ctx.cmpVersion('1.2.9', '1.2.10'), -1);
eq('1.3.0 > 1.2.99', ctx.cmpVersion('1.3.0', '1.2.99'), 1);
eq('2.0.0 > 1.9.9', ctx.cmpVersion('2.0.0', '1.9.9'), 1);
eq('1.2.1 == 1.2.1', ctx.cmpVersion('1.2.1', '1.2.1'), 0);
eq('1.2 == 1.2.0', ctx.cmpVersion('1.2', '1.2.0'), 0);
eq('1.2.0.1 > 1.2', ctx.cmpVersion('1.2.0.1', '1.2'), 1);

// 有没有新版：跟"当前安装的"比，不是存 true/false
eq('newer latest → update', ctx.updateAvailable({ latest: '9.9.9' }, '1.2.1'), true);
eq('same latest → no update', ctx.updateAvailable({ latest: '1.2.1' }, '1.2.1'), false);
eq('older latest (dev build ahead) → no update', ctx.updateAvailable({ latest: '1.2.0' }, '1.2.1'), false);
eq('no check yet → no update', ctx.updateAvailable(null, '1.2.1'), false);
eq('failed check only → no update', ctx.updateAvailable({ failedAt: 1 }, '1.2.1'), false);
eq('unknown current version → no update', ctx.updateAvailable({ latest: '9.9.9' }, ''), false);
eq('defaults to manifest version', ctx.updateAvailable({ latest: manifest.version }), false);
eq('defaults to manifest version (newer)', ctx.updateAvailable({ latest: '999.0.0' }), true);

// 常量指向这个仓库（const 不会挂到 ctx 对象上，要在沙盒里求值取出来）
const API = vm.runInContext('UPDATE_API', ctx);
const PAGE = vm.runInContext('UPDATE_PAGE', ctx);
if (!API.startsWith('https://api.github.com/repos/jjliu6/token-police/')) problems.push(`UPDATE_API wrong: ${API}`);
if (PAGE !== 'https://token-police.philosophie.ai/') problems.push(`UPDATE_PAGE should be the landing page, got ${PAGE}`);

if (problems.length) {
  console.error(problems.join('\n'));
  process.exit(1);
}
console.log('ok  manifest.json and package.json versions match');
console.log('ok  Release tags parse and versions compare numerically (1.2.10 > 1.2.9)');
console.log('ok  updateAvailable compares against the installed version');
console.log('\nUpdate test passed.');
