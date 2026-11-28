import { isDeepStrictEqual } from 'node:util';
import { grayMatter } from '@rspress/shared/gray-matter';

// Rspress exposes gray-matter 4.0.3 with js-yaml's safeLoad engine.
// Accept only an exact YAML delimiter, never a user-selected executable engine.
export function splitFrontmatter(input, label = 'document') {
  const source = input.replace(/^\uFEFF/, '').replace(/\r\n/g, '\n');
  if (!source.startsWith('---\n')) return { body: source, metadata: {}, hasFrontmatter: false };
  const close = /^---[ \t]*$/gm;
  close.lastIndex = 4;
  const match = close.exec(source);
  if (!match) throw new Error(`${label}: unterminated YAML frontmatter`);
  const yaml = source.slice(4, match.index);
  let metadata;
  try {
    // Reconstruct a YAML-only document so gray-matter cannot choose another engine.
    metadata = grayMatter(`---\n${yaml}---\n`, { language: 'yaml' }).data;
  } catch (error) {
    throw new Error(`${label}: invalid YAML frontmatter: ${error.message}`, { cause: error });
  }
  if (!metadata || Object.getPrototypeOf(metadata) !== Object.prototype) {
    throw new Error(`${label}: frontmatter must be a mapping`);
  }
  const seen = new WeakSet();
  function checkValue(value) {
    if (typeof value === 'number' && !Number.isFinite(value)) throw new Error(`${label}: frontmatter numbers must be finite`);
    if (value === null || ['string', 'boolean', 'number'].includes(typeof value)) return;
    if (typeof value === 'object') {
      if (seen.has(value)) throw new Error(`${label}: frontmatter aliases must not share or cycle values`);
      seen.add(value);
    }
    if (Array.isArray(value)) { value.forEach(checkValue); return; }
    if (typeof value !== 'object' || Object.getPrototypeOf(value) !== Object.prototype) {
      throw new Error(`${label}: frontmatter must contain only JSON-compatible values`);
    }
    for (const [key, item] of Object.entries(value)) {
      if (['__proto__', 'constructor', 'prototype', '<<'].includes(key)) throw new Error(`${label}: unsafe frontmatter key ${key}`);
      checkValue(item);
    }
  }
  checkValue(metadata);
  return { metadata, hasFrontmatter: true, body: source.slice(match.index + match[0].length).replace(/^\n/, '') };
}

export function translatedFrontmatter(source, draft, label) {
  if (source.hasFrontmatter !== draft.hasFrontmatter) throw new Error(`${label}: frontmatter presence differs from the source`);
  const keys = (metadata) => Object.keys(metadata).sort();
  if (!isDeepStrictEqual(keys(source.metadata), keys(draft.metadata))) {
    throw new Error(`${label}: frontmatter fields differ from the source`);
  }
  for (const key of keys(source.metadata)) {
    if (key === 'description') {
      const description = draft.metadata.description;
      if (typeof description !== 'string' || !description.trim() || !/\p{Script=Han}/u.test(description) || description === source.metadata.description) {
        throw new Error(`${label}: frontmatter description must retain a translated Chinese description`);
      }
    } else if (!isDeepStrictEqual(source.metadata[key], draft.metadata[key])) {
      throw new Error(`${label}: frontmatter identifier ${key} differs from the source`);
    }
  }
  return draft.metadata;
}

export function pageFrontmatter(metadata, title) {
  if (Object.keys(metadata).length === 0) {
    return `---\ntitle: ${JSON.stringify(title)}\ndescription: ${JSON.stringify(`Oh My Pi 官方仓库文档：${title}。`)}\n---\n\n`;
  }
  const fields = { ...metadata, title };
  if (!Object.hasOwn(fields, 'description')) fields.description = `Oh My Pi 官方仓库文档：${title}。`;
  // A JSON object is valid YAML and safely escapes multiline strings and punctuation.
  return `---\n${JSON.stringify(fields, null, 2)}\n---\n\n`;
}
