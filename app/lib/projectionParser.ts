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

import { parseRows, cleanMarkdownLinks, unescapeMarkdown } from "./parser";
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

function buildProjectionMapFromRows(rows: string[][]): ParsedProjectionMap {
  if (rows.length < 2) return { units: [], strandNames: [] };

  // Row 0: header row - first cell is a grade/title label (skipped), the
  // rest are unit names, often with an embedded day count (e.g. "Unit 1 28
  // days" or "Unit 1 ~ 15 days").
  const headerRow = rows[0];
  const unitNames: string[] = [];
  const unitDays: string[] = [];
  for (let i = 1; i < headerRow.length; i++) {
    const cell = cleanCellText(headerRow[i]);
    const dayMatch = cell.match(/(\d+)\s*days?\b/i);
    const days = dayMatch ? dayMatch[1] : "";
    const name = dayMatch ? cell.slice(0, dayMatch.index).replace(/[~\s]+$/, "").trim() : cell.trim();
    unitNames.push(name || `Unit ${i}`);
    unitDays.push(days);
  }

  // Row 1: dates row - first cell is a label like "'26-'27 Dates" (skipped).
  const datesRow = rows[1] || [];
  const unitDates: string[] = unitNames.map((_, i) => cleanCellText(datesRow[i + 1] || ""));

  const units: ParsedProjectionUnit[] = unitNames.map((name, i) => ({
    name, days: unitDays[i] || "", dates: unitDates[i] || "", cells: {},
  }));

  const strandNames: string[] = [];
  for (let r = 2; r < rows.length; r++) {
    const row = rows[r];
    const rawLabel = row[0] || "";
    if (!rawLabel.trim() || STOP_PATTERNS.some((p) => p.test(rawLabel.trim()))) {
      // A row with every cell empty (sometimes present at the end of the
      // real table before the legend) isn't a stop condition by itself -
      // only an empty or legend-matching LABEL cell is.
      if (!rawLabel.trim() && row.some((c) => c.trim())) continue;
      break;
    }
    const strandName = cleanCellText(rawLabel);
    if (!strandName) continue;
    strandNames.push(strandName);

    const lowerStrand = strandName.toLowerCase();
    let defaultPriority = true;
    if (lowerStrand.includes("supporting")) defaultPriority = false;
    // "priority" or an unlabeled theme row (e.g. Math) both default to true -
    // the review step is what actually confirms this either way.

    for (let i = 0; i < units.length; i++) {
      const cellText = cleanCellText(row[i + 1] || "");
      if (!cellText) continue;
      const entry: StandardEntry = {
        code: "",
        desc: cellText,
        priority: defaultPriority,
        needsSupplement: cellText.includes("*"),
        partial: false,
      };
      (units[i].cells[strandName] ||= []).push(entry);
    }
  }

  return { units, strandNames };
}

/** @deprecated kept only to document the original, unreliable approach - see
 * the module-level comment above. Use parseProjectionMapFromHtml instead. */
export function parseProjectionMapRawText(rawText: string): ParsedProjectionMap {
  return buildProjectionMapFromRows(parseRows(rawText));
}

function extractHtmlCellText(cellHtml: string): string {
  let text = cellHtml.replace(/^<(th|td)[^>]*>/i, "").replace(/<\/(th|td)>$/i, "");
  // Paragraph boundaries within a cell represent separate lines of content
  // in the source doc - keep them separated by a space rather than letting
  // them run together once tags are stripped.
  text = text.replace(/<\/p>\s*<p[^>]*>/gi, " ");
  text = text.replace(/<[^>]+>/g, "");
  text = text
    .replace(/&amp;/g, "&").replace(/&lt;/g, "<").replace(/&gt;/g, ">")
    .replace(/&#39;/g, "'").replace(/&quot;/g, '"')
    .replace(/&rsquo;/g, "\u2019").replace(/&lsquo;/g, "\u2018").replace(/&nbsp;/g, " ");
  return text.replace(/\s+/g, " ").trim();
}

/** Parses the HTML produced by mammoth's docx-to-HTML conversion (see
 * app/admin/import-projection - the browser reads the uploaded .docx as an
 * ArrayBuffer and calls mammoth.convertToHtml client-side). Regex-based
 * rather than a full DOM parser since mammoth's table output is simple,
 * predictable markup and this avoids an extra dependency. */
export function parseRowsFromHtml(html: string, tableIndex = 0): string[][] {
  const tables = html.match(/<table[\s\S]*?<\/table>/gi) || [];
  if (tables.length <= tableIndex) return [];
  const tableHtml = tables[tableIndex];
  const rowMatches = tableHtml.match(/<tr[\s\S]*?<\/tr>/gi) || [];
  return rowMatches.map((rowHtml) => {
    const cellMatches = rowHtml.match(/<(th|td)[\s\S]*?<\/\1>/gi) || [];
    return cellMatches.map(extractHtmlCellText);
  });
}

export function parseProjectionMapFromHtml(html: string, tableIndex = 0): ParsedProjectionMap {
  return buildProjectionMapFromRows(parseRowsFromHtml(html, tableIndex));
}

