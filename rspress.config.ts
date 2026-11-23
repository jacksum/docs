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
