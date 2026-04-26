import Link from "next/link";

export default function BlogPostNotFound() {
  return (
    <div className="mw-container" style={{ textAlign: "center", padding: "3rem 0" }}>
      <h1 className="mw-h1" style={{ fontSize: "1.5rem" }}>
        Материал не найден
      </h1>
      <p style={{ color: "var(--mw-muted)" }}>Возможно, ссылка устарела или публикация снята.</p>
      <p style={{ marginTop: "1.5rem" }}>
        <Link href="/blog" className="mw-btn mw-btn--primary">
          К списку блога
        </Link>
      </p>
    </div>
  );
}
