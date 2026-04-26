"use client";

import { useState } from "react";
import { AdminSidebar } from "./AdminSidebar";
import { AdminTopbar } from "./AdminTopbar";
import { PilotModeBanner } from "./PilotModeBanner";

export function AdminShell({ children }: { children: React.ReactNode }) {
  const [mobileOpen, setMobileOpen] = useState(false);
  return (
    <div className="mw-admin-layout" style={{ minHeight: "100vh" }}>
      <AdminSidebar mobileOpen={mobileOpen} onCloseMobile={() => setMobileOpen(false)} />
      <div className="mw-admin-workspace mw-admin-workspace--shelled">
        <AdminTopbar onOpenSidebar={() => setMobileOpen(true)} searchDisabled />
        <PilotModeBanner />
        {children}
      </div>
    </div>
  );
}
