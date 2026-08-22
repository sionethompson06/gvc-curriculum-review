import { notFound } from "next/navigation";
import Breadcrumb from "../../../../components/Breadcrumb";
import ReviewPanel from "../../../../components/ReviewPanel";
import NotesPanel from "../../../../components/NotesPanel";
import { schoolFromSlug, subjectFromSlug, getMap, computeUnitAlignment, computeInternalAlignment, computeTemplateCompleteness, getReviewsForUnit, getNotesForUnit } from "../../../../lib/data";
import type { CurriculumRow } from "../../../../lib/types";

export const dynamic = "force-dynamic";
export const revalidate = 0;


function findStandardDefinition(code: string, rows: CurriculumRow[]): string {
  const row = rows.find((r) => (r.standard || "").trim().toUpperCase().startsWith(code.toUpperCase()));
  if (!row) return "";
  const full = row.standard || "";
  const match = full.match(/^[\w.]+\s*[:\-–]\s*(.*)/s);
  return match ? match[1].trim() : full;
}

interface VocabTerm {
  term: string;
  definition: string;
}

function parseVocabTerms(text?: string): VocabTerm[] | null {
  if (!text) return null;
  const regex = /\b([A-Z][a-zA-Z]*(?:\s[a-zA-Z]+){0,2})-\s/g;
  const matches = [...text.matchAll(regex)];
  if (matches.length === 0) return null;
  const result: VocabTerm[] = [];
  for (let i = 0; i < matches.length; i++) {
    const start = matches[i].index!;
    const end = i + 1 < matches.length ? matches[i + 1].index! : text.length;
    const chunk = text.slice(start, end);
    const term = matches[i][1];
    const definition = chunk.slice(matches[i][0].length).trim();
    result.push({ term, definition });
  }
  return result;
}

function splitLearningTargets(text?: string): string[] {
  if (!text) return [];
  return text.split(/(?=I can\s)/).map((s) => s.trim()).filter(Boolean);
}

interface ScoringBlock {
  header?: string;
  levels: string[];
}

function parseScoringText(text?: string): ScoringBlock[] {
  if (!text) return [];
  const headerRegex = /(?<=^|\s)(?:[\w.]+\s+)?(?:Post|Pre|Common Standard)\s+Assessment\s+Scoring\s+Agreements(?:\s*\([^)]*\))?:?/gi;
  const matches = [...text.matchAll(headerRegex)];
  if (matches.length === 0) return [{ levels: [text.trim()] }];

  const blocks: ScoringBlock[] = [];
  for (let i = 0; i < matches.length; i++) {
    const start = matches[i].index!;
    const end = i + 1 < matches.length ? matches[i + 1].index! : text.length;
    const chunk = text.slice(start, end).trim();
    const header = matches[i][0].trim();
    const rest = chunk.slice(header.length).trim();
    const levels = rest
      .split(/(?=\d\s*[–\-]\s*(?:Exceeds|Meets|Approaching|Beginning))/i)
      .map((l) => l.trim())
      .filter(Boolean);
    blocks.push({ header, levels: levels.length ? levels : [rest] });
  }
  return blocks;
}

