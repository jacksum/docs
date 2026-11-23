import { defineConfig } from '@rspress/core';

export default defineConfig({
  root: 'docs',
  title: 'Pi Agent 中文文档（非官方）',
  description: 'Pi Agent 的非官方简体中文文档。',
  lang: 'zh',
  base: '/pi-docs/',
  route: {
    cleanUrls: false,
  },
});
