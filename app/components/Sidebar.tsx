"use client";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { useState, useEffect } from "react";
import { SCHOOLS, GRADES, slugify } from "../lib/data";

interface NavTree {
  gradesBySchool: Record<string, string[]>;
  subjectsByKey: Record<string, string[]>;
  unitsByKey: Record<string, { id: string; name: string }[]>;
}

export default function Sidebar({ navTree }: { navTree: NavTree }) {
  const pathname = usePathname();
  const parts = pathname.split("/").filter(Boolean);
  const activeSchoolSlug = parts[0];
  const activeGrade = parts[1] ? decodeURIComponent(parts[1]) : null;
  const activeSubjectSlug = parts[2];
  const activeUnitId = parts[3] || null;

  const [openSchool, setOpenSchool] = useState<string | null>(
    SCHOOLS.find((s) => slugify(s) === activeSchoolSlug) || null
  );
  useEffect(() => {
    const s = SCHOOLS.find((s) => slugify(s) === activeSchoolSlug);
    if (s) setOpenSchool(s);
  }, [activeSchoolSlug]);

  return (
    <aside
      style={{
        width: "var(--sidebar-width)",
        flexShrink: 0,
        background: "var(--ink)",
        color: "var(--paper)",
        minHeight: "100vh",
        padding: "24px 0",
        position: "sticky",
        top: 0,
        alignSelf: "flex-start",
        overflowY: "auto",
        maxHeight: "100vh",
      }}
    >
      <div style={{ padding: "0 20px 20px", borderBottom: "1px solid rgba(255,255,255,0.15)", marginBottom: 12 }}>
        <Link href="/" style={{ display: "flex", alignItems: "center", gap: 10 }}>
          <span
            style={{
              display: "inline-flex", alignItems: "center", justifyContent: "center",
              width: 30, height: 30, border: "1.5px solid var(--gold)", borderRadius: "50%",
              color: "var(--gold)", fontFamily: "'Source Serif 4',serif", fontWeight: 700, fontSize: 12,
            }}
          >
            GVC
          </span>
          <div>
            <div style={{ fontFamily: "'Source Serif 4',serif", fontSize: 14.5, fontWeight: 600 }}>
              Curriculum Review
            </div>
            <div style={{ fontSize: 10, color: "#B8C2D0", letterSpacing: 0.3 }}>Guaranteed &amp; Viable</div>
          </div>
        </Link>
      </div>

      <NavLink href="/" active={pathname === "/"} label="Dashboard" />

      <div style={{ padding: "14px 20px 6px", fontSize: 10, textTransform: "uppercase", letterSpacing: 0.6, color: "#8494A8" }}>
        Schools
      </div>

      {SCHOOLS.map((school) => {
        const slug = slugify(school);
        const isOpen = openSchool === school;
        const grades = navTree.gradesBySchool[school] || [];
        const hasAnyData = grades.length > 0;
        return (
          <div key={school}>
            <button
              onClick={() => setOpenSchool(isOpen ? null : school)}
              style={{
                width: "100%", textAlign: "left", background: isOpen ? "rgba(255,255,255,0.06)" : "transparent",
                border: "none", color: hasAnyData ? "var(--paper)" : "#7C879A",
                padding: "9px 20px", fontSize: 13, fontWeight: 600, cursor: "pointer",
                display: "flex", justifyContent: "space-between", alignItems: "center",
              }}
            >
              <span>{school}</span>
              <span style={{ fontSize: 10, opacity: 0.6 }}>{isOpen ? "▾" : "▸"}</span>
            </button>
            {isOpen && (
              <div style={{ paddingBottom: 6 }}>
                {!hasAnyData && (
                  <div style={{ padding: "6px 20px 10px 30px", fontSize: 11.5, color: "#7C879A", fontStyle: "italic" }}>
                    No documents synced yet
                  </div>
                )}
                {GRADES.filter((g) => grades.includes(g)).map((grade) => (
                  <GradeRow
                    key={grade}
                    school={school}
                    slug={slug}
                    grade={grade}
                    activeGrade={activeGrade}
                    activeSchoolSlug={activeSchoolSlug}
                    activeSubjectSlug={activeSubjectSlug}
                    activeUnitId={activeUnitId}
                    subjects={navTree.subjectsByKey[`${school}|||${grade}`] || []}
                    unitsByKey={navTree.unitsByKey}
                  />
                ))}
              </div>
            )}
          </div>
        );
      })}

      <div style={{ padding: "14px 20px 6px", marginTop: 10, borderTop: "1px solid rgba(255,255,255,0.15)", fontSize: 10, textTransform: "uppercase", letterSpacing: 0.6, color: "#8494A8" }}>
        Guides
      </div>
      <Link
        href="/guide/learning-targets"
        style={{
          display: "block", padding: "9px 20px", fontSize: 13, fontWeight: 600,
          color: pathname === "/guide/learning-targets" ? "var(--gold)" : "#C7CEDA",
          background: pathname === "/guide/learning-targets" ? "rgba(255,255,255,0.06)" : "transparent",
        }}
      >
        Learning Target Rubric
      </Link>

      <div style={{ padding: "14px 20px 6px", marginTop: 10, borderTop: "1px solid rgba(255,255,255,0.15)", fontSize: 10, textTransform: "uppercase", letterSpacing: 0.6, color: "#8494A8" }}>
        Admin
      </div>
      <Link
        href="/admin/import"
        style={{
          display: "block", padding: "9px 20px", fontSize: 13, fontWeight: 600,
          color: pathname === "/admin/import" ? "var(--gold)" : "#C7CEDA",
          background: pathname === "/admin/import" ? "rgba(255,255,255,0.06)" : "transparent",
        }}
      >
        Import Unit Map
      </Link>
      <Link
        href="/admin/import-projection"
        style={{
          display: "block", padding: "9px 20px", fontSize: 13, fontWeight: 600,
          color: pathname === "/admin/import-projection" ? "var(--gold)" : "#C7CEDA",
          background: pathname === "/admin/import-projection" ? "rgba(255,255,255,0.06)" : "transparent",
        }}
      >
        Import Projection Map
      </Link>
      <Link
        href="/admin/import-assessment"
        style={{
          display: "block", padding: "9px 20px", fontSize: 13, fontWeight: 600,
          color: pathname === "/admin/import-assessment" ? "var(--gold)" : "#C7CEDA",
          background: pathname === "/admin/import-assessment" ? "rgba(255,255,255,0.06)" : "transparent",
        }}
      >
        Import Assessment
      </Link>
    </aside>
  );
}

