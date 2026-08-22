"use client";
import { useState } from "react";

interface PastReview {
  id: number;
  review_text: string;
  created_at: string;
}

export default function ReviewPanel({ reviewContext, unitId, pastReviews }: { reviewContext: string; unitId: string; pastReviews: PastReview[] }) {
  const [status, setStatus] = useState<"idle" | "loading" | "done" | "error">("idle");
  const [text, setText] = useState("");
  const [error, setError] = useState("");

  async function requestReview() {
    setStatus("loading");
    setError("");
    try {
      const res = await fetch("/api/review", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ context: reviewContext, unitId }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Review failed");
      setText(data.text);
      setStatus("done");
    } catch (e: any) {
      setError(e.message || "Something went wrong");
      setStatus("error");
    }
  }

  return (
    <div className="panel" style={{ borderColor: "var(--gold)" }}>
      <div className="panel-head" style={{ background: "var(--gold-soft)" }}>
        <h3>GVC Quality Review</h3>
        <button onClick={requestReview} disabled={status === "loading"} style={{ fontSize: 12 }}>
          {status === "loading" ? "Reviewing…" : "Ask Claude to Review This Unit"}
        </button>
      </div>
      <div className="panel-body">
        {status === "idle" && <div className="empty">No review yet this session. Click the button for grounded feedback on deconstruction quality, alignment, and instructional strategy fit.</div>}
        {status === "loading" && <div className="empty">Claude is reviewing this unit against GVC / Rigorous Curriculum Design criteria…</div>}
        {status === "error" && (
          <div className="note-strip" style={{ background: "var(--rust-soft)", borderColor: "var(--rust)", color: "var(--rust)" }}>
            {error.includes("ANTHROPIC_API_KEY") || error.includes("not configured")
              ? "This deployment doesn't have an Anthropic API key configured yet — add ANTHROPIC_API_KEY in the Vercel project's environment variables to enable reviews."
              : `Review failed: ${error}`}
          </div>
        )}
        {status === "done" && (
          <div style={{ whiteSpace: "pre-wrap", lineHeight: 1.65 }}>{text}</div>
        )}

        {pastReviews.length > 0 && (
          <div style={{ marginTop: 16 }}>
            <div style={{ fontSize: 10.5, textTransform: "uppercase", letterSpacing: 0.5, color: "var(--slate)", marginBottom: 8 }}>
              Past Reviews
            </div>
            {pastReviews.map((r) => (
              <div key={r.id} style={{ borderTop: "1px solid var(--paper-dim)", padding: "10px 0", fontSize: 12.5 }}>
                <div style={{ color: "var(--slate)", fontSize: 10.5, marginBottom: 4 }}>
                  {new Date(r.created_at).toLocaleString("en-US", { month: "short", day: "numeric", year: "numeric", hour: "numeric", minute: "2-digit" })}
                </div>
                <div style={{ whiteSpace: "pre-wrap", lineHeight: 1.6 }}>{r.review_text}</div>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
