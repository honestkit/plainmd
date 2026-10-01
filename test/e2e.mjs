// E2E in real Chromium: popup (driven via ?tabId=) clips an article page to Markdown. Needs /tmp/phtest playwright.
import { createRequire } from 'node:module'; import fs from 'node:fs'; import os from 'node:os'; import path from 'node:path';
import http from 'node:http'; import assert from 'node:assert/strict';
const require = createRequire(process.env.PW || '/tmp/phtest/package.json');
const { chromium } = require('playwright');
const src = path.resolve(new URL('../ext', import.meta.url).pathname);
const ext = fs.mkdtempSync(path.join(os.tmpdir(), 'pmext-')); fs.cpSync(src, ext, { recursive: true });
const m = JSON.parse(fs.readFileSync(path.join(ext, 'manifest.json'))); m.host_permissions = ['<all_urls>'];
m.background = { service_worker: 'sw.js' }; fs.writeFileSync(path.join(ext, 'sw.js'), ''); fs.writeFileSync(path.join(ext, 'manifest.json'), JSON.stringify(m));
const para = 'Plain text paragraph with enough words to look like a real article body for the readability scorer. '.repeat(6);
const page = `<!doctype html><meta charset="utf-8"><title>How to test things | Demo Blog</title><base href="/kb/"><body>
<nav><a href="/">Home</a> <a href="/about">About</a> Subscribe now!</nav>
<article><h1>How to test things</h1><p class="byline">By Demo Author</p><p>${para}</p>
<h2>Code</h2><pre><code class="language-js">const x = 1;\nconsole.log(x);</code></pre>
<p>See <a href="/docs/intro">the docs</a>, <a href="guide/setup">the setup guide</a> and <strong>bold</strong> text. ${para}</p>
<table><tr><th>A</th><th>B</th></tr><tr><td>1</td><td>2</td></tr></table>
<ul><li>one</li><li>two</li></ul><p id="pick">Selected sentence here.</p><p>${para}</p>
<h2>Support</h2><x-compat id="xc"></x-compat><script>document.getElementById('xc').attachShadow({ mode: 'open' }).innerHTML = '<table><tr><td></td><th colspan="2">desktop</th></tr><tr><th>fetch</th><td><div>42</div><div>more</div></td><td>39</td></tr></table>';</script></article>
<footer>© Demo footer cookie banner</footer></body>`;
const srv = http.createServer((q, r) => { r.setHeader('Content-Type', 'text/html; charset=utf-8'); r.end(page); });
await new Promise(ok => srv.listen(8954, '127.0.0.1', ok));
const ctx = await chromium.launchPersistentContext(fs.mkdtempSync(path.join(os.tmpdir(), 'pmprof-')), {
  channel: 'chromium', headless: true, args: [`--disable-extensions-except=${ext}`, `--load-extension=${ext}`] });
