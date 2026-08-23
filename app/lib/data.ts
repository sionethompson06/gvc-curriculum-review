import { sql } from "@vercel/postgres";
import type { SubjectMap, Unit, UnitMap, PriorityStandardDeconstruction, LearningTargets } from "./types";

export const SCHOOLS = ["TEACH Prep", "TEACH Academy", "TEACH Tech"];
export const GRADES = ["K", "1", "2", "3", "4", "5", "6", "7", "8", "9", "10", "11", "12"];

export function slugify(name: string): string {
  return name.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/(^-|-$)/g, "");
}

export function schoolFromSlug(slug: string): string | undefined {
  return SCHOOLS.find((s) => slugify(s) === slug);
}

export async function listSubjects(): Promise<string[]> {
  const { rows } = await sql`SELECT name FROM subjects ORDER BY name`;
  return rows.map((r: any) => r.name);
}

export async function subjectFromSlug(slug: string): Promise<string | undefined> {
  const subjects = await listSubjects();
  return subjects.find((s) => slugify(s) === slug);
}

export async function strandsFor(subject: string): Promise<string[]> {
  const { rows } = await sql`SELECT strands FROM subjects WHERE name = ${subject}`;
  return (rows[0]?.strands as string[]) || [];
}

export async function getNavTree() {
  const { rows } = await sql`SELECT school, grade, subject, id, name, sort_order FROM units ORDER BY school, grade, subject, sort_order`;
  const gradesBySchool: Record<string, string[]> = {};
  const subjectsByKey: Record<string, string[]> = {};
  const unitsByKey: Record<string, { id: string; name: string }[]> = {};
  for (const r of rows as any[]) {
    if (!gradesBySchool[r.school]) gradesBySchool[r.school] = [];
    if (!gradesBySchool[r.school].includes(r.grade)) gradesBySchool[r.school].push(r.grade);
    const subjKey = `${r.school}|||${r.grade}`;
    if (!subjectsByKey[subjKey]) subjectsByKey[subjKey] = [];
    if (!subjectsByKey[subjKey].includes(r.subject)) subjectsByKey[subjKey].push(r.subject);
    const unitKey = `${r.school}|||${r.grade}|||${r.subject}`;
    if (!unitsByKey[unitKey]) unitsByKey[unitKey] = [];
    unitsByKey[unitKey].push({ id: r.id, name: r.name || "(unnamed)" });
  }
  return { gradesBySchool, subjectsByKey, unitsByKey };
}

export async function gradesWithDataForSchool(school: string): Promise<Set<string>> {
  const { rows } = await sql`SELECT DISTINCT grade FROM units WHERE school = ${school}`;
  return new Set((rows as any[]).map((r) => r.grade));
}

export async function subjectsWithData(school: string, grade: string): Promise<string[]> {
  const { rows } = await sql`SELECT DISTINCT subject FROM units WHERE school = ${school} AND grade = ${grade} ORDER BY subject`;
  return (rows as any[]).map((r) => r.subject);
}

export async function getUnitsForSubject(school: string, grade: string, subject: string): Promise<{ id: string; name: string }[]> {
  const { rows } = await sql`SELECT id, name FROM units WHERE school = ${school} AND grade = ${grade} AND subject = ${subject} ORDER BY sort_order`;
  return (rows as any[]).map((r) => ({ id: r.id, name: r.name || "(unnamed)" }));
}

function rowsToSubjectMap(rows: any[]): SubjectMap {
  const units: Unit[] = [];
  const unitMaps: Record<string, UnitMap> = {};
  for (const row of rows) {
    units.push({ id: row.id, name: row.name || "", days: row.days || "", dates: row.dates || "", cells: row.cells || {} });
    if (row.priority_standards !== null && row.priority_standards !== undefined) {
      unitMaps[row.id] = {
        priorityStandards: row.priority_standards || [],
        otherDeconstructedStandards: row.other_deconstructed_standards || [],
        supportingStandards: row.supporting_standards || [],
        preAssessment: row.pre_assessment || {},
        postAssessment: row.post_assessment || {},
        commonAssessment: row.common_assessment || {},
        curriculumRows: row.curriculum_rows || [],
        startDate: row.start_date || "",
        endDate: row.end_date || "",
      };
    }
  }
  return { units, unitMaps };
}

