// Parses a Google Drive markdown-table text export of a district Projection
// Map document into the app's Unit/StandardEntry data structures.
//
// IMPORTANT: the plain-text/markdown export of these documents (the same
// export used for Unit Map parsing) was found to silently compress or drop
// empty table cells in a way that shifts subsequent cells left by one or
// more columns - confirmed by comparing against the actual visual document
// and against python-docx's direct XML-based reading of the same file.
// This corruption is NOT detectable from the text alone (row cell-counts
// still "add up"), so it cannot be caught by validation after the fact.
// The reliable path is to convert the raw .docx file to HTML via mammoth
// (which correctly preserves every cell, including empty ones) and parse
// the resulting HTML table instead. See parseProjectionMapFromHtml below -
// this is the primary, supported entry point. The plain-text based
// parseProjectionMapRawText is kept only as an illustration of the
// original (broken) approach and is not used by the import UI.

import { parseRows, cleanMarkdownLinks, unescapeMarkdown, extractCodes, extractCellTextPreservingMarks, extractHighlightedText } from "./parser";
import type { StandardEntry } from "./types";

export interface ParsedProjectionUnit {
  name: string;
  days: string;
  dates: string;
  cells: Record<string, StandardEntry[]>;
}

export interface ParsedProjectionMap {
  units: ParsedProjectionUnit[];
  strandNames: string[];
}

function cleanCellText(text: string): string {
  return unescapeMarkdown(cleanMarkdownLinks(text || "")).trim();
}

const STOP_PATTERNS = [
  /^Italics:/i,
  /^Notes from the mapping team/i,
  /^Revision Notes/i,
  /^Standard\s*$/i,
];

/** Builds one or more StandardEntry objects for a single cell.
 *
 * Priority is only ever asserted from a real signal in the source document:
 * (1) per-code highlight data, when available - a cell can genuinely mix
 * priority and supporting standards together (e.g. Math's "Ratio &
 * Introductory Number System" cell highlights only "6.RP.1-3", leaving
 * "6.NS.1-3" and "6.EE1-2" in the same cell unhighlighted/supporting); or
 * (2) explicit strand-label wording ("(Priority)", "Supporting") - itself a
 * real, literal statement from the document, not an inference.
 *
 * When NEITHER signal is available - no highlight data at all (e.g. a PDF
 * source, or a docx where the team never used highlighting) and no
 * "(Priority)"/"Supporting" wording in the strand name - this deliberately
 * does NOT default to true or false. Priority is left unclear and flagged
 * via priorityUnclear, so the completeness check reports "priority
 * standards not clearly marked" as a finding for the team to resolve in
 * their next revision, rather than the tool silently guessing on their
 * behalf. Cells with no recognizable standard code at all (plain prose
 * like "Introductions") aren't flagged - there's no standard being
 * categorized, so priority doesn't apply. */
function buildEntriesForCell(cellTextWithMarks: string, hasHighlightData: boolean, strandName: string): StandardEntry[] {
  const plainText = cellTextWithMarks.replace(/<\/?mark>/gi, "");
  if (!plainText.trim()) return [];

  const codes = extractCodes(plainText);
  if (codes.length === 0) {
    return [{ code: "", desc: plainText, priority: false, needsSupplement: plainText.includes("*"), partial: false }];
  }

  if (hasHighlightData) {
    const highlightedText = extractHighlightedText(cellTextWithMarks);
    if (highlightedText) {
      return codes.map((code) => ({
        code, desc: plainText, priority: highlightedText.includes(code),
        needsSupplement: plainText.includes("*"), partial: false,
      }));
    }
  }

  const lowerStrand = strandName.toLowerCase();
  if (lowerStrand.includes("supporting")) {
    return codes.map((code) => ({ code, desc: plainText, priority: false, needsSupplement: plainText.includes("*"), partial: false }));
  }
  if (lowerStrand.includes("priority")) {
    return codes.map((code) => ({ code, desc: plainText, priority: true, needsSupplement: plainText.includes("*"), partial: false }));
  }

  return codes.map((code) => ({
    code, desc: plainText, priority: false, priorityUnclear: true,
    needsSupplement: plainText.includes("*"), partial: false,
  }));
}