try {
  let [sw] = ctx.serviceWorkers(); if (!sw) sw = await ctx.waitForEvent('serviceworker');
  const id = sw.url().split('/')[2];
  const p = await ctx.newPage(); await p.goto('http://127.0.0.1:8954/post/1');
  const tabId = await sw.evaluate(async () => (await chrome.tabs.query({ url: 'http://127.0.0.1:8954/*' }))[0].id);
  const pop = await ctx.newPage(); const errs = []; pop.on('pageerror', e => errs.push(e.message));
  await pop.goto(`chrome-extension://${id}/popup.html?tabId=${tabId}`);
  await pop.waitForFunction(() => document.getElementById('md').value.length > 0);
  const md = await pop.inputValue('#md'); if (process.env.DUMP) console.log(md);
  assert.deepEqual(errs, []);
  assert.ok(md.startsWith('---\ntitle: "How to test things"\n'), 'front matter + title suffix stripped');
  assert.ok(md.includes('source: "http://127.0.0.1:8954/post/1"'));
  assert.ok(md.includes('```js\nconst x = 1;\nconsole.log(x);\n```'), 'fenced code with lang');
  assert.ok(md.includes('[the docs](http://127.0.0.1:8954/docs/intro)'), 'absolute links');
  assert.ok(md.includes('[the setup guide](http://127.0.0.1:8954/kb/guide/setup)'), 'relative links honour <base href> (0.2)');
  assert.ok(md.includes('|  | desktop |  |\n| --- | --- | --- |\n| fetch | 42 more | 39 |'), 'table from an open shadow root (0.2): ' + md.slice(md.indexOf('Support')).slice(0, 200));
  assert.ok(md.includes('- one\n- two'), 'tight list');
  assert.ok(md.includes('**bold**')); assert.ok(/\| A \| B \|/.test(md), 'gfm table');
  assert.ok(!md.includes('Subscribe now') && !md.includes('cookie banner'), 'boilerplate stripped');
  // Selection only
  await p.evaluate(() => { const r = document.createRange(); r.selectNodeContents(document.getElementById('pick')); getSelection().addRange(r); });
  await pop.reload(); await pop.waitForFunction(() => document.getElementById('md').value.length > 0);
  await pop.uncheck('#fm');
  assert.equal((await pop.inputValue('#md')).trim(), 'Selected sentence here.');
  // 0.2 output template: saved to storage, survives reopen, placeholders filled; Reset restores default.
  await pop.click('#tplBtn'); await pop.fill('#tpl', '[{{title}}]({{url}}) {{domain}}\n{{content}}');
  await pop.click('#tplSave'); await pop.reload(); await pop.waitForFunction(() => document.getElementById('md').value.length > 0);
  assert.equal((await pop.inputValue('#md')).trim(), '[How to test things](http://127.0.0.1:8954/post/1) 127.0.0.1\nSelected sentence here.', 'template applied');
  await pop.click('#tplBtn'); await pop.click('#tplReset'); await pop.uncheck('#fm');
  assert.equal((await pop.inputValue('#md')).trim(), 'Selected sentence here.', 'template reset');
  assert.deepEqual(errs, []);
  // Layout tables (HN-style ragged rows, icon-only links) -> paragraphs; header-less data table -> GFM table.
  const [layout, plain] = await pop.evaluate(async () => { const { toMarkdown } = await import('./convert.js'); return [
    toMarkdown('<table><tr><td>1.</td><td><a href="/v"><div></div></a></td><td><a href="/s">Story</a></td></tr><tr><td colspan="2"></td><td>9 points</td></tr></table>'),
    toMarkdown('<table><tr><td>Name</td><td>Qty</td></tr><tr><td>Apple</td><td>3</td></tr></table>')]; });
  assert.ok(!/<t[dr]|\]\(\/v\)/.test(layout) && /1\\?\. \[Story\]\(\/s\)/.test(layout) && layout.includes('9 points'), 'layout table flattened: ' + layout);
  assert.ok(/\| Name \| Qty \|\n\| --- \| --- \|\n\| Apple \| 3 \|/.test(plain), 'header-less table promoted: ' + plain);
  // Thread mode: serve a synthetic HN item at the real URL (threads.js gates on hostname + /item).
  const row = (id, ind, user, text) => `<tr class="athing comtr" id="${id}"><td><table><tr><td class="ind" indent="${ind}"></td><td class="default">` +
    `<span class="comhead"><a class="hnuser">${user}</a> <span class="age" title="2026-09-01T10:00:00 1756720800"><a>1 day ago</a></span></span>` +
    `<div class="comment"><div class="commtext c00">${text}</div><div class="reply">reply</div></div></td></tr></table></td></tr>`;
  const hn = `<!doctype html><title>Show HN: Demo | Hacker News</title><table class="fatitem"><tr class="athing submission" id="1"><td>` +
    `<span class="titleline"><a href="https://demo.example/">Show HN: Demo</a></span></td></tr><tr><td class="subtext"><span class="subline">` +
    `<a class="hnuser">alice</a> <span class="age" title="2026-09-01T09:00:00 1756717200">x</span></span></td></tr></table>` +
    `<table class="comment-tree">${row(2, 0, 'bob', 'Top comment')}${row(3, 1, 'carol', 'A reply')}</table>`;
  await ctx.route('https://news.ycombinator.com/**', r => r.fulfill({ contentType: 'text/html', body: hn }));
  const t = await ctx.newPage(); await t.goto('https://news.ycombinator.com/item?id=1');
  const hnTab = await sw.evaluate(async () => (await chrome.tabs.query({ url: 'https://news.ycombinator.com/*' }))[0].id);
  const tp = await ctx.newPage(); await tp.goto(`chrome-extension://${id}/popup.html?tabId=${hnTab}`);
  await tp.waitForFunction(() => document.getElementById('md').value.length > 0); await tp.uncheck('#fm');
  const tmd = await tp.inputValue('#md');
  assert.ok(tmd.startsWith('# Show HN: Demo\n') && tmd.includes('[Show HN: Demo](https://demo.example/) — alice · 2026-09-01 09:00'), 'thread head: ' + tmd);
  assert.ok(tmd.includes('**bob** · 2026-09-01 10:00 · [link](https://news.ycombinator.com/item?id=2)\n\nTop comment'), 'top comment: ' + tmd);
  assert.ok(tmd.includes('> **carol**') && tmd.includes('> A reply') && !/^(> )*reply$/m.test(tmd), 'nested reply: ' + tmd);
  assert.match(await tp.textContent('#info'), /thread, 2 comments$/);
  await tp.uncheck('#thr'); assert.ok(!(await tp.inputValue('#md')).includes('**carol**'), 'comments toggle off');
  await tp.close(); await t.close();
  // Old Reddit markup (live Reddit blocks headless Chromium, so this is our only check of that path).
  const rc = (a, text, kids = '') => `<div class="thing comment" data-author="${a}" data-permalink="/r/x/comments/1/t/${a}/"><div class="entry">` +
    `<time datetime="2026-09-01T10:00:00+00:00">1d</time><div class="usertext-body"><div class="md"><p>${text}</p></div></div></div><div class="child">${kids}</div></div>`;
  const rd = `<!doctype html><title>Q : x</title><div id="siteTable"><div class="thing link self" data-author="op" data-url="/r/x/comments/1/t/">` +
    `<a class="title">Question title</a><time datetime="2026-09-01T09:00:00+00:00">1d</time><div class="usertext-body"><div class="md"><p>Body</p></div></div></div></div>` +
    `<div class="commentarea">${rc('dan', 'Answer', rc('eve', 'Follow-up'))}</div>`;
  await ctx.route('https://old.reddit.com/**', r => r.fulfill({ contentType: 'text/html', body: rd }));
  const rt = await ctx.newPage(); await rt.goto('https://old.reddit.com/r/x/comments/1/t/');
  const rTab = await sw.evaluate(async () => (await chrome.tabs.query({ url: 'https://old.reddit.com/*' }))[0].id);
  const rp = await ctx.newPage(); await rp.goto(`chrome-extension://${id}/popup.html?tabId=${rTab}`);
  await rp.waitForFunction(() => document.getElementById('md').value.length > 0);
  const rmd = await rp.inputValue('#md');
  assert.ok(rmd.includes('# Question title') && rmd.includes('**op** · 2026-09-01 09:00') && rmd.includes('**dan**') && rmd.includes('> **eve**'), 'reddit: ' + rmd);
  await rp.close(); await rt.close();
  // New Reddit (shreddit web components) — unknown elements behave as plain containers here.
  const sc = (a, d, text, kids = '') => `<shreddit-comment author="${a}" depth="${d}" permalink="/r/x/comments/1/t/${a}/"><time datetime="2026-09-01T10:00:00.000Z">1d</time>` +
    `<div slot="comment"><p>${text}</p></div>${kids}</shreddit-comment>`;
  const nr = `<!doctype html><title>Q : r/x</title><shreddit-post author="op" post-title="New title" created-timestamp="2026-09-01T09:00:00.000Z" content-href="https://www.reddit.com/r/x/comments/1/t/">` +
    `<div slot="text-body"><p>Body</p></div></shreddit-post>${sc('dan', 0, 'Answer', sc('eve', 1, 'Follow-up'))}`;
  await ctx.route('https://www.reddit.com/**', r => r.fulfill({ contentType: 'text/html', body: nr }));
  const nt = await ctx.newPage(); await nt.goto('https://www.reddit.com/r/x/comments/1/t/');
  const nTab = await sw.evaluate(async () => (await chrome.tabs.query({ url: 'https://www.reddit.com/*' }))[0].id);
  const np = await ctx.newPage(); await np.goto(`chrome-extension://${id}/popup.html?tabId=${nTab}`);
  await np.waitForFunction(() => document.getElementById('md').value.length > 0);
  const nmd = await np.inputValue('#md');
  assert.ok(nmd.includes('# New title') && nmd.includes('**op** · 2026-09-01 09:00') && /^\*\*dan\*\*/m.test(nmd) && nmd.includes('> **eve**')
    && (nmd.match(/Follow-up/g) || []).length === 1, 'new reddit: ' + nmd);
  await np.close(); await nt.close();
  // GitHub React issue view (data-testids as seen live on 2026-09-29).
  const gc = (a, n, text) => `<div data-testid="comment-viewer-outer-box-X${n}"><div data-testid="comment-header"><a href="/${a}">${a}</a>` +
    `<a href="/o/r/issues/1#issuecomment-${n}"><relative-time datetime="2026-09-01T10:00:00Z">1d</relative-time></a></div><div class="markdown-body"><p>${text}</p></div></div>`;
  const gh = `<!doctype html><title>Bug · Issue #1 · o/r</title><h1 data-testid="issue-title">Bug title</h1><div data-testid="issue-body">` +
    `<a data-testid="issue-body-header-author" href="/op">op</a><relative-time datetime="2026-09-01T09:00:00Z">x</relative-time><div class="markdown-body"><p>Steps</p></div></div>` +
    `${gc('dan', 7, 'Fixed')}<button data-testid="issue-timeline-load-more-load-top">Load more</button>`;
  await ctx.route('https://github.com/**', r => r.fulfill({ contentType: 'text/html', body: gh }));
  const gt = await ctx.newPage(); await gt.goto('https://github.com/o/r/issues/1');
  const gTab = await sw.evaluate(async () => (await chrome.tabs.query({ url: 'https://github.com/*' }))[0].id);
  const gp = await ctx.newPage(); await gp.goto(`chrome-extension://${id}/popup.html?tabId=${gTab}`);
  await gp.waitForFunction(() => document.getElementById('md').value.length > 0);
  const gmd = await gp.inputValue('#md');
  assert.ok(gmd.includes('# Bug title') && gmd.includes('**op** · 2026-09-01 09:00') &&
    gmd.includes('**dan** · 2026-09-01 10:00 · [link](https://github.com/o/r/issues/1#issuecomment-7)\n\nFixed'), 'github: ' + gmd);
  assert.match(await gp.textContent('#info'), /1 comments · some comments are collapsed/);
  await gp.close(); await gt.close();
  // Lobsters (markup as seen live on 2026-09-29).
  const lc = (a, id, text, kids = '') => `<li class="comments_subtree"><div class="comment" data-shortid="${id}"><div class="details"><div class="byline">` +
    `<a href="/~${a}"><img class="avatar"></a> <a href="/~${a}">${a}</a> <a href="/c/${id}"><time datetime="2026-09-28 12:07:46">x</time></a></div>` +
    `<div class="comment_text"><p>${text}</p></div></div></div>${kids ? `<ol class="comments">${kids}</ol>` : ''}</li>`;
  const lb = `<!doctype html><title>Story | Lobsters</title><ol class="stories"><li class="story"><div class="details"><span class="link"><a class="u-url" href="https://ex.example/p">Story</a></span>` +
    `<div class="byline"><a href="/~sub"><img class="avatar"></a> <a class="u-author" href="/~sub">sub</a></div></div></li></ol>` +
    `<ol class="comments"><li class="comments_subtree"><ol class="comments" id="story_comments">${lc('amy', 'a1', 'First', lc('ben', 'b2', 'Reply'))}</ol></li></ol>`;
  await ctx.route('https://lobste.rs/**', r => r.fulfill({ contentType: 'text/html', body: lb }));
  const lt = await ctx.newPage(); await lt.goto('https://lobste.rs/s/abc/story');
  const lTab = await sw.evaluate(async () => (await chrome.tabs.query({ url: 'https://lobste.rs/*' }))[0].id);
  const lp = await ctx.newPage(); await lp.goto(`chrome-extension://${id}/popup.html?tabId=${lTab}`);
  await lp.waitForFunction(() => document.getElementById('md').value.length > 0);
  const lmd = await lp.inputValue('#md');
  assert.ok(lmd.includes('[Story](https://ex.example/p) — sub') && lmd.includes('\n**amy** · 2026-09-28 12:07 · [link](https://lobste.rs/c/a1)') &&
    lmd.includes('\n> **ben**'), 'lobsters: ' + lmd);
  await lp.close(); await lt.close();
  await pop.setViewportSize({ width: 476, height: 360 }); await pop.check('#fm');
  await pop.screenshot({ path: path.join(os.tmpdir(), 'pm-popup.png') });
  console.log('plainmd e2e ok');
} finally { await ctx.close(); srv.close(); }
