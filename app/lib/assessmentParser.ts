// Parses a tagged, student-facing assessment document into individual
// questions with their answer choices (if multiple choice) and the
// standard(s)/target category tags the teacher attached to each question.
//
// Tag format: [CODE-CATS] at the end of the question stem, before any
// answer choices. Multiple standards separated by ";", multiple categories
// for one standard separated by ",". Categories use the same abbreviations
// shown in the Curriculum Map's target labels: K=Knowledge, R=Reasoning,
// PS=Performance Skill, P=Product. Examples:
//   [6.RP.1-K]
//   [6.RP.1-PS,R]
//   [6.RP.2-PS; 6.RP.3-R]
//
// This is intentionally a pure, dependency-free module, same pattern as
// parser.ts and projectionParser.ts, so it can run directly in the
// browser for an instant preview before anything is saved.

export interface AssessmentQuestionTag {
  standardCode: string;
  categories: string[]; // full names, e.g. ["Performance Skill", "Reasoning"]
}

export interface AssessmentQuestion {
  number: string;
  text: string; // question stem with the tag stripped out
  choices: string[];
  tags: AssessmentQuestionTag[];
  rawTagText: string; // the original bracketed text, kept for display/debugging
}

export interface ParsedAssessment {
  questions: AssessmentQuestion[];
  untaggedCount: number;
}

const CATEGORY_ABBREV_MAP: Record<string, string> = {
  K: "Knowledge",
  R: "Reasoning",
  PS: "Performance Skill",
  P: "Product",
};

// Splits "6.RP.2-PS" into code="6.RP.2", categories=["PS"]. The category
// suffix is matched specifically (not just "last hyphen") so that codes
// which themselves contain hyphens (e.g. NGSS-style "MS-LS1-1") still split
// correctly - greedy backtracking finds the last hyphen that's immediately
// followed by a valid, complete category list and nothing else.
function parseSingleTag(tagPart: string): AssessmentQuestionTag | null {
  const trimmed = tagPart.trim();
  const m = trimmed.match(/^(.+)-((?:K|R|PS|P)(?:,(?:K|R|PS|P))*)$/);
  if (!m) return null;
  const standardCode = m[1].trim();
  const categories = m[2].split(",").map((c) => CATEGORY_ABBREV_MAP[c.trim()]).filter(Boolean);
  if (!standardCode || categories.length === 0) return null;
  return { standardCode, categories };
}

function parseTagBlock(tagContent: string): AssessmentQuestionTag[] {
  return tagContent
    .split(";")
    .map(parseSingleTag)
    .filter((t): t is AssessmentQuestionTag => t !== null);
}

/** Splits raw assessment text into per-question chunks. Questions are
 * expected to start with "N. " at the beginning of a line. */
function splitIntoQuestionBlocks(rawText: string): { number: string; block: string }[] {
  const parts = rawText.split(/(?=^\s*\d+\.\s)/m).map((p) => p.trim()).filter(Boolean);
  return parts
    .map((block) => {
      const m = block.match(/^(\d+)\.\s*/);
      if (!m) return null;
      return { number: m[1], block: block.slice(m[0].length).trim() };
    })
    .filter((p): p is { number: string; block: string } => p !== null);
}

export function parseAssessmentText(rawText: string): ParsedAssessment {
  const blocks = splitIntoQuestionBlocks(rawText);
  const questions: AssessmentQuestion[] = [];
  let untaggedCount = 0;

  for (const { number, block } of blocks) {
    // Separate the stem from lettered answer choices (each on its own line,
    // starting with a single capital letter and a period).
    const lines = block.split("\n");
    const choiceStartIdx = lines.findIndex((l) => /^[A-Z]\.\s/.test(l.trim()));
    const stemLines = choiceStartIdx === -1 ? lines : lines.slice(0, choiceStartIdx);
    const choiceLines = choiceStartIdx === -1 ? [] : lines.slice(choiceStartIdx);
    const choices = choiceLines.map((l) => l.trim()).filter(Boolean);

    let stem = stemLines.join(" ").replace(/\s+/g, " ").trim();

    // Extract the tag - the LAST bracketed group in the stem (a question
    // could theoretically mention brackets elsewhere, though not expected
    // in practice; taking the last one is the safer default).
    const tagMatches = [...stem.matchAll(/\[([^\]]+)\]/g)];
    let tags: AssessmentQuestionTag[] = [];
    let rawTagText = "";
    if (tagMatches.length > 0) {
      const lastMatch = tagMatches[tagMatches.length - 1];
      rawTagText = lastMatch[1];
      tags = parseTagBlock(rawTagText);
      stem = (stem.slice(0, lastMatch.index) + stem.slice(lastMatch.index! + lastMatch[0].length)).replace(/\s+/g, " ").trim();
    }
    if (tags.length === 0) untaggedCount++;

    questions.push({ number, text: stem, choices, tags, rawTagText });
  }

  return { questions, untaggedCount };
}
