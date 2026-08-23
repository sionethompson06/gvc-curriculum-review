import { NextRequest, NextResponse } from "next/server";
import { sql } from "@vercel/postgres";
import { ensureSchema } from "../../../lib/db";
import { summarizeIssues, diffIssues } from "../../../lib/data";
import type { Unit, UnitMap } from "../../../lib/types";

function slugify(name: string): string {
  return name.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/(^-|-$)/g, "");
}

export async function POST(req: NextRequest) {
  try {
    await ensureSchema();
    const body = await req.json();
    const { school, grade, subject, unitName, unitId: providedUnitId, parsed } = body;
    if (!school || !grade || !subject || !unitName || !parsed) {
      return NextResponse.json({ error: "school, grade, subject, unitName, and parsed are required" }, { status: 400 });
    }

    // Ensure the subject exists in the subjects table - without this, pages
    // that look up the subject by slug (the subject page, the unit detail
    // page) 404 even though the unit itself is saved and shows up in the
    // sidebar (which reads unit rows directly, not the subjects table).
    // Preserves any existing strands list if the subject is already there.
    await sql`
      INSERT INTO subjects (name, strands) VALUES (${subject}, '[]')
      ON CONFLICT (name) DO NOTHING
    `;

    let unitId = providedUnitId as string | undefined;
    let unitRow: any = null;
    let previousUnitMapRow: any = null;

    if (unitId) {
      // Linking to an existing unit row (created by a prior Projection Map
      // import) - confirm it actually exists and belongs to this subject,
      // and capture its current state (including any existing Unit Map)
      // before it gets overwritten, so we can diff before vs. after.
      const { rows } = await sql`
        SELECT u.id, u.name, u.days, u.dates, u.cells,
               um.priority_standards, um.other_deconstructed_standards, um.supporting_standards,
               um.pre_assessment, um.post_assessment, um.common_assessment, um.curriculum_rows, um.start_date, um.end_date
        FROM units u LEFT JOIN unit_maps um ON um.unit_id = u.id
        WHERE u.id = ${unitId} AND u.school = ${school} AND u.grade = ${grade} AND u.subject = ${subject}
      `;
      if (rows.length === 0) {
        return NextResponse.json({ error: `Unit id ${unitId} not found for ${school}/${grade}/${subject}` }, { status: 404 });
      }
      unitRow = rows[0];
      if (unitRow.priority_standards !== null && unitRow.priority_standards !== undefined) {
        previousUnitMapRow = {
          priorityStandards: unitRow.priority_standards || [],
          otherDeconstructedStandards: unitRow.other_deconstructed_standards || [],
          supportingStandards: unitRow.supporting_standards || [],
          preAssessment: unitRow.pre_assessment || {},
          postAssessment: unitRow.post_assessment || {},
          commonAssessment: unitRow.common_assessment || {},
          curriculumRows: unitRow.curriculum_rows || [],
          startDate: unitRow.start_date || "",
          endDate: unitRow.end_date || "",
        };
      }
    } else {
      // No existing unit to link to - create a new placeholder unit row.
      // Its Projection Map fields (dates, cells) stay empty until/unless a
      // Projection Map import fills them in separately; this at minimum
      // lets the Unit Map itself be reviewed right away, and the app's own
      // Projection Map Completeness check will correctly flag the gap.
      const { rows: maxOrderRows } = await sql`SELECT COALESCE(MAX(sort_order), -1) + 1 AS next_order FROM units WHERE school = ${school} AND grade = ${grade} AND subject = ${subject}`;
      const nextOrder = maxOrderRows[0]?.next_order ?? 0;
      unitId = `u${slugify(unitName)}${Date.now().toString(36).slice(-5)}`;
      await sql`
        INSERT INTO units (id, school, grade, subject, name, days, dates, cells, sort_order)
        VALUES (${unitId}, ${school}, ${grade}, ${subject}, ${unitName}, '', '', '{}', ${nextOrder})
      `;
      unitRow = { id: unitId, name: unitName, days: "", dates: "", cells: {} };
    }

    const unitForChecks: Unit = { id: unitRow.id, name: unitRow.name || "", days: unitRow.days || "", dates: unitRow.dates || "", cells: unitRow.cells || {} };
    const beforeIssues = summarizeIssues(unitForChecks, previousUnitMapRow);

    await sql`
      INSERT INTO unit_maps (unit_id, priority_standards, other_deconstructed_standards, supporting_standards, pre_assessment, post_assessment, common_assessment, curriculum_rows, start_date, end_date)
      VALUES (${unitId}, ${JSON.stringify(parsed.priorityStandards || [])}, ${JSON.stringify(parsed.otherDeconstructedStandards || [])}, ${JSON.stringify(parsed.supportingStandards || [])}, ${JSON.stringify(parsed.preAssessment || {})},
              ${JSON.stringify(parsed.postAssessment || {})}, ${JSON.stringify(parsed.commonAssessment || {})}, ${JSON.stringify(parsed.curriculumRows || [])}, ${parsed.startDate || ""}, ${parsed.endDate || ""})
      ON CONFLICT (unit_id) DO UPDATE SET priority_standards=EXCLUDED.priority_standards, other_deconstructed_standards=EXCLUDED.other_deconstructed_standards, supporting_standards=EXCLUDED.supporting_standards, pre_assessment=EXCLUDED.pre_assessment,
        post_assessment=EXCLUDED.post_assessment, common_assessment=EXCLUDED.common_assessment, curriculum_rows=EXCLUDED.curriculum_rows, start_date=EXCLUDED.start_date, end_date=EXCLUDED.end_date
    `;

    const afterUnitMap: UnitMap = {
      priorityStandards: parsed.priorityStandards || [],
      otherDeconstructedStandards: parsed.otherDeconstructedStandards || [],
      supportingStandards: parsed.supportingStandards || [],
      preAssessment: parsed.preAssessment || {},
      postAssessment: parsed.postAssessment || {},
      commonAssessment: parsed.commonAssessment || {},
      curriculumRows: parsed.curriculumRows || [],
      startDate: parsed.startDate || "",
      endDate: parsed.endDate || "",
    };
    const afterIssues = summarizeIssues(unitForChecks, afterUnitMap);
    const diff = diffIssues(beforeIssues, afterIssues);

    return NextResponse.json({ ok: true, unitId, isReimport: !!previousUnitMapRow, diff });
  } catch (err: any) {
    return NextResponse.json({ error: err.message || "Request failed" }, { status: 500 });
  }
}
