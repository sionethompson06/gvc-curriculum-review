import { NextRequest, NextResponse } from "next/server";
import { sql } from "@vercel/postgres";
import { ensureSchema } from "../../../lib/db";

function slugify(name: string): string {
  return name.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/(^-|-$)/g, "");
}

// A unit's name can legitimately change between two imports of the "same"
// unit - most commonly because a parser fix changes how the name gets
// extracted (e.g. "Unit 1 # Days 25" becoming the cleaner "Unit 1"). Matching
// on the number extracted from the name is robust to that; matching on the
// exact string is not, and silently creates a duplicate instead of updating
// the existing unit - exactly the failure mode this is fixing.
function extractUnitNumber(name: string): number | null {
  const m = name.match(/Unit\s+(\d+)/i);
  return m ? parseInt(m[1], 10) : null;
}

export async function POST(req: NextRequest) {
  try {
    await ensureSchema();
    const body = await req.json();
    const { school, grade, subject, strandNames, units } = body;
    if (!school || !grade || !subject || !Array.isArray(units)) {
      return NextResponse.json({ error: "school, grade, subject, and units are required" }, { status: 400 });
    }

    await sql`
      INSERT INTO subjects (name, strands) VALUES (${subject}, ${JSON.stringify(strandNames || [])})
      ON CONFLICT (name) DO UPDATE SET strands = EXCLUDED.strands
    `;

    // Match by unit number first (robust across name changes between
    // imports - see extractUnitNumber above), falling back to exact name
    // match only for units with no number in their name (e.g. "Beginning
    // of school"). Preserves the existing id either way, and therefore any
    // Unit Map already linked to it.
    const { rows: existingUnits } = await sql`SELECT id, name, sort_order FROM units WHERE school = ${school} AND grade = ${grade} AND subject = ${subject}`;
    const existingByNumber = new Map<number, any>();
    const existingByName = new Map<string, any>();
    existingUnits.forEach((r: any) => {
      const num = extractUnitNumber(r.name);
      if (num !== null) existingByNumber.set(num, r);
      existingByName.set(r.name, r);
    });
    let nextOrder = existingUnits.reduce((max: number, r: any) => Math.max(max, r.sort_order || 0), -1) + 1;

    let created = 0, updated = 0;
    for (const unit of units) {
      const unitNum = extractUnitNumber(unit.name);
      const existing = (unitNum !== null ? existingByNumber.get(unitNum) : undefined) || existingByName.get(unit.name);
      if (existing) {
        await sql`
          UPDATE units SET name = ${unit.name}, days = ${unit.days || ""}, dates = ${unit.dates || ""}, cells = ${JSON.stringify(unit.cells || {})}
          WHERE id = ${existing.id}
        `;
        updated++;
      } else {
        const id = `u${slugify(unit.name)}${Date.now().toString(36).slice(-5)}${Math.random().toString(36).slice(2, 5)}`;
        await sql`
          INSERT INTO units (id, school, grade, subject, name, days, dates, cells, sort_order)
          VALUES (${id}, ${school}, ${grade}, ${subject}, ${unit.name}, ${unit.days || ""}, ${unit.dates || ""}, ${JSON.stringify(unit.cells || {})}, ${nextOrder})
        `;
        nextOrder++;
        created++;
      }
    }

    return NextResponse.json({ ok: true, created, updated });
  } catch (err: any) {
    return NextResponse.json({ error: err.message || "Request failed" }, { status: 500 });
  }
}
