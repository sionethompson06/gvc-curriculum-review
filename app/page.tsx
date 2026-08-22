import Link from "next/link";
import { allMapEntries, computeUnitAlignment, computeTemplateCompleteness, detectDuplicateContent, slugify } from "./lib/data";

export const dynamic = "force-dynamic";

export default async function DashboardPage() {
  let entries: Awaited<ReturnType<typeof allMapEntries>> = [];
  let dupWarnings: Awaited<ReturnType<typeof detectDuplicateContent>> = [];
  let dbError = false;
  try {
    entries = await allMapEntries();
    dupWarnings = await detectDuplicateContent();
  } catch {
    dbError = true;
  }

  let totalUnits = 0, unitMapsAttached = 0, flaggedUnits = 0, incompleteUnits = 0;
  const flagList: { school: string; grade: string; subject: string; unitName: string; href: string; issues: string[] }[] = [];

  entries.forEach(({ school, grade, subject, map }) => {
    map.units.forEach((unit) => {
      totalUnits++;
      const um = map.unitMaps[unit.id] || null;
      if (um) unitMapsAttached++;
      const align = computeUnitAlignment(unit, um);
      const completeness = computeTemplateCompleteness(um);
      if (um && completeness.missingItems.length > 0) incompleteUnits++;
      const issues: string[] = [];
      if (align.missingFromUnitMap.length) issues.push(`Missing from unit map: ${align.missingFromUnitMap.join(", ")}`);
      if (align.extraInUnitMap.length) issues.push(`Not on projection map: ${align.extraInUnitMap.join(", ")}`);
      if (align.dateIssue?.kind === "mismatch") issues.push(`Timeline mismatch: ${align.dateIssue.projStart}–${align.dateIssue.projEnd} vs ${align.dateIssue.umStart}–${align.dateIssue.umEnd}`);
      if (align.dateIssue?.kind === "missingProjectionDates") issues.push(`Projection Map has no dates on file (Unit Map states ${align.dateIssue.umStart}–${align.dateIssue.umEnd})`);
      if (align.dateIssue?.kind === "missingUnitMapDates") issues.push(`Unit Map has no Plan Start/End Date (Projection Map states ${align.dateIssue.projStart}–${align.dateIssue.projEnd})`);
      if (um && completeness.missingItems.length > 0) issues.push(`Template incomplete (${completeness.passedChecks}/${completeness.totalChecks}): ${completeness.missingItems[0]}${completeness.missingItems.length > 1 ? ` +${completeness.missingItems.length - 1} more` : ""}`);
      if (issues.length) {
        flaggedUnits++;
        flagList.push({
          school, grade, subject, unitName: unit.name,
          href: `/${slugify(school)}/${grade}/${slugify(subject)}/${unit.id}`,
          issues,
        });
      }
    });
  });

  return (
    <div>
      <div style={{ borderBottom: "3px double var(--ink)", paddingBottom: 14, marginBottom: 20 }}>
        <h1 style={{ fontSize: 26, margin: 0, fontWeight: 700 }}>District Curriculum Review</h1>
        <div style={{ color: "var(--slate)", fontSize: 12.5, marginTop: 4 }}>
          Guaranteed &amp; Viable Curriculum &middot; browse by school, grade, and subject in the sidebar
        </div>
      </div>

      {dbError && (
        <div className="note-strip" style={{ background: "var(--rust-soft)", borderColor: "var(--rust)", color: "var(--rust)" }}>
          Database not initialized yet. Visit <code>/api/admin/init</code> with a POST request once to set up the schema and load starter data.
        </div>
      )}

      {dupWarnings.length > 0 && (
        <div className="panel" style={{ borderColor: "var(--rust)" }}>
          <div className="panel-head" style={{ background: "var(--rust-soft)" }}>
            <h3 style={{ color: "var(--rust)" }}>Copy-Pasted Template Warning</h3>
          </div>
          <div className="panel-body">
            <p style={{ marginTop: 0 }}>These grade levels have identical standard codes across every unit in the same subject — almost certainly a template copied without updating for grade level:</p>
            <ul>
              {dupWarnings.map((d, i) => (
                <li key={i}><strong>{d.school} &middot; {d.subject}</strong>: Grade {d.gradeA} and Grade {d.gradeB} are word-for-word identical</li>
              ))}
            </ul>
          </div>
        </div>
      )}

      <div style={{ display: "grid", gridTemplateColumns: "repeat(5, 1fr)", gap: 12, marginBottom: 20 }}>
        <StatCard num={totalUnits} label="Units Mapped (Projection)" />
        <StatCard num={unitMapsAttached} label="Unit Maps On File" tone="ok" />
        <StatCard num={flaggedUnits} label="Units With Open Issues" tone="flag" />
        <StatCard num={incompleteUnits} label="Missing Template Sections" tone="flag" />
        <StatCard num={entries.length} label="School / Grade / Subject Cells" />
      </div>

      <div className="panel">
        <div className="panel-head"><h3>Needs Your Attention</h3></div>
        <div className="panel-body">
          {flagList.length === 0 ? (
            <div className="empty">Nothing flagged.</div>
          ) : (
            <table>
              <thead><tr><th>School</th><th>Grade</th><th>Subject</th><th>Unit</th><th>Issues</th><th></th></tr></thead>
              <tbody>
                {flagList.slice(0, 20).map((f, i) => (
                  <tr key={i}>
                    <td>{f.school}</td>
                    <td>{f.grade}</td>
                    <td>{f.subject}</td>
                    <td>{f.unitName || "(unnamed)"}</td>
                    <td>{f.issues.slice(0, 2).join("; ")}{f.issues.length > 2 ? ` +${f.issues.length - 2} more` : ""}</td>
                    <td><Link href={f.href} style={{ color: "var(--teal)", fontSize: 11.5, textDecoration: "underline" }}>Open →</Link></td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>
      </div>

      <div className="note-strip">
        Use the sidebar to browse by school → grade → subject. Each subject page shows the Projection Map alongside every Unit Map that's been synced, with alignment status for each.
      </div>
    </div>
  );
}

function StatCard({ num, label, tone }: { num: number; label: string; tone?: "ok" | "flag" }) {
  const color = tone === "ok" ? "var(--teal)" : tone === "flag" ? "var(--rust)" : "var(--ink)";
  return (
    <div className="panel" style={{ padding: "14px 16px", marginBottom: 0 }}>
      <div style={{ fontFamily: "'Source Serif 4',serif", fontSize: 28, fontWeight: 700, color }}>{num}</div>
      <div style={{ fontSize: 10.5, textTransform: "uppercase", letterSpacing: 0.5, color: "var(--slate)", marginTop: 5 }}>{label}</div>
    </div>
  );
}
