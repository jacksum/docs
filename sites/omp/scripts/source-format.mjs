import remarkGfm from 'remark-gfm';
import remarkParse from 'remark-parse';
import { unified } from 'unified';

const parser = unified().use(remarkParse).use(remarkGfm);

// The source bytes are verified against the pinned Git blob before this adapter runs.
// Only widen single-backtick inline-code delimiters. If a literal escaped backtick
// touches the closing delimiter, require symmetric CommonMark padding as well.
// Padding is removed by the parser; the literal inline-code value must not change.
export function applySourceFormatPatches(source, entry) {
  const patches = entry.sourceFormatPatches;
  if (patches === undefined) return source;
  const label = entry.target ?? entry.source ?? 'document';
  const fail = (message) => { throw new Error(`${label}: source format patch ${message}`); };
  if (!Array.isArray(patches)) fail('list must be an array');
  const replacements = [];
  for (const patch of patches) {
    if (!patch || typeof patch !== 'object' || Array.isArray(patch)) fail('must be an object');
    if (Object.keys(patch).some((key) => !['kind', 'from', 'to', 'count', 'reason'].includes(key))) fail('has an unsupported field');
    if (patch.kind !== 'inline-code-delimiter') fail('kind must be inline-code-delimiter');
    const { from, to, count, reason } = patch;
    const needsPadding = typeof from === 'string' && from.endsWith('\\``');
    if (typeof from !== 'string' || from.length < 3 || !from.startsWith('`') || from.startsWith('``') ||
        !from.endsWith('`') || (from.endsWith('``') && !needsPadding)) fail('from must have single-backtick delimiters');
    const expected = needsPadding ? '`` ' + from.slice(1, -1) + ' ``' : `\`${from}\``;
    if (to !== expected) fail(needsPadding
      ? 'to must use double-backtick delimiters with one padding space on each side'
      : 'to must only add one backtick at each end of from');
    if (needsPadding) {
      const tree = parser.parse(to);
      const paragraph = tree.children[0];
      const code = paragraph?.children?.[0];
      if (tree.children.length !== 1 || paragraph.type !== 'paragraph' || paragraph.children.length !== 1 ||
          code.type !== 'inlineCode' || code.value !== from.slice(1, -1)) {
        fail('padding must preserve the exact literal inline-code value');
      }
    }
    if (count !== 1) fail('count must be exactly 1');
    if (typeof reason !== 'string' || !reason.trim()) fail('requires a nonempty reason');
    const matches = [];
    for (let at = source.indexOf(from); at !== -1; at = source.indexOf(from, at + 1)) matches.push(at);
    if (matches.length !== count) fail(`expected ${count} exact occurrence, found ${matches.length}`);
    const start = matches[0];
    const end = start + from.length;
    if (source[start - 1] === '`' || source[end] === '`') fail('matched span already has wider backtick delimiters');
    if (replacements.some((other) => start < other.end && end > other.start)) fail('spans must not overlap');
    replacements.push({ start, end, to });
  }
  for (const { start, end, to } of replacements.sort((a, b) => b.start - a.start)) {
    source = source.slice(0, start) + to + source.slice(end);
  }
  return source;
}
