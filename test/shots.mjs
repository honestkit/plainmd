// CWS screenshots (1280x800) + promo tile (440x280) → ../store/. Demo data is fictional.
import { createRequire } from 'node:module'; import fs from 'node:fs'; import os from 'node:os'; import path from 'node:path'; import http from 'node:http';
const require = createRequire(process.env.PW || '/tmp/phtest/package.json');
const { chromium } = require('playwright');
const root = path.resolve(new URL('..', import.meta.url).pathname);
const ext = fs.mkdtempSync(path.join(os.tmpdir(), 'pmext-')); fs.cpSync(path.join(root, 'ext'), ext, { recursive: true });
const m = JSON.parse(fs.readFileSync(path.join(ext, 'manifest.json'))); m.host_permissions = ['<all_urls>'];
m.background = { service_worker: 'sw.js' }; fs.writeFileSync(path.join(ext, 'sw.js'), ''); fs.writeFileSync(path.join(ext, 'manifest.json'), JSON.stringify(m));
const para = 'Sourdough relies on a stable starter: a mix of flour and water colonised by wild yeast and lactic acid bacteria. Feed it daily at room temperature and it will double within six hours. ';
const demo = `<meta charset="utf-8"><title>Getting started with sourdough | Demo Kitchen Blog</title><body style="font:15px Georgia,serif;margin:0;color:#222">
<nav style="background:#333;color:#fff;padding:8px 16px;font:13px system-ui">Demo Kitchen · Recipes · Newsletter · <b>Subscribe!</b></nav>
<article style="padding:8px 24px"><h1 style="font-size:24px">Getting started with sourdough</h1><p style="color:#666">By Demo Author</p>
<p>${para}${para}</p><h2 style="font-size:18px">Feeding schedule</h2><table border=1 cellpadding=4 style="border-collapse:collapse"><tr><th>Day</th><th>Flour</th><th>Water</th></tr>
<tr><td>1</td><td>50 g</td><td>50 g</td></tr><tr><td>2</td><td>50 g</td><td>50 g</td></tr></table><p>${para}</p>
<pre><code class="language-python">hydration = water / flour</code></pre><p>${para}${para}</p></article></body>`;
const srv = http.createServer((q, r) => { r.setHeader('Content-Type', 'text/html; charset=utf-8'); r.end(demo); });
await new Promise(ok => srv.listen(8955, '127.0.0.1', ok));
const ctx = await chromium.launchPersistentContext(fs.mkdtempSync(path.join(os.tmpdir(), 'pmprof-')), {
  channel: 'chromium', headless: true, deviceScaleFactor: 2, args: [`--disable-extensions-except=${ext}`, `--load-extension=${ext}`] });
try {
  let [sw] = ctx.serviceWorkers(); if (!sw) sw = await ctx.waitForEvent('serviceworker');
  const id = sw.url().split('/')[2];
  const page = await ctx.newPage(); await page.setViewportSize({ width: 620, height: 440 }); await page.goto('http://127.0.0.1:8955/');
  const tabId = await sw.evaluate(async () => (await chrome.tabs.query({ url: 'http://127.0.0.1:8955/*' }))[0].id);
  const pagePng = (await page.screenshot()).toString('base64');
  const pop = await ctx.newPage(); await pop.setViewportSize({ width: 476, height: 360 });
  await pop.goto(`chrome-extension://${id}/popup.html?tabId=${tabId}`); await pop.waitForFunction(() => document.getElementById('md').value.length > 0);
  const popPng = (await pop.screenshot()).toString('base64');
  const shot = (cap, sub) => `<meta charset="utf-8"><body style="margin:0;width:1280px;height:800px;background:linear-gradient(135deg,#efeaf8,#fff);font:18px system-ui;position:relative">
    <div style="position:absolute;left:60px;top:60px;width:1160px"><h1 style="font-size:40px;color:#322659;margin:0 0 8px">${cap}</h1><p style="color:#444;margin:0">${sub}</p></div>
    <img src="data:image/png;base64,${pagePng}" style="position:absolute;left:60px;top:200px;width:620px;border-radius:8px;box-shadow:0 10px 30px #0002">
    <img src="data:image/png;base64,${popPng}" style="position:absolute;left:720px;top:200px;width:500px;border-radius:8px;box-shadow:0 12px 40px #0003"></body>`;
  const out = await ctx.newPage(); await out.setViewportSize({ width: 1280, height: 800 });
  const shots = [['shot1', 'Any article → clean Markdown', 'Menus, ads and footers stripped. Headings, links, tables and code kept.'],
    ['shot2', 'Made for Obsidian and AI chats', 'YAML front matter with title, source and date. Copy or download a .md file.'],
    ['shot3', 'Private by design', 'Only reads the page you click it on. No account, no limits, nothing leaves your browser.']];
  for (const [n, c, s] of shots) {
    await out.setContent(shot(c, s)); await out.waitForTimeout(200);
    await out.screenshot({ path: path.join(root, 'store', n + '.png'), scale: 'css' });
  }
  await out.setViewportSize({ width: 440, height: 280 });
  await out.setContent(`<meta charset="utf-8"><body style="margin:0;width:440px;height:280px;display:flex;flex-direction:column;justify-content:center;align-items:center;background:#553c9a;color:#fff;font:20px system-ui">
    <img src="data:image/png;base64,${fs.readFileSync(path.join(root, 'ext/icons/128.png')).toString('base64')}" width="96">
    <div style="font-size:34px;font-weight:700;margin-top:10px">MDGrab</div><div>Any page → clean Markdown</div></body>`);
  await out.screenshot({ path: path.join(root, 'store', 'tile-440x280.png'), scale: 'css' });
} finally { await ctx.close(); srv.close(); }
console.log('shots done');
