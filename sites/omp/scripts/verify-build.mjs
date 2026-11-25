import { readFile, readdir } from 'node:fs/promises';
import { resolve, sep } from 'node:path';
import { fileURLToPath } from 'node:url';
import collection from '../../../collection.json' with { type: 'json' };

const root = fileURLToPath(new URL('..', import.meta.url));
const dist = resolve(root, 'doc_build');
const partial = process.argv.slice(2).includes('--partial');
const manifest = JSON.parse(await readFile(resolve(root, 'source-manifest.json'), 'utf8'));
const expected = manifest.pages.map((page) => page.target.slice(0, -3));
const notice = (await readFile(resolve(root, 'LICENSE'), 'utf8')).replaceAll('\r\n', '\n').trimEnd();
const readOutput = async (name) => (await readFile(resolve(dist, name), 'utf8')).replaceAll('\r\n', '\n');
const built = (await readdir(dist)).filter((file) => file.endsWith('.html')).map((file) => file.slice(0, -5));
const scopes = ['index', 'translation', ...expected];
const failures = [];
const unexpected = built.filter((name) => name !== '404' && !scopes.includes(name));
if (unexpected.length) failures.push(`Unexpected pages: ${unexpected.join(', ')}`);
const present = scopes.filter((name) => built.includes(name));
const absent = scopes.filter((name) => !built.includes(name));
if ((!partial && absent.length) || !present.includes('index') || !present.includes('translation')) {
  failures.push(`Missing pages: ${absent.join(', ')}`);
}

const pageHtml = new Map(await Promise.all(present.map(async (name) => [`${name}.html`, await readOutput(`${name}.html`)])));
const decode = (text) => text.replace(/&(quot|amp|lt|gt|apos|#\d+|#x[\da-f]+);/gi, (_, value) => {
  if (value.startsWith('#x')) return String.fromCodePoint(Number.parseInt(value.slice(2), 16));
  if (value.startsWith('#')) return String.fromCodePoint(Number.parseInt(value.slice(1), 10));
  return { quot: '"', amp: '&', lt: '<', gt: '>', apos: "'" }[value.toLowerCase()];
});
const whitespace = (s) => s.replace(/\s+/g, ' ').trim();
const hrefs = (html) => [...html.matchAll(/<a\b[^>]*?\shref="([^"]+)"[^>]*>/g)].map((match) => decode(match[1]));
const basename = (path) => !path || path.endsWith('/') ? `${path}index.html` : path;
const index = pageHtml.get('index.html') || '';
const sidebarLinks = new Set(hrefs(index));
const ids = new Map([...pageHtml].map(([name, html]) => [name, new Set([...html.matchAll(/\sid="([^"]+)"/g)].map((match) => decode(match[1])))]));
const internal = 'https://omp-docs.invalid';
const base = `${collection.base}omp/`;
const collectionEntrances = new Set([collection.base, ...collection.projects.map(({ id }) => `${collection.base}${id}/`)]);
const siblingIcons = new Set(collection.projects
  .filter(({ id, icon }) => id !== 'omp' && icon)
  .map(({ id, icon }) => `${collection.base}${id}/${icon}`));
let checkedLinks = 0;
let checkedImages = 0;

for (const name of present) {
  const html = pageHtml.get(`${name}.html`);
  if (!html.includes(notice)) failures.push(`${name}.html: missing full MIT notice`);
  if (name === 'translation') {
    const pre = /<pre\b[^>]*>([\s\S]*?)<\/pre>/.exec(html)?.[1] ?? '';
    if (whitespace(decode(pre.replace(/<[^>]+>/g, ''))) !== whitespace(notice)) failures.push(`${name}.html: visible text differs from the notice`);
  }
  if (name === 'index' && !/<meta(?=[^>]*http-equiv="refresh")(?=[^>]*content="0;url=\.\/install\.html")[^>]*>/.test(html)) {
    failures.push('index.html: missing redirect to the installation guide');
  }
  const markdown = await readOutput(`${name}.md`);
  if (!markdown.includes(notice)) failures.push(`${name}.md: missing full MIT notice`);
  if (html.includes('omp-translation-notice') || /^> \*\*(翻译说明|页面说明|许可说明)/m.test(markdown)) {
    failures.push(`${name}: an obsolete per-page translation notice is still present`);
  }
  const nav = /<header\b[^>]*>([\s\S]*?)<\/header>/.exec(html)?.[1] ?? '';
  if (!hrefs(nav).includes('https://omp.sh/docs')) failures.push(`${name}.html: missing official docs navigation`);
  if (name !== 'index' && !sidebarLinks.has(`${base}${name}.html`)) failures.push(`${name}.html: missing entry on the homepage`);
  for (const href of hrefs(html)) {
    const url = new URL(href, `${internal}${base}${name}.html`);
    if (url.origin !== internal) continue;
    if (!url.hash && collectionEntrances.has(url.pathname) && !url.pathname.startsWith(base)) continue;
    if (!url.pathname.startsWith(base)) {
      failures.push(`${name}.html: link escapes the site base: ${href}`);
      continue;
    }
    const path = basename(decodeURIComponent(url.pathname.slice(base.length)));
    const hash = url.hash && decodeURIComponent(url.hash.slice(1));
    if (!pageHtml.has(path)) failures.push(`${name}.html: link points to missing page ${href}`);
    else if (hash && !ids.get(path).has(hash)) failures.push(`${name}.html: link points to missing anchor ${href}`);
    checkedLinks++;
  }
  for (const match of html.matchAll(/<img\b[^>]*?\ssrc="([^"]+)"[^>]*>/g)) {
    const url = new URL(decode(match[1]), `${internal}${base}${name}.html`);
    // The collection verifier checks registered sibling icons in the combined output.
    if (url.origin === internal && siblingIcons.has(url.pathname)) continue;
    if (url.origin !== internal || !url.pathname.startsWith(base)) {
      failures.push(`${name}.html: image is not a local, site-scoped asset: ${match[1]}`);
      continue;
    }
    const target = resolve(dist, decodeURIComponent(url.pathname.slice(base.length)));
    if (!target.startsWith(dist + sep)) failures.push(`${name}.html: image path escapes the output folder: ${match[1]}`);
    else try { await readFile(target); } catch { failures.push(`${name}.html: image does not exist: ${match[1]}`); }
    checkedImages++;
  }
}
if (!(await readOutput('llms-full.txt')).includes(notice)) failures.push('llms-full.txt: missing full MIT notice');
if (failures.length) throw new Error([...new Set(failures)].join('\n'));
console.log(JSON.stringify({ verifiedPages: present.length, translatedPages: present.filter((name) => expected.includes(name)).length, missing: absent, checkedLinks, checkedImages }, null, 2));