const JOIN_QUERY = `
  SELECT u.id, u.school, u.grade, u.subject, u.name, u.days, u.dates, u.cells, u.sort_order,
         um.priority_standards, um.other_deconstructed_standards, um.supporting_standards, um.pre_assessment, um.post_assessment, um.common_assessment, um.curriculum_rows, um.start_date, um.end_date
  FROM units u LEFT JOIN unit_maps um ON um.unit_id = u.id
`;

export async function getMap(school: string, grade: string, subject: string): Promise<SubjectMap | null> {
  const { rows } = await sql.query(
    JOIN_QUERY + ` WHERE u.school = $1 AND u.grade = $2 AND u.subject = $3 ORDER BY u.sort_order`,
    [school, grade, subject]
  );
  if (rows.length === 0) return null;
  return rowsToSubjectMap(rows);
}

export async function allMapEntries() {
  const { rows } = await sql.query(JOIN_QUERY + ` ORDER BY u.school, u.grade, u.subject, u.sort_order`);
  const grouped: Record<string, { school: string; grade: string; subject: string; map: SubjectMap }> = {};
  for (const row of rows as any[]) {
    const key = `${row.school}|||${row.grade}|||${row.subject}`;
    if (!grouped[key]) grouped[key] = { school: row.school, grade: row.grade, subject: row.subject, map: { units: [], unitMaps: {} } };
    grouped[key].map.units.push({ id: row.id, name: row.name || "", days: row.days || "", dates: row.dates || "", cells: row.cells || {} });
    if (row.priority_standards !== null && row.priority_standards !== undefined) {
      grouped[key].map.unitMaps[row.id] = {
        priorityStandards: row.priority_standards || [],
        otherDeconstructedStandards: row.other_deconstructed_standards || [],
        supportingStandards: row.supporting_standards || [],
        preAssessment: row.pre_assessment || {},
        postAssessment: row.post_assessment || {},
        commonAssessment: row.common_assessment || {},
        curriculumRows: row.curriculum_rows || [],
        startDate: row.start_date || "",
        endDate: row.end_date || "",
      };
    }
  }
  return Object.values(grouped);
}

export async function getReviewsForUnit(unitId: string) {
  const { rows } = await sql`SELECT id, review_text, created_at FROM ai_reviews WHERE unit_id = ${unitId} ORDER BY created_at DESC`;
  return rows as { id: number; review_text: string; created_at: string }[];
}

export async function getNotesForUnit(unitId: string) {
  const { rows } = await sql`SELECT id, note_text, author, created_at FROM notes WHERE unit_id = ${unitId} ORDER BY created_at DESC`;
  return rows as { id: number; note_text: string; author: string | null; created_at: string }[];
}

// --- Standard code normalization for alignment checking (pure functions, no DB) ---
function extractStandardTokens(text: string): string[] {
  if (!text) return [];
  const t = text.replace(/CCSS\.ELA-LITERACY\./gi, "").replace(/CCSS\.MATH\.CONTENT\./gi, "");
  const tokens: string[] = [];
  // Letter-prefix codes (RH, WH, ELD.PI, MP, RP, NS, EE, SP, G, etc.) are always
  // uppercase in every real source document seen so far. Restricting to [A-Z]
  // (rather than [A-Za-z]) avoids false positives where an ordinary lowercase
  // word ends up glued directly to a following standard code with no space
  // (e.g. source text reading "...use of fire.6.1.2. Identify..." should not
  // be read as the code "fire.6.1.2").
  const re1 = /\b([A-Z]{1,6}\.\d+(?:\.\d+){0,2}(?:-\d+)?)\b/g;
  let m;
  while ((m = re1.exec(t))) tokens.push(m[1]);
  const re2 = /\b(\d+\.\d+(?:-\d+)?)\b/g;
  while ((m = re2.exec(t))) if (!tokens.includes(m[1])) tokens.push(m[1]);
  const re3 = /\b([A-Za-z0-9]+-[A-Za-z]{1,4}\d+-\d+)\b/g;
  while ((m = re3.exec(t))) if (!tokens.includes(m[1])) tokens.push(m[1]);
  return tokens;
}

