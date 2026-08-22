import { NextRequest, NextResponse } from "next/server";
import { sql } from "@vercel/postgres";
import { ensureSchema } from "../../../lib/db";

export async function GET(req: NextRequest) {
  try {
    await ensureSchema();
    const { searchParams } = new URL(req.url);
    const school = searchParams.get("school") || "";
    const grade = searchParams.get("grade") || "";
    const subject = searchParams.get("subject") || "";
    if (!school || !grade || !subject) {
      return NextResponse.json({ error: "school, grade, and subject are required" }, { status: 400 });
    }
    const { rows } = await sql`
      SELECT u.id, u.name, u.dates,
             (um.unit_id IS NOT NULL) AS has_unit_map
      FROM units u
      LEFT JOIN unit_maps um ON um.unit_id = u.id
      WHERE u.school = ${school} AND u.grade = ${grade} AND u.subject = ${subject}
      ORDER BY u.sort_order
    `;
    return NextResponse.json({ units: rows });
  } catch (err: any) {
    return NextResponse.json({ error: err.message || "Request failed" }, { status: 500 });
  }
}
