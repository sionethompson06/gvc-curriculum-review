import { NextRequest, NextResponse } from "next/server";
import { sql } from "@vercel/postgres";
import { ensureSchema } from "../../../lib/db";

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
    const { rows } = await sql.query(`SELECT ${column} FROM unit_maps WHERE unit_id = $1`, [unitId]);
    if (rows.length === 0) {
      return NextResponse.json({ error: "No Unit Map found for this unit yet - import the Unit Map first, then add assessment questions." }, { status: 404 });
    }

    // Preserve the existing link/scoring/warmup - only the questions array changes.
    const existingBlock = rows[0][column] || {};
    const updatedBlock = { ...existingBlock, questions };

    await sql.query(`UPDATE unit_maps SET ${column} = $1 WHERE unit_id = $2`, [JSON.stringify(updatedBlock), unitId]);

    return NextResponse.json({ ok: true, unitId, assessmentType, questionCount: questions.length });
  } catch (err: any) {
    return NextResponse.json({ error: err.message || "Request failed" }, { status: 500 });
  }
}
