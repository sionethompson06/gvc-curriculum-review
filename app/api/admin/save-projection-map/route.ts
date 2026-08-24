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
// Returns a string key like "4a" or "1" rather than a parsed integer, since
// some documents split a unit into lettered sub-units ("Unit 4a", "Unit 4b")
// - parsing to a number would collapse both to 4 and incorrectly treat them
// as the same unit.
function extractUnitNumber(name: string): string | null {
  const m = name.match(/Unit\s+(\d+[a-z]?)\b/i);
  return m ? m[1].toLowerCase() : null;
}

export async function POST(req: NextRequest) {
  try {
    await ensureSchema();
    const body = await req.json();
    const { school, grade, subject, strandNames, units } = body;
    if (!school || !grade || !subject || !Array.isArray(units)) {
      return NextResponse.json({ error: "school, grade, subject, and units are required" }, { status: 400 });
    }

    // Resolve to an existing subject name case-insensitively, if one
    // already exists, rather than creating a new, differently-cased
    // duplicate row. This is the actual root cause of a real production
    // bug: the units lookup below was already case-insensitive (from an
    // earlier fix), so a typo like "HIstory" correctly matched and updated
    // the real "History" units - but this subjects upsert was still an
    // exact match, so the typo silently created an ORPHANED "HIstory" row
    // with zero associated units. subjectFromSlug's case-insensitive slug
    // matching would then sometimes resolve to that orphaned name instead
    // of the real one, breaking the entire subject page and every unit
    // page under it.
    const { rows: existingSubjectRows } = await sql`SELECT name FROM subjects WHERE LOWER(TRIM(name)) = LOWER(TRIM(${subject}))`;
    const resolvedSubject = existingSubjectRows[0]?.name || subject;

    await sql`
      INSERT INTO subjects (name, strands) VALUES (${resolvedSubject}, ${JSON.stringify(strandNames || [])})
      ON CONFLICT (name) DO UPDATE SET strands = EXCLUDED.strands
    `;

    // Match by unit number first (robust across name changes between
    // imports - see extractUnitNumber above), falling back to exact name
    // match only for units with no number in their name (e.g. "Beginning
    // of school"). Preserves the existing id either way, and therefore any
    // Unit Map already linked to it.
    // Case-insensitive, whitespace-tolerant match - the same fix already
    // applied to units-for-subject. An exact match here is the more severe
    // failure mode of the two: it doesn't just leave a dropdown empty, it
    // silently treats EVERY unit as new on the slightest casing/whitespace
    // difference, duplicating the entire projection map rather than
    // updating it - confirmed as the actual cause of a real duplication.
    const { rows: existingUnits } = await sql`
      SELECT id, name, sort_order FROM units
      WHERE LOWER(TRIM(school)) = LOWER(${school}) AND LOWER(TRIM(grade)) = LOWER(${grade}) AND LOWER(TRIM(subject)) = LOWER(${resolvedSubject})
    `;
    const existingByNumber = new Map<string, any>();
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
          VALUES (${id}, ${school}, ${grade}, ${resolvedSubject}, ${unit.name}, ${unit.days || ""}, ${unit.dates || ""}, ${JSON.stringify(unit.cells || {})}, ${nextOrder})
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
