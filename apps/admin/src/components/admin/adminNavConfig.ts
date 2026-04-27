export type AdminNavIcon =
  | "users"
  | "calendar"
  | "inbox"
  | "star"
  | "alert"
  | "coin"
  | "card"
  | "revert"
  | "file"
  | "link"
  | "database"
  | "spark"
  | "eye"
  | "book"
  | "folder"
  | "job"
  | "chart"
  | "stack";

export type AdminNavItem = {
  href: string;
  label: string;
  icon: AdminNavIcon;
};

export type AdminNavGroup = {
  id: string;
  label: string;
  items: AdminNavItem[];
};

export const ADMIN_NAV_GROUPS: AdminNavGroup[] = [
  {
    id: "ops",
    label: "Операционка",
    items: [
      { href: "/organizers", label: "Организаторы", icon: "users" },
      { href: "/programs", label: "Программы", icon: "calendar" },
      { href: "/bookings", label: "Заявки", icon: "inbox" },
      { href: "/organizer-outreach", label: "Outreach писем", icon: "file" },
      { href: "/reviews", label: "Отзывы", icon: "star" },
      { href: "/incidents", label: "Инциденты", icon: "alert" },
    ],
  },
  {
    id: "finance",
    label: "Финансы",
    items: [
      { href: "/commissions", label: "Комиссии", icon: "coin" },
      { href: "/payments", label: "Платежи", icon: "card" },
      { href: "/refunds", label: "Возвраты", icon: "revert" },
      { href: "/statements", label: "Отчёты", icon: "file" },
    ],
  },
  {
    id: "content",
    label: "Контент и загрузка",
    items: [
      { href: "/sources", label: "Источники", icon: "link" },
      { href: "/raw-items", label: "Сырые данные", icon: "database" },
      { href: "/event-candidates", label: "Кандидаты", icon: "spark" },
      { href: "/content-review", label: "Проверка владельцем", icon: "eye" },
      { href: "/content-pipeline", label: "Контент-конвейер", icon: "stack" },
      { href: "/publications", label: "Публикации", icon: "book" },
      { href: "/blog-posts", label: "Статьи", icon: "file" },
      { href: "/collections", label: "Подборки", icon: "folder" },
      { href: "/jobs", label: "Задачи", icon: "job" },
    ],
  },
  {
    id: "analytics",
    label: "Аналитика",
    items: [
      { href: "/pilot-kpi", label: "Пилот KPI (shadow)", icon: "coin" },
      { href: "/analytics/founder", label: "Founder (сводка)", icon: "chart" },
      { href: "/analytics/dq", label: "DQ", icon: "stack" },
      { href: "/analytics/billing", label: "Биллинг", icon: "card" },
      { href: "/analytics/content-entries", label: "Источники заявок", icon: "link" },
      { href: "/analytics/score-actions", label: "Действия по оценкам", icon: "stack" },
    ],
  },
];
