import { spawnSync } from 'node:child_process';
import { cp, lstat, mkdtemp, readFile, rename, rm, writeFile } from 'node:fs/promises';
import { basename, dirname, resolve } from 'node:path';
import { base, defaultEntrance, marker, markerText, name, output, projects, root } from './collection.mjs';

const tempPrefix = '.collection-build-';
const npm = process.env.npm_execpath;
if (!npm) throw new Error('Run this build with npm run build.');

function runProduct(script, id) {
  const result = spawnSync(process.execPath, [npm, 'run', script, '--workspace', `./sites/${id}`], {
    cwd: root,
    stdio: 'inherit',
  });
  if (result.error) throw result.error;
  if (result.status !== 0) throw new Error(`${id}: ${script} failed (${result.status ?? result.signal})`);
}

const escape = (value) => String(value).replace(/[&<>"']/g, (char) => ({
  '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;',
}[char]));

function redirectDocument() {
  return `<!doctype html>
<html lang="zh-CN">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <title>${escape(name)}</title>
  <meta http-equiv="refresh" content="0;url=${defaultEntrance}">
  <link rel="canonical" href="${defaultEntrance}">
</head>
<body>
  <a href="${defaultEntrance}">打开默认文档</a>
</body>
</html>
`;
}

async function replaceOutput(stage) {
  if (dirname(output) !== root || basename(output) !== 'doc_build' || dirname(stage) !== root ||
      !basename(stage).startsWith(tempPrefix)) throw new Error('Unexpected collection output paths.');
  const old = await lstat(output).catch((error) => {
    if (error.code === 'ENOENT') return null;
    throw error;
  });
  if (old) {
    if (!old.isDirectory() || (await readFile(resolve(output, marker), 'utf8')) !== markerText) {
      throw new Error(`Refusing to replace a directory not owned by this build: ${output}`);
    }
    await rm(output, { recursive: true });
  }
  await rename(stage, output);
}

const stage = await mkdtemp(resolve(root, tempPrefix));
try {
  for (const { id } of projects) {
    runProduct('build', id);
    const productOutput = resolve(stage, id);
    await cp(resolve(root, 'sites', id, 'doc_build'), productOutput, { recursive: true });
    // Rspress links to a Markdown alternate on its generated 404 page.
    await writeFile(resolve(productOutput, '404.md'), '# 页面不存在\n\n[返回项目文档](./)。\n', { flag: 'wx' })
      .catch((error) => { if (error.code !== 'EEXIST') throw error; });
  }
  await writeFile(resolve(stage, 'index.html'), redirectDocument());
  await writeFile(resolve(stage, marker), markerText);
  await replaceOutput(stage);
} finally {
  if (dirname(stage) === root && basename(stage).startsWith(tempPrefix)) {
    await rm(stage, { recursive: true, force: true });
  }
}
console.log(`Collection built: ${output} (base ${base})`);
