import { readdir, readFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { parse } from 'parse5';
import { base, defaultEntrance, marker, markerText, output, projects } from './collection.mjs';

if ((await readFile(resolve(output, marker), 'utf8')) !== markerText) throw new Error('Build the collection first.');

async function allFiles(dir, prefix = '') {
  const entries = await readdir(dir, { withFileTypes: true });
  const paths = await Promise.all(entries.map(async (entry) => {
    const path = `${prefix}${entry.name}`;
    if (entry.isDirectory()) return allFiles(resolve(dir, entry.name), `${path}/`);
    return entry.isFile() ? [path] : [];
  }));
  return paths.flat();
}

const files = new Set(await allFiles(output));
const pages = new Map();
const readOutput = (relativePath) => readFile(resolve(output, relativePath), 'utf8');

function analyze(html) {
  const references = [];
  const ids = new Set();
  let refresh;
  const stack = [parse(html)];
  while (stack.length) {
    const node = stack.pop();
    if (node.childNodes) stack.push(...node.childNodes);
    if (!node.attrs) continue;
    const props = Object.fromEntries(node.attrs.map(({ name, value }) => [name, value]));
    if (props.id) ids.add(props.id);
    if (node.tagName === 'meta' && props['http-equiv']?.toLowerCase() === 'refresh') refresh = props.content;
    if ((node.tagName === 'a' || node.tagName === 'link') && props.href) references.push([node.tagName, props.href]);
    if (['img', 'script', 'source'].includes(node.tagName) && props.src) references.push([node.tagName, props.src]);
  }
  return { references, ids, refresh };
}

for (const path of files) if (path.endsWith('.html')) pages.set(path, analyze(await readOutput(path)));
const errors = [];
let localReferences = 0;
let anchors = 0;
const images = new Set();
const origin = 'https://docs-collection.invalid';

for (const [path, { references }] of pages) {
  for (const [tag, reference] of references) {
    const url = new URL(reference, `${origin}${base}${path}`);
    if (url.origin !== origin) continue;
    localReferences++;
    if (!url.pathname.startsWith(base)) {
      errors.push(`${path}: ${reference} is outside ${base}`);
      continue;
    }
    const route = decodeURIComponent(url.pathname.slice(base.length));
    const target = files.has(route) ? route : `${route}${route && !route.endsWith('/') ? '/' : ''}index.html`;
    if (!files.has(target)) {
      errors.push(`${path}: missing target ${reference}`);
      continue;
    }
    if (tag === 'img') images.add(target);
    if (tag === 'a' && url.hash && pages.has(target)) {
      anchors++;
      const id = decodeURIComponent(url.hash.slice(1));
      if (!pages.get(target).ids.has(id)) errors.push(`${path}: missing anchor ${reference}`);
    }
  }
}

const entry = pages.get('index.html');
if (entry?.refresh !== `0;url=${defaultEntrance}` ||
    !entry.references.some(([tag, href]) => tag === 'a' && href === defaultEntrance)) {
  errors.push(`Collection root must open ${defaultEntrance} and include a fallback link.`);
}
if (files.has('portal.css')) errors.push('The old portal stylesheet is still in the build.');

const entrances = projects.map(({ id }) => `${base}${id}/`);
const counts = {};
for (const { id, license } of projects) {
  const prefix = `${id}/`;
  const home = pages.get(`${prefix}index.html`);
  if (!home) errors.push(`Missing collection entrance ${base}${prefix}`);
  else for (const entrance of entrances) {
    if (!home.references.some(([tag, href]) => tag === 'a' && href === entrance)) errors.push(`${id}: no link to ${entrance}`);
  }
  const productPages = [...pages.keys()].filter((path) => path.startsWith(prefix) && path !== `${prefix}404.html`);
  counts[id] = productPages.length;
  if (license !== 'MIT') continue;
  const licenseDoc = await readOutput(`${prefix}license.md`);
  const notice = licenseDoc.replaceAll('\r\n', '\n').match(/```text\n(MIT License[\s\S]*?)\n```/)?.[1];
  if (!notice) errors.push(`${id}: full MIT notice missing from license export`);
  else for (const page of productPages) {
    const markdown = await readOutput(page.replace(/\.html$/, '.md'));
    if (!markdown.replaceAll('\r\n', '\n').includes(notice)) errors.push(`${page}: Markdown export lost its MIT notice`);
  }
}

if (errors.length) throw new Error([...new Set(errors)].join('\n'));
console.log(JSON.stringify({ projects: counts, localReferences, anchors, imageAssets: images.size }, null, 2));
