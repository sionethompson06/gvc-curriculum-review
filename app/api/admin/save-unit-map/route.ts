import { NextRequest, NextResponse } from "next/server";
import { sql } from "@vercel/postgres";
import { ensureSchema } from "../../../lib/db";

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

    if (unitId) {
      // Linking to an existing unit row (created by a prior Projection Map
      // import) - confirm it actually exists and belongs to this subject.
      const { rows } = await sql`SELECT id FROM units WHERE id = ${unitId} AND school = ${school} AND grade = ${grade} AND subject = ${subject}`;
      if (rows.length === 0) {
        return NextResponse.json({ error: `Unit id ${unitId} not found for ${school}/${grade}/${subject}` }, { status: 404 });
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
    }

    await sql`
      INSERT INTO unit_maps (unit_id, priority_standards, supporting_standards, pre_assessment, post_assessment, common_assessment, curriculum_rows, start_date, end_date)
      VALUES (${unitId}, ${JSON.stringify(parsed.priorityStandards || [])}, ${JSON.stringify(parsed.supportingStandards || [])}, ${JSON.stringify(parsed.preAssessment || {})},
              ${JSON.stringify(parsed.postAssessment || {})}, ${JSON.stringify(parsed.commonAssessment || {})}, ${JSON.stringify(parsed.curriculumRows || [])}, ${parsed.startDate || ""}, ${parsed.endDate || ""})
      ON CONFLICT (unit_id) DO UPDATE SET priority_standards=EXCLUDED.priority_standards, supporting_standards=EXCLUDED.supporting_standards, pre_assessment=EXCLUDED.pre_assessment,
        post_assessment=EXCLUDED.post_assessment, common_assessment=EXCLUDED.common_assessment, curriculum_rows=EXCLUDED.curriculum_rows, start_date=EXCLUDED.start_date, end_date=EXCLUDED.end_date
    `;

    return NextResponse.json({ ok: true, unitId });
  } catch (err: any) {
    return NextResponse.json({ error: err.message || "Request failed" }, { status: 500 });
  }
}