export default async function UnitPage({ params }: { params: { school: string; grade: string; subject: string; unitId: string } }) {
  const school = schoolFromSlug(params.school);
  const subject = await subjectFromSlug(params.subject);
  if (!school || !subject) return notFound();
  const grade = decodeURIComponent(params.grade);
  const map = await getMap(school, grade, subject);
  const unit = map?.units.find((u) => u.id === params.unitId);
  if (!map || !unit) return notFound();
  const um = map.unitMaps[unit.id] || null;
  const align = computeUnitAlignment(unit, um);
  const internalAlign = computeInternalAlignment(um);
  const completeness = computeTemplateCompleteness(um);

  let pastReviews: Awaited<ReturnType<typeof getReviewsForUnit>> = [];
  let notes: Awaited<ReturnType<typeof getNotesForUnit>> = [];
  try {
    pastReviews = await getReviewsForUnit(unit.id);
    notes = await getNotesForUnit(unit.id);
  } catch {
    // schema may not exist yet
  }

  const priorityFromPM: string[] = [];
  Object.entries(unit.cells || {}).forEach(([strand, stds]) =>
    stds.forEach((s) => { if (s.priority) priorityFromPM.push(`${strand}: ${s.code || ""} ${s.desc || ""}`); })
  );

  const reviewContext = `UNIT: ${unit.name} (Grade ${grade}, ${subject}, ${school})

PRIORITY STANDARDS FROM PROJECTION MAP: ${priorityFromPM.join("; ") || "none marked"}

DECONSTRUCTION QUALITY:
${(um?.priorityStandards || []).map((ps) =>
  `- ${ps.code || "(no code)"} [type: ${ps.type || "not marked"}] nouns: ${ps.nouns ? "yes" : "MISSING"}, verbs: ${ps.verbs ? "yes" : "MISSING"}, targets filled: ${Object.values(ps.targets || {}).filter(Boolean).length}/4`
).join("\n") || "(no standards deconstructed)"}

CURRICULUM MAP / INSTRUCTIONAL STRATEGIES:
${(um?.curriculumRows || []).map((r) =>
  `- ${(r.standard || "").slice(0, 80)} | strategies: ${(r.strategies || []).length} (${(r.strategies || []).map((s) => s.type).join(",") || "none"})`
).join("\n") || "(no curriculum map rows)"}

ALIGNMENT CHECK, Projection Map vs Unit Map (already computed automatically): ${[
  align.missingFromUnitMap.length ? `Standards on Projection Map but NOT in Unit Map: ${align.missingFromUnitMap.join(", ")}` : "No coverage gap detected.",
  align.extraInUnitMap.length ? `Standards in Unit Map not on Projection Map: ${align.extraInUnitMap.join(", ")}` : "",
  align.dateIssue?.kind === "mismatch" ? `Timeline mismatch: Projection ${align.dateIssue.projStart}-${align.dateIssue.projEnd} vs Unit Map ${align.dateIssue.umStart}-${align.dateIssue.umEnd}` : "",
  align.dateIssue?.kind === "missingProjectionDates" ? `Projection Map has no dates on file for this unit, so its timeline can't be checked against the Unit Map's stated ${align.dateIssue.umStart}-${align.dateIssue.umEnd}.` : "",
  align.dateIssue?.kind === "missingUnitMapDates" ? `Unit Map never filled in its own Plan Start/End Date fields, so it can't be checked against the Projection Map's ${align.dateIssue.projStart}-${align.dateIssue.projEnd} window.` : "",
].filter(Boolean).join(" ")}

INTERNAL UNIT MAP ALIGNMENT, within the Unit Map's own sections (already computed automatically): ${[
  internalAlign.priorityMissingFromCurriculumMap.length ? `Chosen priority standard(s) never added to the Unit Curriculum Map: ${internalAlign.priorityMissingFromCurriculumMap.join(", ")}` : "",
  internalAlign.typeTargetMismatches.length ? internalAlign.typeTargetMismatches.map((m) => `${m.code} has ${m.categories.join("/")} target(s) written but type marking omits ${m.categories.length > 1 ? "them" : "it"}`).join("; ") : "",
  internalAlign.verbCategoryMismatches.length ? internalAlign.verbCategoryMismatches.map((m) => `${m.code} (verbs suggest: ${m.verbCategoryPairs.map((p) => `${p.verb}→${p.categories.join("/")}`).join(", ")}) - ${[m.markedNotSupportedByVerbs.length ? `marked ${m.markedNotSupportedByVerbs.join("/")} but no verb supports ${m.markedNotSupportedByVerbs.length > 1 ? "them" : "it"}` : "", m.verbSuggestsNotMarked.length ? `verb(s) suggest ${m.verbSuggestsNotMarked.join(", ")} but not marked` : ""].filter(Boolean).join("; ")}`).join(" | ") : "",
].filter(Boolean).join(" ") || "No internal inconsistencies detected."}

TEMPLATE COMPLETENESS (checked against the district's required Unit Map template, ${completeness.passedChecks}/${completeness.totalChecks} sections complete): ${
  completeness.missingItems.length === 0 ? "All required template sections are filled in." : `Missing: ${completeness.missingItems.join("; ")}`
}`;

  return (
    <div>
      <Breadcrumb items={[
        { label: "Dashboard", href: "/" },
        { label: school, href: `/${params.school}` },
        { label: `Grade ${grade}`, href: `/${params.school}/${params.grade}` },
        { label: subject, href: `/${params.school}/${params.grade}/${params.subject}` },
        { label: unit.name || "Unit" },
      ]} />
      <h1 style={{ fontSize: 22, marginBottom: 4 }}>{unit.name}</h1>
      <div style={{ color: "var(--slate)", fontSize: 12.5, marginBottom: 20 }}>
        {unit.days ? `${unit.days} days` : ""} {unit.dates ? `· ${unit.dates}` : ""}
      </div>

      {(align.missingFromUnitMap.length > 0 || align.extraInUnitMap.length > 0 || align.dateIssue) && (
        <div className="panel" style={{ borderColor: "var(--rust)" }}>
          <div className="panel-head" style={{ background: "var(--rust-soft)" }}><h3 style={{ color: "var(--rust)" }}>Alignment Issues (Projection Map ↔ Unit Map)</h3></div>
          <div className="panel-body">
            {align.missingFromUnitMap.length > 0 && (
              <div style={{ marginBottom: 6 }}><span className="badge badge-flag">Standards gap</span> Projection Map promises <strong>{align.missingFromUnitMap.join(", ")}</strong> but the Unit Map never addresses {align.missingFromUnitMap.length > 1 ? "them" : "it"}.</div>
            )}
            {align.extraInUnitMap.length > 0 && (
              <div style={{ marginBottom: 6 }}><span className="badge badge-partial">Unplanned addition</span> Unit Map covers <strong>{align.extraInUnitMap.join(", ")}</strong>, not on the Projection Map for this unit.</div>
            )}
            {align.dateIssue && align.dateIssue.kind === "missingProjectionDates" && (
              <div><span className="badge badge-flag">Can't verify timeline</span> The Projection Map has no dates on file for this unit, so its Aug/Sept-style pacing can't be checked against the Unit Map's stated <strong>{align.dateIssue.umStart}–{align.dateIssue.umEnd}</strong>.</div>
            )}
            {align.dateIssue && align.dateIssue.kind === "missingUnitMapDates" && (
              <div><span className="badge badge-flag">Can't verify timeline</span> The Unit Map never filled in its own Plan Start Date / Projected End Date, so it can't be checked against the Projection Map's <strong>{align.dateIssue.projStart}–{align.dateIssue.projEnd}</strong> window.</div>
            )}
            {align.dateIssue && align.dateIssue.kind === "mismatch" && (
              <div><span className="badge badge-flag">Timeline gap</span> Projection: {align.dateIssue.projStart}–{align.dateIssue.projEnd}. Unit Map: {align.dateIssue.umStart}–{align.dateIssue.umEnd}.</div>
            )}
          </div>
        </div>
      )}

      {(internalAlign.priorityMissingFromCurriculumMap.length > 0 || internalAlign.typeTargetMismatches.length > 0 || internalAlign.verbCategoryMismatches.length > 0) && (
        <div className="panel" style={{ borderColor: "var(--rust)" }}>
          <div className="panel-head" style={{ background: "var(--rust-soft)" }}><h3 style={{ color: "var(--rust)" }}>Internal Unit Map Alignment</h3></div>
          <div className="panel-body">
            {internalAlign.priorityMissingFromCurriculumMap.length > 0 && (
              <div style={{ marginBottom: 6 }}>
                <span className="badge badge-flag">Not carried through</span> <strong>{internalAlign.priorityMissingFromCurriculumMap.join(", ")}</strong> {internalAlign.priorityMissingFromCurriculumMap.length > 1 ? "were" : "was"} chosen under CHOOSE PRIORITY STANDARD(S) and deconstructed, but never added to the Unit Curriculum Map — no lesson-level planning exists for {internalAlign.priorityMissingFromCurriculumMap.length > 1 ? "them" : "it"} yet.
              </div>
            )}
            {internalAlign.typeTargetMismatches.map((m, i) => (
              <div key={i} style={{ marginBottom: 6 }}>
                <span className="badge badge-partial">Type/target mismatch</span> <strong>{m.code}</strong> has {m.categories.join(" and ")} target{m.categories.length > 1 ? "s" : ""} written out, but the standard's type marking doesn't include {m.categories.length > 1 ? "those categories" : "that category"} — worth confirming the type marking is complete.
              </div>
            ))}
            {internalAlign.verbCategoryMismatches.map((m, i) => (
              <div key={i} style={{ marginBottom: 6 }}>
                <span className="badge badge-partial">Off-verb</span> <strong>{m.code}</strong>&apos;s own verb{m.recognizedVerbs.length > 1 ? "s" : ""} suggest{m.recognizedVerbs.length === 1 ? "s" : ""}{" "}
                <strong>
                  {m.verbCategoryPairs.map((p, pi) => (
                    <span key={pi}>
                      {p.verb} → {p.categories.join(" or ")}
                      {pi < m.verbCategoryPairs.length - 1 ? ", " : ""}
                    </span>
                  ))}
                </strong>
                {" — "}
                {m.markedNotSupportedByVerbs.length > 0 && (
                  <>the standard is marked <strong>{m.markedNotSupportedByVerbs.join(", ")}</strong>, which none of these verbs support</>
                )}
                {m.markedNotSupportedByVerbs.length > 0 && m.verbSuggestsNotMarked.length > 0 && "; "}
                {m.verbSuggestsNotMarked.length > 0 && (
                  <>the verb{m.verbSuggestsNotMarked.length > 1 ? "s" : ""} above suggest{m.verbSuggestsNotMarked.length === 1 ? "s" : ""} <strong>{m.verbSuggestsNotMarked.join(", ")}</strong>, but that&apos;s not currently marked</>
                )}
                {" "}— see the <a href="/guide/learning-targets" style={{ color: "var(--teal)", textDecoration: "underline" }}>Learning Target Rubric</a> for how verbs map to categories.
              </div>
            ))}
          </div>
        </div>
      )}

      <div className="panel" style={{ borderColor: completeness.missingItems.length > 0 ? "var(--amber)" : "var(--teal)" }}>
        <div className="panel-head" style={{ background: completeness.missingItems.length > 0 ? "var(--amber-soft)" : "var(--teal-soft)" }}>
          <h3 style={{ color: completeness.missingItems.length > 0 ? "var(--amber)" : "var(--teal)" }}>
            Template Completeness — {completeness.passedChecks}/{completeness.totalChecks}
          </h3>
        </div>
        <div className="panel-body">
          {completeness.missingItems.length === 0 ? (
            <div style={{ fontSize: 12.5, color: "var(--teal)" }}>Every required section of the district's Unit Map template is filled in.</div>
          ) : (
            <ul style={{ margin: 0, paddingLeft: 18 }}>
              {completeness.missingItems.map((item, i) => (
                <li key={i} style={{ fontSize: 12.5, marginBottom: 4 }}>{item}</li>
              ))}
            </ul>
          )}
        </div>
      </div>

      {um && (um.supportingStandards || []).length > 0 && (
        <div className="panel">
          <div className="panel-head"><h3>Supporting Standards</h3></div>
          <div className="panel-body">
            {um.supportingStandards!.map((s, i) => (
              <div key={i} style={{ fontSize: 12.5, marginBottom: 6 }}>
                <strong>{s.code}</strong> — {s.desc}
              </div>
            ))}
          </div>
        </div>
      )}

      {!um ? (
        <div className="panel"><div className="panel-body"><div className="empty">No Unit Map synced for this unit yet.</div></div></div>
      ) : (
        <>
          <div className="panel">
            <div className="panel-head"><h3>Standard Deconstruction (Priority Standards Chosen by Teacher)</h3></div>
            <div className="panel-body">
              {(um.priorityStandards || []).length === 0 ? <div className="empty">Not deconstructed yet.</div> :
                um.priorityStandards.map((ps, i) => {
                  const definition = findStandardDefinition(ps.code, um.curriculumRows || []);
                  return (
                  <div key={i} style={{ border: "1px solid var(--line)", padding: 12, marginBottom: 10, borderRadius: 3 }}>
                    <div style={{ marginBottom: 8, lineHeight: 1.5 }}>
                      <span style={{ fontWeight: 700 }}>{ps.code}</span>
                      {ps.type && <span className="badge badge-support" style={{ marginLeft: 6, marginRight: 6 }}>{ps.type}</span>}
                      {definition && <span style={{ fontSize: 13 }}> - {definition}</span>}
                    </div>
                    <div style={{ fontSize: 12, color: "var(--slate)", marginBottom: 3 }}>Nouns: {ps.nouns || "—"}</div>
                    <div style={{ fontSize: 12, color: "var(--slate)", marginBottom: 8 }}>Verbs: {ps.verbs || "—"}</div>
                    {ps.targets && (ps.targets.knowledge || ps.targets.reasoning || ps.targets.performanceSkill || ps.targets.product) && (
                      <div style={{ marginTop: 8 }}>
                        {ps.targets.knowledge && (
                          <div style={{ background: "var(--paper-dim)", padding: 8, borderRadius: 3, marginBottom: 6 }}>
                            <div style={{ fontSize: 9.5, fontWeight: 700, textTransform: "uppercase", color: "var(--slate)", marginBottom: 4 }}>Knowledge</div>
                            <div style={{ fontSize: 11.5 }}>{ps.targets.knowledge}</div>
                          </div>
                        )}
                        {ps.targets.reasoning && (
                          <div style={{ background: "var(--paper-dim)", padding: 8, borderRadius: 3, marginBottom: 6 }}>
                            <div style={{ fontSize: 9.5, fontWeight: 700, textTransform: "uppercase", color: "var(--slate)", marginBottom: 4 }}>Reasoning</div>
                            <div style={{ fontSize: 11.5 }}>{ps.targets.reasoning}</div>
                          </div>
                        )}
                        {ps.targets.performanceSkill && (
                          <div style={{ background: "var(--paper-dim)", padding: 8, borderRadius: 3, marginBottom: 6 }}>
                            <div style={{ fontSize: 9.5, fontWeight: 700, textTransform: "uppercase", color: "var(--slate)", marginBottom: 4 }}>Performance Skill</div>
                            <div style={{ fontSize: 11.5 }}>{ps.targets.performanceSkill}</div>
                          </div>
                        )}
                        {ps.targets.product && (
                          <div style={{ background: "var(--paper-dim)", padding: 8, borderRadius: 3 }}>
                            <div style={{ fontSize: 9.5, fontWeight: 700, textTransform: "uppercase", color: "var(--slate)", marginBottom: 4 }}>Product</div>
                            <div style={{ fontSize: 11.5 }}>{ps.targets.product}</div>
                          </div>
                        )}
                      </div>
                    )}
                  </div>
                  );
                })}
            </div>
          </div>

          <div className="panel">
            <div className="panel-head"><h3>Unit Curriculum Map</h3></div>
            <div className="panel-body" style={{ padding: 0, overflowX: "auto" }}>
              {(um.curriculumRows || []).length === 0 ? <div className="empty" style={{ padding: "16px 18px" }}>No rows logged.</div> : (
                <table style={{ minWidth: 1150 }}>
                  <thead>
                    <tr>
                      <th style={{ minWidth: 170 }}>Standards</th>
                      <th style={{ minWidth: 230 }}>Content and Vocabulary</th>
                      <th style={{ minWidth: 230 }}>Learning Targets</th>
                      <th style={{ minWidth: 170 }}>Assessments</th>
                      <th style={{ minWidth: 230 }}>Instructional Strategies</th>
                    </tr>
                  </thead>
                  <tbody>
                    {um.curriculumRows.map((r, i) => {
                      const vocabTerms = parseVocabTerms(r.contentVocab);
                      const targetList = splitLearningTargets(r.targetOrder);
                      return (
                      <tr key={i}>
                        <td style={{ fontWeight: 600, fontSize: 12, verticalAlign: "top" }}>{r.standard}</td>
                        <td style={{ fontSize: 11.5, verticalAlign: "top" }}>
                          {!r.contentVocab ? "—" : vocabTerms ? (
                            vocabTerms.map((v, vi) => (
                              <div key={vi} style={{ marginBottom: 5 }}>
                                <span style={{ background: "var(--gold-soft)", padding: "1px 6px", borderRadius: 3, fontWeight: 600 }}>{v.term}</span>
                                {" "}{v.definition}
                              </div>
                            ))
                          ) : r.contentVocab}
                        </td>
                        <td style={{ fontSize: 11.5, verticalAlign: "top" }}>
                          {targetList.length === 0 ? "—" : (
                            <ul style={{ margin: 0, paddingLeft: 16 }}>
                              {targetList.map((t, ti) => <li key={ti} style={{ marginBottom: 4 }}>{t}</li>)}
                            </ul>
                          )}
                        </td>
                        <td style={{ fontSize: 11.5, verticalAlign: "top" }}>{r.assessmentNote || "—"}</td>
                        <td style={{ fontSize: 11.5, verticalAlign: "top" }}>
                          {(r.strategies || []).length === 0 ? "—" : r.strategies.map((s, si) => (
                            <div key={si} style={{ marginBottom: 4 }}>
                              {s.name}{s.type === "high-impact" ? " ★" : ""}
                            </div>
                          ))}
                        </td>
                      </tr>
                      );
                    })}
                  </tbody>
                </table>
              )}
            </div>
          </div>

          {(um.preAssessment?.link || um.preAssessment?.scoring || um.preAssessment?.warmup || um.postAssessment?.link || um.postAssessment?.scoring || um.postAssessment?.warmup || um.commonAssessment?.link || um.commonAssessment?.scoring || um.commonAssessment?.warmup) && (
            <div className="panel">
              <div className="panel-head"><h3>Assessment</h3></div>
              <div className="panel-body">
                {(um.preAssessment?.link || um.preAssessment?.scoring || um.preAssessment?.warmup) && (
                  <AssessmentBlock title="Pre-Assessment" block={um.preAssessment} />
                )}
                {(um.postAssessment?.link || um.postAssessment?.scoring || um.postAssessment?.warmup) && (
                  <AssessmentBlock title="Post-Assessment" block={um.postAssessment} />
                )}
                {(um.commonAssessment?.link || um.commonAssessment?.scoring || um.commonAssessment?.warmup) && (
                  <AssessmentBlock title="Common Standard Assessment" block={um.commonAssessment} last />
                )}
              </div>
            </div>
          )}
        </>
      )}

      <ReviewPanel reviewContext={reviewContext} unitId={unit.id} pastReviews={pastReviews} />
      <NotesPanel unitId={unit.id} initialNotes={notes} />
    </div>
  );
}

