import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { spawnSync } from 'node:child_process';
import { cp, mkdir, mkdtemp, readFile, rm, symlink, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { test } from 'node:test';
import { splitFrontmatter, translatedFrontmatter, pageFrontmatter } from './frontmatter.mjs';
import { applySourceFormatPatches } from './source-format.mjs';
import remarkGfm from 'remark-gfm';
import remarkParse from 'remark-parse';
import { unified } from 'unified';

const scripts = dirname(fileURLToPath(import.meta.url));
const source = '---\nname: authoring-hooks\ndescription: Use when creating hooks.\n---\n\n# Authoring Hooks\n\nSee [reference](../reference.md#reference).\n\n[Legacy self link](#legacy-hooks).\n\n```ts\nconst name = "hook";\n```\n';
const draft = '---\nname: authoring-hooks\ndescription: 创建钩子时使用，涵盖 API 与事件。\n---\n\n# 编写钩子\n\n参见[参考](../reference.md#reference)。\n\n[旧版自引用](#legacy-hooks)。\n\n```ts\nconst name = "hook";\n```\n';

test('splits YAML without treating metadata as a Markdown setext heading', () => {
  const document = splitFrontmatter('\uFEFF' + draft.replaceAll('\n', '\r\n'));
  assert.equal(document.metadata.name, 'authoring-hooks');
  assert.ok(document.body.startsWith('\n# 编写钩子'));
  assert.ok(!document.body.includes('description:'));
  assert.deepEqual(translatedFrontmatter(splitFrontmatter(source), document, 'hooks'), document.metadata);
  const rendered = splitFrontmatter(pageFrontmatter(document.metadata, '编写钩子') + document.body);
  assert.equal(rendered.metadata.description, document.metadata.description);
  assert.equal(rendered.metadata.name, 'authoring-hooks');
  assert.equal(rendered.metadata.title, '编写钩子');
});

test('keeps ordinary Markdown and real setext headings outside metadata', () => {
  const plain = 'Title\n=====\n\nBody\n';
  assert.equal(splitFrontmatter(plain).body, plain);
  assert.equal(splitFrontmatter('---\nname: hook\ndescription: test\n---\n' + plain).body, plain);
  assert.equal(splitFrontmatter(plain).hasFrontmatter, false);
});

test('rejects changed identifiers, fields, untranslated or dropped descriptions', () => {
  const original = splitFrontmatter(source);
  for (const changed of [
    draft.replace('name: authoring-hooks', 'name: changed'),
    draft.replace('name: authoring-hooks\n', ''),
    draft.replace('description:', 'summary:'),
    draft.replace('创建钩子时使用，涵盖 API 与事件。', 'Use when creating hooks.'),
    draft.replace('创建钩子时使用，涵盖 API 与事件。', ''),
    draft.replace('---\n\n#', 'extra: value\n---\n\n#'),
    splitFrontmatter(draft).body,
  ]) assert.throws(() => translatedFrontmatter(original, splitFrontmatter(changed), 'hooks'), /frontmatter/);
  assert.throws(() => translatedFrontmatter(splitFrontmatter('# No metadata'), splitFrontmatter(draft), 'extra'), /presence/);
});

test('rejects invalid, duplicate-key, executable-tag and cyclic YAML safely', () => {
  for (const invalid of [
    '---\nname: x\n',
    '---\nname: [\n---\n# Body',
    '---\nname: first\nname: second\n---\n# Body',
    '---\nname: !!js/function "function () { throw 1; }"\n---\n# Body',
    '---\nname: &a [*a]\n---\n# Body',
    '---\nconstructor: bad\n---\n# Body',
    '---\n- one\n- two\n---\n# Body',
  ]) assert.throws(() => splitFrontmatter(invalid), /frontmatter/);
  assert.equal(splitFrontmatter('---js\nthrow 1\n---\n# Body').hasFrontmatter, false);
});

function run(command, args, cwd) {
  const result = spawnSync(command, args, { cwd, encoding: 'utf8' });
  if (result.error) throw result.error;
  return result;
}

async function fixture(callback) {
  const dir = await mkdtemp(join(tmpdir(), 'omp-frontmatter-test-'));
  try {
    const site = join(dir, 'site');
    const upstream = join(dir, 'upstream');
    const drafts = join(dir, 'drafts');
    await mkdir(join(site, 'scripts'), { recursive: true });
    await mkdir(join(upstream, 'docs', 'skills'), { recursive: true });
    await mkdir(join(upstream, 'metadata'), { recursive: true });
    await mkdir(join(drafts, 'skills'), { recursive: true });
    await cp(join(scripts, 'integrate.mjs'), join(site, 'scripts', 'integrate.mjs'));
    await cp(join(scripts, 'frontmatter.mjs'), join(site, 'scripts', 'frontmatter.mjs'));
    await cp(join(scripts, 'source-format.mjs'), join(site, 'scripts', 'source-format.mjs'));
    await symlink(resolve(scripts, '../../../node_modules'), join(site, 'node_modules'), 'junction');
    const sources = { 'docs/skills/hooks.md': source, 'docs/reference.md': '# Reference\n\nPlain body.\n' };
    for (const [path, content] of Object.entries(sources)) await writeFile(join(upstream, path), content);
    await writeFile(join(drafts, 'skills/hooks.md'), draft);
    await writeFile(join(drafts, 'reference.md'), '# 参考\n\n普通正文。\n');
    const tree = Object.entries(sources).map(([path, content]) => ({ path, type: 'blob', sha: createHash('sha1').update(`blob ${Buffer.byteLength(content)}\0`).update(content).digest('hex') }));
    const manifest = { upstream: 'https://github.com/example/docs', version: 'main-fixture', commit: 'fixed-fixture-sha', treeSha: 'fixed-tree', pages: [
      { source: 'docs/skills/hooks.md', target: 'skills/hooks.md', title: '编写钩子', anchorAliases: { 'authoring-hooks': ['legacy-hooks'] } },
      { source: 'docs/reference.md', target: 'reference.md', title: '参考' },
    ] };
    await writeFile(join(upstream, 'metadata/git-tree.json'), JSON.stringify({ sha: 'fixed-tree', tree, truncated: false }));
    await writeFile(join(upstream, 'metadata/commit.json'), JSON.stringify({ sha: manifest.commit, commit: { tree: { sha: 'fixed-tree' } } }));
    const saveManifest = () => writeFile(join(site, 'source-manifest.json'), JSON.stringify(manifest));
    await saveManifest();
    const integrate = (...flags) => run(process.execPath, [join(site, 'scripts/integrate.mjs'), upstream, drafts, ...flags], site);
    await callback({ dir, site, upstream, drafts, manifest, saveManifest, integrate });
  } finally {
    // Only remove the known mkdtemp fixture, never the real site or linked dependencies.
    assert.equal(dirname(dir), resolve(tmpdir()));
    assert.ok(dir.startsWith(join(tmpdir(), 'omp-frontmatter-test-')));
    await rm(dir, { recursive: true, force: true });
  }
}

test('snapshot CLI retains YAML, nested links, code, anchors, no-YAML and summary/partial behavior', async () => {
  await fixture(async ({ site, drafts, manifest, saveManifest, integrate }) => {
    manifest.pages.push({ source: 'docs/not-yet.md', target: 'not-yet.md', title: '尚未翻译' });
    await saveManifest();
    let result = integrate('--snapshot', '--partial', '--summary');
    assert.equal(result.status, 0, result.stderr);
    const summary = JSON.parse(result.stdout);
    assert.equal(summary.integrated, 2);
    assert.equal(summary.missing, 1);
    assert.equal(summary.rewrittenLinks, 1); // Normalize the legacy self-reference; the relative file link is already correct.
    const output = await readFile(join(site, 'docs/main-fixture/skills/hooks.md'), 'utf8');
    const parsed = splitFrontmatter(output);
    assert.equal(parsed.metadata.name, 'authoring-hooks');
    assert.equal(parsed.metadata.description, '创建钩子时使用，涵盖 API 与事件。');
    assert.equal(parsed.metadata.title, '编写钩子');
    assert.match(parsed.body, /# 编写钩子 \\\{#authoring-hooks\}/);
    assert.ok(parsed.body.includes('<a id="legacy-hooks"></a>'));
    assert.ok(parsed.body.includes('[旧版自引用](#authoring-hooks)'));
    assert.match(parsed.body, /\.\.\/reference\.md#reference/);
    assert.match(parsed.body, /```ts\nconst name = "hook";\n```/);
    assert.ok(!parsed.body.includes('description:'));
    const plain = splitFrontmatter(await readFile(join(site, 'docs/main-fixture/reference.md'), 'utf8'));
    assert.equal(plain.metadata.description, 'Oh My Pi 官方仓库文档：参考。');
    result = integrate('--snapshot', '--summary');
    assert.notEqual(result.status, 0);
    assert.match(result.stderr, /Missing translation drafts/);
    await writeFile(join(drafts, 'skills/hooks.md'), draft.replace('authoring-hooks', 'other-id'));
    result = integrate('--snapshot', '--partial');
    assert.notEqual(result.status, 0);
    assert.match(result.stderr, /frontmatter identifier name differs/);
  });
});

test('rejects unsafe, duplicate and unknown compatibility anchors', async () => {
  await fixture(async ({ manifest, saveManifest, integrate }) => {
    for (const aliases of [
      { missing: ['legacy'] },
      { 'authoring-hooks': ['authoring-hooks'] },
      { 'authoring-hooks': ['legacy', 'legacy'] },
      { 'authoring-hooks': ['bad" onclick="bad'] },
    ]) {
      manifest.pages[0].anchorAliases = aliases;
      await saveManifest();
      const result = integrate('--snapshot');
      assert.notEqual(result.status, 0);
      assert.match(result.stderr, /anchor alias/);
    }
  });
});

test('a real Setext body heading keeps the existing explicit ATX rejection', async () => {
  await fixture(async ({ drafts, integrate }) => {
    await writeFile(join(drafts, 'skills/hooks.md'), draft.replace('# 编写钩子', '编写钩子\n========'));
    const result = integrate('--snapshot');
    assert.notEqual(result.status, 0);
    assert.match(result.stderr, /expected an ATX heading/);
    assert.doesNotMatch(result.stderr, /frontmatter.*differs/);
  });
});

const malformedSpan = '`<name> is a session tool command and cannot run in a PTY; run it without \\`pty\\`.`';
const delimiterPatch = { kind: 'inline-code-delimiter', from: malformedSpan, to: '`' + malformedSpan + '`', count: 1, reason: 'Widen delimiters around literal backticks so following prose is not parsed as code.' };

test('source format adapter permits only exact, documented single-to-double delimiter widening', () => {
  const original = 'Before ' + malformedSpan + ' after.';
  assert.equal(applySourceFormatPatches(original, {}), original);
  assert.equal(applySourceFormatPatches(original, { sourceFormatPatches: [] }), original);
  assert.equal(applySourceFormatPatches(original, { sourceFormatPatches: [delimiterPatch] }), 'Before ' + delimiterPatch.to + ' after.');
  for (const patch of [
    { ...delimiterPatch, kind: 'replace' },
    { ...delimiterPatch, to: delimiterPatch.to.replace('PTY', 'shell') },
    { ...delimiterPatch, to: malformedSpan },
    { ...delimiterPatch, to: '``' + malformedSpan + '``' },
    { ...delimiterPatch, count: 0 },
    { ...delimiterPatch, count: 2 },
    { ...delimiterPatch, count: '1' },
    { ...delimiterPatch, reason: '' },
    { ...delimiterPatch, from: delimiterPatch.to, to: '`' + delimiterPatch.to + '`' },
    { ...delimiterPatch, from: 'plain', to: '`plain`' },
    { ...delimiterPatch, extra: 'arbitrary replacement' },
  ]) assert.throws(() => applySourceFormatPatches(original, { sourceFormatPatches: [patch] }), /source format patch/);
  for (const input of ['', original + original, '`' + malformedSpan + '`']) {
    assert.throws(() => applySourceFormatPatches(input, { sourceFormatPatches: [delimiterPatch] }), /source format patch/);
  }
  assert.throws(() => applySourceFormatPatches(original, { sourceFormatPatches: [delimiterPatch, delimiterPatch] }), /overlap/);
  assert.throws(() => applySourceFormatPatches(original, { sourceFormatPatches: {} }), /must be an array/);
});

test('malformed English source integrates a fully translated tail without weakening code protection or blob checks', async () => {
  await fixture(async ({ site, upstream, drafts, manifest, saveManifest, integrate }) => {
    const english = '# Bash\n\nThe tool refuses it (' + malformedSpan + '). A line made only of commands joined by `;` passes approval. Images are decoded.\n';
    const chinese = '# Shell 工具\n\n工具拒绝此调用（' + delimiterPatch.to + '）。仅由命令组成、通过 `;` 连接的行可通过审批。图像将被解码。\n';
    await mkdir(join(upstream, 'docs/tools'), { recursive: true });
    await mkdir(join(drafts, 'tools'), { recursive: true });
    await writeFile(join(upstream, 'docs/tools/bash.md'), english);
    await writeFile(join(drafts, 'tools/bash.md'), chinese);
    const treePath = join(upstream, 'metadata/git-tree.json');
    const tree = JSON.parse(await readFile(treePath, 'utf8'));
    tree.tree.push({ path: 'docs/tools/bash.md', type: 'blob', sha: createHash('sha1').update(`blob ${Buffer.byteLength(english)}\0`).update(english).digest('hex') });
    await writeFile(treePath, JSON.stringify(tree));
    const entry = { source: 'docs/tools/bash.md', target: 'tools/bash.md', title: 'Shell 工具', sourceSha256: createHash('sha256').update(english).digest('hex') };
    manifest.pages.push(entry);
    await saveManifest();
    let result = integrate('--snapshot', '--summary');
    assert.notEqual(result.status, 0);
    assert.match(result.stderr, /inline differs from the source/);
    entry.sourceFormatPatches = [delimiterPatch];
    await saveManifest();
    result = integrate('--snapshot', '--summary');
    assert.equal(result.status, 0, result.stderr);
    const output = splitFrontmatter(await readFile(join(site, 'docs/main-fixture/tools/bash.md'), 'utf8')).body;
    assert.ok(output.includes(delimiterPatch.to));
    assert.ok(output.includes('仅由命令组成、通过 `;` 连接的行可通过审批。图像将被解码。'));
    assert.ok(!output.includes('A line made only'));
    assert.equal(await readFile(join(upstream, 'docs/tools/bash.md'), 'utf8'), english);
    // Internal characters remain protected by the existing AST signature, not this adapter.
    await writeFile(join(drafts, 'tools/bash.md'), chinese.replace('PTY', 'shell'));
    result = integrate('--snapshot');
    assert.notEqual(result.status, 0);
    assert.match(result.stderr, /inline differs from the source/);
    await writeFile(join(drafts, 'tools/bash.md'), chinese);
    await writeFile(join(upstream, 'docs/tools/bash.md'), english + '\nChanged source.');
    result = integrate('--snapshot');
    assert.notEqual(result.status, 0);
    assert.match(result.stderr, /Source bytes differ from the pinned Git blob/);
  });
});

// Exact malformed spans from the fixed docs/tools/grep.md, lines 168 and 171.
const grepSpans = [
  '`Cannot search external URL: ... Use \\`read\\` to fetch web content, then search the returned text.`',
  '`(\\`path\\` list entries must each exist relative to cwd)`',
  '`Path not found: ...; list each target in the semicolon-delimited \\`path\\``',
];
const grepPatches = grepSpans.map((from, i) => ({
  kind: 'inline-code-delimiter', from,
  to: i === 2 ? '`` ' + from.slice(1, -1) + ' ``' : '`' + from + '`',
  count: 1, reason: 'Preserve literal nested backticks and allow surrounding prose to be translated.',
}));

test('all three real grep spans preserve their exact CommonMark inline-code values', () => {
  const parser = unified().use(remarkParse).use(remarkGfm);
  for (const patch of grepPatches) {
    const result = applySourceFormatPatches(patch.from, { sourceFormatPatches: [patch] });
    const tree = parser.parse(result);
    assert.equal(tree.children.length, 1);
    assert.equal(tree.children[0].type, 'paragraph');
    assert.equal(tree.children[0].children.length, 1);
    const code = tree.children[0].children[0];
    assert.equal(code.type, 'inlineCode');
    assert.equal(code.value, patch.from.slice(1, -1));
  }
  const boundary = grepPatches[2];
  for (const changed of [
    { ...boundary, to: '`' + boundary.from + '`' }, // No padding makes three closing backticks.
    { ...boundary, to: boundary.to.replace('semicolon', 'comma') },
    { ...boundary, to: boundary.to.replace('`` ', '``  ') },
    { ...boundary, count: 2 },
    { ...boundary, count: 0 },
    { ...boundary, from: boundary.to, to: '`' + boundary.to + '`' },
  ]) assert.throws(() => applySourceFormatPatches(boundary.from, { sourceFormatPatches: [changed] }), /source format patch/);
  for (const patch of grepPatches.slice(0, 2)) {
    assert.throws(() => applySourceFormatPatches(patch.from, { sourceFormatPatches: [{ ...patch, to: '`` ' + patch.from.slice(1, -1) + ' ``' }] }), /only add one backtick/);
  }
  assert.throws(() => applySourceFormatPatches(boundary.from + boundary.from, { sourceFormatPatches: [boundary] }), /found 2/);
  assert.throws(() => applySourceFormatPatches('no span', { sourceFormatPatches: [boundary] }), /found 0/);
});

test('the three grep format patches allow fully Chinese surrounding error descriptions in an isolated integration', async () => {
  await fixture(async ({ site, upstream, drafts, manifest, saveManifest, integrate }) => {
    const english = '# Grep\n\n- ' + grepSpans[0] + ' for non-fetchable external URL schemes or declined fetches.\n- Multi-path calls append the hint ' + grepSpans[1] + ', or ' + grepSpans[2] + ' when every multi-path filesystem entry is missing.\n';
    const chinese = '# 内容搜索\n\n- 对于无法抓取的外部 URL 协议或被拒绝的抓取，返回 ' + grepPatches[0].to + '。\n- 多路径调用会追加提示 ' + grepPatches[1].to + '；当多路径调用的所有文件系统条目均不存在时，返回 ' + grepPatches[2].to + '。\n';
    await mkdir(join(upstream, 'docs/tools'), { recursive: true });
    await mkdir(join(drafts, 'tools'), { recursive: true });
    await writeFile(join(upstream, 'docs/tools/grep.md'), english);
    await writeFile(join(drafts, 'tools/grep.md'), chinese);
    const treePath = join(upstream, 'metadata/git-tree.json');
    const tree = JSON.parse(await readFile(treePath, 'utf8'));
    tree.tree.push({ path: 'docs/tools/grep.md', type: 'blob', sha: createHash('sha1').update(`blob ${Buffer.byteLength(english)}\0`).update(english).digest('hex') });
    await writeFile(treePath, JSON.stringify(tree));
    manifest.pages.push({ source: 'docs/tools/grep.md', target: 'tools/grep.md', title: '内容搜索', sourceFormatPatches: grepPatches });
    await saveManifest();
    const result = integrate('--snapshot', '--summary');
    assert.equal(result.status, 0, result.stderr);
    const output = splitFrontmatter(await readFile(join(site, 'docs/main-fixture/tools/grep.md'), 'utf8')).body;
    for (const patch of grepPatches) assert.ok(output.includes(patch.to));
    assert.ok(output.includes('当多路径调用的所有文件系统条目均不存在时，返回'));
    assert.ok(!output.includes('when every multi-path'));
    assert.equal(await readFile(join(upstream, 'docs/tools/grep.md'), 'utf8'), english);
  });
});

test('Git checkout CLI still validates pinned blobs and metadata', async () => {
  await fixture(async ({ upstream, manifest, saveManifest, integrate }) => {
    for (const args of [ ['init', '-q'], ['add', 'docs'], ['-c', 'user.name=Fixture', '-c', 'user.email=fixture@example.invalid', 'commit', '-qm', 'fixture'] ]) {
      const result = run('git', args, upstream);
      assert.equal(result.status, 0, result.stderr);
    }
    const result = run('git', ['rev-parse', 'HEAD'], upstream);
    assert.equal(result.status, 0, result.stderr);
    manifest.commit = result.stdout.trim();
    await saveManifest();
    const integrated = integrate('--summary');
    assert.equal(integrated.status, 0, integrated.stderr);
    assert.equal(JSON.parse(integrated.stdout).integrated, 2);
  });
});
