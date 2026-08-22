import { NextRequest, NextResponse } from "next/server";
import { sql } from "@vercel/postgres";
import { ensureSchema } from "../../lib/db";

export async function POST(req: NextRequest) {
  try {
    await ensureSchema();
    const { unitId, noteText, author } = await req.json();
    if (!unitId || !noteText) {
      return NextResponse.json({ error: "unitId and noteText are required" }, { status: 400 });
    }
    const { rows } = await sql`
      INSERT INTO notes (unit_id, note_text, author) VALUES (${unitId}, ${noteText}, ${author || null})
      RETURNING id, note_text, author, created_at
    `;
    return NextResponse.json({ note: rows[0] });
  } catch (err: any) {
    return NextResponse.json({ error: err.message || "Request failed" }, { status: 500 });
  }
}
