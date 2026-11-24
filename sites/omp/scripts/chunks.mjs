import { readFile, writeFile, mkdir } from 'node:fs/promises';
import { resolve } from 'node:path';
import remarkGfm from 'remark-gfm';
import remarkParse from 'remark-parse';
import { unified } from 'unified';

const parser = unified().use(remarkParse).use(remarkGfm);
const [mode, ...args] = process.argv.slice(2);
const markerFor = (i) => `<!-- OMP-CODE-${String(i + 1).padStart(4, '0')} -->`;
const offset = (node, edge) => node.position[edge].offset;
const eol = (text) => text.replace(/^\uFEFF/, '').replace(/\r\n/g, '\n');

function chunkStructure(text) {
  const headings = [];
  const inline = [];
  const links = [];
  const visit = (node) => {
    if (node.type === 'heading') headings.push(node.depth);
    if (node.type === 'inlineCode') inline.push(node.value);
    if (node.url) links.push(node.url);
    for (const child of node.children ?? []) visit(child);
  };
  visit(parser.parse(text));
  return {
    headings,
    inline: inline.sort(),
    links: links.sort(),
    // A part may start with continuation rows that parse as a paragraph in isolation.
    tableRows: text.split('\n').filter((line) => /^\s*\|/.test(line)).map((line) => [...line.matchAll(/(?<!\\)\|/g)].length),
    protectedCode: text.match(/<!-- OMP-CODE-\d+ -->/g) ?? [],
  };
}

async function checkedPart(workDir, translatedDir, file) {
  const source = eol(await readFile(resolve(workDir, file), 'utf8'));
  const rendered = eol(await readFile(resolve(translatedDir, file), 'utf8'));
  const original = chunkStructure(source);
  const translated = chunkStructure(rendered);
  const differences = Object.keys(original).filter((key) => JSON.stringify(original[key]) !== JSON.stringify(translated[key]));
  if (differences.length) throw new Error(`${file} changed: ${differences.join(', ')}`);
  return rendered;
}

if (mode === 'prepare' && args.length === 2) {
  const [sourceFile, workDir] = args;
  const source = eol(await readFile(sourceFile, 'utf8'));
  const code = [];
  const tree = parser.parse(source);
  const spans = [];
  const visit = (node) => {
    if (node.type === 'code') spans.push([offset(node, 'start'), offset(node, 'end')]);
    for (const child of node.children ?? []) visit(child);
  };
  visit(tree);
  const units = [];
  for (const node of tree.children) {
    if (node.type === 'table') {
      const rows = node.children;
      // The first unit includes the header and delimiter. Later units keep their row syntax.
      units.push([offset(node, 'start'), offset(rows[1] ?? rows[0], 'end')]);
      for (const row of rows.slice(2)) units.push([offset(row, 'start'), offset(row, 'end')]);
    } else units.push([offset(node, 'start'), offset(node, 'end')]);
  }
  if (!units.length) throw new Error('No translatable blocks found.');
  const parts = [];
  const budget = 15_000;
  let content = '';
  let previousEnd = 0;
  let separator = '';
  let spanIndex = 0;
  const finish = () => {
    if (!content) return;
    parts.push({ file: `part-${String(parts.length + 1).padStart(2, '0')}.md`, separator, content });
    content = '';
  };
  for (const [start, end] of units) {
    let block = '';
    let cursor = start;
    while (spanIndex < spans.length && spans[spanIndex][0] < end) {
      const [from, to] = spans[spanIndex++];
      if (from < start || to > end) throw new Error('A protected block crosses a translation unit boundary.');
      block += source.slice(cursor, from) + markerFor(code.length);
      cursor = to;
      code.push(source.slice(from, to));
    }
    block += source.slice(cursor, end);
    const gap = source.slice(previousEnd, start);
    if (content && content.length + gap.length + block.length > budget) finish();
    if (!content) {
      separator = gap;
      content = block;
    } else content += gap + block;
    previousEnd = end;
  }
  finish();
  await mkdir(workDir, { recursive: true });
  const chunkFiles = parts.map(({ file, separator }) => ({ file, separator }));
  // Refuse to overwrite intermediate files or previously translated parts by accident.
  for (const { file, content } of parts) await writeFile(resolve(workDir, file), `${content}\n`, { flag: 'wx' });
  await writeFile(resolve(workDir, 'chunks.json'), JSON.stringify({ files: chunkFiles, code, trailing: source.slice(previousEnd) }, null, 2) + '\n', { flag: 'wx' });
  console.log(`${parts.length} parts; ${code.length} protected code blocks.`);
} else if (mode === 'check' && args.length >= 2) {
  const [workDir, translatedDir, ...selected] = args;
  const { files } = JSON.parse(await readFile(resolve(workDir, 'chunks.json'), 'utf8'));
  const names = files.map((entry) => entry.file);
  const expected = selected.length ? selected : names;
  for (const file of expected) {
    if (!names.includes(file)) throw new Error(`Unknown translation chunk ${file}`);
    await checkedPart(workDir, translatedDir, file);
  }
  console.log(`Verified ${expected.length} translation chunks.`);
} else if (mode === 'assemble' && args.length === 3) {
  const [workDir, translatedDir, output] = args;
  const { files, code, trailing } = JSON.parse(await readFile(resolve(workDir, 'chunks.json'), 'utf8'));
  let rendered = '';
  for (const { file, separator } of files) {
    rendered += separator + (await checkedPart(workDir, translatedDir, file)).replace(/\n+$/, '');
  }
  let index = 0;
  rendered = rendered.replace(/<!-- OMP-CODE-\d+ -->/g, (marker) => {
    if (marker !== markerFor(index) || index >= code.length) throw new Error(`Unexpected code marker ${marker}`);
    return code[index++];
  });
  if (index !== code.length) throw new Error(`Only ${index} of ${code.length} code markers survived translation.`);
  await writeFile(output, rendered + trailing, { flag: 'wx' });
} else {
  throw new Error('Usage: chunks.mjs prepare <source.md> <scratch-dir> | check <scratch-dir> <translated-parts-dir> [parts...] | assemble <scratch-dir> <translated-parts-dir> <target.md>');
}
