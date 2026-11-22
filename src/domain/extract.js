// Pulling structure out of prose.
//
// Two extractions, both deterministic and both allowed to return nothing. The
// rule for this file: never invent a fact. If a description has no acceptance
// criteria heading, the dossier has no criteria section, it does not guess
// from the body text. If no comment contains a decision cue, there is no
// decisions section. An agent that is told "no criteria recorded" behaves
// better than one handed a plausible paraphrase.

const CRITERIA_HEADING =
  /^\s*(?:#{1,6}\s*)?(?:acceptance criteria|definition of done|done when|success criteria)\b/i;

const DECISION_CUE =
  /\b(decided|decision|agreed|agreement|we will|we won't|we won’t|let's|let’s|instead|must not|must|do not|don't|don’t|going with|settled on|won't|will not)\b/i;

/**
 * Where the criteria block sits: the heading line, and the line the block ends
 * on, the next heading, or the first blank line after at least one bullet, or
 * the first plain paragraph after the list.
 */
function criteriaRange(text) {
  const lines = String(text ?? '').split(/\r?\n/);
  const start = lines.findIndex((line) => CRITERIA_HEADING.test(line));
  if (start === -1) return null;

  let end = lines.length;
  let seen = 0;
  for (let i = start + 1; i < lines.length; i += 1) {
    const line = lines[i].trim();
    if (/^#{1,6}\s/.test(line)) {
      end = i;
      break;
    }
    if (!line) {
      if (seen) {
        end = i;
        break;
      }
      continue;
    }
    const bullet = line
      .replace(/^[-*•]\s+/, '')
      .replace(/^\d+[.)]\s+/, '')
      .trim();
    if (bullet === line && seen) {
      end = i;
      break;
    }
    seen += 1;
  }
  return { lines, start, end };
}

/**
 * The bullet lines under an acceptance-criteria heading, up to `max`.
 * Stops at the next heading, or at the first plain paragraph after the list -
 * a following "Notes" paragraph is not a criterion.
 */
export function acceptanceCriteria(text, { max = 8 } = {}) {
  const range = criteriaRange(text);
  if (!range) return [];

  const out = [];
  for (let i = range.start + 1; i < range.end && out.length < max; i += 1) {
    const line = range.lines[i].trim();
    if (!line) continue;
    out.push(
      line
        .replace(/^[-*•]\s+/, '')
        .replace(/^\d+[.)]\s+/, '')
        .trim(),
    );
  }
  return out;
}

/**
 * The description with every criteria block removed, for the one-line
 * "Description" fact. Without this the same criteria would appear twice in a
 * dossier, once as the section, once leaked inside the description bullet.
 */
export function withoutCriteria(text) {
  let source = String(text ?? '');
  for (let pass = 0; pass < 10; pass += 1) {
    const range = criteriaRange(source);
    if (!range) break;
    source = [...range.lines.slice(0, range.start), ...range.lines.slice(range.end)].join('\n');
  }
  return source.trim();
}

export function splitSentences(text) {
  return String(text ?? '')
    .replace(/\s+/g, ' ')
    .trim()
    .split(/(?<=[.!?])\s+/)
    .filter(Boolean);
}

/**
 * The first sentence in a comment that reads like a decision, or null.
 * A cue is a heuristic, not comprehension: it is why the quote is shown verbatim
 * with its author and date, so a human can check it in one glance.
 */
export function decisionQuote(text, { max = 240 } = {}) {
  for (const sentence of splitSentences(text)) {
    if (!DECISION_CUE.test(sentence)) continue;
    return sentence.length > max ? `${sentence.slice(0, max - 1).trimEnd()}…` : sentence;
  }
  return null;
}
