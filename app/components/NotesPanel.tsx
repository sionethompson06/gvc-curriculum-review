"use client";
import { useState } from "react";

interface Note {
  id: number;
  note_text: string;
  author: string | null;
  created_at: string;
}

export default function NotesPanel({ unitId, initialNotes }: { unitId: string; initialNotes: Note[] }) {
  const [notes, setNotes] = useState<Note[]>(initialNotes);
  const [draft, setDraft] = useState("");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");

  async function saveNote() {
    if (!draft.trim()) return;
    setSaving(true);
    setError("");
    try {
      const res = await fetch("/api/notes", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ unitId, noteText: draft.trim() }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Failed to save note");
      setNotes([data.note, ...notes]);
      setDraft("");
    } catch (e: any) {
      setError(e.message || "Something went wrong");
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="panel">
      <div className="panel-head"><h3>Your Notes</h3></div>
      <div className="panel-body">
        <textarea
          value={draft}
          onChange={(e) => setDraft(e.target.value)}
          placeholder="Log a note about this unit — what you told the teacher, what changed, what to check next time…"
          rows={3}
          style={{ marginBottom: 8 }}
        />
        <div style={{ display: "flex", justifyContent: "flex-end" }}>
          <button onClick={saveNote} disabled={saving || !draft.trim()} style={{ fontSize: 12 }}>
            {saving ? "Saving…" : "Save Note"}
          </button>
        </div>
        {error && <div style={{ color: "var(--rust)", fontSize: 12, marginTop: 6 }}>{error}</div>}

        {notes.length === 0 ? (
          <div className="empty" style={{ marginTop: 12 }}>No notes logged yet.</div>
        ) : (
          <div style={{ marginTop: 14 }}>
            {notes.map((n) => (
              <div key={n.id} style={{ borderTop: "1px solid var(--paper-dim)", padding: "10px 0", fontSize: 12.5 }}>
                <div style={{ color: "var(--slate)", fontSize: 10.5, marginBottom: 3 }}>
                  {new Date(n.created_at).toLocaleString("en-US", { month: "short", day: "numeric", year: "numeric", hour: "numeric", minute: "2-digit" })}
                </div>
                <div style={{ whiteSpace: "pre-wrap" }}>{n.note_text}</div>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