function expandToken(tok: string): string[] {
  const m = tok.match(/^(.*?)(\d+)-(\d+)$/);
  if (m) {
    const prefix = m[1], start = +m[2], end = +m[3];
    if (end > start && end - start < 20 && !prefix.includes("-")) {
      const out: string[] = [];
      for (let n = start; n <= end; n++) out.push(prefix + n);
      return out;
    }
  }
  return [tok];
}

export function normalizeCodes(text: string): string[] {
  const toks = extractStandardTokens(text || "");
  let out: string[] = [];
  toks.forEach((t) => (out = out.concat(expandToken(t))));
  return Array.from(new Set(out));
}

function parseDateLoose(str?: string): Date | null {
  if (!str) return null;
  const s = str.trim();
  let m = s.match(/([A-Za-z]+)\s+(\d{1,2}),?\s*(\d{4})/);
  if (m) {
    const d = new Date(`${m[1]} ${m[2]}, ${m[3]}`);
    if (!isNaN(d.getTime())) return d;
  }
  m = s.match(/(\d{1,2})\/(\d{1,2})/);
  if (m) {
    const month = +m[1], day = +m[2];
    const year = month >= 7 ? 2026 : 2027;
    const d = new Date(year, month - 1, day);
    if (!isNaN(d.getTime())) return d;
  }
  // "Month Year" with no day at all (e.g. "Aug 2026", "Sept 2026") - some
  // Unit Maps only record a month, not a specific day. Treat as the 1st.
  m = s.match(/^([A-Za-z]+)\s+(\d{4})$/);
  if (m) {
    const d = new Date(`${m[1]} 1, ${m[2]}`);
    if (!isNaN(d.getTime())) return d;
  }
  return null;
}

function parseDateRange(str?: string): { start: Date | null; end: Date | null } {
  if (!str) return { start: null, end: null };
  const parts = str.split(/-|–|—/);
  if (parts.length >= 2) {
    return { start: parseDateLoose(parts[0]), end: parseDateLoose(parts.slice(1).join("-")) };
  }
  return { start: parseDateLoose(str), end: null };
}

function fmtDate(d: Date | null): string {
  return d ? d.toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" }) : "—";
}

export interface AlignmentResult {
  missingFromUnitMap: string[];
  extraInUnitMap: string[];
  dateIssue: null | {
    kind: "mismatch" | "missingProjectionDates" | "missingUnitMapDates";
    projStart: string; projEnd: string; umStart: string; umEnd: string;
    startDiff: number | null; endDiff: number | null;
  };
  hasUnitMap: boolean;
}

export function computeUnitAlignment(unit: Unit, um: UnitMap | null): AlignmentResult {
  const projCodes = new Set<string>();
  Object.values(unit.cells || {}).forEach((stds) =>
    stds.forEach((s) => normalizeCodes(`${s.code || ""} ${s.desc || ""}`).forEach((c) => projCodes.add(c)))
  );
  const umCodes = new Set<string>();
  if (um) {
    (um.priorityStandards || []).forEach((ps) => normalizeCodes(ps.code || "").forEach((c) => umCodes.add(c)));
    (um.curriculumRows || []).forEach((r) => normalizeCodes(r.standard || "").forEach((c) => umCodes.add(c)));
  }
  const missingFromUnitMap = [...projCodes].filter((c) => !umCodes.has(c));
  const extraInUnitMap = [...umCodes].filter((c) => !projCodes.has(c));

  let dateIssue: AlignmentResult["dateIssue"] = null;
  const projRange = parseDateRange(unit.dates);
  const projHasDates = !!projRange.start;
  const umHasDates = !!(um?.startDate && um?.endDate);

  if (um && umHasDates && !projHasDates) {
    // The Unit Map has real dates, but the Projection Map has none at all for
    // this unit - timeline alignment genuinely cannot be verified, which is
    // itself worth surfacing rather than silently passing as "aligned".
    const umRange = { start: parseDateLoose(um.startDate), end: parseDateLoose(um.endDate) };
    dateIssue = {
      kind: "missingProjectionDates",
      projStart: "—", projEnd: "—",
      umStart: fmtDate(umRange.start), umEnd: fmtDate(umRange.end),
      startDiff: null, endDiff: null,
    };
  } else if (um && projHasDates && !umHasDates) {
    // The reverse: the Unit Map exists but never filled in its own Plan
    // Start Date / Projected End Date fields, so it can't be checked against
    // a Projection Map that does have dates.
    dateIssue = {
      kind: "missingUnitMapDates",
      projStart: fmtDate(projRange.start), projEnd: fmtDate(projRange.end),
      umStart: "—", umEnd: "—",
      startDiff: null, endDiff: null,
    };
  } else if (um && umHasDates && projHasDates) {
    const umRange = { start: parseDateLoose(um.startDate), end: parseDateLoose(um.endDate) };
    if (umRange.start) {
      const startDiff = Math.round((umRange.start.getTime() - projRange.start!.getTime()) / (1000 * 60 * 60 * 24));
      const endDiff =
        projRange.end && umRange.end
          ? Math.round((umRange.end.getTime() - projRange.end.getTime()) / (1000 * 60 * 60 * 24))
          : null;
      if (Math.abs(startDiff) >= 2 || (endDiff !== null && Math.abs(endDiff) >= 2)) {
        dateIssue = {
          kind: "mismatch",
          projStart: fmtDate(projRange.start), projEnd: fmtDate(projRange.end),
          umStart: fmtDate(umRange.start), umEnd: fmtDate(umRange.end),
          startDiff, endDiff,
        };
      }
    }
  }

  return { missingFromUnitMap, extraInUnitMap, dateIssue, hasUnitMap: !!um };
}