function AssessmentBlock({ title, block, last }: { title: string; block?: { link?: string; scoring?: string; warmup?: string }; last?: boolean }) {
  const scoringBlocks = parseScoringText(block?.scoring);
  return (
    <div style={{ marginBottom: last ? 0 : 18, border: "1px solid var(--line)", borderRadius: 4, overflow: "hidden" }}>
      <div style={{ background: "var(--paper-dim)", padding: "7px 12px", fontSize: 11, fontWeight: 700, textTransform: "uppercase", letterSpacing: 0.4, color: "var(--ink)" }}>
        {title}
      </div>
      <div style={{ padding: 12 }}>
        {block?.link && (
          <div style={{ display: "flex", gap: 8, marginBottom: 10, fontSize: 12.5 }}>
            <span style={{ fontWeight: 700, color: "var(--slate)", flexShrink: 0 }}>Link:</span>
            <span style={{ color: block.link.toLowerCase().includes("paste") ? "var(--rust)" : "var(--ink)", fontStyle: block.link.toLowerCase().includes("paste") ? "italic" : "normal" }}>
              {block.link}
            </span>
          </div>
        )}
        {block?.warmup && (
          <div style={{ display: "flex", gap: 8, marginBottom: scoringBlocks.length ? 10 : 0, fontSize: 12.5 }}>
            <span style={{ fontWeight: 700, color: "var(--slate)", flexShrink: 0 }}>Warm-up:</span>
            <span>{block.warmup}</span>
          </div>
        )}
        {scoringBlocks.map((sb, i) => (
          <div key={i} style={{ marginTop: i > 0 ? 10 : 0, background: "var(--paper-dim)", borderRadius: 3, padding: 10 }}>
            {sb.header && <div style={{ fontSize: 11.5, fontWeight: 700, marginBottom: 6 }}>{sb.header}</div>}
            {sb.levels.length > 1 ? (
              <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(180px, 1fr))", gap: 6 }}>
                {sb.levels.map((level, li) => {
                  const m = level.match(/^(\d)\s*[–\-]\s*(\w+):?\s*(.*)/s);
                  return (
                    <div key={li} style={{ background: "var(--white)", border: "1px solid var(--line)", borderRadius: 3, padding: 8 }}>
                      {m ? (
                        <>
                          <div style={{ fontSize: 10.5, fontWeight: 700, color: "var(--teal)", marginBottom: 3 }}>{m[1]} — {m[2]}</div>
                          <div style={{ fontSize: 11 }}>{m[3]}</div>
                        </>
                      ) : (
                        <div style={{ fontSize: 11 }}>{level}</div>
                      )}
                    </div>
                  );
                })}
              </div>
            ) : (
              <div style={{ fontSize: 12 }}>{sb.levels[0]}</div>
            )}
          </div>
        ))}
      </div>
    </div>
  );
}