function buildProjectionMapFromRows(rows: string[][], hasHighlightData = false): ParsedProjectionMap {
  if (rows.length < 2) return { units: [], strandNames: [] };

  // Row 0: header row - first cell is a grade/title label (skipped), the
  // rest are unit names, often with an embedded day count in one of a few
  // observed conventions: "Unit 1 28 days", "Unit 1 ~ 15 days", or
  // "Unit 1 # Days 25" (a literal "#" placeholder the teacher filled in
  // after rather than replacing).
  const headerRow = rows[0];
  const unitNames: string[] = [];
  const unitDays: string[] = [];
  for (let i = 1; i < headerRow.length; i++) {
    const cell = cleanCellText(headerRow[i]);
    const dayMatch = cell.match(/#?\s*days?\s*[:\-]?\s*(\d+)|(\d+)\s*days?\b/i);
    const days = dayMatch ? (dayMatch[1] || dayMatch[2]) : "";
    const name = dayMatch ? cell.slice(0, dayMatch.index).replace(/[~\s]+$/, "").trim() : cell.trim();
    // "Column ${i}" rather than "Unit ${i}" - an unnamed column (e.g. this
    // grade's document leaves the first data column label blank, even
    // though it holds real Beginning-of-School content like "Introductions"
    // / "Notebook prep") must not risk colliding with a genuinely-named
    // "Unit N" column elsewhere in the same header row.
    unitNames.push(name || `Column ${i}`);
    unitDays.push(days || "");
  }

  // Row 1: dates row - first cell is a label like "'26-'27 Dates" (skipped).
  const datesRow = rows[1] || [];
  const unitDates: string[] = unitNames.map((_, i) => cleanCellText(datesRow[i + 1] || ""));

  const units: ParsedProjectionUnit[] = unitNames.map((name, i) => ({
    name, days: unitDays[i] || "", dates: unitDates[i] || "", cells: {},
  }));

  // Group rows into per-strand blocks. Most documents put one strand per
  // row, but some (e.g. 7th grade History) spread a single strand's content
  // across several consecutive rows - a main standard statement, then a
  // "Standard Description" label row, then sub-standards, then a
  // "Standard Identifier: HSS-7.1..." metadata row - all with an empty
  // label cell. Only a genuinely new, non-empty label starts a new group;
  // everything else accumulates into the current one, so downstream code
  // extraction sees the full combined text regardless of how many rows the
  // source document happened to spread it across.
  type StrandGroup = { label: string; rows: string[][] };
  const groups: StrandGroup[] = [];
  for (let r = 2; r < rows.length; r++) {
    const row = rows[r];
    const rawLabel = (row[0] || "").replace(/<\/?mark>/gi, "");
    const cleanLabel = cleanCellText(rawLabel);
    const rowHasAnyContent = row.some((c) => c.replace(/<\/?mark>/gi, "").trim());
    if (!cleanLabel) {
      if (!rowHasAnyContent) break; // fully empty row - end of the real table
      if (groups.length > 0) groups[groups.length - 1].rows.push(row);
      continue;
    }
    if (STOP_PATTERNS.some((p) => p.test(cleanLabel))) break;
    groups.push({ label: cleanLabel, rows: [row] });
  }

  const strandNames: string[] = [];
  for (const group of groups) {
    const strandName = group.label;
    strandNames.push(strandName);

    for (let i = 0; i < units.length; i++) {
      const combinedCell = group.rows.map((row) => row[i + 1] || "").filter((c) => c.trim()).join(" ");
      const entries = buildEntriesForCell(combinedCell, hasHighlightData, strandName);
      if (entries.length === 0) continue;
      (units[i].cells[strandName] ||= []).push(...entries);
    }
  }

  return { units, strandNames };
}

/** @deprecated kept only to document the original, unreliable approach - see
 * the module-level comment above. Use parseProjectionMapFromHtml instead. */
export function parseProjectionMapRawText(rawText: string): ParsedProjectionMap {
  return buildProjectionMapFromRows(parseRows(rawText), false);
}

function extractHtmlCellTextPreservingMarks(cellHtml: string): string {
  return extractCellTextPreservingMarks(cellHtml)
    .replace(/&rsquo;/g, "\u2019").replace(/&lsquo;/g, "\u2018");
}

/** Parses the HTML produced by mammoth's docx-to-HTML conversion (see
 * app/admin/import-projection - the browser reads the uploaded .docx as an
 * ArrayBuffer and calls mammoth.convertToHtml client-side with a
 * "highlight => mark" style map, so highlighted text survives as <mark>
 * tags). Regex-based rather than a full DOM parser since mammoth's table
 * output is simple, predictable markup and this avoids an extra
 * dependency. Cell text keeps <mark> tags intact - callers needing plain
 * text should strip them; buildProjectionMapFromRows uses them directly
 * for per-code priority detection. */
export function parseRowsFromHtml(html: string, tableIndex = 0): string[][] {
  const tables = html.match(/<table[\s\S]*?<\/table>/gi) || [];
  if (tables.length <= tableIndex) return [];
  const tableHtml = tables[tableIndex];
  const rowMatches = tableHtml.match(/<tr[\s\S]*?<\/tr>/gi) || [];
  return rowMatches.map((rowHtml) => {
    const cellMatches = rowHtml.match(/<(th|td)[\s\S]*?<\/\1>/gi) || [];
    return cellMatches.map(extractHtmlCellTextPreservingMarks);
  });
}

export function parseProjectionMapFromHtml(html: string, tableIndex = 0): ParsedProjectionMap {
  const rows = parseRowsFromHtml(html, tableIndex);
  const hasHighlightData = rows.some((row) => row.some((cell) => /<mark>/i.test(cell)));
  return buildProjectionMapFromRows(rows, hasHighlightData);
}