export async function detectDuplicateContent() {
  const entries = await allMapEntries();
  const bySubjectSchool: Record<string, { grade: string; sig: string }[]> = {};
  entries.forEach(({ school, grade, subject, map }) => {
    const codes: string[] = [];
    map.units.forEach((u) => Object.values(u.cells || {}).forEach((stds) => stds.forEach((s) => codes.push(s.code))));
    if (codes.length === 0) return;
    const sig = codes.join("|");
    const k = `${school}|||${subject}`;
    (bySubjectSchool[k] ||= []).push({ grade, sig });
  });
  const dups: { school: string; subject: string; gradeA: string; gradeB: string }[] = [];
  Object.entries(bySubjectSchool).forEach(([k, list]) => {
    const [school, subject] = k.split("|||");
    for (let i = 0; i < list.length; i++) {
      for (let j = i + 1; j < list.length; j++) {
        if (list[i].sig === list[j].sig) {
          dups.push({ school, subject, gradeA: list[i].grade, gradeB: list[j].grade });
        }
      }
    }
  });
  return dups;
}

// --- Template completeness checking, grounded in the district's required Unit Map template ---
// A unit map is only "complete" if it satisfies every required section of that template:
// priority standard(s) chosen + typed, nouns/verbs deconstructed, all 4 learning target
// categories, a real (non-placeholder) pre- and post-assessment, and curriculum map rows.
// "Common Standard Assessment" is deliberately excluded - it's not part of the required template.
function isPlaceholderText(text?: string): boolean {
  if (!text) return true;
  const t = text.trim().toLowerCase();
  if (t.length === 0) return true;
  if (t.includes("paste link") || t.includes("paste the link")) return true;
  return false;
}

export interface TemplateCompleteness {
  missingItems: string[];
  totalChecks: number;
  passedChecks: number;
}

