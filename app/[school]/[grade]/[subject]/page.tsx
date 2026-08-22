import Link from "next/link";
import { notFound } from "next/navigation";
import Breadcrumb from "../../../components/Breadcrumb";
import ProjectionGrid from "../../../components/ProjectionGrid";
import { schoolFromSlug, subjectFromSlug, getMap, strandsFor, computeUnitAlignment, computeTemplateCompleteness, computeProjectionMapCompleteness } from "../../../lib/data";

export const dynamic = "force-dynamic";
export const revalidate = 0;


export default async function SubjectPage({ params }: { params: { school: string; grade: string; subject: string } }) {
  const school = schoolFromSlug(params.school);
  const subject = await subjectFromSlug(params.subject);
  if (!school || !subject) return notFound();
  const grade = decodeURIComponent(params.grade);
  const map = await getMap(school, grade, subject);
  const strands = await strandsFor(subject);
  const projCompleteness = computeProjectionMapCompleteness(map?.units || []);

  return (
    <div>
      <Breadcrumb items={[
        { label: "Dashboard", href: "/" },
        { label: school, href: `/${params.school}` },
        { label: `Grade ${grade}`, href: `/${params.school}/${params.grade}` },
        { label: subject },
      ]} />
      <h1 style={{ fontSize: 22, marginBottom: 20 }}>{school} &middot; Grade {grade} &middot; {subject}</h1>

      <div className="panel">
        <div className="panel-head"><h3>Projection Map</h3></div>
        <div className="panel-body">
          <ProjectionGrid units={map?.units || []} strands={strands} basePath={`/${params.school}/${params.grade}/${params.subject}`} />
        </div>
      </div>

      {map && map.units.length > 0 && (
        <div className="panel" style={{ borderColor: projCompleteness.unitsWithIssues.length > 0 ? "var(--amber)" : "var(--teal)" }}>
          <div className="panel-head" style={{ background: projCompleteness.unitsWithIssues.length > 0 ? "var(--amber-soft)" : "var(--teal-soft)" }}>
            <h3 style={{ color: projCompleteness.unitsWithIssues.length > 0 ? "var(--amber)" : "var(--teal)" }}>
              Projection Map Completeness — {projCompleteness.totalUnits - projCompleteness.unitsWithIssues.length}/{projCompleteness.totalUnits} units complete
            </h3>
          </div>
          <div className="panel-body">
            {projCompleteness.unitsWithIssues.length === 0 ? (
              <div style={{ fontSize: 12.5, color: "var(--teal)" }}>Every unit on this Projection Map has a name, dates, standards, and at least one priority standard marked.</div>
            ) : (
              <ul style={{ margin: 0, paddingLeft: 18 }}>
                {projCompleteness.unitsWithIssues.map((u, i) => (
                  <li key={i} style={{ fontSize: 12.5, marginBottom: 4 }}>
                    <strong>{u.unitName}</strong>: {u.issues.join("; ")}
                  </li>
                ))}
              </ul>
            )}
          </div>
        </div>
      )}

      <div className="panel">
        <div className="panel-head"><h3>Units</h3></div>
        <div className="panel-body" style={{ padding: 0 }}>
          {!map || map.units.length === 0 ? (
            <div className="empty">No units yet.</div>
          ) : (
            <table>
              <thead><tr><th>Unit</th><th>Dates</th><th>Unit Map</th><th>Alignment</th><th>Template</th><th></th></tr></thead>
              <tbody>
                {map.units.map((unit) => {
                  const um = map.unitMaps[unit.id] || null;
                  const align = computeUnitAlignment(unit, um);
                  const completeness = computeTemplateCompleteness(um);
                  const hasIssue = align.missingFromUnitMap.length > 0 || align.extraInUnitMap.length > 0 || !!align.dateIssue;
                  return (
                    <tr key={unit.id}>
                      <td style={{ fontWeight: 600 }}>{unit.name || "(unnamed)"}</td>
                      <td style={{ color: "var(--slate)", fontSize: 12 }}>{unit.dates || "—"}</td>
                      <td>
                        {um ? <span className="badge badge-ok">On file</span> : <span className="badge badge-support">Not synced</span>}
                      </td>
                      <td>
                        {!um ? (
                          <span style={{ color: "var(--slate)", fontSize: 12 }}>—</span>
                        ) : hasIssue ? (
                          <span className="badge badge-flag">Misaligned</span>
                        ) : (
                          <span className="badge badge-ok">Aligned</span>
                        )}
                      </td>
                      <td>
                        {!um ? (
                          <span style={{ color: "var(--slate)", fontSize: 12 }}>—</span>
                        ) : completeness.missingItems.length === 0 ? (
                          <span className="badge badge-ok">{completeness.passedChecks}/{completeness.totalChecks}</span>
                        ) : (
                          <span className="badge badge-partial">{completeness.passedChecks}/{completeness.totalChecks}</span>
                        )}
                      </td>
                      <td>
                        <Link href={`/${params.school}/${params.grade}/${params.subject}/${unit.id}`} style={{ color: "var(--teal)", fontSize: 12, textDecoration: "underline" }}>
                          Open →
                        </Link>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          )}
        </div>
      </div>
    </div>
  );
}
