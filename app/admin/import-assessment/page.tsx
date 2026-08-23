"use client";
import { useState } from "react";
import { parseAssessmentText, type ParsedAssessment } from "../../lib/assessmentParser";
import { SCHOOLS, GRADES } from "../../lib/data";

interface ExistingUnit {
  id: string;
  name: string;
  dates: string;
  has_unit_map: boolean;
}

const ASSESSMENT_TYPES = [
  { value: "postAssessment", label: "Post-Assessment" },
  { value: "preAssessment", label: "Pre-Assessment" },
  { value: "commonAssessment", label: "Common Standard Assessment" },
];

export default function AdminImportAssessmentPage() {
  const [school, setSchool] = useState(SCHOOLS[1]);
  const [grade, setGrade] = useState("6");
  const [subject, setSubject] = useState("");
  const [units, setUnits] = useState<ExistingUnit[]>([]);
  const [selectedUnitId, setSelectedUnitId] = useState("");
  const [assessmentType, setAssessmentType] = useState("postAssessment");
  const [rawInput, setRawInput] = useState("");
  const [parsed, setParsed] = useState<ParsedAssessment | null>(null);
  const [status, setStatus] = useState<"idle" | "loadingUnits" | "saving" | "saved" | "error">("idle");
  const [error, setError] = useState("");
  const [lookupNotice, setLookupNotice] = useState("");

  async function loadUnits() {
    const trimmedSubject = subject.trim();
    if (!trimmedSubject) {
      setError("Enter a subject name first.");
      return;
    }
    setStatus("loadingUnits");
    setError("");
    setLookupNotice("");
    try {
      const res = await fetch(`/api/admin/units-for-subject?school=${encodeURIComponent(school)}&grade=${encodeURIComponent(grade)}&subject=${encodeURIComponent(trimmedSubject)}`);
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || `HTTP ${res.status}`);
      setUnits(data.units || []);
      if ((data.units || []).length === 0) {
        setLookupNotice(`No units found for ${school} / Grade ${grade} / ${trimmedSubject}. Import the Unit Map or Projection Map for this subject first.`);
      }
      setStatus("idle");
    } catch (e: any) {
      setError(e.message || String(e));
      setStatus("error");
    }
  }

  function handleParse() {
    setError("");
    if (!rawInput.trim()) {
      setError("Paste the raw assessment text first.");
      return;
    }
    const data = parseAssessmentText(rawInput);
    if (data.questions.length === 0) {
      setError("No questions found - questions should start with a number and a period (e.g. '1. ...') at the start of a line.");
      return;
    }
    setParsed(data);
  }

  async function handleSave() {
    if (!parsed || !selectedUnitId) return;
    setStatus("saving");
    setError("");
    try {
      const res = await fetch("/api/admin/save-assessment-questions", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ unitId: selectedUnitId, assessmentType, questions: parsed.questions }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Save failed");
      setStatus("saved");
    } catch (e: any) {
      setError(e.message || String(e));
      setStatus("error");
    }
  }

  return (
    <div>
      <div style={{ borderBottom: "3px double var(--ink)", paddingBottom: 14, marginBottom: 20 }}>
        <h1 style={{ fontSize: 24, margin: 0, fontWeight: 700 }}>Import Assessment</h1>
        <div style={{ color: "var(--slate)", fontSize: 12.5, marginTop: 4 }}>
          Paste the tagged, student-facing assessment text. Each question should end with a bracketed tag like{" "}
          <code>[6.RP.1-K]</code> or <code>[6.RP.2-PS,R; 6.RP.3-K]</code> - see the{" "}
          <a href="/guide/learning-targets" style={{ color: "var(--teal)", textDecoration: "underline" }}>Learning Target Rubric</a> for category abbreviations.
        </div>
      </div>

      <div className="panel">
        <div className="panel-head"><h3>1. Which unit and assessment does this belong to?</h3></div>
        <div className="panel-body">
          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr", gap: 12, marginBottom: 12 }}>
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
          <button onClick={loadUnits} disabled={status === "loadingUnits"} style={{ marginBottom: 12 }}>
            {status === "loadingUnits" ? "Loading…" : "Find Units"}
          </button>
          {lookupNotice && <div className="note-strip" style={{ marginBottom: 12 }}>{lookupNotice}</div>}
          {units.length > 0 && (
            <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12 }}>
              <div>
                <div style={{ fontSize: 11, fontWeight: 700, marginBottom: 4, color: "var(--slate)" }}>Unit</div>
                <select value={selectedUnitId} onChange={(e) => setSelectedUnitId(e.target.value)} style={{ width: "100%", padding: 8, border: "1px solid var(--line)", borderRadius: 3 }}>
                  <option value="">— select a unit —</option>
                  {units.map((u) => <option key={u.id} value={u.id}>{u.name} {u.dates ? `(${u.dates})` : ""} {!u.has_unit_map ? "— no Unit Map yet" : ""}</option>)}
                </select>
              </div>
              <div>
                <div style={{ fontSize: 11, fontWeight: 700, marginBottom: 4, color: "var(--slate)" }}>Assessment</div>
                <select value={assessmentType} onChange={(e) => setAssessmentType(e.target.value)} style={{ width: "100%", padding: 8, border: "1px solid var(--line)", borderRadius: 3 }}>
                  {ASSESSMENT_TYPES.map((t) => <option key={t.value} value={t.value}>{t.label}</option>)}
                </select>
              </div>
            </div>
          )}
        </div>
      </div>

      <div className="panel">
        <div className="panel-head"><h3>2. Paste the assessment text</h3></div>
        <div className="panel-body">
          <textarea
            value={rawInput}
            onChange={(e) => setRawInput(e.target.value)}
            rows={12}
            placeholder={"1. Define what a ratio is. [6.RP.1-K]\n\n2. Write the ratio of 3 apples to 5 oranges. [6.RP.1-PS]\nA. 3:5\nB. 5:3\n..."}
            style={{ fontFamily: "monospace", fontSize: 11.5 }}
          />
          <div style={{ display: "flex", justifyContent: "flex-end", marginTop: 10 }}>
            <button onClick={handleParse}>Parse</button>
          </div>
          {error && <div style={{ color: "var(--rust)", fontSize: 12.5, marginTop: 8 }}>{error}</div>}
        </div>
      </div>

      {parsed && (
        <div className="panel">
          <div className="panel-head">
            <h3>3. Review &amp; save — {parsed.questions.length} question{parsed.questions.length !== 1 ? "s" : ""} detected</h3>
          </div>
          <div className="panel-body">
            {parsed.untaggedCount > 0 && (
              <div className="note-strip" style={{ background: "var(--rust-soft)", borderColor: "var(--rust)", color: "var(--rust)" }}>
                {parsed.untaggedCount} question{parsed.untaggedCount > 1 ? "s have" : " has"} no tag at all - these won&apos;t count toward any target&apos;s assessment coverage.
              </div>
            )}
            <div style={{ marginBottom: 14 }}>
              {parsed.questions.map((q, i) => (
                <div key={i} style={{ border: "1px solid var(--line)", borderRadius: 3, padding: 10, marginBottom: 8 }}>
                  <div style={{ display: "flex", justifyContent: "space-between", gap: 10 }}>
                    <div style={{ fontSize: 12.5 }}><strong>Q{q.number}.</strong> {q.text}</div>
                    <div style={{ flexShrink: 0 }}>
                      {q.tags.length === 0 ? (
                        <span className="badge badge-flag">No tag</span>
                      ) : (
                        q.tags.map((t, ti) => (
                          <span key={ti} className="badge badge-priority" style={{ marginLeft: 4 }}>
                            {t.standardCode}-{t.categories.map((c) => c[0] === "P" && c !== "Product" ? "PS" : c[0]).join(",")}
                          </span>
                        ))
                      )}
                    </div>
                  </div>
                  {q.choices.length > 0 && (
                    <div style={{ fontSize: 11.5, color: "var(--slate)", marginTop: 6, paddingLeft: 14 }}>
                      {q.choices.map((c, ci) => <div key={ci}>{c}</div>)}
                    </div>
                  )}
                </div>
              ))}
            </div>

            {status === "saved" && <div className="note-strip">Saved. Open the unit&apos;s page to see the completeness and alignment checks.</div>}
            {error && status === "error" && <div style={{ color: "var(--rust)", fontSize: 12.5, marginBottom: 8 }}>{error}</div>}
            <div style={{ display: "flex", justifyContent: "flex-end" }}>
              <button onClick={handleSave} disabled={!selectedUnitId || status === "saving"}>
                {status === "saving" ? "Saving…" : !selectedUnitId ? "Select a unit above first" : "Save Assessment Questions"}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
