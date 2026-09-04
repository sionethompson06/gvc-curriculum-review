import { NextRequest, NextResponse } from "next/server";
import { sql } from "@vercel/postgres";
import { ensureSchema } from "../../../lib/db";
import { summarizeIssues, diffIssues, logRevision } from "../../../lib/data";
import type { Unit, UnitMap } from "../../../lib/types";

const COLUMN_BY_TYPE: Record<string, string> = {
  preAssessment: "pre_assessment",
  postAssessment: "post_assessment",
  commonAssessment: "common_assessment",
};

export async function POST(req: NextRequest) {
  try {
    await ensureSchema();
    const body = await req.json();
    const { unitId, assessmentType, questions } = body;
    if (!unitId || !assessmentType || !Array.isArray(questions)) {
      return NextResponse.json({ error: "unitId, assessmentType, and questions are required" }, { status: 400 });
    }
    const column = COLUMN_BY_TYPE[assessmentType];
    if (!column) {
      return NextResponse.json({ error: `Unknown assessmentType: ${assessmentType}` }, { status: 400 });
    }

    // A Unit Map must already exist for this unit - assessment questions
    // attach to one of its three assessment blocks, they don't stand alone.
    const { rows: unitMapRows } = await sql`
      SELECT priority_standards, other_deconstructed_standards, supporting_standards,
             pre_assessment, post_assessment, common_assessment, curriculum_rows, start_date, end_date
      FROM unit_maps WHERE unit_id = ${unitId}
    `;
    if (unitMapRows.length === 0) {
      return NextResponse.json({ error: "No Unit Map found for this unit yet - import the Unit Map first, then add assessment questions." }, { status: 404 });
    }
    const { rows: unitRows } = await sql`SELECT id, name, days, dates, cells FROM units WHERE id = ${unitId}`;
    const unitRow = unitRows[0];
    const unitForChecks: Unit | null = unitRow ? { id: unitRow.id, name: unitRow.name || "", days: unitRow.days || "", dates: unitRow.dates || "", cells: unitRow.cells || {} } : null;

    const buildUnitMap = (row: any): UnitMap => ({
      priorityStandards: row.priority_standards || [],
      otherDeconstructedStandards: row.other_deconstructed_standards || [],
      supportingStandards: row.supporting_standards || [],
      preAssessment: row.pre_assessment || {},
      postAssessment: row.post_assessment || {},
      commonAssessment: row.common_assessment || {},
      curriculumRows: row.curriculum_rows || [],
      startDate: row.start_date || "",
      endDate: row.end_date || "",
    });
    const beforeUnitMap = buildUnitMap(unitMapRows[0]);
    const beforeIssues = unitForChecks ? summarizeIssues(unitForChecks, beforeUnitMap) : [];

    // Preserve the existing link/scoring/warmup - only the questions array changes.
    const existingBlock = (unitMapRows[0] as any)[column] || {};
    const updatedBlock = { ...existingBlock, questions };

    await sql.query(`UPDATE unit_maps SET ${column} = $1 WHERE unit_id = $2`, [JSON.stringify(updatedBlock), unitId]);

    if (unitForChecks) {
      const afterUnitMap: UnitMap = { ...beforeUnitMap, [assessmentType]: updatedBlock };
      const afterIssues = summarizeIssues(unitForChecks, afterUnitMap);
      await logRevision(unitId, "unit_map", diffIssues(beforeIssues, afterIssues));
    }

    return NextResponse.json({ ok: true, unitId, assessmentType, questionCount: questions.length });
  } catch (err: any) {
    return NextResponse.json({ error: err.message || "Request failed" }, { status: 500 });
  }
}
