import { readFile, writeFile } from 'node:fs/promises';
import { posix, resolve } from 'node:path';
import { defineConfig } from '@rspress/core';
import collection from '../../collection.json';

const title = collection.projects.find(({ id }) => id === 'pi')!.label;
const versions = ['v1.6.0'];
const markdownExports = new Map<string, string[]>();

export default defineConfig({
  root: 'docs',
  title,
  description: 'Pi 的文档、指南与参考资料。',
  logo: '/pi-logo.svg',
  logoText: title,
  icon: '/pi-icon.svg',
  plugins: [
    {
      name: 'pi:license-markdown-exports',
      routeGenerated(routes, isProd) {
        if (!isProd) return;
        markdownExports.clear();
        for (const { routePath, pureRoutePath, version } of routes) {
          if (pureRoutePath === '/license') continue;
          const file = `${routePath}${routePath.endsWith('/') ? 'index.md' : '.md'}`
            .replace(/^\/+/, '');
          const files = markdownExports.get(version) ?? [];
          files.push(file);
          markdownExports.set(version, files);
        }
      },
      async afterBuild({ root = 'docs', outDir = 'doc_build', llms }, isProd) {
        if (!isProd || llms === false) return;
        for (const [version, files] of markdownExports) {
          const license = await readFile(resolve(root, version, 'license.md'), 'utf8');
          const notice = license.match(/^```text\r?\n(MIT License[\s\S]*?)\r?\n```\s*$/m)?.[1];
          if (!notice) throw new Error(`The upstream MIT notice is missing for ${version}.`);

          const footer = `\n\n## 许可证\n\n\`\`\`text\n${notice}\n\`\`\`\n`;
          await Promise.all(files.map(async (file) => {
            const output = resolve(outDir, file);
            const content = await readFile(output, 'utf8');
            const images = posix.relative(posix.dirname(file), 'images');
            const withImages = content.replace(/^(!\[[^\r\n\]]*\]\()\/images\//gm, `$1${images}/`);
            const exported = withImages.includes(notice) ? withImages : withImages + footer;
            if (exported !== content) await writeFile(output, exported, 'utf8');
          }));
        }
      },
    },
  ],
  lang: 'zh',
  base: `${collection.base}pi/`,
  multiVersion: {
    // Keep release folders intact and list the current release first.
    default: versions[0],
    versions,
  },
  route: {
    cleanUrls: false,
  },
  markdown: {
    link: {
      checkAnchors: {
        // Rspress registers heading IDs but not upstream HTML anchor aliases.
        excludes: [
          '#mcp-tools',
          '#resource-options',
          './cli.md#mcp-tools',
          './extensions.md#interact-with-the-user',
          './extensions.md#ui-and-modes',
          './models.md#prompt-cache-lifetimes',
          './sdk.md#codemode-mcp',
          './sdk.md#sessionmanager-api',
          './settings.md#model-cycling',
          './settings.md#per-model-compaction-overrides',
        ],
      },
    },
  },
});
