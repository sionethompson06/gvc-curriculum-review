import { NextRequest, NextResponse } from "next/server";
import { sql } from "@vercel/postgres";
import { ensureSchema } from "../../../lib/db";

function slugify(name: string): string {
  return name.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/(^-|-$)/g, "");
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

    // Match by unit name within this school/grade/subject - update if a unit
    // with that name already exists (preserving its id, and therefore any
    // Unit Map already linked to it), otherwise create a new one.
    const { rows: existingUnits } = await sql`SELECT id, name, sort_order FROM units WHERE school = ${school} AND grade = ${grade} AND subject = ${subject}`;
    const existingByName = new Map(existingUnits.map((r: any) => [r.name, r]));
    let nextOrder = existingUnits.reduce((max: number, r: any) => Math.max(max, r.sort_order || 0), -1) + 1;

    let created = 0, updated = 0;
    for (const unit of units) {
      const existing = existingByName.get(unit.name);
      if (existing) {
        await sql`
          UPDATE units SET days = ${unit.days || ""}, dates = ${unit.dates || ""}, cells = ${JSON.stringify(unit.cells || {})}
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