export function computeTemplateCompleteness(um: UnitMap | null): TemplateCompleteness {
  const missing: string[] = [];
  let total = 0, passed = 0;
  const check = (ok: boolean, label: string) => {
    total++;
    if (ok) passed++; else missing.push(label);
  };

  if (!um) {
    return { missingItems: ["No Unit Map on file for this unit"], totalChecks: 1, passedChecks: 0 };
  }

  check((um.priorityStandards || []).length > 0, "No priority standard(s) chosen for deconstruction");

  const priorityStandards = um.priorityStandards || [];
  priorityStandards.forEach((ps) => {
    check(!!ps.type && ps.type.trim().length > 0, `${ps.code}: standard type (Knowledge/Reasoning/Performance Skill/Product) not marked`);
    check(!!ps.nouns && ps.nouns.trim().length > 0, `${ps.code}: nouns not listed`);
    check(!!ps.verbs && ps.verbs.trim().length > 0, `${ps.code}: verbs not listed`);
    check(!!ps.targets?.knowledge, `${ps.code}: Knowledge target missing`);
    check(!!ps.targets?.reasoning, `${ps.code}: Reasoning target missing`);
    check(!!ps.targets?.performanceSkill, `${ps.code}: Performance Skill target missing`);
    check(!!ps.targets?.product, `${ps.code}: Product target missing`);
  });

  check(!isPlaceholderText(um.postAssessment?.link), "Post-Assessment link not filled in (template placeholder still present)");
  check(!isPlaceholderText(um.postAssessment?.scoring), "Post-Assessment scoring agreements missing");
  check(!isPlaceholderText(um.preAssessment?.link), "Pre-Assessment link not filled in (template placeholder still present)");
  check(!isPlaceholderText(um.preAssessment?.scoring), "Pre-Assessment scoring agreements missing");
  check(!!um.startDate && !!um.endDate, "Plan Start Date / Projected End Date not filled in");

  const rows = um?.curriculumRows || [];
  if (priorityStandards.length === 0) {
    check(false, "A curriculum map row exists for each priority standard");
    check(false, "Instructional strategies logged for each curriculum map row");
  } else {
    check(
      rows.length >= priorityStandards.length,
      rows.length < priorityStandards.length ? `Curriculum map has ${rows.length}/${priorityStandards.length} rows` : "A curriculum map row exists for each priority standard"
    );
    const missingVocab = rows.filter((r) => !r.contentVocab || !r.contentVocab.trim()).length;
    check(missingVocab === 0, missingVocab ? `${missingVocab} curriculum map row(s) missing Content and Vocabulary` : "Content and Vocabulary filled for each curriculum map row");
    const missingTargetOrder = rows.filter((r) => !r.targetOrder || !r.targetOrder.trim()).length;
    check(missingTargetOrder === 0, missingTargetOrder ? `${missingTargetOrder} curriculum map row(s) missing Learning Targets (in teaching order)` : "Learning Targets (in teaching order) filled for each curriculum map row");
    const missingStrategies = rows.filter((r) => (r.strategies || []).length === 0).length;
    check(missingStrategies === 0, missingStrategies ? `${missingStrategies} curriculum map row(s) have no instructional strategies logged` : "Instructional strategies logged for each curriculum map row");
  }

  return { missingItems: missing, totalChecks: total, passedChecks: passed };
}

// --- Internal Unit Map alignment: checks whether the different sections of
// the SAME unit map agree with each other, independent of the Projection Map. ---
export interface InternalAlignmentResult {
  priorityMissingFromCurriculumMap: string[];
  typeTargetMismatches: { code: string; categories: string[] }[];
  verbCategoryMismatches: { code: string; recognizedVerbs: string[]; verbCategoryPairs: { verb: string; categories: string[] }[]; markedNotSupportedByVerbs: string[]; verbSuggestsNotMarked: string[] }[];
  droppedTargets: { code: string; statements: { category: string; statement: string }[] }[];
}

const TARGET_CATEGORY_LABELS: { key: keyof NonNullable<UnitMap["priorityStandards"][number]["targets"]>; label: string }[] = [
  { key: "knowledge", label: "Knowledge" },
  { key: "reasoning", label: "Reasoning" },
  { key: "performanceSkill", label: "Performance Skill" },
  { key: "product", label: "Product" },
];

// Grounded in the district's Learning Target Rubric (see /guide/learning-targets).
// Verbs not listed here (e.g. "understand", "discuss", "trace", "know") are
// deliberately left unmapped - a standard whose only verbs fall outside this
// list is treated as inconclusive rather than guessed at, to avoid false
// positives. "explain" appears under both Knowledge and Reasoning per the
// rubric's own note that context, not the word alone, decides its category.
const VERB_TO_CATEGORIES: Record<string, string[]> = {
  identify: ["Knowledge"], define: ["Knowledge"], list: ["Knowledge"], describe: ["Knowledge"], explain: ["Knowledge", "Reasoning"],
  predict: ["Reasoning"], infer: ["Reasoning"], analyze: ["Reasoning"], evaluate: ["Reasoning"], compare: ["Reasoning"], contrast: ["Reasoning"], justify: ["Reasoning"], synthesize: ["Reasoning"],
  observe: ["Performance Skill"], listen: ["Performance Skill"], perform: ["Performance Skill"], do: ["Performance Skill"], question: ["Performance Skill"], speak: ["Performance Skill"], assemble: ["Performance Skill"], operate: ["Performance Skill"], use: ["Performance Skill"], measure: ["Performance Skill"], model: ["Performance Skill"], demonstrate: ["Performance Skill"], solve: ["Performance Skill"], apply: ["Performance Skill"], execute: ["Performance Skill"], implement: ["Performance Skill"],
  write: ["Product"], generate: ["Product"], design: ["Product"], combine: ["Product"], devise: ["Product"], modify: ["Product"], create: ["Product"], produce: ["Product"], construct: ["Product"], develop: ["Product"], formulate: ["Product"], propose: ["Product"],
};

