import Link from "next/link";
import { notFound } from "next/navigation";
import Breadcrumb from "../components/Breadcrumb";
import { schoolFromSlug, gradesWithDataForSchool, subjectsWithData, GRADES } from "../lib/data";

export default async function SchoolPage({ params }: { params: { school: string } }) {
  const school = schoolFromSlug(params.school);
  if (!school) return notFound();

  const grades = await gradesWithDataForSchool(school);
  const orderedGrades = GRADES.filter((g) => grades.has(g));
  const subjectsByGrade: Record<string, string[]> = {};
  for (const g of orderedGrades) {
    subjectsByGrade[g] = await subjectsWithData(school, g);
  }

  return (
    <div>
      <Breadcrumb items={[{ label: "Dashboard", href: "/" }, { label: school }]} />
      <h1 style={{ fontSize: 22, marginBottom: 4 }}>{school}</h1>
      <div style={{ color: "var(--slate)", fontSize: 12.5, marginBottom: 20 }}>
        {orderedGrades.length === 0 ? "No documents synced yet for this school." : "Select a grade to browse its subjects."}
      </div>

      {orderedGrades.length === 0 ? (
        <div className="panel"><div className="panel-body"><div className="empty">Nothing here yet — connect this school's Drive folder in Setup, or sync existing documents.</div></div></div>
      ) : (
        <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(140px, 1fr))", gap: 12 }}>
          {orderedGrades.map((grade) => {
            const subjects = subjectsByGrade[grade];
            return (
              <Link key={grade} href={`/${params.school}/${grade}`} className="panel" style={{ display: "block", padding: "16px", marginBottom: 0 }}>
                <div style={{ fontFamily: "'Source Serif 4',serif", fontSize: 20, fontWeight: 700 }}>Grade {grade}</div>
                <div style={{ fontSize: 11.5, color: "var(--slate)", marginTop: 6 }}>{subjects.length} subject{subjects.length !== 1 ? "s" : ""}</div>
              </Link>
            );
          })}
        </div>
      )}
    </div>
  );
}
