"use client";
import { useState, useRef } from "react";
import { parseProjectionMapFromHtml, type ParsedProjectionMap } from "../../lib/projectionParser";
import { SCHOOLS, GRADES } from "../../lib/data";

export default function AdminImportProjectionPage() {
  const [school, setSchool] = useState(SCHOOLS[1]);
  const [grade, setGrade] = useState("6");
  const [subject, setSubject] = useState("");
  const [parsed, setParsed] = useState<ParsedProjectionMap | null>(null);
  const [status, setStatus] = useState<"idle" | "parsing" | "ready" | "saving" | "saved" | "error">("idle");
  const [error, setError] = useState("");
  const [saveResult, setSaveResult] = useState<{ created: number; updated: number; unitDiffs?: { unitName: string; diff: { resolved: string[]; newlyIntroduced: string[]; stillPresent: string[] } }[] } | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  async function handleFile(file: File) {
    setError("");
    setStatus("parsing");
    setSaveResult(null);
    try {
      const mammoth = await import("mammoth");
      const arrayBuffer = await file.arrayBuffer();
      const result = await mammoth.convertToHtml({ arrayBuffer });
      const data = parseProjectionMapFromHtml(result.value);
      if (data.units.length === 0) {
        throw new Error("No units found - this doesn't look like a Projection Map table, or the table structure wasn't recognized.");
      }
      setParsed(data);
      setStatus("ready");
    } catch (e: any) {
      setError(e.message || String(e));
      setStatus("error");
    }
  }

  function togglePriority(unitIndex: number, strand: string, entryIndex: number) {
    if (!parsed) return;
    const next: ParsedProjectionMap = {
      ...parsed,
      units: parsed.units.map((u, ui) => {
        if (ui !== unitIndex) return u;
        return {
          ...u,
          cells: {
            ...u.cells,
            [strand]: u.cells[strand].map((e, ei) => (ei === entryIndex ? { ...e, priority: !e.priority } : e)),
          },
        };
      }),
    };
    setParsed(next);
  }

  async function handleSave() {
    if (!parsed) return;
    if (!subject.trim()) {
      setError("Enter a subject name first.");
      return;
    }
    setStatus("saving");
    setError("");
    try {
      const res = await fetch("/api/admin/save-projection-map", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ school, grade, subject, strandNames: parsed.strandNames, units: parsed.units }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Save failed");
      setSaveResult({ created: data.created, updated: data.updated, unitDiffs: data.unitDiffs || [] });
      setStatus("saved");
    } catch (e: any) {
      setError(e.message || String(e));
      setStatus("error");
    }
  }

  return (
    <div>
      <div style={{ borderBottom: "3px double var(--ink)", paddingBottom: 14, marginBottom: 20 }}>
        <h1 style={{ fontSize: 24, margin: 0, fontWeight: 700 }}>Import Projection Map</h1>
        <div style={{ color: "var(--slate)", fontSize: 12.5, marginTop: 4 }}>
          Upload the actual <code>.docx</code> file (not pasted text) — the raw file preserves exact table structure that
          Google Drive&apos;s text export can silently lose. Highlighting still can&apos;t be read automatically, so review
          the priority flag on every entry below before saving.
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
        <div className="panel-head"><h3>2. Upload the Projection Map .docx</h3></div>
        <div className="panel-body">
          <input
            ref={fileInputRef}
            type="file"
            accept=".docx"
            onChange={(e) => {
              const file = e.target.files?.[0];
              if (file) handleFile(file);
            }}
          />
          {status === "parsing" && <div className="empty" style={{ marginTop: 12 }}>Parsing…</div>}
          {error && <div style={{ color: "var(--rust)", fontSize: 12.5, marginTop: 8 }}>{error}</div>}
        </div>
      </div>

      {parsed && (
        <div className="panel">
          <div className="panel-head">
            <h3>3. Review priority — {parsed.units.length} units, {parsed.strandNames.length} strands</h3>
          </div>
          <div className="panel-body">
            <div className="note-strip">
              Every entry below defaults to a best guess (Priority for most rows, Supporting where the row is explicitly
              labeled that way). Click any badge to flip it based on what&apos;s actually highlighted in the source document.
            </div>
            <div style={{ overflowX: "auto" }}>
              <table style={{ minWidth: 900 }}>
                <thead>
                  <tr>
                    <th style={{ minWidth: 150 }}>Strand</th>
                    {parsed.units.map((u, i) => (
                      <th key={i} style={{ minWidth: 180 }}>
                        {u.name} {u.days ? `(${u.days}d)` : ""}
                        <div style={{ fontSize: 9.5, color: "var(--slate)", fontWeight: 400 }}>{u.dates}</div>
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {parsed.strandNames.map((strand) => (
                    <tr key={strand}>
                      <td style={{ fontWeight: 600, fontSize: 11.5 }}>{strand}</td>
                      {parsed.units.map((u, ui) => {
                        const entries = u.cells[strand] || [];
                        return (
                          <td key={ui} style={{ fontSize: 11 }}>
                            {entries.map((entry, ei) => (
                              <div key={ei} style={{ marginBottom: 6 }}>
                                <button
                                  onClick={() => togglePriority(ui, strand, ei)}
                                  className={entry.priority ? "badge badge-priority" : "badge badge-support"}
                                  style={{ border: "none", cursor: "pointer", marginBottom: 3 }}
                                  title="Click to flip Priority / Supporting"
                                >
                                  {entry.priority ? "Priority" : "Supporting"}
                                </button>
                                <div>{entry.desc}</div>
                              </div>
                            ))}
                          </td>
                        );
                      })}
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>

            {saveResult && (
              <div className="note-strip" style={{ marginTop: 14 }}>
                Saved — {saveResult.created} unit{saveResult.created !== 1 ? "s" : ""} created, {saveResult.updated} updated.
              </div>
            )}
            {saveResult && saveResult.unitDiffs && saveResult.unitDiffs.length > 0 && (
              <div style={{ marginTop: 14 }}>
                <div style={{ fontSize: 12.5, fontWeight: 700, color: "var(--ink-soft)", marginBottom: 8 }}>
                  What changed from the previous version, by unit
                </div>
                {saveResult.unitDiffs.map((ud, i) => (
                  <div key={i} className="panel" style={{ marginBottom: 10 }}>
                    <div className="panel-head"><h3 style={{ fontSize: 13.5 }}>{ud.unitName}</h3></div>
                    <div className="panel-body">
                      {ud.diff.resolved.length > 0 && (
                        <div style={{ marginBottom: ud.diff.newlyIntroduced.length > 0 ? 10 : 0 }}>
                          <div style={{ fontSize: 11.5, fontWeight: 700, color: "var(--teal)", marginBottom: 4 }}>✓ Resolved ({ud.diff.resolved.length})</div>
                          <ul style={{ margin: 0, paddingLeft: 18 }}>
                            {ud.diff.resolved.map((issue, ii) => <li key={ii} style={{ fontSize: 12, marginBottom: 2 }}>{issue}</li>)}
                          </ul>
                        </div>
                      )}
                      {ud.diff.newlyIntroduced.length > 0 && (
                        <div>
                          <div style={{ fontSize: 11.5, fontWeight: 700, color: "var(--rust)", marginBottom: 4 }}>New ({ud.diff.newlyIntroduced.length})</div>
                          <ul style={{ margin: 0, paddingLeft: 18 }}>
                            {ud.diff.newlyIntroduced.map((issue, ii) => <li key={ii} style={{ fontSize: 12, marginBottom: 2 }}>{issue}</li>)}
                          </ul>
                        </div>
                      )}
                      {ud.diff.stillPresent.length > 0 && (
                        <div style={{ marginTop: 10, fontSize: 12, color: "var(--slate)" }}>
                          {ud.diff.stillPresent.length} issue{ud.diff.stillPresent.length > 1 ? "s" : ""} still present from before.
                        </div>
                      )}
                    </div>
                  </div>
                ))}
              </div>
            )}
            {error && status === "error" && <div style={{ color: "var(--rust)", fontSize: 12.5, marginTop: 8 }}>{error}</div>}
            <div style={{ display: "flex", justifyContent: "flex-end", marginTop: 14 }}>
              <button onClick={handleSave} disabled={status === "saving"}>
                {status === "saving" ? "Saving…" : "Save Projection Map"}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
