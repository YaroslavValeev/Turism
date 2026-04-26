"use client";

import { usePathname } from "next/navigation";
import { AdminShell } from "./AdminShell";

export function AdminChrome({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();
  if (pathname === "/login" || pathname === "/") {
    return <>{children}</>;
  }
  return <AdminShell>{children}</AdminShell>;
}
