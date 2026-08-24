import { NextRequest, NextResponse } from "next/server";
import { sql } from "@vercel/postgres";
import { ensureSchema } from "../../../lib/db";

// Removes a Unit Map's linkage from a unit without deleting the unit
// itself (which would also discard its real Projection Map data) -
// needed when a Unit Map was linked to the wrong unit and the correct
// one is genuinely unclear (source documents disagree), so the
// incorrect link needs to be cleared rather than just overwritten.
// Browser-visitable: /api/admin/delete-unit-map?unitId=...
export async function GET(req: NextRequest) {
  try {
    await ensureSchema();
    const unitId = new URL(req.url).searchParams.get("unitId");
    if (!unitId) return NextResponse.json({ error: "unitId is required" }, { status: 400 });
    const { rows } = await sql`DELETE FROM unit_maps WHERE unit_id = ${unitId} RETURNING unit_id`;
    if (rows.length === 0) return NextResponse.json({ error: `No unit map found for unit id ${JSON.stringify(unitId)}` }, { status: 404 });
    return NextResponse.json({ ok: true, deleted: rows[0] });
  } catch (err: any) {
    return NextResponse.json({ error: err.message || "Request failed" }, { status: 500 });
  }
}
