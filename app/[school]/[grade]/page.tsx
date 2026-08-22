import Link from "next/link";
import { notFound } from "next/navigation";
import Breadcrumb from "../../components/Breadcrumb";
import { schoolFromSlug, subjectsWithData, slugify, getMap } from "../../lib/data";

export const dynamic = "force-dynamic";
export const revalidate = 0;


export default async function GradePage({ params }: { params: { school: string; grade: string } }) {
  const school = schoolFromSlug(params.school);
  if (!school) return notFound();
  const grade = decodeURIComponent(params.grade);
  const subjects = await subjectsWithData(school, grade);

  return (
    <div>
      <Breadcrumb items={[
        { label: "Dashboard", href: "/" },
        { label: school, href: `/${params.school}` },
        { label: `Grade ${grade}` },
      ]} />
      <h1 style={{ fontSize: 22, marginBottom: 20 }}>{school} &middot; Grade {grade}</h1>

      {subjects.length === 0 ? (
        <div className="empty">No subjects synced for this grade yet.</div>
      ) : (
        <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(200px, 1fr))", gap: 12 }}>
          {await Promise.all(subjects.map(async (subject) => {
            const map = await getMap(school, grade, subject);
            const unitCount = map?.units.length || 0;
            const umCount = map ? Object.keys(map.unitMaps).length : 0;
            return (
              <Link key={subject} href={`/${params.school}/${params.grade}/${slugify(subject)}`} className="panel" style={{ display: "block", padding: "16px", marginBottom: 0 }}>
                <div style={{ fontFamily: "'Source Serif 4',serif", fontSize: 17, fontWeight: 700 }}>{subject}</div>
                <div style={{ fontSize: 11.5, color: "var(--slate)", marginTop: 6 }}>
                  {unitCount} unit{unitCount !== 1 ? "s" : ""} on projection map &middot; {umCount} unit map{umCount !== 1 ? "s" : ""} on file
                </div>
              </Link>
            );
          }))}
        </div>
      )}
    </div>
  );
}