function extractRecognizedVerbs(verbsText: string): string[] {
  if (!verbsText) return [];
  const lower = verbsText.toLowerCase();
  return Object.keys(VERB_TO_CATEGORIES).filter((v) => new RegExp(`\\b${v}\\b`).test(lower));
}

export function computeInternalAlignment(um: UnitMap | null): InternalAlignmentResult {
  if (!um) return { priorityMissingFromCurriculumMap: [], typeTargetMismatches: [], verbCategoryMismatches: [], droppedTargets: [] };
  const priorityStandards = um.priorityStandards || [];

  // Check 1: a standard chosen under CHOOSE PRIORITY STANDARD(S) never shows
  // up anywhere in the Unit Curriculum Map - meaning it was deconstructed but
  // never actually carried through to lesson-level planning.
  const curriculumCodes = new Set<string>();
  (um.curriculumRows || []).forEach((r) => normalizeCodes(r.standard || "").forEach((c) => curriculumCodes.add(c)));

  const priorityMissingFromCurriculumMap = priorityStandards
    .map((ps) => ps.code)
    .filter((code) => {
      const normalized = normalizeCodes(code);
      return normalized.length === 0 || !normalized.some((c) => curriculumCodes.has(c));
    });

  // Check 2: a Learning Target category has real content written for it, but
  // the standard's own type marking doesn't include that category - meaning
  // the type marking (Knowledge/Reasoning/Performance Skill/Product) doesn't
  // actually match the depth of target-writing that was done for it.
  const typeTargetMismatches: { code: string; categories: string[] }[] = [];
  priorityStandards.forEach((ps) => {
    if (!ps.type) return; // if type is entirely missing, that's already flagged by completeness
    const typeLower = ps.type.toLowerCase();
    const missingCategories: string[] = [];
    TARGET_CATEGORY_LABELS.forEach(({ key, label }) => {
      const hasTarget = !!ps.targets?.[key] && ps.targets![key]!.trim().length > 0;
      const mentionedInType = typeLower.includes(label.toLowerCase());
      if (hasTarget && !mentionedInType) missingCategories.push(label);
    });
    if (missingCategories.length > 0) {
      typeTargetMismatches.push({ code: ps.code, categories: missingCategories });
    }
  });

  // Check 3: does the standard's own type marking "stay on verb", per the
  // district's Learning Target Rubric? A standard whose only verbs fall
  // outside the rubric's four verb lists is skipped entirely (inconclusive,
  // not flagged) - this is a deliberate tradeoff to avoid false positives on
  // very common unmapped verbs like "understand", at the cost of not
  // catching real misalignments on those standards automatically.
  const verbCategoryMismatches: InternalAlignmentResult["verbCategoryMismatches"] = [];
  priorityStandards.forEach((ps) => {
    if (!ps.type || !ps.verbs) return;
    const recognizedVerbs = extractRecognizedVerbs(ps.verbs);
    if (recognizedVerbs.length === 0) return; // inconclusive - no known verbs to check against

    const suggestedCategories = new Set<string>();
    recognizedVerbs.forEach((v) => VERB_TO_CATEGORIES[v].forEach((c) => suggestedCategories.add(c)));

    const markedCategories = ps.type.split(",").map((c) => c.trim()).filter(Boolean);
    const markedSet = new Set(markedCategories);

    const markedNotSupportedByVerbs = markedCategories.filter((c) => !suggestedCategories.has(c));

    const verbSuggestsNotMarked: string[] = [];
    recognizedVerbs.forEach((v) => {
      const cats = VERB_TO_CATEGORIES[v];
      const anyMarked = cats.some((c) => markedSet.has(c));
      if (!anyMarked) {
        const label = cats.length > 1 ? `${v} (${cats.join(" or ")})` : v;
        if (!verbSuggestsNotMarked.some((existing) => existing.startsWith(v))) verbSuggestsNotMarked.push(label);
      }
    });

    if (markedNotSupportedByVerbs.length > 0 || verbSuggestsNotMarked.length > 0) {
      const verbCategoryPairs = recognizedVerbs.map((v) => ({ verb: v, categories: VERB_TO_CATEGORIES[v] }));
      verbCategoryMismatches.push({ code: ps.code, recognizedVerbs, verbCategoryPairs, markedNotSupportedByVerbs, verbSuggestsNotMarked });
    }
  });

  // Check 4: an individual "I can" statement was written during deconstruction
  // but never carried into the curriculum map's teaching sequence (targetOrder)
  // at all - distinct from Check 1, which only checks whether the standard as
  // a whole made it into the curriculum map, not whether every target it was
  // deconstructed into actually did. Runs across both chosen priority
  // standards and any other standards that were still fully deconstructed
  // without being formally marked priority.
  const droppedTargets: InternalAlignmentResult["droppedTargets"] = [];
  [...priorityStandards, ...(um.otherDeconstructedStandards || [])].forEach((ps) => {
    if (!ps.targets) return;
    const matchingRows = (um.curriculumRows || []).filter((r) => {
      const rowCodes = normalizeCodes(r.standard || "");
      return normalizeCodes(ps.code || "").some((c) => rowCodes.includes(c));
    });
    if (matchingRows.length === 0) return; // already flagged by Check 1
    const curriculumStatements = new Set(
      matchingRows.flatMap((r) => splitIntoStatements(r.targetOrder).map(normalizeStatement))
    );
    const missing: { category: string; statement: string }[] = [];
    TARGET_CATEGORY_LABELS.forEach(({ key, label }) => {
      splitIntoStatements(ps.targets?.[key]).forEach((stmt) => {
        if (!curriculumStatements.has(normalizeStatement(stmt))) missing.push({ category: label, statement: stmt });
      });
    });
    if (missing.length > 0) droppedTargets.push({ code: ps.code, statements: missing });
  });

  return { priorityMissingFromCurriculumMap, typeTargetMismatches, verbCategoryMismatches, droppedTargets };
}

