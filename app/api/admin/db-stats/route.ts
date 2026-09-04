import { NextResponse } from "next/server";
import { sql } from "@vercel/postgres";
import { ensureSchema } from "../../../lib/db";

// One-shot diagnostic: full breakdown of units and unit_maps by
// school/grade/subject, plus any unit_maps rows that are orphaned (no
// matching unit row - shouldn't be possible via the app's own delete
// paths, but worth being able to see directly rather than assume).
export async function GET() {
  try {
    await ensureSchema();
    const { rows: breakdown } = await sql`
      SELECT u.school, u.grade, u.subject,
             COUNT(*) AS unit_count,
             COUNT(um.unit_id) AS unit_map_count
      FROM units u LEFT JOIN unit_maps um ON um.unit_id = u.id
      GROUP BY u.school, u.grade, u.subject
      ORDER BY u.school, u.grade, u.subject
    `;
    const { rows: totals } = await sql`
      SELECT (SELECT COUNT(*) FROM units) AS total_units, (SELECT COUNT(*) FROM unit_maps) AS total_unit_maps
    `;
    const { rows: orphaned } = await sql`
      SELECT um.unit_id FROM unit_maps um LEFT JOIN units u ON u.id = um.unit_id WHERE u.id IS NULL
    `;
    return NextResponse.json({ totals: totals[0], breakdown, orphanedUnitMaps: orphaned });
  } catch (err: any) {
    return NextResponse.json({ error: err.message || "Request failed" }, { status: 500 });
  }
}
