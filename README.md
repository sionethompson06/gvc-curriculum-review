# GVC Curriculum Review

A Next.js 14 (App Router) application built for TEACH Public Schools' Chief Director of Academics to review K-12 curriculum alignment and quality, grounded in Marzano/Ainsworth's Rigorous Curriculum Design (RCD) framework.

## Stack
- Next.js 14 App Router
- Vercel Postgres (Neon) for persistent storage
- Anthropic API (Claude) for AI-powered curriculum review

## Structure
- `app/[school]/[grade]/[subject]/[unitId]/page.tsx` — unit detail page: alignment checks (external + internal), template completeness, standard deconstruction, curriculum map, assessments, AI review, notes
- `app/[school]/[grade]/[subject]/page.tsx` — subject page: Projection Map grid + Projection Map completeness + units table
- `app/lib/data.ts` — all DB queries + alignment/completeness computation logic
- `app/api/admin/init/route.ts` — one-time DB schema setup + seed data loader (visit `/api/admin/init` to run)
- `app/api/review/route.ts` — AI review endpoint (requires `ANTHROPIC_API_KEY` env var)

## Setup
```bash
npm install
npm run dev
```

Requires environment variables for Vercel Postgres (auto-provided when using Vercel Postgres/Neon integration) and `ANTHROPIC_API_KEY` for the AI review feature.

## Database initialization
After deploying, visit `/api/admin/init` once (GET or POST) to create the schema and load seed data. Re-visiting is safe (idempotent upserts).
