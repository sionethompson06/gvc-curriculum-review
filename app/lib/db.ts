import { sql } from "@vercel/postgres";

export async function ensureSchema() {
  await sql`CREATE TABLE IF NOT EXISTS units (
    id TEXT PRIMARY KEY,
    school TEXT NOT NULL,
    grade TEXT NOT NULL,
    subject TEXT NOT NULL,
    name TEXT,
    days TEXT,
    dates TEXT,
    cells JSONB NOT NULL DEFAULT '{}',
    sort_order INT DEFAULT 0
  )`;
  await sql`CREATE TABLE IF NOT EXISTS unit_maps (
    unit_id TEXT PRIMARY KEY REFERENCES units(id) ON DELETE CASCADE,
    priority_standards JSONB NOT NULL DEFAULT '[]',
    supporting_standards JSONB NOT NULL DEFAULT '[]',
    pre_assessment JSONB NOT NULL DEFAULT '{}',
    post_assessment JSONB NOT NULL DEFAULT '{}',
    common_assessment JSONB NOT NULL DEFAULT '{}',
    curriculum_rows JSONB NOT NULL DEFAULT '[]',
    start_date TEXT,
    end_date TEXT,
    updated_at TIMESTAMPTZ DEFAULT now()
  )`;
  await sql`ALTER TABLE unit_maps ADD COLUMN IF NOT EXISTS supporting_standards JSONB NOT NULL DEFAULT '[]'`;
  await sql`ALTER TABLE unit_maps ADD COLUMN IF NOT EXISTS common_assessment JSONB NOT NULL DEFAULT '{}'`;
  await sql`ALTER TABLE unit_maps ADD COLUMN IF NOT EXISTS other_deconstructed_standards JSONB NOT NULL DEFAULT '[]'`;
  await sql`CREATE TABLE IF NOT EXISTS subjects (
    name TEXT NOT NULL,
    strands JSONB NOT NULL DEFAULT '[]'
  )`;
  // Migrate to school-scoped subjects. The original schema used a bare
  // "name" primary key, which is a real, serious bug caught in a
  // pre-scaling review: every school will have a "Math", a "History", an
  // "ELA" - importing a second school's Projection Map would silently
  // overwrite the first school's strand labels via the upsert logic,
  // since there was only ever one global row per subject name. Adds
  // school scoping via a composite unique index rather than changing the
  // primary key in place, which is safer to run idempotently on every
  // request against a database that already has data.
  await sql`ALTER TABLE subjects ADD COLUMN IF NOT EXISTS school TEXT`;
  await sql`UPDATE subjects SET school = 'TEACH Academy' WHERE school IS NULL`;
  await sql`ALTER TABLE subjects ALTER COLUMN school SET NOT NULL`;
  await sql`ALTER TABLE subjects DROP CONSTRAINT IF EXISTS subjects_pkey`;
  await sql`CREATE UNIQUE INDEX IF NOT EXISTS subjects_school_name_idx ON subjects (school, name)`;
  await sql`CREATE TABLE IF NOT EXISTS ai_reviews (
    id SERIAL PRIMARY KEY,
    unit_id TEXT REFERENCES units(id) ON DELETE CASCADE,
    review_text TEXT NOT NULL,
    created_at TIMESTAMPTZ DEFAULT now()
  )`;
  await sql`CREATE TABLE IF NOT EXISTS notes (
    id SERIAL PRIMARY KEY,
    unit_id TEXT REFERENCES units(id) ON DELETE CASCADE,
    note_text TEXT NOT NULL,
    author TEXT,
    created_at TIMESTAMPTZ DEFAULT now()
  )`;
}
