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
    name TEXT PRIMARY KEY,
    strands JSONB NOT NULL DEFAULT '[]'
  )`;
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