// --- Projection Map completeness: checks whether the Projection Map itself
// (independent of any Unit Map) is fully filled in for every unit. ---
export interface ProjectionUnitIssue {
  unitId: string;
  unitName: string;
  issues: string[];
}

export interface ProjectionCompletenessResult {
  totalUnits: number;
  unitsWithIssues: ProjectionUnitIssue[];
}

export function computeProjectionMapCompleteness(units: Unit[]): ProjectionCompletenessResult {
  const unitsWithIssues: ProjectionUnitIssue[] = [];
  units.forEach((u) => {
    const issues: string[] = [];
    if (!u.name || !u.name.trim()) issues.push("Unit name missing");
    if (!u.dates || !u.dates.trim()) issues.push("Dates not filled in");
    const allEntries = Object.values(u.cells || {}).flat();
    const hasContent = allEntries.some((e) => e.desc && e.desc.trim().length > 0);
    if (!hasContent) issues.push("No standards listed for this unit");
    const hasPriority = allEntries.some((e) => e.priority);
    if (!hasPriority) issues.push("No priority standard(s) marked for this unit");
    if (issues.length > 0) {
      unitsWithIssues.push({ unitId: u.id, unitName: u.name || "(unnamed)", issues });
    }
  });
  return { totalUnits: units.length, unitsWithIssues };
}

// --- Curriculum Map Learning Target labeling: matches each individual "I can"
// statement in a curriculum row's Learning Targets (targetOrder) field back
// to the specific deconstruction category (Knowledge/Reasoning/Performance
// Skill/Product) it was originally written under, by comparing the actual
// statement text - no new data is stored, this just traces what's already
// there back to its source. A statement that doesn't match any category
// either came from a different standard's targets, or was written directly
// into the curriculum map without being deconstructed first - both worth
// surfacing rather than silently leaving unlabeled. ---
function normalizeStatement(s: string): string {
  return s.trim().replace(/\s+/g, " ").replace(/\.+$/, "").toLowerCase();
}

