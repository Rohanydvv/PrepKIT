"use client";

import { AuthGuard } from "@/components/AuthGuard";
import { DashboardView } from "@/components/DashboardView";

export default function DashboardPage() {
  return (
    <AuthGuard>
      <DashboardView />
    </AuthGuard>
  );
}
