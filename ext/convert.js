// HTML -> Markdown (runs in the popup, which has a DOM). Turndown + GFM (tables, strikethrough, task lists).
import TurndownService from './vendor/turndown.browser.es.js';
import { gfm } from './vendor/turndown-plugin-gfm.browser.es.js';

// Language hint from common conventions: language-x / lang-x (Prism, highlight.js), "brush: x" (MDN/SyntaxHighlighter),
// highlight-source-x (GitHub), data-lang / data-language.
export function codeLang(pre) {
  const code = pre.firstChild; const par = pre.parentElement;
  const attrs = [code?.getAttribute?.('class'), pre.getAttribute('class'), par?.getAttribute?.('class')].filter(Boolean).join(' ');
  const m = /(?:^|\s)(?:language|lang)-([\w+#-]+)/.exec(attrs) || /brush:\s*([\w+#-]+)/.exec(attrs) || /highlight-source-([\w+#-]+)/.exec(attrs);
  return (m?.[1] || code?.getAttribute?.('data-lang') || pre.getAttribute('data-lang') || pre.getAttribute('data-language') || '').toLowerCase();
}

// Tables Turndown would leave as raw HTML: layout tables (nested tables / role=presentation, e.g. Hacker News)
// become one paragraph per row; header-less data tables get their first row promoted so GFM can convert them.
export function tidyTables(html) {
  const doc = new DOMParser().parseFromString(`<body>${html}</body>`, 'text/html');
  const tables = [...doc.querySelectorAll('table')].reverse(); // innermost first
  for (const t of tables) {
    const noHead = !t.querySelector('th'), widths = new Set([...t.rows].map(r => r.cells.length));
    if (t.querySelector('table') || /^(presentation|none)$/.test(t.getAttribute('role') || '') || (noHead && widths.size > 1)) {
      const box = doc.createElement('div');
      for (const r of t.rows) {
        const p = doc.createElement('div');
        for (const c of r.cells) { if (!c.textContent.trim() && !c.querySelector('img')) continue; p.append(...c.childNodes, ' '); }
        if (p.textContent.trim()) box.append(p);
      }
      t.replaceWith(box);
    } else if (noHead && t.rows.length > 1) {
      for (const c of [...t.rows[0].cells]) { const th = doc.createElement('th'); th.append(...c.childNodes); c.replaceWith(th); }
    }
  }
  return doc.body.innerHTML;
}

export function toMarkdown(html) {
  const td = new TurndownService({ headingStyle: 'atx', codeBlockStyle: 'fenced', bulletListMarker: '-', emDelimiter: '*' });
  td.use(gfm);
  td.remove(['script', 'style', 'noscript', 'iframe', 'form', 'button']);
  // Keep the language hint of <pre><code class="language-x">.
  td.addRule('fencedLang', {
    filter: n => n.nodeName === 'PRE' && n.firstChild && n.firstChild.nodeName === 'CODE',
    replacement: (_, n) => {
      const lang = codeLang(n);
      return '\n\n```' + lang + '\n' + n.firstChild.textContent.replace(/\n$/, '') + '\n```\n\n';
    },
  });
  // Icon-only links (vote arrows, empty anchors) would become "[](url)" noise.
  td.addRule('emptyLink', { filter: n => n.nodeName === 'A' && !n.textContent.trim() && !n.querySelector('img'), replacement: () => '' });
  // "- item" instead of Turndown's padded "-   item".
  td.addRule('tightList', {
    filter: 'li',
    replacement: (content, node, opts) => {
      const parent = node.parentNode;
      let prefix = opts.bulletListMarker + ' ';
      if (parent.nodeName === 'OL') {
        const start = Number(parent.getAttribute('start') || 1);
        prefix = (start + Array.prototype.indexOf.call(parent.children, node)) + '. ';
      }
      content = content.replace(/^\n+/, '').replace(/\n+$/, '\n').replace(/\n/gm, '\n' + ' '.repeat(prefix.length));
      return prefix + content + (node.nextSibling && !/\n$/.test(content) ? '\n' : '');
    },
  });
  return td.turndown(tidyTables(html)).replace(/\n{3,}/g, '\n\n').trim();
}

export function frontMatter({ title, url, byline }, date = new Date()) {
  const q = s => JSON.stringify(String(s || ''));
  return ['---', `title: ${q(title)}`, `source: ${q(url)}`, byline ? `author: ${q(byline)}` : null,
    `clipped: ${date.toISOString().slice(0, 10)}`, '---', ''].filter(x => x !== null).join('\n');
}

// Output template (0.2). {{frontmatter}} and {{heading}} carry their own trailing blank line; unknown {{x}} left as-is.
export const DEFAULT_TEMPLATE = '{{frontmatter}}{{heading}}{{content}}\n';
export const TEMPLATE_VARS = ['frontmatter', 'heading', 'title', 'url', 'domain', 'author', 'date', 'time', 'content'];
export function applyTemplate(tpl, v, date = new Date()) {
  const pad = n => String(n).padStart(2, '0');
  let domain = ''; try { domain = new URL(v.url).hostname.replace(/^www\./, ''); } catch {}
  const vars = { ...v, domain, author: v.author || '', date: date.toISOString().slice(0, 10),
    time: `${pad(date.getHours())}:${pad(date.getMinutes())}` };
  return (tpl || DEFAULT_TEMPLATE).replace(/\{\{(\w+)\}\}/g, (m, k) => (k in vars && TEMPLATE_VARS.includes(k) ? String(vars[k] ?? '') : m));
}

export function fileName(title) {
  return (title || 'page').replace(/[\\/:*?"<>|#\x00-\x1f]+/g, ' ').replace(/\s+/g, ' ').trim().slice(0, 80) + '.md';
}
