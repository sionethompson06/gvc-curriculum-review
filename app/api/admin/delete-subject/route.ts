import { NextRequest, NextResponse } from "next/server";
import { sql } from "@vercel/postgres";
import { ensureSchema } from "../../../lib/db";

// Lists every row in the subjects table when visited with no query params -
// including any accidental case-variant duplicates (e.g. "History" vs
// "HIstory") that the app's case-insensitive lookups elsewhere would
// otherwise hide from view, and now always includes school since a
// subject name alone (e.g. "Math") is no longer unique across schools.
// Deletes a subject when both ?name= and ?school= are provided (exact
// match on name, case-insensitive on school) - browser-visitable
// directly either way, since a plain link click is always a GET request.
export async function GET(req: NextRequest) {
  try {
    await ensureSchema();
    const url = new URL(req.url);
    const name = url.searchParams.get("name");
    const school = url.searchParams.get("school");
    if (name) {
      if (!school) return NextResponse.json({ error: "school is required alongside name - a subject name alone is no longer unique across schools" }, { status: 400 });
      const { rows } = await sql`DELETE FROM subjects WHERE LOWER(TRIM(school)) = LOWER(TRIM(${school})) AND name = ${name} RETURNING school, name`;
      if (rows.length === 0) return NextResponse.json({ error: `No subject found with exact name ${JSON.stringify(name)} for school ${JSON.stringify(school)}` }, { status: 404 });
      return NextResponse.json({ ok: true, deleted: rows[0] });
    }
    const { rows } = await sql`SELECT school, name, strands FROM subjects ORDER BY school, name`;
    return NextResponse.json({ subjects: rows });
  } catch (err: any) {
    return NextResponse.json({ error: err.message || "Request failed" }, { status: 500 });
  }
}
