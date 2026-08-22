import Link from "next/link";

export default function Breadcrumb({ items }: { items: { label: string; href?: string }[] }) {
  return (
    <div style={{ fontSize: 12, color: "var(--slate)", marginBottom: 14, display: "flex", gap: 6, alignItems: "center", flexWrap: "wrap" }}>
      {items.map((item, i) => (
        <span key={i} style={{ display: "flex", alignItems: "center", gap: 6 }}>
          {item.href ? (
            <Link href={item.href} style={{ color: "var(--teal)" }}>{item.label}</Link>
          ) : (
            <span style={{ color: "var(--ink)", fontWeight: 600 }}>{item.label}</span>
          )}
          {i < items.length - 1 && <span style={{ color: "var(--line)" }}>/</span>}
        </span>
      ))}
    </div>
  );
}
