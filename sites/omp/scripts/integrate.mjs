import { execFileSync } from 'node:child_process';
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { dirname, posix, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import GithubSlugger from 'github-slugger';
import remarkGfm from 'remark-gfm';
import remarkParse from 'remark-parse';
import { unified } from 'unified';

const root = fileURLToPath(new URL('..', import.meta.url));
const manifest = JSON.parse(await readFile(resolve(root, 'source-manifest.json'), 'utf8'));
const args = process.argv.slice(2);
const partial = args.includes('--partial');
const [sourceRoot, draftRoot, ...rest] = args.filter((arg) => arg !== '--partial');
if (!sourceRoot || !draftRoot || rest.length) {
  throw new Error('Usage: node scripts/integrate.mjs <upstream checkout> <translation drafts> [--partial]');
}
const commit = execFileSync('git', ['-C', sourceRoot, 'rev-parse', 'HEAD'], { encoding: 'utf8' }).trim();
if (commit !== manifest.commit) throw new Error(`Unexpected upstream commit ${commit}`);

const parser = unified().use(remarkParse).use(remarkGfm);
const output = resolve(root, 'docs', manifest.version);
const targetFor = new Map();
const available = [];
const missing = [];
const errors = [];
const changes = [];
const unresolved = new Map();
const upstreamEntries = execFileSync('git', ['-C', sourceRoot, 'ls-tree', '-r', '-t', '-z', '--name-only', manifest.commit], {
  encoding: 'utf8', maxBuffer: 8_000_000,
}).split('\0').filter(Boolean);
const upstreamPaths = new Set(upstreamEntries);
const upstreamDirectories = new Set(upstreamEntries.map((path) => posix.dirname(path)));

function normalized(text) { return text.replace(/^\uFEFF/, '').replace(/\r\n/g, '\n'); }
function nodes(root, names) {
  const output = [];
  const visit = (node) => {
    if (names.includes(node.type)) output.push(node);
    for (const child of node.children ?? []) visit(child);
  };
  visit(root);
  return output;
}
function text(node) { return node.value ?? node.alt ?? (node.children ?? []).map(text).join(''); }
function stableList(list) { return [...list].sort(); }
function equals(a, b) { return JSON.stringify(a) === JSON.stringify(b); }
function offset(node, edge) { return node.position[edge].offset; }
function replaceRanges(input, ranges) {
  for (const { start, end, value } of [...ranges].sort((a, b) => b.start - a.start)) {
    input = input.slice(0, start) + value + input.slice(end);
  }
  return input;
}
function linkUrl(node) {
  if (node.type === 'link' && !node.children?.length) return null;
  return node.url ?? null;
}
function signature(tree) {
  const by = (types, fn) => nodes(tree, types).map(fn);
  return {
    headings: by(['heading'], (n) => n.depth),
    code: by(['code'], (n) => [n.lang, n.meta, n.value]),
    inline: stableList(by(['inlineCode'], (n) => n.value)),
    links: stableList(by(['link', 'definition', 'image'], linkUrl).filter(Boolean)),
    blocks: by(['heading', 'paragraph', 'code', 'html', 'list', 'listItem', 'blockquote', 'table', 'thematicBreak'], (n) => n.type),
    tables: by(['table'], (n) => n.children.map((row) => row.children.length)),
  };
}

for (const entry of manifest.pages) {
  if (!/^[a-z0-9-]+\.md$/.test(entry.target)) throw new Error(`Unexpected target ${entry.target}`);
  let draft;
  try { draft = normalized(await readFile(resolve(draftRoot, entry.target), 'utf8')); }
  catch (error) {
    if (error.code !== 'ENOENT') throw error;
    missing.push(entry.target);
    continue;
  }
  let source = normalized(await readFile(resolve(sourceRoot, entry.source), 'utf8'));
  // Bind the checked-out bytes, not only the Git checkout's branch label.
  const gitSource = normalized(execFileSync('git', ['-C', sourceRoot, 'show', `${manifest.commit}:${entry.source}`], { encoding: 'utf8', maxBuffer: 8_000_000 }));
  if (source !== gitSource) throw new Error(`Upstream worktree differs from the pinned blob: ${entry.source}`);
  if (entry.lines) source = source.split('\n').slice(entry.lines[0] - 1, entry.lines[1]).join('\n');
  const sourceAST = parser.parse(source);
  const draftAST = parser.parse(draft);
  const original = signature(sourceAST);
  const translated = signature(draftAST);
  for (const key of Object.keys(original)) {
    if (!equals(original[key], translated[key])) errors.push(`${entry.target}: ${key} differs from the source`);
  }
  if (!/\p{Script=Han}/u.test(draft)) errors.push(`${entry.target}: no translated Chinese text`);
  available.push({ ...entry, sourceAST, draftAST, draft });
  if (!entry.lines) targetFor.set(entry.source, entry.target);
}
if (!partial && missing.length) errors.push(`Missing translation drafts: ${missing.join(', ')}`);
if (errors.length) throw new Error(errors.join('\n'));

const github = `${manifest.upstream}/blob/${manifest.commit}`;
function rewriteLink(url, entry) {
  if (url.startsWith('#') || url.startsWith('//')) return url;
  let pathname;
  if (url.startsWith(`${manifest.upstream}/blob/`)) {
    const parts = url.slice(`${manifest.upstream}/blob/`.length).split('/');
    const ref = parts.shift();
    if (!['main', 'master', manifest.commit, manifest.version].includes(ref)) return url;
    pathname = parts.join('/');
  } else if (url.startsWith(`${manifest.upstream}/tree/`)) {
    const parts = url.slice(`${manifest.upstream}/tree/`.length).split('/');
    const ref = parts.shift();
    if (!['main', 'master', manifest.commit, manifest.version].includes(ref)) return url;
    return parts.length ? `${manifest.upstream}/tree/${manifest.commit}/${parts.join('/')}` : `${manifest.upstream}/tree/${manifest.commit}`;
  } else if (/^[a-z][a-z0-9+.-]*:/i.test(url)) return url;
  else if (url.startsWith('/')) return url;
  else if (/^~(?:\/?|$)/.test(url)) return url;
  else pathname = posix.normalize(posix.join(posix.dirname(entry.source), url));
  if (pathname === '..' || pathname.startsWith('../')) return url;
  const index = pathname.search(/[?#]/);
  const suffix = index === -1 ? '' : pathname.slice(index);
  const file = (index === -1 ? pathname : pathname.slice(0, index)).replace(/\/$/, '');
  const target = targetFor.get(file);
  if (target) return `./${target}${suffix}`;
  if (upstreamDirectories.has(file) || pathname.endsWith('/')) return `${manifest.upstream}/tree/${manifest.commit}/${file}${suffix}`;
  if (!upstreamPaths.has(file)) {
    const links = unresolved.get(entry.target) ?? new Set();
    links.add(url);
    unresolved.set(entry.target, links);
  }
  return `${github}/${file}${suffix}`;
}

function rewriteLinks(entry) {
  const ranges = [];
  for (const node of nodes(entry.draftAST, ['link', 'definition', 'image'])) {
    const url = linkUrl(node);
    if (!url) continue;
    if (node.type === 'image') throw new Error(`${entry.target}: each image needs an explicit source and license decision (${url})`);
    const value = rewriteLink(url, entry);
    if (url === value) continue;
    const start = offset(node, 'start');
    const end = offset(node, 'end');
    const raw = entry.draft.slice(start, end);
    if (node.type === 'link' || node.type === 'image') {
      const separator = raw.lastIndexOf('](');
      if (separator === -1) {
        if (raw !== url && raw !== `<${url}>`) throw new Error(`${entry.target}: cannot locate link destination ${url}`);
        ranges.push({ start, end, value: `[${url}](${value})` });
        changes.push([entry.target, url, value]);
        continue;
      }
      const at = raw.indexOf(url, separator + 2);
      if (at === -1) throw new Error(`${entry.target}: cannot explicitly locate destination ${url}`);
      ranges.push({ start: start + at, end: start + at + url.length, value });
    } else {
      const separator = raw.indexOf(']:');
      const at = raw.indexOf(url, separator + 2);
      if (separator === -1 || at === -1) throw new Error(`${entry.target}: cannot locate reference destination ${url}`);
      ranges.push({ start: start + at, end: start + at + url.length, value });
    }
    changes.push([entry.target, url, value]);
  }
  return replaceRanges(entry.draft, ranges);
}

function anchoredDraft(entry, draft) {
  const original = nodes(entry.sourceAST, ['heading']);
  const translated = nodes(parser.parse(draft), ['heading']);
  const slugger = new GithubSlugger();
  const ranges = translated.map((heading, i) => {
    const id = slugger.slug(text(original[i]));
    if (!id || /[\s{}]/.test(id)) throw new Error(`${entry.target}: unusable anchor ${id}`);
    const start = offset(heading, 'start');
    const end = offset(heading, 'end');
    const raw = draft.slice(start, end);
    const atx = /^\s{0,3}#{1,6}\s+([\s\S]*?)(?:\s+#+)?$/.exec(raw);
    if (!atx) throw new Error(`${entry.target}: expected an ATX heading`);
    const level = entry.lines && i === 0 ? 1 : heading.depth;
    return { start, end, value: `${'#'.repeat(level)} ${atx[1].trimEnd()} \\{#${id}}` };
  });
  return replaceRanges(draft, ranges);
}

await mkdir(output, { recursive: true });
for (const entry of available) {
  const rendered = anchoredDraft(entry, rewriteLinks(entry));
  const frontmatter = `---\ntitle: ${JSON.stringify(entry.title)}\ndescription: ${JSON.stringify(`Oh My Pi ${manifest.version} 仓库文档：${entry.title}。`)}\n---\n\n`;
  await writeFile(resolve(output, entry.target), frontmatter + rendered.trimEnd() + '\n', 'utf8');
}
const license = (await readFile(resolve(root, 'LICENSE'), 'utf8')).trimEnd();
await writeFile(resolve(output, 'license.md'), `---\ntitle: 上游 MIT 许可证\ndescription: Oh My Pi 上游版权和许可声明。\n---\n\n# 上游 MIT 许可证\n\n\`\`\`text\n${license}\n\`\`\`\n`);
const sidebar = [{ type: 'file', name: 'index', label: '概览' }];
let group;
for (const entry of available) {
  if (entry.group !== group) sidebar.push({ type: 'section-header', label: group = entry.group });
  sidebar.push({ type: 'file', name: entry.target.slice(0, -3), label: entry.title });
}
sidebar.push({ type: 'file', name: 'license', label: '上游 MIT 许可证' });
await writeFile(resolve(output, '_meta.json'), JSON.stringify(sidebar, null, 2) + '\n');
console.log(JSON.stringify({
  integrated: available.map((entry) => entry.target),
  missing,
  rewrittenLinks: changes.length,
  unresolvedUpstreamLinks: Object.fromEntries([...unresolved].map(([page, links]) => [page, [...links]])),
}, null, 2));
