import { readFile, writeFile } from 'node:fs/promises';
import { posix, resolve } from 'node:path';
import { defineConfig } from '@rspress/core';
import collection from '../../collection.json';
import manifest from './source-manifest.json';

const title = collection.projects.find(({ id }) => id === 'omp')!.label;
const exportedPages = new Set<string>();

export default defineConfig({
  root: 'docs',
  title,
  description: 'Oh My Pi 仓库版使用指南与参考资料的简体中文选译。',
  lang: 'zh',
  logoText: title,
  base: `${collection.base}omp/`,
  multiVersion: { default: manifest.version, versions: [manifest.version] },
  route: { cleanUrls: false },
  plugins: [{
    name: 'omp:retain-upstream-license',
    routeGenerated(routes, isProd) {
      if (!isProd) return;
      exportedPages.clear();
      for (const { routePath, pureRoutePath, relativePath } of routes) {
        if (pureRoutePath === '/license' || !relativePath.startsWith(`${manifest.version}/`)) continue;
        const stem = `${routePath}${routePath.endsWith('/') ? 'index' : ''}`.replace(/^\/+/, '');
        exportedPages.add(stem);
      }
    },
    async afterBuild({ outDir = 'doc_build', llms }, isProd) {
      if (!isProd) return;
      const notice = (await readFile(resolve('LICENSE'), 'utf8')).trimEnd();
      if (notice.includes('-->')) throw Error('Cannot embed the upstream license in an HTML comment.');
      await Promise.all([...exportedPages].map(async (stem) => {
        const htmlPath = resolve(outDir, `${stem}.html`);
        const html = await readFile(htmlPath, 'utf8');
        if (!html.includes('</head>')) throw Error(`Expected a document head in ${stem}.html`);
        if (!html.includes(notice)) await writeFile(htmlPath, html.replace('</head>', `<!--\n${notice}\n-->\n</head>`));
        if (llms === false) return;
        const mdPath = resolve(outDir, posix.normalize(`${stem}.md`));
        const md = await readFile(mdPath, 'utf8');
        if (!md.includes(notice)) await writeFile(mdPath, `${md.trimEnd()}\n\n## 上游许可证\n\n\`\`\`text\n${notice}\n\`\`\`\n`);
      }));
    },
  }],
});
