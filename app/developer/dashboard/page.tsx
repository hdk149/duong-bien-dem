import { Suspense } from "react";
import DeveloperDashboardClient from "./DashboardClient";

export default function DeveloperDashboardPage() {
  return (
    <Suspense
      fallback={
        <main className="min-h-screen flex items-center justify-center">
          <div className="text-sm opacity-70">
            Loading developer dashboard…
          </div>
        </main>
      }
    >
      <DeveloperDashboardClient />
    </Suspense>
  );
}
