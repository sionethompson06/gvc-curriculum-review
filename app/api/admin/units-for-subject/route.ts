import { NextRequest, NextResponse } from "next/server";
import { sql } from "@vercel/postgres";
import { ensureSchema } from "../../../lib/db";

export async function GET(req: NextRequest) {
  try {
    await ensureSchema();
    const { searchParams } = new URL(req.url);
    const school = (searchParams.get("school") || "").trim();
    const grade = (searchParams.get("grade") || "").trim();
    const subject = (searchParams.get("subject") || "").trim();
    if (!school || !grade || !subject) {
      return NextResponse.json({ error: "school, grade, and subject are required" }, { status: 400 });
    }
    // Case-insensitive, whitespace-tolerant match - an exact match here would
    // silently return zero rows (an empty dropdown, no visible error) on any
    // casing or trailing-space difference between what's typed and what's
    // stored, which is exactly the kind of failure that's invisible until
    // someone reports "the dropdown is just empty".
    const { rows } = await sql`
      SELECT u.id, u.name, u.dates,
             (um.unit_id IS NOT NULL) AS has_unit_map
      FROM units u
      LEFT JOIN unit_maps um ON um.unit_id = u.id
      WHERE LOWER(TRIM(u.school)) = LOWER(${school}) AND LOWER(TRIM(u.grade)) = LOWER(${grade}) AND LOWER(TRIM(u.subject)) = LOWER(${subject})
      ORDER BY u.sort_order
    `;
    return NextResponse.json({ units: rows, debug: { school, grade, subject, matchCount: rows.length } });
  } catch (err: any) {
    return NextResponse.json({ error: err.message || "Request failed" }, { status: 500 });
  }
}
