import "./globals.css";
import Sidebar from "./components/Sidebar";
import { getNavTree } from "./lib/data";

export const dynamic = "force-dynamic";
export const revalidate = 0;
export const fetchCache = "force-no-store";

export const metadata = {
  title: "GVC Curriculum Review",
  description: "Guaranteed & Viable Curriculum review dashboard",
};

export default async function RootLayout({ children }: { children: React.ReactNode }) {
  let navTree = { gradesBySchool: {}, subjectsByKey: {}, unitsByKey: {} };
  try {
    navTree = await getNavTree();
  } catch {
    // Database not initialized yet - sidebar will show "no documents synced" for every school
  }

  return (
    <html lang="en">
      <body>
        <div style={{ display: "flex", minHeight: "100vh" }}>
          <Sidebar navTree={navTree} />
          <main style={{ flex: 1, minWidth: 0, padding: "28px 32px 60px", maxWidth: 1200 }}>
            {children}
          </main>
        </div>
      </body>
    </html>
  );
}
