"use client";

const LINKS = [
  { href: "/organizers", label: "Организаторы" },
  { href: "/programs", label: "Программы" },
  { href: "/bookings", label: "Заявки" },
  { href: "/incidents", label: "Инциденты" },
  { href: "/reviews", label: "Отзывы" },
  { href: "/commissions", label: "Комиссии" },
  { href: "/payments", label: "Платежи" },
  { href: "/refunds", label: "Возвраты" },
  { href: "/statements", label: "Statements" },
  { href: "/analytics/founder", label: "Analytics · Founder" },
  { href: "/analytics/dq", label: "Analytics · DQ" },
  { href: "/analytics/billing", label: "Analytics · Billing" },
  { href: "/sources", label: "Источники" },
  { href: "/raw-items", label: "Сырые данные" },
  { href: "/event-candidates", label: "Кандидаты" },
  { href: "/jobs", label: "Jobs" },
];

export function AdminNav({ current }: { current: string }) {
  return (
    <p style={{ marginBottom: 20 }}>
      {LINKS.map((link, index) => (
        <span key={link.href}>
          {index > 0 ? " | " : ""}
          {link.href === current ? <strong>{link.label}</strong> : <a href={link.href}>{link.label}</a>}
        </span>
      ))}
    </p>
  );
}
