// The compiler.
//
// A dossier is a list of facts, each tagged with a section and a source. The
// compiler decides what an agent sees under a token budget, in a fixed order,
// and states what it left out. Two properties matter and both are tested:
//
//   1. The rendered markdown never estimates above the cap, unless the pinned
//      identity facts alone are bigger than the cap. Then it says so.
//   2. The order is deterministic. Same facts in, same bytes out. No clocks
//      inside the compiler: `generatedAt` is passed in, never read.

import { estimateTokens } from './tokens.js';

// Section order IS the priority order. A section earlier in this list is worth
// more to an agent that has never seen the ticket. `tier` is documentation for
// humans reading the output; the array position is what the compiler obeys.
export const SECTIONS = [
  { key: 'issue', title: 'Issue', tier: 0 },
  { key: 'criteria', title: 'Acceptance criteria', tier: 1 },
  { key: 'blockers', title: 'Blockers', tier: 1 },
  { key: 'decisions', title: 'Recent decisions', tier: 2 },
  { key: 'pulls', title: 'Linked pull requests', tier: 3 },
  { key: 'goals', title: 'Goals and parents', tier: 3 },
  { key: 'siblings', title: 'Sibling work', tier: 4 },
  { key: 'owners', title: 'People who know this', tier: 4 },
];

export const DEFAULT_BUDGET = 1500;
export const MIN_BUDGET = 400;
export const MAX_BUDGET = 8000;

const SECTION_KEYS = new Set(SECTIONS.map((section) => section.key));
const SECTION_BY_KEY = new Map(SECTIONS.map((section) => [section.key, section]));

export function clampBudget(value) {
  const parsed = Number(value);
  if (!Number.isFinite(parsed)) return DEFAULT_BUDGET;
  return Math.min(MAX_BUDGET, Math.max(MIN_BUDGET, Math.round(parsed)));
}

/**
 * Build one fact. Throws on an unknown section or empty text: a silently
 * dropped fact is worse than a loud failure, because the agent would never
 * learn that something existed.
 */
export function fact(section, text, options = {}) {
  if (!SECTION_KEYS.has(section)) {
    throw new Error(`unknown dossier section: ${section}`);
  }
  // A fact is one line. A multi-line fact would break the bullet list it lands
  // in and could inject a heading into the rendered dossier, so newlines are
  // flattened here rather than trusted to every caller.
  const body = String(text ?? '')
    .replace(/\s*\n+\s*/g, ' ')
    .replace(/\s{2,}/g, ' ')
    .trim();
  if (!body) throw new Error(`empty dossier fact in section: ${section}`);
  return {
    section,
    text: body,
    at: options.at ?? null,
    pinned: options.pinned === true,
  };
}

function byRecencyThenOrder(a, b) {
  if (a.pinned !== b.pinned) return a.pinned ? -1 : 1;
  if (a.at !== b.at) {
    if (!a.at) return 1;
    if (!b.at) return -1;
    return String(b.at).localeCompare(String(a.at));
  }
  return a.index - b.index;
}

function renderHeading(title, cap, generatedAt) {
  const lines = [`# Dossier: ${title}`, `> Compiled for an agent with a ${cap}-token budget.`];
  if (generatedAt) lines.push(`> Generated ${generatedAt}.`);
  return lines.join('\n');
}

function renderBody(kept) {
  return SECTIONS.filter((section) => (kept.get(section.key) ?? []).length > 0)
    .map((section) => {
      const lines = kept.get(section.key).map((item) => `- ${item.text}`);
      return `## ${section.title}\n${lines.join('\n')}`;
    })
    .join('\n\n');
}

function renderFooter(cap, used, dropped, overBudget) {
  const lines = [`_~${used} of ${cap} tokens used (4 characters per token)._`];
  const drops = [...dropped.entries()]
    .filter(([, count]) => count > 0)
    .map(([key, count]) => `${count} from ${SECTION_BY_KEY.get(key).title}`);
  if (drops.length) {
    lines.push(`_Dropped for budget: ${drops.join(', ')}. Ask for a larger budget to include them._`);
  }
  if (overBudget) {
    lines.push('_The identity facts alone exceed the budget. Raise it, or the agent is reading a truncated ticket._');
  }
  return lines.join('\n');
}

export function compileDossier({
  title = 'Untitled',
  facts = [],
  budget = DEFAULT_BUDGET,
  generatedAt = null,
} = {}) {
  const cap = clampBudget(budget);
  const heading = renderHeading(String(title), cap, generatedAt);

  const buckets = new Map(SECTIONS.map((section) => [section.key, []]));
  const ignored = [];
  (Array.isArray(facts) ? facts : []).forEach((item, index) => {
    if (!item || !SECTION_KEYS.has(item.section)) {
      ignored.push(item?.section ?? 'undefined');
      return;
    }
    buckets.get(item.section).push({ ...item, index });
  });

  const kept = new Map(SECTIONS.map((section) => [section.key, []]));
  const dropped = new Map();
  const drop = (key) => dropped.set(key, (dropped.get(key) ?? 0) + 1);

  // Pass one: greedy fill in section order, skipping a fact that does not fit
  // but continuing, because a later short fact in the same section may.
  let budgetUsed = estimateTokens(heading);
  for (const section of SECTIONS) {
    const ordered = [...buckets.get(section.key)].sort(byRecencyThenOrder);
    for (const item of ordered) {
      const cost = estimateTokens(`- ${item.text}`);
      if (!item.pinned && budgetUsed + cost > cap) {
        drop(section.key);
        continue;
      }
      kept.get(section.key).push(item);
      budgetUsed += cost;
    }
  }

  // Pass two: the accumulated estimate above is not the rendered estimate -
  // headings, blank lines and the footer cost too. Trim from the tail (lowest
  // value last) until the whole document fits, footer included.
  let overBudget = false;
  let markdown = '';
  let used = 0;
  let guard = 0;

  for (;;) {
    const body = renderBody(kept);
    const bodyUsed = estimateTokens([heading, body].join('\n\n'));
    const footer = renderFooter(cap, bodyUsed, dropped, overBudget);
    markdown = [heading, body, footer].join('\n\n');
    used = estimateTokens(markdown);
    if (used <= cap) break;

    if (guard++ > 500) {
      overBudget = true;
      break;
    }

    let removed = false;
    for (let s = SECTIONS.length - 1; s >= 0 && !removed; s -= 1) {
      const items = kept.get(SECTIONS[s].key);
      for (let i = items.length - 1; i >= 0; i -= 1) {
        if (items[i].pinned) continue;
        items.splice(i, 1);
        drop(SECTIONS[s].key);
        removed = true;
        break;
      }
    }

    if (!removed) {
      // Nothing left that may be cut. Add the warning once, then stop.
      if (overBudget) break;
      overBudget = true;
    }
  }

  return {
    markdown,
    used: estimateTokens(markdown),
    cap,
    overBudget,
    generatedAt,
    sections: SECTIONS.filter((section) => kept.get(section.key).length > 0).map((section) => ({
      key: section.key,
      title: section.title,
      count: kept.get(section.key).length,
    })),
    dropped: [...dropped.entries()].map(([key, count]) => ({
      key,
      title: SECTION_BY_KEY.get(key).title,
      count,
    })),
    ignored,
  };
}
