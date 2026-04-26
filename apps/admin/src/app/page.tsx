"use client";

import { useEffect } from "react";

export default function AdminHome() {
  useEffect(() => {
    const token = window.localStorage.getItem("admin_token");
    window.location.href = token ? "/organizers" : "/login";
  }, []); // default redirect to organizers; programs at /programs
  return <p className="mw-admin-prose" style={{ padding: 24, margin: 0 }}>Перенаправляем…</p>;
}
