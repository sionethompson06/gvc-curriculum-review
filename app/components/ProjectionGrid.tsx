import Link from "next/link";
import type { Unit } from "../lib/types";

export default function ProjectionGrid({ units, strands, basePath }: { units: Unit[]; strands: string[]; basePath?: string }) {
  if (units.length === 0) return <div className="empty">No projection map units synced yet.</div>;
  return (
    <div style={{ overflowX: "auto" }}>
      <table style={{ minWidth: 900 }}>
        <thead>
          <tr>
            <th style={{ minWidth: 150 }}>Strand</th>
            {units.map((u) => {
              const headerContent = (
                <>
                  <div style={{ fontFamily: "'Source Serif 4',serif", fontStyle: "italic", fontWeight: 400, fontSize: 12.5 }}>{u.name}</div>
                  <div style={{ fontSize: 10, color: "#D9C9A0", marginTop: 2 }}>{u.days ? `${u.days} days` : ""}</div>
                  <div style={{ fontSize: 9.5, color: "#B8A87A" }}>{u.dates}</div>
                </>
              );
              return (
                <th key={u.id} style={{ minWidth: 150, background: "var(--ink)", color: "var(--paper)", padding: 0 }}>
                  {basePath ? (
                    <Link href={`${basePath}/${u.id}`} style={{ display: "block", padding: "8px", color: "var(--paper)" }}>
                      {headerContent}
                      <div style={{ fontSize: 9, color: "var(--gold)", marginTop: 4, textDecoration: "underline" }}>Open unit →</div>
                    </Link>
                  ) : (
                    <div style={{ padding: "8px" }}>{headerContent}</div>
                  )}
                </th>
              );
            })}
          </tr>
        </thead>
        <tbody>
          {strands.map((strand) => (
            <tr key={strand}>
              <td style={{ background: "var(--paper-dim)", fontWeight: 600, fontSize: 11.5 }}>{strand}</td>
              {units.map((u) => {
                const stds = u.cells[strand] || [];
                return (
                  <td key={u.id} style={{ fontSize: 11 }}>
                    {stds.map((s, i) => (
                      <div
                        key={i}
                        style={{
                          background: s.priority ? "var(--gold-soft)" : "var(--paper-dim)",
                          borderLeft: `3px solid ${s.priority ? "var(--gold)" : "var(--line)"}`,
                          padding: "3px 6px", marginBottom: 3, borderRadius: 3,
                          fontWeight: s.priority ? 600 : 400,
                        }}
                      >
                        {s.code && <strong>{s.code}</strong>} {s.desc}
                        {s.needsSupplement && <span style={{ color: "var(--rust)", fontWeight: 700 }}> *</span>}
                        {s.partial && <span style={{ color: "var(--amber)" }}> (partial)</span>}
                      </div>
                    ))}
                  </td>
                );
              })}
            </tr>
          ))}
        </tbody>
      </table>
      <div className="note-strip" style={{ marginTop: 10 }}>
        Gold chips = Priority Standards. Plain chips = Supporting. <strong>*</strong> = needs supplementing by team.
      </div>
    </div>
  );
}
