// utils/textChunker.js
//
// Section-aware semantic chunking with recursive fallback.
//
// WHY THIS FILE EXISTS
// ---------------------
// Feeding an entire resume, job description, or generated roadmap into a
// single embedding produces one vector that blurs together unrelated
// content (a candidate's "Skills" section and "Education" section end up
// mashed into one point in vector space), which makes retrieval much
// less precise than it could be. This module splits source text into
// smaller, semantically coherent chunks before services/embeddingService.js
// ever sees it, using a two-pass strategy:
//
//   1. Section-aware pass: scan for known heading lines (the same kind
//      of vocabulary already used for resume structure detection in
//      utils/atsScoring.js's SECTION_PATTERNS, extended here to job
//      postings, learning roadmaps, interview transcripts, and
//      market-trend reports) and split the text at those boundaries, so
//      each chunk stays within one logical section.
//   2. Recursive fallback pass: any section (or, if no headings were
//      found at all, the whole document) that's still longer than the
//      target chunk size is split further by progressively finer
//      separators — paragraph breaks, then line breaks, then sentence
//      boundaries, then a hard character slice as a last resort — with a
//      small character overlap carried between adjacent chunks so a
//      sentence split mid-thought doesn't lose its surrounding context.
//      This mirrors the standard "recursive character splitter" pattern
//      used by most RAG pipelines, implemented natively here so no new
//      dependency is needed.
//
// This is a pure, dependency-free function — no DB or network access —
// so it can be unit-tested the same way atsScoring.js/roadmapEngine.js
// already are, and reused by services/chunkService.js as its first step
// before embedding anything.

const DEFAULT_MAX_CHARS = 1200; // roughly 300 tokens — a safe, embedding-friendly chunk size
const DEFAULT_OVERLAP_CHARS = 150;
const MIN_CHUNK_CHARS = 40; // drop near-empty trailing fragments (stray whitespace/punctuation)
const HEADING_MAX_LEN = 60; // a heading line is short; long lines are never treated as headings

