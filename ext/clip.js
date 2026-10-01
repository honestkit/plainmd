// Injected after vendor/Readability.js via chrome.scripting.executeScript({files}); last expression = result.
(() => {
  const sel = window.getSelection();
  let selectionHtml = '';
  if (sel && sel.rangeCount && !sel.isCollapsed) {
    const box = document.createElement('div');
    for (let i = 0; i < sel.rangeCount; i++) box.append(sel.getRangeAt(i).cloneContents());
    selectionHtml = box.innerHTML;
  }
  // Absolutise links/images so the Markdown works outside the page.
  const doc = document.cloneNode(true);
  // A clone has no shadow roots: copy visible tables rendered inside open shadow roots (e.g. MDN's browser-compat table) into their host.
  const live = document.querySelectorAll('*'), twin = doc.querySelectorAll('*');
  const shadowTables = r => [...r.querySelectorAll('table'), ...Array.from(r.querySelectorAll('*')).filter(x => x.shadowRoot).flatMap(x => shadowTables(x.shadowRoot))];
  // Pages rendered almost entirely by web components (caniuse.com): the light DOM holds next to no text, so copy the rendered
  // shadow content (display:none parts, styles and scripts left out). Ordinary pages never take this branch.
  const shadowLen = r => Array.from(r.children).reduce((n, x) => n + (x.getClientRects().length && x.tagName !== 'STYLE' ? (x.innerText || '').length : 0), 0) + // rendered text only
    Array.from(r.querySelectorAll('*')).filter(x => x.shadowRoot && x.getClientRects().length).reduce((n, x) => n + shadowLen(x.shadowRoot), 0);
  const flat = root => { const box = doc.createElement('div'); for (const n of root.childNodes) box.append(doc.importNode(n, true));
    const l = Array.from(root.querySelectorAll('*')), c = Array.from(box.querySelectorAll('*'));
    if (l.length === c.length) l.forEach((x, k) => { if (/^(STYLE|SCRIPT|LINK|TEMPLATE)$/.test(x.tagName) || getComputedStyle(x).display === 'none') c[k].remove();
      else if (x.shadowRoot) c[k].append(flat(x.shadowRoot)); });
    return box; };
  const hosts = Array.from(live).filter(e => e.shadowRoot && e.getClientRects().length);
  const mostlyShadow = hosts.reduce((n, e) => n + shadowLen(e.shadowRoot), 0) > 2 * (document.body?.innerText || '').length;
  if (live.length === twin.length) live.forEach((e, i) => { if (!e.shadowRoot) return;
    if (mostlyShadow) { twin[i].append(flat(e.shadowRoot)); return; }
    for (const t of shadowTables(e.shadowRoot)) { if (t.rows.length < 2 || !t.getClientRects().length) continue;
      // Component cells are built from buttons/icons/blocks: keep each cell's visible text on one line so the Markdown table stays a table.
      const copy = doc.createElement('table');
      for (const tr of t.rows) { const row = copy.insertRow();
        for (const c of tr.cells) { const tag = tr === t.rows[0] ? 'th' : c.tagName.toLowerCase(); const cell = doc.createElement(tag); if (c.rowSpan > 1) cell.rowSpan = c.rowSpan;
          cell.textContent = (c.innerText || '').replace(/\s+/g, ' ').trim(); row.append(cell);
          for (let k = 1; k < Math.min(c.colSpan, 50); k++) row.append(doc.createElement(tag)); } } // colspan -> empty cells (pipe tables have no spans)
      twin[i].append(copy); } });
  doc.querySelectorAll('a[href]').forEach(a => { try { a.setAttribute('href', new URL(a.getAttribute('href'), document.baseURI).href); } catch {} });
  // Drop icons/badges (declared < 32px) — they clutter Markdown (e.g. Wikipedia padlocks, flag icons).
  doc.querySelectorAll('img').forEach(i => { const w = Number(i.getAttribute('width')), h = Number(i.getAttribute('height'));
    if ((w && w < 32) || (h && h < 32)) (i.closest('a') && !i.closest('a').textContent.trim() ? i.closest('a') : i).remove(); });
  doc.querySelectorAll('img[src]').forEach(i => { try { i.setAttribute('src', new URL(i.getAttribute('src'), document.baseURI).href); } catch {} });
  // Readability drops link-heavy data tables (e.g. Wikipedia lists). Swap them for text placeholders, restore after.
  const tables = [];
  doc.querySelectorAll('table').forEach(t => {
    if (t.querySelector('table') || t.closest('table') !== t || t.rows.length < 2) return;
    if (/\b(navbox|infobox|sidebar|metadata|vertical-navbox)\b/.test(t.className)) return;
    // Filler grows with the table so Readability scores a big data table like the body text it stands for
    // (a page that is mostly one table used to lose it); the restore regex below strips the filler again.
    const filler = 'table cell, '.repeat(Math.min(400, Math.floor(t.textContent.length / 40)));
    const p = doc.createElement('p'); p.textContent = `PLAINMDTABLE${tables.length}PLAINMDTABLE placeholder text keeps this paragraph. ${filler}`;
    tables.push(t.outerHTML); t.replaceWith(p);
  });
  // Coverage repair (same logic as our article-extractor actor). Readability deletes every <aside> and, when a site cuts
  // the body into several blocks (BBC, Ars Technica), keeps only one of them.
  const words = t => (t || '').match(/[\p{L}\p{N}]+/gu)?.length || 0;
  const pWords = (el, sel) => [...el.querySelectorAll(sel)].reduce((n, x) => n + words(x.textContent), 0);
  // Prose callouts inside the article are content: aside -> div (sign-up boxes, link lists, promo cards stay asides).
  doc.querySelectorAll('article aside').forEach(el => {
    if (el.querySelector('form, input, button, aside, nav, :is(h1, h2, h3, h4, h5, h6) a, a :is(h1, h2, h3, h4, h5, h6)') || el.parentElement.closest('aside')) return;
    const w = pWords(el, 'p'); if (w < 40 || pWords(el, 'a') > w * 0.25) return;
    const div = doc.createElement('div'); div.append(...el.childNodes); el.replaceWith(div);
  });
  // Running text (paragraphs of 12+ words outside page chrome) grouped by parent element.
  const textBlocks = root => { const g = new Map();
    root.querySelectorAll('p').forEach(p => { if (p.closest('nav, footer, aside, form, figcaption')) return;
      const w = words(p.textContent); if (w >= 12) g.set(p.parentElement, (g.get(p.parentElement) || 0) + w); });
    return [...g].map(([el, w]) => ({ el, w })); };
  const topBlock = d => textBlocks(d).reduce((x, y) => (y.w > (x?.w || 0) ? y : x), null);
  // Move same tag+class text blocks of the main <article> into the first one; true if the document changed.
  const mergeBlocks = d => { const top = topBlock(d), host = top?.el.closest('article'), cls = top?.el.getAttribute('class')?.trim();
    if (!host || !cls) return false;
    const peers = textBlocks(d).filter(b => b.w >= 30 && b.el.nodeName === top.el.nodeName && b.el.getAttribute('class')?.trim() === cls && b.el.closest('article') === host)
      .map(b => b.el).filter((el, _, all) => !all.some(o => o !== el && o.contains(el)));
    if (peers.length < 2 || peers.length > 40) return false;
    peers.slice(1).forEach(el => { peers[0].append(...el.childNodes); el.remove(); }); return true; };
  const parse = d => { try { return new Readability(d.cloneNode(true), { keepClasses: true }).parse(); } catch { return null; } };
  let article = parse(doc);
  const host = topBlock(doc)?.el.closest('article');
  const expected = host ? textBlocks(host).reduce((n, b) => n + b.w, 0) : 0, got = words(article?.textContent);
  if (expected >= 150 && got < 0.7 * expected) {
    const merged = doc.cloneNode(true);
    if (mergeBlocks(merged)) { const again = parse(merged), n = words(again?.textContent);
      if (n > got && n <= expected * 1.5 + 200) article = again; }
  }
  if (article) article.content = article.content.replace(/<p[^>]*>\s*PLAINMDTABLE(\d+)PLAINMDTABLE[^<]*<\/p>|PLAINMDTABLE(\d+)PLAINMDTABLE[^<]*/g,
    (_, a, b) => tables[Number(a ?? b)] || '');
  // "Post title | Site name" -> "Post title" when the page's h1 confirms the prefix.
  let title = article?.title || document.title;
  const h1 = (document.querySelector('h1')?.textContent || '').trim();
  if (h1 && title.length > h1.length && title.startsWith(h1) && /^\s*[|\-–—:·]/.test(title.slice(h1.length))) title = h1;
  let thread = null;
  try { thread = self.plainmdThread?.() || null; } catch {}
  return { url: location.href, title, byline: article?.byline || '',
    html: article?.content || document.body.innerHTML, selectionHtml, readable: !!article, thread };
})();
