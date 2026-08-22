import { NextRequest, NextResponse } from "next/server";
import { sql } from "@vercel/postgres";
import { ensureSchema } from "../../../lib/db";

async function deleteUnit(unitId: string | null) {
  if (!unitId) return NextResponse.json({ error: "unitId is required" }, { status: 400 });
  await ensureSchema();
  const { rows } = await sql`DELETE FROM units WHERE id = ${unitId} RETURNING id, name`;
  if (rows.length === 0) return NextResponse.json({ error: `No unit found with id ${unitId}` }, { status: 404 });
  return NextResponse.json({ ok: true, deleted: rows[0] });
}

// Deletes a unit row. unit_maps, notes, and ai_reviews for it are removed
// automatically via their ON DELETE CASCADE foreign keys.
export async function POST(req: NextRequest) {
  try {
    const { unitId } = await req.json();
    return await deleteUnit(unitId);
  } catch (err: any) {
    return NextResponse.json({ error: err.message || "Request failed" }, { status: 500 });
  }
}

// Also browser-visitable directly: /api/admin/delete-unit?unitId=...
export async function GET(req: NextRequest) {
  try {
    const unitId = new URL(req.url).searchParams.get("unitId");
    return await deleteUnit(unitId);
  } catch (err: any) {
    return NextResponse.json({ error: err.message || "Request failed" }, { status: 500 });
  }
}

