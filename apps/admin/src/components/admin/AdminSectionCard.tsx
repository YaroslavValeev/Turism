export function AdminSectionCard({
  title,
  id,
  children,
  className = "",
  style = {},
  padding = "clamp(18px,2vw,24px) clamp(18px,2.5vw,28px) clamp(20px,2.5vw,28px)",
}: {
  title?: string;
  id?: string;
  children: React.ReactNode;
  className?: string;
  style?: React.CSSProperties;
  padding?: string;
}) {
  return (
    <section
      id={id}
      className={`mw-admin-card ${className}`.trim()}
      style={{
        padding,
        marginBottom: 20,
        ...style,
      }}
    >
      {title && (
        <h2 style={{ margin: "0 0 16px 0" }}>
          {title}
        </h2>
      )}
      {children}
    </section>
  );
}
