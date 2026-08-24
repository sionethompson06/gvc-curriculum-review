// Parses a Google Drive markdown-table text export of a district Unit Map
// document into the app's UnitMap data structure. Ported from a Python
// prototype validated against two structurally different real documents
// (6th Math: CCSS-style codes, single-row learning targets; 6th History:
// bare-digit codes, one-row-per-standard learning targets).
//
// This is intentionally a pure, dependency-free module (no DB, no fetch) so
// it can be exercised directly from the admin import UI's "preview" step
// before anything is written to the database.

import type { UnitMap, PriorityStandardDeconstruction, SupportingStandard, CurriculumRow, AssessmentBlock } from "./types";

export interface ParsedUnitMap extends UnitMap {
  allStandardsCodes: string[];
  chosenPriorityCodes: string[];
}

export function cleanMarkdownLinks(text: string): string {
  return text.replace(/\[([^\]]+)\]\([^)]+\)/g, "$1");
}

// Drive's text export sometimes loses the space between sentences/segments
// that were on separate lines in the source doc (e.g. "compared.I can" or
// "quantities(verbs)" or "sort6.1.1"). Insert a space in these specific safe
// cases; never applied to standard-code strings themselves (see cleanAllStrings).
export function unescapeMarkdown(text: string): string {
  return text.replace(/\\([*!\[\]()_~`>#+.-])/g, "$1");
}

function fixMissingSpacing(text: string): string {
  if (!text) return text;
  let t = unescapeMarkdown(text);
  t = t.replace(/\.([A-Z])/g, ". $1");
  t = t.replace(/([a-z])\(/g, "$1 (");
  t = t.replace(/([a-z])([A-Z])/g, "$1 $2");
  t = t.replace(/([a-z])(\d)/g, "$1 $2");
  // Ensure rubric level markers (e.g. "4 - Exceeds:") always have a preceding
  // space/boundary - the UI's scoring-block parser depends on this.
  t = t.replace(/(?<=\S)(?=\d\s*[\u2013\-]\s*(?:Exceeds|Meets|Approaching|Beginning)\b)/g, " ");
  return t;
}

/** Split raw markdown-table text into rows of cells, skipping separator rows. */
export function parseRows(rawText: string): string[][] {
  const rows: string[][] = [];
  for (const rawLine of rawText.split("\n")) {
    const line = rawLine.trim();
    if (!line.startsWith("|")) continue;
    const cells = line.replace(/^\||\|$/g, "").split("|").map((c) => c.trim());
    if (cells.every((c) => c === "" || /^:?-+:?$/.test(c))) continue;
    rows.push(cells);
  }
  return rows;
}

/** Extract an ordered, deduped list of standard codes from a blob of text.
 * Handles patterns like 6.RP.1, 6.NS.3, 6.1.2, MP.1, ELD.PI.8.1.
 * Codes are sometimes glued directly onto preceding prose with no space (a
 * Drive export artifact from lost line breaks), so lookbehinds check "not
 * preceded by a digit/letter" rather than \b, which fails when the
 * preceding character is a letter glued directly against a leading digit. */
export function extractCodes(text: string): string[] {
  const t = cleanMarkdownLinks(text);
  const patterns = [
    /(?<!\d)\d{1,2}\.[A-Z]{1,4}\.\d{1,2}(?:\.\d{1,2})?/g, // 6.RP.1, 6.NS.3
    /(?<![A-Z])ELD\.[A-Z]{1,3}\.\d{1,2}\.\d{1,2}/g, // ELD.PI.8.1
    /(?<![A-Z])MP\.\d{1,2}/g, // MP.1
    /(?<![A-Z])[A-Z]{1,2}-[A-Z]{2,4}\d-\d{1,2}(?!\d)/g, // MS-LS1-1, MS-ETS1-4 (NGSS-style; both boundaries use lookarounds - not \b - since these are sometimes glued directly to surrounding words with no space)
    /(?<!\d)\d{1,2}\.\d{1,2}(?:\.\d{1,2})?(?!\d)/g, // 6.1, 6.1.2 (bare, e.g. History)
  ];
  const allMatches: { start: number; end: number; code: string }[] = [];
  for (const pattern of patterns) {
    for (const m of t.matchAll(pattern)) {
      allMatches.push({ start: m.index!, end: m.index! + m[0].length, code: m[0] });
    }
  }
  // Resolve overlaps: prefer longer matches; sort by start asc, length desc,
  // then greedily accept matches that don't fall inside an already-accepted span.
  allMatches.sort((a, b) => a.start - b.start || (b.end - b.start) - (a.end - a.start));
  const accepted: string[] = [];
  let lastEnd = -1;
  for (const { start, end, code } of allMatches) {
    if (start >= lastEnd) {
      accepted.push(code);
      lastEnd = end;
    }
  }
  return Array.from(new Set(accepted));
}

/** Split a blob of text into per-code segments, using each code's first
 * occurrence position as a split point. Returns {code: segmentText}. */
export function splitByCodes(text: string, codes: string[]): Record<string, string> {
  if (!text || codes.length === 0) return {};
  const t = cleanMarkdownLinks(text);
  const positions: { pos: number; code: string; end: number }[] = [];
  for (const code of codes) {
    const escaped = code.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
    const m = t.match(new RegExp(escaped));
    if (m && m.index !== undefined) positions.push({ pos: m.index, code, end: m.index + m[0].length });
  }
  positions.sort((a, b) => a.pos - b.pos);
  const result: Record<string, string> = {};
  positions.forEach(({ code, end }, i) => {
    const stop = i + 1 < positions.length ? positions[i + 1].pos : t.length;
    let segment = t.slice(end, stop).trim();
    segment = segment.replace(/^[:\-\s]+/, "").trim();
    result[code] = segment;
  });
  return result;
}

/** Find the index of the first row matching labelMatcher (case-insensitive
 * substring). By default checks only the first cell; set anyCell=true to
 * check all cells (needed when the label isn't in cell 0). */
export function findRowIndex(rows: string[][], labelMatcher: string, start = 0, anyCell = false): number {
  const needle = labelMatcher.toLowerCase();
  for (let i = start; i < rows.length; i++) {
    const row = rows[i];
    if (!row) continue;
    const cellsToCheck = anyCell ? row : row.slice(0, 1);
    if (cellsToCheck.some((c) => c.toLowerCase().includes(needle))) return i;
  }
  return -1;
}

/** Parse the "Mark the standard type/s" row structure:
 * [label, codesBlob1, "Knowledge", codesBlob2, "Reasoning", codesBlob3, "Performance Skill", "Product"]
 * The codesBlob cells often have codes squished with no separator (e.g.
 * "6.RP.16.RP.26.RP.3"), which is ambiguous to re-parse independently.
 * Instead we check containment of each already-known code (from CHOOSE
 * PRIORITY STANDARD(S)) as a substring - the code's exact character
 * sequence survives intact even when concatenated. */
export function parseTypeMarkingRow(row: string[], knownCodes: string[]): Record<string, string[]> {
  const result: Record<string, string[]> = {};
  const categoryNames = ["Knowledge", "Reasoning", "Performance Skill", "Product"];
  let i = 1;
  while (i < row.length - 1) {
    const codesBlob = cleanMarkdownLinks(row[i] || "");
    const category = (row[i + 1] || "").trim();
    if (categoryNames.includes(category)) {
      for (const code of knownCodes) {
        if (codesBlob.includes(code)) {
          (result[code] ||= []).push(category);
        }
      }
    }
    i += 2;
  }
  return result;
}

/** Recursively apply fixMissingSpacing to string values, skipping any value
 * under a "code" key or a key ending in "Codes" - those are exact
 * standard-code strings and must not be touched by prose-spacing fixes. */
function cleanAllStrings(obj: any, parentKey?: string): any {
  const isCode = parentKey === "code" || (typeof parentKey === "string" && parentKey.endsWith("Codes"));
  const isLink = parentKey === "link";
  if (typeof obj === "string") {
    if (isCode) return obj;
    if (isLink) return unescapeMarkdown(obj); // URLs must not get letter-digit/word-spacing fixes
    return fixMissingSpacing(obj);
  }
  if (Array.isArray(obj)) return obj.map((v) => cleanAllStrings(v, parentKey));
  if (obj && typeof obj === "object") {
    const out: any = {};
    for (const [k, v] of Object.entries(obj)) out[k] = cleanAllStrings(v, k);
    return out;
  }
  return obj;
}

/** Splits a raw text export that contains MULTIPLE units concatenated in one
 * document (e.g. a district doc titled "Unit 1-6 Mathematics (Grade 7)")
 * into one raw-text chunk per unit. Each unit's section is expected to start
 * with a standalone line like "Unit 2 History (Grade 6)" (not inside a
 * table row) - this is the pattern Drive's export uses between units in a
 * single combined document. If no such delimiter is found at all, the whole
 * text is returned as a single chunk (the common case: a document already
 * scoped to one unit). */
export function splitIntoUnitChunks(rawText: string): { title: string; text: string }[] {
  const delimiterRe = /^Unit\s+\d+[^\n]*\(Grade\s+\d+\)\s*$/gm;
  const matches = [...rawText.matchAll(delimiterRe)];
  if (matches.length === 0) return [{ title: "Unit 1", text: rawText }];
  const chunks: { title: string; text: string }[] = [];
  matches.forEach((m, i) => {
    const start = m.index!;
    const end = i + 1 < matches.length ? matches[i + 1].index! : rawText.length;
    chunks.push({ title: m[0].trim(), text: rawText.slice(start, end) });
  });
  return chunks;
}

/** Parse a single unit's raw text export into the app's UnitMap shape (plus
 * the two intermediate code lists useful for review/debugging: every
 * standard listed at the top of the doc, and the subset formally chosen
 * under CHOOSE PRIORITY STANDARD(S)). */
export function parseUnitMapRawText(rawText: string): ParsedUnitMap {
  const rows = parseRows(rawText);
  const result: ParsedUnitMap = {
    allStandardsCodes: [],
    chosenPriorityCodes: [],
    priorityStandards: [],
    otherDeconstructedStandards: [],
    supportingStandards: [],
    preAssessment: {},
    postAssessment: {},
    commonAssessment: {},
    curriculumRows: [],
    startDate: "",
    endDate: "",
  };

  // Header: dates
  let idx = findRowIndex(rows, "Plan Start Date");
  if (idx >= 0 && rows[idx].length >= 4) {
    result.startDate = rows[idx][1];
    result.endDate = rows[idx][3];
  }

  // List Standards in this Unit
  idx = findRowIndex(rows, "List Standards in this Unit", 0, true);
  if (idx >= 0 && idx + 1 < rows.length) {
    const allStandardsText = rows[idx + 1][0];
    result.allStandardsCodes = extractCodes(allStandardsText);
  }

  // Supporting Standards
  idx = findRowIndex(rows, "List Supporting Standards");
  if (idx >= 0 && idx + 1 < rows.length) {
    const suppText = cleanMarkdownLinks(rows[idx + 1][0]);
    const suppCodes = extractCodes(suppText);
    const segments = splitByCodes(suppText, suppCodes);
    const supportingStandards: SupportingStandard[] = [];
    for (const code of suppCodes) {
      let desc = segments[code] || "";
      desc = desc.replace(/\s*(?:ELD Standards|Standards)\s*$/i, "").trim();
      supportingStandards.push({ code, desc });
    }
    result.supportingStandards = supportingStandards;
  }

  // CHOOSE PRIORITY STANDARD(S)
  idx = findRowIndex(rows, "CHOOSE PRIORITY STANDARD");
  if (idx >= 0 && idx + 1 < rows.length) {
    const chosenText = rows[idx + 1][0];
    result.chosenPriorityCodes = extractCodes(chosenText);
  }

  // Mark the standard type/s
  let typeMap: Record<string, string[]> = {};
  idx = findRowIndex(rows, "Mark the standard type");
  if (idx >= 0) {
    typeMap = parseTypeMarkingRow(rows[idx], result.chosenPriorityCodes);
  }

  // Deconstruct: nouns / verbs
  let nounsMap: Record<string, string> = {};
  let verbsMap: Record<string, string> = {};
  idx = findRowIndex(rows, "List the nouns");
  if (idx >= 0 && rows[idx].length > 1) {
    const text = rows[idx][1];
    nounsMap = splitByCodes(text, extractCodes(text));
  }
  idx = findRowIndex(rows, "List the verbs");
  if (idx >= 0 && rows[idx].length > 1) {
    const text = rows[idx][1];
    verbsMap = splitByCodes(text, extractCodes(text));
  }

  // Identify Learning Targets - two known formats:
  // Format A (e.g. Math): one row, each category cell has all codes embedded.
  // Format B (e.g. History): one row per standard, in chosenPriorityCodes
  // order, with no code prefix in each cell.
  let knowledgeMap: Record<string, string> = {};
  let reasoningMap: Record<string, string> = {};
  let perfMap: Record<string, string> = {};
  let productMap: Record<string, string> = {};
  idx = findRowIndex(rows, "Identify Learning Targets");
  if (idx >= 0) {
    const contentIdx = idx + 3;
    const chosenCodes = result.chosenPriorityCodes;
    const firstContentRow = rows[contentIdx] || [];
    // Format A (all codes embedded in one row, e.g. Math) is only the right
    // read when MULTIPLE distinct codes appear in the first cell - a single
    // leading code label (e.g. History Unit 2/3's "6.2.1 - I will be able
    // to...") is just a per-row prefix, not concatenated multi-standard
    // content, and should still be treated as Format B (one row per standard).
    const firstCellHasCodes = firstContentRow.length > 0 && extractCodes(firstContentRow[0]).length > 1;

    if (firstCellHasCodes) {
      const [kText, rText, pText, prText] = [firstContentRow[0] || "", firstContentRow[1] || "", firstContentRow[2] || "", firstContentRow[3] || ""];
      knowledgeMap = splitByCodes(kText, extractCodes(kText));
      reasoningMap = splitByCodes(rText, extractCodes(rText));
      perfMap = splitByCodes(pText, extractCodes(pText));
      productMap = splitByCodes(prText, extractCodes(prText));
    } else {
      for (let offset = 0; offset < chosenCodes.length; offset++) {
        const code = chosenCodes[offset];
        const rowI = contentIdx + offset;
        if (rowI >= rows.length) break;
        const row = rows[rowI];
        if (!row || (row[0] && (row[0].includes("Determine Post Assessment") || row[0].includes("Determine Pre-Assessment")))) break;
        const cells = [row[0] || "", row[1] || "", row[2] || "", row[3] || ""];
        // Some Format B documents (e.g. History Units 2/3) prefix only the
        // first cell with the standard's own code as a label the teacher
        // typed for their own reference (e.g. "6.2.1 - I will be able to...").
        // Strip it so the stored target reads the same as documents that
        // never had the label in the first place (e.g. History Unit 1).
        let knowledgeCell = cells[0];
        if (knowledgeCell.startsWith(code)) {
          knowledgeCell = knowledgeCell.slice(code.length).replace(/^[.:\-\s]+/, "").trim();
        }
        knowledgeMap[code] = knowledgeCell;
        reasoningMap[code] = cells[1];
        perfMap[code] = cells[2];
        productMap[code] = cells[3];
      }
    }
  }

  // Build priorityStandards array from chosen codes
  const priorityStandards: PriorityStandardDeconstruction[] = [];
  for (const code of result.chosenPriorityCodes) {
    const types = typeMap[code] || [];
    priorityStandards.push({
      code,
      type: types.join(", "),
      nouns: nounsMap[code] || "",
      verbs: verbsMap[code] || "",
      targets: {
        knowledge: knowledgeMap[code] || "",
        reasoning: reasoningMap[code] || "",
        performanceSkill: perfMap[code] || "",
        product: productMap[code] || "",
      },
    });
  }
  result.priorityStandards = priorityStandards;

  // Standards that were fully deconstructed (nouns, verbs, and/or targets
  // written out) but never formally checked off under CHOOSE PRIORITY
  // STANDARD(S) - e.g. a standard the teacher listed under Supporting
  // Standards but still deconstructed anyway. Captured separately so this
  // real work isn't lost, without blurring the "chosen priority" scope of
  // priorityStandards itself. "type" is left blank since "Mark the standard
  // type/s" is scoped to the chosen priority standards in the template
  // itself - it's genuinely never marked for these.
  const allDeconstructedCodes = new Set<string>([
    ...Object.keys(nounsMap), ...Object.keys(verbsMap),
    ...Object.keys(knowledgeMap), ...Object.keys(reasoningMap), ...Object.keys(perfMap), ...Object.keys(productMap),
  ]);
  const chosenSet = new Set(result.chosenPriorityCodes);
  const otherDeconstructedStandards: PriorityStandardDeconstruction[] = [];
  for (const code of allDeconstructedCodes) {
    if (chosenSet.has(code)) continue;
    const hasContent = !!(nounsMap[code] || verbsMap[code] || knowledgeMap[code] || reasoningMap[code] || perfMap[code] || productMap[code]);
    if (!hasContent) continue;
    otherDeconstructedStandards.push({
      code,
      type: "",
      nouns: nounsMap[code] || "",
      verbs: verbsMap[code] || "",
      targets: {
        knowledge: knowledgeMap[code] || "",
        reasoning: reasoningMap[code] || "",
        performanceSkill: perfMap[code] || "",
        product: productMap[code] || "",
      },
    });
  }
  result.otherDeconstructedStandards = otherDeconstructedStandards;

  function parseAssessmentBlock(label: string): AssessmentBlock {
    const block: AssessmentBlock = {};
    const i = findRowIndex(rows, label);
    if (i < 0) return block;
    const linkRow = i + 1;
    if (linkRow < rows.length) block.link = rows[linkRow][0];
    const contentRow = i + 3;
    if (contentRow < rows.length && rows[contentRow].length >= 2) {
      block.scoring = rows[contentRow][0];
      block.warmup = rows[contentRow][1];
    }
    return block;
  }
  result.postAssessment = parseAssessmentBlock("Determine Post Assessment");
  result.preAssessment = parseAssessmentBlock("Determine Pre-Assessment");
  result.commonAssessment = parseAssessmentBlock("Common Standard Assessment");

  // Unit Curriculum Map table
  let cmIdx = -1;
  for (let i = 0; i < rows.length; i++) {
    const row = rows[i];
    if (row && row[0]?.trim() === "Standards" && row.length > 1 && row[1].includes("Content and Vocabulary")) {
      cmIdx = i;
      break;
    }
  }
  if (cmIdx >= 0) {
    let i = cmIdx + 2; // skip header row and the italic instructions row
    const curriculumRows: CurriculumRow[] = [];
    while (i < rows.length) {
      const row = rows[i];
      if (!row || !row[0]?.trim()) {
        i++;
        continue;
      }
      if (row[0].includes("Determine Pre-Assessment") || row[0].includes("Common Standard Assessment")) break;
      if (row.length >= 5) {
        curriculumRows.push({
          standard: row[0],
          contentVocab: row[1],
          targetOrder: row[2],
          assessmentNote: row[3],
          strategies: row[4]?.trim() ? [{ name: row[4], type: "curriculum" }] : [],
        });
      }
      i++;
    }
    result.curriculumRows = curriculumRows;
  }

  return cleanAllStrings(result);
}

/** Converts every <table> in mammoth's HTML output back into the same
 * pipe-delimited text format the existing text-based parser already
 * expects, so parseUnitMapRawText can run unchanged against a much more
 * reliable input (the actual docx structure) instead of Google Drive's
 * lossy plain-text export - see the module-level comment for why that
 * matters (silently shifted/compressed empty cells, no highlight info). */
export function htmlToUnitMapPipeText(html: string): string {
  // Walk the HTML in document order, alternating between table blocks
  // (converted to pipe-delimited text) and whatever text sits between them -
  // crucially including standalone "Unit N ... (Grade N)" delimiter lines,
  // which is what splitIntoUnitChunks uses to detect unit boundaries in a
  // document that bundles multiple units into one file. Extracting only
  // <table> content (the original version of this function) silently drops
  // those lines entirely, causing a 3-unit document to be misread as one
  // giant unit - caught by testing against History's real 3-unit file.
  const segments: string[] = [];
  let lastIndex = 0;
  const tableRegex = /<table[\s\S]*?<\/table>/gi;
  let match: RegExpExecArray | null;
  while ((match = tableRegex.exec(html)) !== null) {
    const between = html.slice(lastIndex, match.index);
    const betweenText = between.replace(/<[^>]+>/g, "\n").replace(/&amp;/g, "&").replace(/&nbsp;/g, " ");
    const unitLineMatch = betweenText.match(/^\s*Unit\s+\d+[^\n]*\(Grade\s+\d+\)\s*$/m);
    if (unitLineMatch) segments.push(unitLineMatch[0].trim());

    const tableHtml = match[0];
    const rowMatches = tableHtml.match(/<tr[\s\S]*?<\/tr>/gi) || [];
    const lines = rowMatches.map((rowHtml) => {
      const cellMatches = rowHtml.match(/<(th|td)[\s\S]*?<\/\1>/gi) || [];
      const cells = cellMatches.map((c) => {
        let text = c.replace(/^<(th|td)[^>]*>/i, "").replace(/<\/(th|td)>$/i, "");
        text = text.replace(/<\/p>\s*<p[^>]*>/gi, " ");
        text = text.replace(/<[^>]+>/g, "");
        text = text
          .replace(/&amp;/g, "&").replace(/&lt;/g, "<").replace(/&gt;/g, ">")
          .replace(/&#39;/g, "'").replace(/&quot;/g, '"').replace(/&nbsp;/g, " ");
        return text.replace(/\s+/g, " ").trim();
      });
      return "| " + cells.join(" | ") + " |";
    });
    segments.push(lines.join("\n"));
    lastIndex = match.index + tableHtml.length;
  }
  return segments.join("\n\n");
}
// The plain-text export this parser otherwise runs on has no way to know
// which codes were actually highlighted in that row - parseTypeMarkingRow
// can only guess via substring containment, which over-reports whenever a
// codes-blob is reused across multiple category columns (a real, common
// pattern - not a copy-paste mistake, since the row is genuinely one blob
// of codes repeated per category with only some of them meant to be
// selected via highlighting). When the raw .docx is available, mammoth's
// HTML output (converted with a "highlight => mark" style map) preserves
// exactly which codes were highlighted, which is the actual ground truth
// the source document encodes - confirmed against python-docx's direct
// XML read of the same file, both agreeing exactly.

function extractCellTextPreservingMarks(cellHtml: string): string {
  let text = cellHtml.replace(/^<(th|td)[^>]*>/i, "").replace(/<\/(th|td)>$/i, "");
  text = text.replace(/<\/p>\s*<p[^>]*>/gi, " ");
  text = text.replace(/<(?!\/?mark\b)[^>]+>/gi, "");
  text = text
    .replace(/&amp;/g, "&").replace(/&lt;/g, "<").replace(/&gt;/g, ">")
    .replace(/&#39;/g, "'").replace(/&quot;/g, '"').replace(/&nbsp;/g, " ");
  return text.replace(/\s+/g, " ").trim();
}

function extractHighlightedText(cellTextWithMarks: string): string {
  const marks = [...cellTextWithMarks.matchAll(/<mark>([\s\S]*?)<\/mark>/gi)];
  return marks.map((m) => m[1]).join("");
}

/** Given the raw HTML of the row containing "Mark the standard type/s"
 * (from mammoth with a "highlight => mark" style map) and the unit's
 * chosen priority codes, returns {code: [categories]} based on which
 * codes are actually highlighted under each category cell - the reliable
 * ground truth, in place of parseTypeMarkingRow's text-only guess. */
export function extractHighlightedTypeMarking(fullHtml: string, knownCodes: string[], occurrence = 0): Record<string, string[]> {
  let searchFrom = 0;
  let rowIdx = -1;
  for (let n = 0; n <= occurrence; n++) {
    rowIdx = fullHtml.indexOf("Mark the standard type", searchFrom);
    if (rowIdx === -1) return {};
    searchFrom = rowIdx + 1;
  }
  const rowStart = fullHtml.lastIndexOf("<tr>", rowIdx);
  const rowEndIdx = fullHtml.indexOf("</tr>", rowIdx);
  if (rowStart === -1 || rowEndIdx === -1) return {};
  const rowHtml = fullHtml.slice(rowStart, rowEndIdx + 5);
  const cellMatches = rowHtml.match(/<(th|td)[\s\S]*?<\/\1>/gi) || [];

  const categoryNames = ["Knowledge", "Reasoning", "Performance Skill", "Product"];
  const result: Record<string, string[]> = {};
  let i = 1;
  while (i < cellMatches.length - 1) {
    const codesCellRaw = extractCellTextPreservingMarks(cellMatches[i]);
    const categoryCellRaw = extractCellTextPreservingMarks(cellMatches[i + 1]);
    if (categoryNames.includes(categoryCellRaw)) {
      const highlightedText = extractHighlightedText(codesCellRaw);
      if (highlightedText) {
        knownCodes.forEach((code) => {
          if (highlightedText.includes(code)) {
            (result[code] ||= []).push(categoryCellRaw);
          }
        });
      }
    }
    i += 2;
  }
  return result;
}

/** Re-parses a unit map's priorityStandards' "type" field using highlight
 * data from the raw docx's HTML, when available and non-empty for at least
 * one standard - otherwise leaves the original text-based guess in place
 * (some documents genuinely have no highlighting applied at all, in which
 * case falling back is better than reporting nothing marked for anyone). */
export function refineTypeMarkingWithHighlights(parsed: ParsedUnitMap, fullHtml: string, occurrence = 0): ParsedUnitMap {
  const codes = parsed.priorityStandards.map((ps) => ps.code);
  const highlightMap = extractHighlightedTypeMarking(fullHtml, codes, occurrence);
  if (Object.keys(highlightMap).length === 0) return parsed;
  return {
    ...parsed,
    priorityStandards: parsed.priorityStandards.map((ps) => {
      const categories = highlightMap[ps.code];
      return categories ? { ...ps, type: categories.join(", ") } : ps;
    }),
  };
}
