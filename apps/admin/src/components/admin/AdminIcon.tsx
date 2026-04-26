import type { AdminNavIcon } from "./adminNavConfig";

const S = 18;

const svgProps = {
  viewBox: "0 0 24 24",
  width: S,
  height: S,
  "aria-hidden": true as const,
  fill: "none" as const,
  stroke: "currentColor",
  strokeWidth: 1.7,
  strokeLinecap: "round" as const,
  strokeLinejoin: "round" as const,
};

export function AdminIcon({ name }: { name: AdminNavIcon }) {
  return (
    <span
      className="mw-admin-nav-icon"
      style={{ display: "inline-flex", width: S, height: S, flexShrink: 0, color: "inherit" }}
    >
      {name === "users" && (
        <svg {...svgProps}>
          <path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2" />
          <circle cx="12" cy="7" r="4" />
        </svg>
      )}
      {name === "calendar" && (
        <svg {...svgProps}>
          <rect x="3" y="4" width="18" height="18" rx="2" />
          <path d="M16 2v4M8 2v4M3 10h18" />
        </svg>
      )}
      {name === "inbox" && (
        <svg {...svgProps}>
          <path d="M22 12H2l4-7h12l4 7Z" transform="scale(0.9) translate(1.2,1)" />
          <path d="M2 9v8a2 2 0 0 0 2 2h16a2 2 0 0 0 2-2V9" transform="scale(0.9) translate(1.2,0)" />
        </svg>
      )}
      {name === "star" && (
        <svg {...svgProps}>
          <path d="M12 2l2.1 4.2 4.6.5-3.4 3.1.8 4.4L12 12.1 7.9 14.2l.8-4.4L5.3 6.7l4.6-.5L12 2z" />
        </svg>
      )}
      {name === "alert" && (
        <svg {...svgProps}>
          <path d="M10.2 2.5h3.5L22 20H2L10.2 2.5Z" transform="scale(0.9) translate(0.1,0)" />
          <path d="M12 9v4" />
        </svg>
      )}
      {name === "coin" && (
        <svg {...svgProps}>
          <circle cx="12" cy="12" r="8" />
          <path d="M12 8v8M9.5 9.5h5" />
        </svg>
      )}
      {name === "card" && (
        <svg {...svgProps}>
          <rect x="2" y="5" width="20" height="14" rx="2" />
          <path d="M2 10h20" />
        </svg>
      )}
      {name === "revert" && (
        <svg {...svgProps}>
          <path d="M3 12a9 9 0 0 1 15-6" />
          <path d="M3 5v4h4" />
        </svg>
      )}
      {name === "file" && (
        <svg {...svgProps}>
          <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8l-6-6z" />
          <path d="M14 2v6h6" />
        </svg>
      )}
      {name === "link" && (
        <svg {...svgProps}>
          <path d="M10 13a5 5 0 0 1 0-7L11 5a5 5 0 0 1 5 0" transform="scale(0.85) translate(2,2.5)" />
          <path d="M14 11a5 5 0 0 1 0 7l-1 1" transform="scale(0.85) translate(2,2.5)" />
        </svg>
      )}
      {name === "database" && (
        <svg {...svgProps}>
          <ellipse cx="12" cy="5" rx="8" ry="3" />
          <path d="M4 5v5c0 1.1 2.2 2 8 2s8-.9 8-2V5" />
          <path d="M4 10v6c0 1.1 2.2 2 8 2s8-.9 8-2v-4" />
        </svg>
      )}
      {name === "spark" && (
        <svg {...svgProps}>
          <path d="M12 3v2M12 19v2M3 12h2M19 12h2M5.5 5.5l1.3 1.3M18.2 5.5l-1.2 1.2M5.5 18.3l1.2-1.2M18.2 18.2l-1-1" />
        </svg>
      )}
      {name === "eye" && (
        <svg {...svgProps}>
          <path d="M1 12s4-6 11-6 11 6 11 6-4 6-11 6-11-6-11-6z" />
          <circle cx="12" cy="12" r="3" />
        </svg>
      )}
      {name === "book" && (
        <svg {...svgProps}>
          <path d="M4 4.2A1.6 1.6 0 0 1 5.5 2.5h9A1.6 1.6 0 0 1 16.2 4.2V22L10.3 20 4.3 22V4.2z" transform="scale(0.9) translate(0.2,0)" />
        </svg>
      )}
      {name === "folder" && (
        <svg {...svgProps}>
          <path d="M3 7a2 2 0 0 1 2-2h5.2L12.5 7H20a1 1 0 0 1 1 1v9a1 1 0 0 1-1 1H3a1 1 0 0 1-1-1V7z" transform="scale(0.92) translate(0,1)" />
        </svg>
      )}
      {name === "job" && (
        <svg {...svgProps}>
          <rect x="4" y="3" width="16" height="18" rx="2" />
          <path d="M8 1v4M16 1v4M2 8h20" transform="scale(0.9) translate(0.1,0)" />
        </svg>
      )}
      {name === "chart" && (
        <svg {...svgProps}>
          <path d="M3 3v18h18" />
          <path d="M7 16V9M12 20V4M17 12v4" />
        </svg>
      )}
      {name === "stack" && (
        <svg {...svgProps}>
          <rect x="3" y="3" width="18" height="5" rx="1" />
          <rect x="3" y="9.5" width="18" height="5" rx="1" />
          <rect x="3" y="16" width="18" height="5" rx="1" />
        </svg>
      )}
    </span>
  );
}