// ─────────────────────────────────────────────────────────────────────────
// Section heading vocabularies, one per RAG domain (resume / job /
// learning / interview / market — matching the five chunk collections).
// The 'resume' set mirrors atsScoring.js's SECTION_PATTERNS so both
// modules agree on what a resume's sections are called.
// ─────────────────────────────────────────────────────────────────────────
const SECTION_HEADING_PATTERNS = {
  resume: [
    { section: 'summary', pattern: /\b(summary|objective|profile|about me)\b/i },
    { section: 'skills', pattern: /\b(technical skills|skills|core competencies|technologies)\b/i },
    { section: 'experience', pattern: /\b(work experience|professional experience|employment history|experience)\b/i },
    { section: 'education', pattern: /\beducation\b/i },
    { section: 'projects', pattern: /\b(projects?|academic projects?|personal projects?)\b/i },
    { section: 'certifications', pattern: /\b(certifications?|licenses?|courses?)\b/i },
  ],
  job: [
    { section: 'overview', pattern: /\b(overview|about the role|job summary|description)\b/i },
    { section: 'responsibilities', pattern: /\b(responsibilities|what you.?ll do|duties)\b/i },
    { section: 'requirements', pattern: /\b(requirements|qualifications|what we.?re looking for|must[- ]haves?)\b/i },
    { section: 'nice_to_have', pattern: /\b(nice to have|preferred|bonus points)\b/i },
    { section: 'benefits', pattern: /\b(benefits|perks|what we offer|compensation)\b/i },
  ],
  learning: [
    { section: 'summary', pattern: /\b(roadmap summary|overview|summary)\b/i },
    { section: 'phase', pattern: /\bphase\s*\d+/i },
    { section: 'course', pattern: /\b(course|module|lesson)\b/i },
    { section: 'outcome', pattern: /\b(expected outcomes?|learning objectives?|milestones?)\b/i },
  ],
  interview: [
    { section: 'question', pattern: /\bquestion\s*[:#]?\s*\d*\b/i },
    { section: 'answer', pattern: /\b(answer|response)\b/i },
    { section: 'feedback', pattern: /\b(feedback|evaluation)\b/i },
  ],
  market: [
    { section: 'demand', pattern: /\b(demand|market demand|job growth)\b/i },
    { section: 'salary', pattern: /\b(salary|compensation|pay range)\b/i },
    { section: 'skills', pattern: /\b(trending skills|in[- ]demand skills|most demanded skills)\b/i },
    { section: 'companies', pattern: /\b(top companies|hiring companies)\b/i },
    // Live external-data facets (GitHub / Adzuna / Remotive-sourced —
    // see services/marketIntelligenceService.js), given their own
    // sections so retrieval can distinguish "what GitHub/job-board data
    // showed" from the LLM-generated demand/salary/insights narrative
    // above, even though both live in the same market_chunks collection.
    { section: 'technologies', pattern: /\btrending technologies\b/i },
    { section: 'languages', pattern: /\b(trending|popular) programming languages\b/i },
    { section: 'frameworks', pattern: /\bpopular frameworks\b/i },
    { section: 'hiring', pattern: /\bhiring trends?\b/i },
    { section: 'insights', pattern: /\b(insights?|trends?)\b/i },
  ],
};

/**
 * Scans `text` line-by-line for short lines that match one of the given
 * domain's known section headings, and groups the lines in between into
 * { section, content } blocks. Lines before the first recognized heading
 * (or the entire text, if no heading is ever found) fall under 'general'.
 */
function splitIntoSections(text, domain) {
  const patterns = SECTION_HEADING_PATTERNS[domain];
  if (!patterns) return [{ section: 'general', content: text.trim() }];

  const lines = text.split('\n');
  const sections = [];
  let current = { section: 'general', lines: [] };

  for (const line of lines) {
    const trimmed = line.trim();
    const isHeadingCandidate = trimmed.length > 0 && trimmed.length <= HEADING_MAX_LEN;
    let matchedSection = null;

    if (isHeadingCandidate) {
      for (const { section, pattern } of patterns) {
        if (pattern.test(trimmed)) { matchedSection = section; break; }
      }
    }

    if (matchedSection) {
      if (current.lines.length) sections.push(current);
      current = { section: matchedSection, lines: [] };
    } else {
      current.lines.push(line);
    }
  }
  if (current.lines.length) sections.push(current);

  return sections
    .map((s) => ({ section: s.section, content: s.lines.join('\n').trim() }))
    .filter((s) => s.content.length > 0);
}

/**
 * Recursive character splitter: breaks `text` into pieces no longer than
 * `maxChars`, trying progressively finer separators (paragraph -> line ->
 * sentence -> hard slice) until one actually produces more than one
 * piece, then greedily packs those pieces back together up to the size
 * limit. `overlapChars` of the previous chunk's tail is carried into the
 * start of the next chunk so context isn't lost at a split boundary.
 */
function recursiveSplit(text, maxChars = DEFAULT_MAX_CHARS, overlapChars = DEFAULT_OVERLAP_CHARS) {
  if (text.length <= maxChars) return [text];

  const SEPARATORS = ['\n\n', '\n', '. ', ' '];
  let pieces = null;
  let usedSeparator = '';

  for (const sep of SEPARATORS) {
    const candidate = text.split(sep).filter(Boolean);
    if (candidate.length > 1) {
      pieces = candidate;
      usedSeparator = sep;
      break;
    }
  }

  // Nothing helped (e.g. one giant unbroken token/URL) — hard-slice with
  // overlap as the last resort.
  if (!pieces) {
    const chunks = [];
    const step = Math.max(maxChars - overlapChars, 1);
    for (let i = 0; i < text.length; i += step) {
      chunks.push(text.slice(i, i + maxChars));
    }
    return chunks;
  }

  const chunks = [];
  let buffer = '';

  for (const piece of pieces) {
    // A single piece can itself still exceed maxChars (e.g. one huge
    // paragraph) — recurse into it with the next-finer separator before
    // trying to pack it alongside its neighbors.
    if (piece.length > maxChars) {
      if (buffer) { chunks.push(buffer); buffer = ''; }
      chunks.push(...recursiveSplit(piece, maxChars, overlapChars));
      continue;
    }

    const withSep = buffer ? buffer + usedSeparator + piece : piece;
    if (withSep.length > maxChars && buffer) {
      chunks.push(buffer);
      const overlapTail = buffer.slice(-overlapChars);
      buffer = overlapTail ? overlapTail + usedSeparator + piece : piece;
    } else {
      buffer = withSep;
    }
  }
  if (buffer) chunks.push(buffer);

  return chunks;
}

/**
 * Full pipeline: section-aware split, then recursive fallback split of
 * any section that's still too large, then drop trivially small
 * fragments. Returns chunks in source order, each tagged with its
 * detected section and position.
 *
 * @param {string} text - raw source text (resume, job description, etc.)
 * @param {Object} options
 * @param {'resume'|'job'|'learning'|'interview'|'market'|'general'} options.domain
 * @param {number} options.maxChars - target max chunk size (default 1200)
 * @param {number} options.overlapChars - overlap carried between recursive-split chunks (default 150)
 * @returns {Array<{section: string, text: string, chunkIndex: number}>}
 */
function chunkText(text, options = {}) {
  const domain = options.domain || 'general';
  const maxChars = options.maxChars || DEFAULT_MAX_CHARS;
  const overlapChars = options.overlapChars ?? DEFAULT_OVERLAP_CHARS;

  const cleaned = String(text || '').replace(/\r\n/g, '\n').trim();
  if (!cleaned) return [];

  const sections = domain === 'general'
    ? [{ section: 'general', content: cleaned }]
    : splitIntoSections(cleaned, domain);

  const effectiveSections = sections.length ? sections : [{ section: 'general', content: cleaned }];

  const chunks = [];
  let chunkIndex = 0;

  for (const { section, content } of effectiveSections) {
    const pieces = content.length > maxChars ? recursiveSplit(content, maxChars, overlapChars) : [content];
    for (const piece of pieces) {
      const trimmed = piece.trim();
      if (trimmed.length < MIN_CHUNK_CHARS) continue;
      chunks.push({ section, text: trimmed, chunkIndex: chunkIndex++ });
    }
  }

  return chunks;
}

module.exports = {
  chunkText,
  splitIntoSections,
  recursiveSplit,
  SECTION_HEADING_PATTERNS,
  DEFAULT_MAX_CHARS,
  DEFAULT_OVERLAP_CHARS,
};