export function splitIntoStatements(text?: string): string[] {
  if (!text) return [];
  return text.split(/(?=I can\s)/).map((s) => s.trim()).filter(Boolean);
}

export function matchTargetStatementToCategory(statement: string, ps: PriorityStandardDeconstruction | undefined): string | null {
  if (!ps || !ps.targets) return null;
  const normalizedStatement = normalizeStatement(statement);
  for (const { key, label } of TARGET_CATEGORY_LABELS) {
    const fragments = splitIntoStatements(ps.targets[key]).map(normalizeStatement);
    if (fragments.includes(normalizedStatement)) return label;
  }
  return null;
}

export function findMatchingPriorityStandard(rowStandardText: string, priorityStandards: PriorityStandardDeconstruction[], otherDeconstructedStandards: PriorityStandardDeconstruction[] = []): PriorityStandardDeconstruction | undefined {
  const rowCodes = normalizeCodes(rowStandardText || "");
  const combined = [...priorityStandards, ...otherDeconstructedStandards];
  return combined.find((ps) => normalizeCodes(ps.code || "").some((c) => rowCodes.includes(c)));
}

// --- Flattens every check (completeness, external alignment, internal
// alignment) into a single list of human-readable issue strings, so two
// points in time can be compared with plain set difference - used to show
// "what's resolved / what's new" when a Unit Map is re-imported over an
// existing one. Deliberately re-derived fresh each call rather than stored,
// since it's cheap to compute and always reflects the exact wording shown
// elsewhere in the app. ---
export function summarizeIssues(unit: Unit, um: UnitMap | null): string[] {
  const issues: string[] = [];

  const completeness = computeTemplateCompleteness(um);
  completeness.missingItems.forEach((i) => issues.push(`Completeness: ${i}`));

  const align = computeUnitAlignment(unit, um);
  if (align.missingFromUnitMap.length) issues.push(`Alignment: Projection Map promises ${align.missingFromUnitMap.join(", ")} but Unit Map never addresses it`);
  if (align.extraInUnitMap.length) issues.push(`Alignment: Unit Map covers ${align.extraInUnitMap.join(", ")}, not on the Projection Map`);
  if (align.dateIssue?.kind === "mismatch") issues.push(`Alignment: Timeline mismatch (Projection ${align.dateIssue.projStart}-${align.dateIssue.projEnd} vs Unit Map ${align.dateIssue.umStart}-${align.dateIssue.umEnd})`);
  if (align.dateIssue?.kind === "missingProjectionDates") issues.push(`Alignment: Projection Map has no dates on file for this unit`);
  if (align.dateIssue?.kind === "missingUnitMapDates") issues.push(`Alignment: Unit Map has no Plan Start/End Date`);

  const internal = computeInternalAlignment(um);
  if (internal.priorityMissingFromCurriculumMap.length) issues.push(`Internal alignment: ${internal.priorityMissingFromCurriculumMap.join(", ")} not carried into the Curriculum Map`);
  internal.typeTargetMismatches.forEach((m) => issues.push(`Internal alignment: ${m.code} has ${m.categories.join("/")} target(s) but type marking omits ${m.categories.length > 1 ? "them" : "it"}`));
  internal.verbCategoryMismatches.forEach((m) => issues.push(`Internal alignment: ${m.code} off-verb (marked ${m.markedNotSupportedByVerbs.join("/") || "-"}, verb suggests ${m.verbSuggestsNotMarked.join("/") || "-"})`));
  internal.droppedTargets.forEach((d) => issues.push(`Internal alignment: ${d.code} has ${d.statements.length} target(s) dropped from the Curriculum Map`));

  return issues;
}

export interface IssueDiff {
  resolved: string[];
  newlyIntroduced: string[];
  stillPresent: string[];
}

export function diffIssues(before: string[], after: string[]): IssueDiff {
  return {
    resolved: before.filter((i) => !after.includes(i)),
    newlyIntroduced: after.filter((i) => !before.includes(i)),
    stillPresent: before.filter((i) => after.includes(i)),
  };
}