function GradeRow({ school, slug, grade, activeGrade, activeSchoolSlug, activeSubjectSlug, activeUnitId, subjects, unitsByKey }: {
  school: string; slug: string; grade: string; activeGrade: string | null; activeSchoolSlug: string; activeSubjectSlug?: string; activeUnitId?: string | null; subjects: string[]; unitsByKey: Record<string, { id: string; name: string }[]>;
}) {
  const isActiveSchool = activeSchoolSlug === slug;
  const isActiveGrade = isActiveSchool && activeGrade === grade;

  return (
    <div>
      <Link
        href={`/${slug}/${grade}`}
        style={{
          display: "block", padding: "7px 20px 7px 32px", fontSize: 12.5,
          color: isActiveGrade ? "var(--gold)" : "#C7CEDA",
          fontWeight: isActiveGrade ? 700 : 500,
          background: isActiveGrade && !activeSubjectSlug ? "rgba(255,255,255,0.06)" : "transparent",
        }}
      >
        Grade {grade}
      </Link>
      {isActiveGrade &&
        subjects.map((subject) => {
          const subSlug = slugify(subject);
          const isActiveSubject = activeSubjectSlug === subSlug;
          const units = unitsByKey[`${school}|||${grade}|||${subject}`] || [];
          return (
            <div key={subject}>
              <Link
                href={`/${slug}/${grade}/${subSlug}`}
                style={{
                  display: "block", padding: "6px 20px 6px 44px", fontSize: 12,
                  color: isActiveSubject ? "var(--paper)" : "#9AA6B8",
                  background: isActiveSubject && !activeUnitId ? "var(--teal)" : "transparent",
                  borderRadius: isActiveSubject && !activeUnitId ? 3 : 0,
                  margin: isActiveSubject && !activeUnitId ? "0 10px" : 0,
                }}
              >
                {subject}
              </Link>
              {isActiveSubject && units.length > 0 && (
                <div style={{ paddingBottom: 4 }}>
                  {units.map((u) => {
                    const isActiveUnit = activeUnitId === u.id;
                    return (
                      <Link
                        key={u.id}
                        href={`/${slug}/${grade}/${subSlug}/${u.id}`}
                        style={{
                          display: "block", padding: "5px 20px 5px 56px", fontSize: 11.5,
                          color: isActiveUnit ? "var(--gold)" : "#7E8CA3",
                          fontWeight: isActiveUnit ? 600 : 400,
                          background: isActiveUnit ? "rgba(255,255,255,0.06)" : "transparent",
                          overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap",
                        }}
                        title={u.name}
                      >
                        {u.name}
                      </Link>
                    );
                  })}
                </div>
              )}
            </div>
          );
        })}
    </div>
  );
}

function NavLink({ href, active, label }: { href: string; active: boolean; label: string }) {
  return (
    <Link
      href={href}
      style={{
        display: "block", padding: "9px 20px", fontSize: 13, fontWeight: 600,
        color: active ? "var(--gold)" : "var(--paper)",
        background: active ? "rgba(255,255,255,0.06)" : "transparent",
      }}
    >
      {label}
    </Link>
  );
}
