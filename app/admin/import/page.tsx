"use client";
import { useState } from "react";
import { splitIntoUnitChunks, parseUnitMapRawText, type ParsedUnitMap } from "../../lib/parser";
import { SCHOOLS, GRADES } from "../../lib/data";

interface ExistingUnit {
  id: string;
  name: string;
  dates: string;
  has_unit_map: boolean;
}

interface ChunkState {
  title: string;
  rawText: string;
  parsed: ParsedUnitMap;
  linkMode: "existing" | "new";
  selectedUnitId: string;
  newUnitName: string;
  saveStatus: "idle" | "saving" | "saved" | "error";
  saveError: string;
}

// Unit Map document titles often carry extra context the Projection Map's
// own unit name doesn't have (e.g. "Unit 1 History (Grade 6)" vs. just
// "Unit 1") - matching on the unit's number is far more reliable than an
// exact string match across those two naming conventions.
function extractUnitNumber(name: string): number | null {
  const m = name.match(/Unit\s+(\d+)/i);
  return m ? parseInt(m[1], 10) : null;
}

export default function AdminImportPage() {
  const [school, setSchool] = useState(SCHOOLS[1]);
  const [grade, setGrade] = useState("6");
  const [subject, setSubject] = useState("");
  const [rawInput, setRawInput] = useState("");
  const [chunks, setChunks] = useState<ChunkState[] | null>(null);
  const [existingUnits, setExistingUnits] = useState<ExistingUnit[]>([]);
  const [parseError, setParseError] = useState("");

  async function handleParse() {
    setParseError("");
    if (!subject.trim()) {
      setParseError("Enter a subject name first.");
      return;
    }
    if (!rawInput.trim()) {
      setParseError("Paste the raw document text first.");
      return;
    }
    try {
      const rawChunks = splitIntoUnitChunks(rawInput);
      const parsedChunks: ChunkState[] = rawChunks.map((c) => ({
        title: c.title,
        rawText: c.text,
        parsed: parseUnitMapRawText(c.text),
        linkMode: "new",
        selectedUnitId: "",
        newUnitName: c.title.replace(/\s*\(Grade\s*\d+\)\s*$/i, "").trim() || c.title,
        saveStatus: "idle",
        saveError: "",
      }));
      setChunks(parsedChunks);

      const res = await fetch(`/api/admin/units-for-subject?school=${encodeURIComponent(school)}&grade=${encodeURIComponent(grade)}&subject=${encodeURIComponent(subject)}`);
      if (res.ok) {
        const data = await res.json();
        setExistingUnits(data.units || []);
        // Auto-suggest a link: prefer matching by unit number (robust across
        // naming conventions), falling back to an exact name match for
        // documents that don't follow the "Unit N" pattern at all.
        setChunks((prev) =>
          (prev || []).map((c) => {
            const chunkNum = extractUnitNumber(c.title);
            let match: ExistingUnit | undefined;
            if (chunkNum !== null) {
              match = (data.units || []).find((u: ExistingUnit) => extractUnitNumber(u.name) === chunkNum);
            }
            if (!match) {
              match = (data.units || []).find((u: ExistingUnit) => u.name.toLowerCase() === c.newUnitName.toLowerCase());
            }
            return match ? { ...c, linkMode: "existing" as const, selectedUnitId: match.id } : c;
          })
        );
      }
    } catch (e: any) {
      setParseError(`Parse error: ${e.message || e}`);
    }
  }

  function updateChunk(i: number, patch: Partial<ChunkState>) {
    setChunks((prev) => (prev ? prev.map((c, ci) => (ci === i ? { ...c, ...patch } : c)) : prev));
  }

  async function handleSave(i: number) {
    const c = chunks?.[i];
    if (!c) return;
    updateChunk(i, { saveStatus: "saving", saveError: "" });
    try {
      const body: any = {
        school,
        grade,
        subject,
        parsed: c.parsed,
      };
      if (c.linkMode === "existing") {
        if (!c.selectedUnitId) throw new Error("Select an existing unit to link to.");
        body.unitId = c.selectedUnitId;
        body.unitName = existingUnits.find((u) => u.id === c.selectedUnitId)?.name || c.newUnitName;
      } else {
        if (!c.newUnitName.trim()) throw new Error("Enter a name for the new unit.");
        body.unitName = c.newUnitName.trim();
      }
      const res = await fetch("/api/admin/save-unit-map", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Save failed");
      updateChunk(i, { saveStatus: "saved" });
    } catch (e: any) {
      updateChunk(i, { saveStatus: "error", saveError: e.message || String(e) });
    }
  }

  return (
    <div>
      <div style={{ borderBottom: "3px double var(--ink)", paddingBottom: 14, marginBottom: 20 }}>
        <h1 style={{ fontSize: 24, margin: 0, fontWeight: 700 }}>Import Unit Map</h1>
        <div style={{ color: "var(--slate)", fontSize: 12.5, marginTop: 4 }}>
          Paste a raw Drive text export of a Unit Map document. Documents covering multiple units (e.g. "Unit 1-6 Mathematics")
          are automatically split and parsed one unit at a time.
        </div>
      </div>

      <div className="panel">
        <div className="panel-head"><h3>1. Where does this belong?</h3></div>
        <div className="panel-body" style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr", gap: 12 }}>
          <div>
            <div style={{ fontSize: 11, fontWeight: 700, marginBottom: 4, color: "var(--slate)" }}>School</div>
            <select value={school} onChange={(e) => setSchool(e.target.value)} style={{ width: "100%", padding: 8, border: "1px solid var(--line)", borderRadius: 3 }}>
              {SCHOOLS.map((s) => <option key={s} value={s}>{s}</option>)}
            </select>
          </div>
          <div>
            <div style={{ fontSize: 11, fontWeight: 700, marginBottom: 4, color: "var(--slate)" }}>Grade</div>
            <select value={grade} onChange={(e) => setGrade(e.target.value)} style={{ width: "100%", padding: 8, border: "1px solid var(--line)", borderRadius: 3 }}>
              {GRADES.map((g) => <option key={g} value={g}>{g}</option>)}
            </select>
          </div>
          <div>
            <div style={{ fontSize: 11, fontWeight: 700, marginBottom: 4, color: "var(--slate)" }}>Subject</div>
            <input type="text" value={subject} onChange={(e) => setSubject(e.target.value)} placeholder="e.g. Science, ELA" />
          </div>
        </div>
      </div>

      <div className="panel">
        <div className="panel-head"><h3>2. Paste the raw document text</h3></div>
        <div className="panel-body">
          <textarea
            value={rawInput}
            onChange={(e) => setRawInput(e.target.value)}
            rows={10}
            placeholder="Paste the full Drive markdown-table text export here..."
            style={{ fontFamily: "monospace", fontSize: 11.5 }}
          />
          <div style={{ display: "flex", justifyContent: "flex-end", marginTop: 10 }}>
            <button onClick={handleParse}>Parse</button>
          </div>
          {parseError && <div style={{ color: "var(--rust)", fontSize: 12.5, marginTop: 8 }}>{parseError}</div>}
        </div>
      </div>

      {chunks && chunks.length > 0 && (
        <div className="panel">
          <div className="panel-head"><h3>3. Review &amp; save — {chunks.length} unit{chunks.length !== 1 ? "s" : ""} detected</h3></div>
          <div className="panel-body">
            {chunks.map((c, i) => (
              <div key={i} style={{ border: "1px solid var(--line)", borderRadius: 4, padding: 14, marginBottom: 14 }}>
                <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", marginBottom: 10 }}>
                  <div style={{ fontWeight: 700, fontSize: 15 }}>{c.title}</div>
                  {c.saveStatus === "saved" && <span className="badge badge-ok">Saved</span>}
                  {c.saveStatus === "error" && <span className="badge badge-flag">Error</span>}
                </div>

                <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 16, marginBottom: 12, fontSize: 12.5 }}>
                  <div>
                    <div style={{ color: "var(--slate)", marginBottom: 3 }}>Priority standards chosen</div>
                    <div>{c.parsed.chosenPriorityCodes.join(", ") || <em style={{ color: "var(--rust)" }}>none found</em>}</div>
                  </div>
                  <div>
                    <div style={{ color: "var(--slate)", marginBottom: 3 }}>Curriculum map rows / Supporting standards</div>
                    <div>{c.parsed.curriculumRows.length} rows &middot; {c.parsed.supportingStandards?.length || 0} supporting</div>
                  </div>
                  <div>
                    <div style={{ color: "var(--slate)", marginBottom: 3 }}>Dates parsed</div>
                    <div>{c.parsed.startDate || "—"} to {c.parsed.endDate || "—"}</div>
                  </div>
                  <div>
                    <div style={{ color: "var(--slate)", marginBottom: 3 }}>Targets filled (avg per standard)</div>
                    <div>
                      {c.parsed.priorityStandards.length > 0
                        ? (c.parsed.priorityStandards.reduce((sum, ps) => sum + Object.values(ps.targets || {}).filter(Boolean).length, 0) / c.parsed.priorityStandards.length).toFixed(1)
                        : "—"} / 4
                    </div>
                  </div>
                </div>

                <div style={{ background: "var(--paper-dim)", padding: 10, borderRadius: 3, marginBottom: 12 }}>
                  <div style={{ display: "flex", gap: 16, marginBottom: 8 }}>
                    <label style={{ fontSize: 12.5, display: "flex", alignItems: "center", gap: 6 }}>
                      <input type="radio" checked={c.linkMode === "existing"} onChange={() => updateChunk(i, { linkMode: "existing" })} />
                      Link to existing unit
                    </label>
                    <label style={{ fontSize: 12.5, display: "flex", alignItems: "center", gap: 6 }}>
                      <input type="radio" checked={c.linkMode === "new"} onChange={() => updateChunk(i, { linkMode: "new" })} />
                      Create new unit
                    </label>
                  </div>
                  {c.linkMode === "existing" ? (
                    <select value={c.selectedUnitId} onChange={(e) => updateChunk(i, { selectedUnitId: e.target.value })} style={{ width: "100%", padding: 6, border: "1px solid var(--line)", borderRadius: 3 }}>
                      <option value="">— select a unit —</option>
                      {existingUnits.map((u) => (
                        <option key={u.id} value={u.id}>
                          {u.name} {u.dates ? `(${u.dates})` : ""} {u.has_unit_map ? "— already has a Unit Map (will overwrite)" : ""}
                        </option>
                      ))}
                    </select>
                  ) : (
                    <input type="text" value={c.newUnitName} onChange={(e) => updateChunk(i, { newUnitName: e.target.value })} placeholder="Unit name" />
                  )}
                </div>

                {c.saveStatus === "error" && (
                  <div style={{ color: "var(--rust)", fontSize: 12.5, marginBottom: 8 }}>{c.saveError}</div>
                )}
                <div style={{ display: "flex", justifyContent: "flex-end" }}>
                  <button onClick={() => handleSave(i)} disabled={c.saveStatus === "saving" || c.saveStatus === "saved"}>
                    {c.saveStatus === "saving" ? "Saving…" : c.saveStatus === "saved" ? "Saved" : "Save this unit"}
                  </button>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
