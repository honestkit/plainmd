import { toMarkdown, frontMatter, fileName, applyTemplate, DEFAULT_TEMPLATE } from './convert.js';
const $ = id => document.getElementById(id);
function toast(msg) { const t = $('toast'); t.textContent = msg; t.style.display = 'block'; setTimeout(() => { t.style.display = 'none'; }, 1800); }
let page = null, template = DEFAULT_TEMPLATE;

function render() {
  const useSel = page.selectionHtml && $('sel').checked;
  const useThread = !useSel && page.thread && $('thr').checked;
  const body = toMarkdown(useSel ? page.selectionHtml : useThread ? page.thread.html : page.html);
  const title = useThread ? page.thread.title : page.title;
  $('md').value = applyTemplate(template, { frontmatter: $('fm').checked ? frontMatter({ ...page, title }) + '\n' : '',
    heading: useSel ? '' : `# ${title}\n\n`, title, url: page.url, author: page.byline, content: body });
  const words = body.split(/\s+/).filter(Boolean).length;
  $('info').textContent = `${words.toLocaleString()} words` + (useThread ? ` · thread, ${page.thread.comments} comments` +
    (page.thread.partial ? ' · some comments are collapsed on the page — expand them ("Load more"), then reopen' : '')
    : page.readable || useSel ? '' : ' · whole page (no article found)');
}

async function main() {
  // ?tabId= lets tests drive the popup against a specific tab.
  const forced = Number(new URLSearchParams(location.search).get('tabId'));
  const [tab] = forced ? [await chrome.tabs.get(forced)] : await chrome.tabs.query({ active: true, currentWindow: true });
  try {
    const res = await chrome.scripting.executeScript({ target: { tabId: tab.id }, files: ['vendor/Readability.js', 'threads.js', 'clip.js'] });
    page = res[0].result;
  } catch { page = null; }
  if (!page) { $('md').value = "Can't read this page (browser pages and the Web Store are off-limits to extensions)."; return; }
  $('selWrap').hidden = !page.selectionHtml;
  $('thrWrap').hidden = !page.thread;
  $('fm').onchange = $('sel').onchange = $('thr').onchange = render;
  try { template = (await chrome.storage.local.get('template')).template || DEFAULT_TEMPLATE; } catch {}
  $('tpl').value = template;
  render();
}
$('copy').onclick = async () => { await navigator.clipboard.writeText($('md').value); toast('Copied Markdown'); };
$('dl').onclick = () => {
  const a = Object.assign(document.createElement('a'), { href: URL.createObjectURL(new Blob([$('md').value], { type: 'text/markdown' })), download: fileName(page?.title) });
  a.click();
};
$('tplBtn').onclick = () => { $('tplBox').hidden = !$('tplBox').hidden; };
$('tplSave').onclick = async () => { template = $('tpl').value || DEFAULT_TEMPLATE; await chrome.storage.local.set({ template }); if (page) render(); toast('Template saved'); };
$('tplReset').onclick = async () => { template = $('tpl').value = DEFAULT_TEMPLATE; await chrome.storage.local.remove('template'); if (page) render(); toast('Template reset'); };
main();
