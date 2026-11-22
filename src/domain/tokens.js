// Token accounting for the dossier budget.
//
// There is no tokenizer here on purpose. A real BPE tokenizer is a megabyte of
// tables and would make the compile step slow enough to feel broken inside a
// Forge function. Four characters per token is the usual rough ratio for
// English prose, and it is wrong in a useful direction: code and identifiers
// tokenize denser than prose, so a 4:1 estimate UNDER-counts them. The budget
// is therefore a floor on the real cost, never an overstatement.
//
// The one hard guarantee this module provides is that a rendered dossier's
// estimate never exceeds the cap. That is a property of the output, not of a
// real tokenizer, and the README says exactly that.

export const CHARS_PER_TOKEN = 4;

export function estimateTokens(text) {
  if (text === null || text === undefined) return 0;
  const body = String(text);
  if (body.length === 0) return 0;
  return Math.max(1, Math.ceil(body.length / CHARS_PER_TOKEN));
}

/**
 * Cut text so that `estimateTokens(result) <= maxTokens`.
 * Trims on a word boundary when one is close enough to the cut, so a truncated
 * sentence does not end mid-identifier.
 */
export function truncateToTokens(text, maxTokens) {
  const source = String(text ?? '');
  const cap = Math.max(0, Math.floor(Number(maxTokens) || 0));
  if (cap === 0) return '';
  if (estimateTokens(source) <= cap) return source;

  // Reserve one character for the ellipsis so the result still fits the cap.
  const limit = Math.max(1, cap * CHARS_PER_TOKEN - 1);
  const head = source.slice(0, limit);
  const space = head.lastIndexOf(' ');
  const body = space > limit * 0.6 ? head.slice(0, space) : head;
  return `${body.trimEnd()}…`;
}
