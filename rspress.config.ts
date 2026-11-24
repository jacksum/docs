import { defineConfig } from '@rspress/core';
import collection from './collection.json';

export default defineConfig({
  title: collection.name,
  lang: 'zh',
  base: collection.base,
  outDir: 'doc_build',
});
