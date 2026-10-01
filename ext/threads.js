// Discussion-thread extractors (Hacker News, GitHub issues/PRs, Reddit, Lobsters). Readability keeps only the top post on
// these pages; here each comment becomes "**author** · date" + body, replies nested as blockquotes.
// Injected before clip.js; defines self.plainmdThread() -> { title, html } or null when the page isn't a known thread.
self.plainmdThread = (() => {
  const esc = s => String(s || '').replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' })[c]);
  const abs = h => { try { return new URL(h, document.baseURI).href; } catch { return h; } };
  const cleanBody = el => {
    const c = el.cloneNode(true);
    c.querySelectorAll('.reply, script, style, button, [aria-hidden="true"]').forEach(n => n.remove());
    c.querySelectorAll('a[href]').forEach(a => a.setAttribute('href', abs(a.getAttribute('href'))));
    c.querySelectorAll('img[src]').forEach(i => i.setAttribute('src', abs(i.getAttribute('src'))));
    return c.innerHTML;
  };
  const when = t => (t || '').replace('T', ' ').replace(/(:\d\d)(\.\d+)?Z?$/, '$1').slice(0, 16);
  // Comment -> HTML; depth wraps it in blockquotes (capped so deep threads stay readable).
  const comment = ({ author, date, link, body, depth = 0 }) => {
    const head = `<p><strong>${esc(author || '[deleted]')}</strong>${date ? ' · ' + esc(when(date)) : ''}${link ? ` · <a href="${esc(link)}">link</a>` : ''}</p>`;
    const d = Math.min(depth, 5);
    return '<blockquote>'.repeat(d) + head + body + '</blockquote>'.repeat(d) + '<hr>';
  };
  // partial: the site collapsed or paginated some comments (the popup tells the user to expand them first).
  const out = (title, parts, count, partial = false) => parts.length ? { title, html: parts.join(''), comments: count, partial: !!partial } : null;

  function hackerNews() {
    if (!/(^|\.)news\.ycombinator\.com$/.test(location.hostname) || location.pathname !== '/item' || !document.querySelector('tr.athing')) return null;
    const story = document.querySelector('tr.athing.submission, table.fatitem tr.athing');
    const titleA = story?.querySelector('.titleline > a');
    const parts = [];
    if (story) {
      const sub = document.querySelector('.fatitem .subline, .fatitem .subtext');
      const by = sub?.querySelector('.hnuser')?.textContent, age = sub?.querySelector('.age')?.getAttribute('title');
      const top = document.querySelector('.fatitem .toptext');
      parts.push(`<p>${titleA ? `<a href="${esc(abs(titleA.getAttribute('href')))}">${esc(titleA.textContent)}</a>` : ''}` +
        `${by ? ` — ${esc(by)}` : ''}${age ? ' · ' + esc(when(age.split(' ')[0])) : ''}</p>${top ? cleanBody(top) : ''}<hr>`);
    }
    const rows = [...document.querySelectorAll('tr.athing.comtr')];
    for (const r of rows) {
      const text = r.querySelector('.commtext');
      if (!text) continue; // [dead]/[flagged] rows
      parts.push(comment({ author: r.querySelector('.hnuser')?.textContent, date: r.querySelector('.age')?.getAttribute('title')?.split(' ')[0],
        link: abs(`item?id=${r.id}`), body: cleanBody(text), depth: Number(r.querySelector('td.ind')?.getAttribute('indent') || 0) }));
    }
    const title = titleA?.textContent || document.title.replace(/ \| Hacker News$/, '');
    return out(title, parts, parts.length - (story ? 1 : 0), document.querySelector('a.morelink'));
  }

  function gitHub() {
    if (location.hostname !== 'github.com' || !/^\/[^/]+\/[^/]+\/(issues|pull|discussions)\/\d+/.test(location.pathname)) return null;
    const parts = [];
    const title = document.querySelector('[data-testid="issue-title"], .js-issue-title, .gh-header-title .markdown-title')?.textContent.trim();
    // New React issue view.
    const body = document.querySelector('[data-testid="issue-body"]');
    if (body) {
      const md = body.querySelector('.markdown-body');
      parts.push(comment({ author: body.querySelector('[data-testid="issue-body-header-author"]')?.textContent.trim(),
        date: body.querySelector('relative-time')?.getAttribute('datetime'), body: md ? cleanBody(md) : '' }));
    }
    const boxes = [...document.querySelectorAll('[data-testid^="comment-viewer-outer-box-"]')];
    for (const b of boxes) {
      const md = b.querySelector('.markdown-body'); if (!md) continue;
      const h = b.querySelector('[data-testid="comment-header"]');
      const a = [...(h?.querySelectorAll('a[href^="/"], a[href^="https://github.com/"]') || [])].find(x => x.textContent.trim() && !x.querySelector('relative-time'));
      const t = h?.querySelector('relative-time'); const link = (h?.querySelector('a[href*="#issuecomment-"]') || t?.closest('a'))?.getAttribute('href');
      parts.push(comment({ author: a?.textContent.trim(), date: t?.getAttribute('datetime'), link: link && abs(link), body: cleanBody(md) }));
    }
    // Classic server-rendered timeline (PRs, discussions, older views).
    if (!body) for (const c of document.querySelectorAll('.timeline-comment, .js-comment-container')) {
      const md = c.querySelector('.comment-body, .js-comment-body'); if (!md || c.parentElement?.closest('.timeline-comment, .js-comment-container')) continue;
      const t = c.querySelector('relative-time');
      parts.push(comment({ author: (c.querySelector('.author') || [...c.querySelectorAll('a[data-hovercard-type="user"]')].find(a => a.textContent.trim()))?.textContent.trim(), date: t?.getAttribute('datetime'), body: cleanBody(md) }));
    }
    return out(title || document.title.replace(/ by \S+ · (Pull Request|Issue|Discussion) #\d+ · .*$| · (Issue|Discussion) #\d+ · .*$/, ''), parts, parts.length - 1,
      document.querySelector('[data-testid^="issue-timeline-load-more"], .ajax-pagination-btn, .js-discussion .Details-content--hidden'));
  }

  function reddit() {
    if (!/(^|\.)reddit\.com$/.test(location.hostname) || !/\/comments\//.test(location.pathname)) return null;
    const parts = [];
    // New Reddit (shreddit web components).
    const post = document.querySelector('shreddit-post');
    if (post) {
      const text = post.querySelector('[slot="text-body"]');
      parts.push(comment({ author: post.getAttribute('author'), date: post.getAttribute('created-timestamp'),
        body: (post.getAttribute('content-href') && !post.getAttribute('content-href').includes('/comments/') ? `<p><a href="${esc(post.getAttribute('content-href'))}">${esc(post.getAttribute('content-href'))}</a></p>` : '') + (text ? cleanBody(text) : '') }));
      for (const c of document.querySelectorAll('shreddit-comment')) {
        const text = [...c.children].find(x => x.getAttribute('slot') === 'comment') || c.querySelector(':scope > [slot="comment"]');
        if (!text) continue;
        parts.push(comment({ author: c.getAttribute('author'), date: c.querySelector('time')?.getAttribute('datetime'),
          link: c.getAttribute('permalink') && abs(c.getAttribute('permalink')), body: cleanBody(text), depth: Number(c.getAttribute('depth') || 0) }));
      }
      return out(post.getAttribute('post-title') || document.title, parts, parts.length - 1, document.querySelector('faceplate-partial[loading="action"], shreddit-comment [slot="more-comments-permalink"]'));
    }
    // Old Reddit.
    const op = document.querySelector('#siteTable .thing.link');
    if (!op) return null;
    const opText = op.querySelector('.usertext-body .md');
    parts.push(comment({ author: op.dataset.author, date: op.querySelector('time')?.getAttribute('datetime'),
      body: (op.dataset.url && !op.dataset.url.startsWith('/r/') ? `<p><a href="${esc(abs(op.dataset.url))}">${esc(abs(op.dataset.url))}</a></p>` : '') + (opText ? cleanBody(opText) : '') }));
    for (const c of document.querySelectorAll('.commentarea .thing.comment')) {
      const text = c.querySelector(':scope > .entry .usertext-body .md'); if (!text) continue;
      let depth = 0; for (let p = c.parentElement; p; p = p.parentElement) if (p.classList?.contains('comment')) depth++;
      parts.push(comment({ author: c.dataset.author, date: c.querySelector(':scope > .entry time')?.getAttribute('datetime'),
        link: c.dataset.permalink && abs(c.dataset.permalink), body: cleanBody(text), depth }));
    }
    return out(op.querySelector('a.title')?.textContent || document.title, parts, parts.length - 1, document.querySelector('.commentarea .morecomments'));
  }

  function lobsters() {
    if (location.hostname !== 'lobste.rs' || !/^\/s\//.test(location.pathname)) return null;
    const parts = []; const story = document.querySelector('.story, li.story');
    const ta = story?.querySelector('.link a, a.u-url');
    if (story) {
      const st = document.querySelector('.story_text');
      const by = [...story.querySelectorAll('.byline a[href^="/~"]')].find(a => a.textContent.trim())?.textContent.trim();
      parts.push(`<p>${ta ? `<a href="${esc(abs(ta.getAttribute('href')))}">${esc(ta.textContent)}</a>` : ''}` +
        `${by ? ' — ' + esc(by) : ''}</p>${st ? cleanBody(st) : ''}<hr>`);
    }
    const cs = [...document.querySelectorAll('div.comment[data-shortid]')];
    const depthOf = c => { let d = 0; for (let p = c; p; p = p.parentElement) if (p.matches?.('ol.comments')) d++; return d; };
    const base = Math.min(...cs.map(depthOf)); let n = 0;
    for (const c of cs) {
      const text = c.querySelector(':scope > .details > .comment_text'); if (!text) continue;
      const by = c.querySelector(':scope > .details > .byline'); const t = by?.querySelector('time');
      parts.push(comment({ author: [...(by?.querySelectorAll('a[href^="/~"]') || [])].find(a => a.textContent.trim())?.textContent.trim(),
        date: t?.getAttribute('datetime'), link: abs(`/c/${c.dataset.shortid}`), body: cleanBody(text), depth: depthOf(c) - base })); n++;
    }
    return out(ta?.textContent || document.title.replace(/ \| Lobsters$/, ''), parts, n);
  }

  return () => { for (const f of [hackerNews, gitHub, reddit, lobsters]) { try { const r = f(); if (r) return r; } catch {} } return null; };
})();
