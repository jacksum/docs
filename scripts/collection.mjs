import { resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import collection from '../collection.json' with { type: 'json' };

export const root = resolve(fileURLToPath(new URL('..', import.meta.url)));
export const output = resolve(root, 'doc_build');
export const marker = '.docs-collection';
export const markerText = 'docs-collection build output\n';
export const { base, name, projects, defaultProject } = collection;

if (!/^\/(?:[\w-]+\/)+$/.test(base)) throw new Error(`Invalid collection base: ${base}`);
if (!projects.length || new Set(projects.map(({ id }) => id)).size !== projects.length) {
  throw new Error('Register at least one project, with no duplicate IDs.');
}
for (const { id } of projects) {
  if (!/^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(id)) throw new Error(`Invalid project ID: ${id}`);
}
if (!projects.some(({ id }) => id === defaultProject)) {
  throw new Error(`Default project is not registered: ${defaultProject}`);
}
export const defaultEntrance = `${base}${defaultProject}/`;
