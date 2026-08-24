import { NextRequest, NextResponse } from "next/server";
import { sql } from "@vercel/postgres";
import { ensureSchema } from "../../../lib/db";

// Lists every row in the subjects table when visited with no query params -
// including any accidental case-variant duplicates (e.g. "History" vs
// "HIstory") that the app's case-insensitive lookups elsewhere would
// otherwise hide from view. Deletes the named subject when ?name= is
// provided (exact match) - browser-visitable directly either way, since
// a plain link click is always a GET request.
export async function GET(req: NextRequest) {
  try {
    await ensureSchema();
    const name = new URL(req.url).searchParams.get("name");
    if (name) {
      const { rows } = await sql`DELETE FROM subjects WHERE name = ${name} RETURNING name`;
      if (rows.length === 0) return NextResponse.json({ error: `No subject found with exact name ${JSON.stringify(name)}` }, { status: 404 });
      return NextResponse.json({ ok: true, deleted: rows[0] });
    }
    const { rows } = await sql`SELECT name, strands FROM subjects ORDER BY name`;
    return NextResponse.json({ subjects: rows });
  } catch (err: any) {
    return NextResponse.json({ error: err.message || "Request failed" }, { status: 500 });
  }
}
