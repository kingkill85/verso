import { useState } from "react";
import { Sidebar } from "./sidebar";
import { TopBar } from "./top-bar";

export function AppShell({ children }: { children: React.ReactNode }) {
  const [sidebarOpen, setSidebarOpen] = useState(false);

  return (
    <div className="flex flex-col h-screen overflow-hidden" style={{ backgroundColor: "var(--bg)" }}>
      <TopBar
        sidebarOpen={sidebarOpen}
        onMenuClick={() => setSidebarOpen(!sidebarOpen)}
      />

      <div className="flex flex-1 min-h-0 relative">
        {/* Desktop: inline push — no onClose so links don't collapse sidebar */}
        <div
          className="hidden lg:block shrink-0 overflow-hidden border-r transition-[width] duration-200"
          style={{
            width: sidebarOpen ? "16rem" : "0",
            borderColor: sidebarOpen ? "var(--border)" : "transparent",
            backgroundColor: "var(--sidebar-bg)",
          }}
        >
          <div className="w-64 h-full">
            <Sidebar />
          </div>
        </div>

        {/* Mobile: overlay */}
        {sidebarOpen && (
          <>
            <div
              className="fixed inset-0 top-14 bg-black/50 z-40 lg:hidden"
              onClick={() => setSidebarOpen(false)}
            />
            <div
              className="fixed top-14 left-0 bottom-0 w-64 z-50 lg:hidden"
              style={{ backgroundColor: "var(--sidebar-bg)" }}
            >
              <Sidebar onClose={() => setSidebarOpen(false)} />
            </div>
          </>
        )}

        <main className="flex-1 overflow-auto p-6">{children}</main>
      </div>
    </div>
  );
}
