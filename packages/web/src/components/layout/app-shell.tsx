import { useState, useCallback } from "react";
import { Sidebar } from "./sidebar";
import { TopBar } from "./top-bar";
import { BottomTabBar } from "./bottom-tab-bar";

const SIDEBAR_KEY = "verso-sidebar-open";

function getInitialSidebarState(): boolean {
  try {
    const stored = localStorage.getItem(SIDEBAR_KEY);
    if (stored !== null) return stored === "true";
  } catch {}
  // Default open on desktop-width screens
  return window.matchMedia("(min-width: 1024px)").matches;
}

export function AppShell({ children }: { children: React.ReactNode }) {
  const [sidebarOpen, setSidebarOpen] = useState(getInitialSidebarState);

  const toggleSidebar = useCallback(() => {
    setSidebarOpen((prev) => {
      const next = !prev;
      try { localStorage.setItem(SIDEBAR_KEY, String(next)); } catch {}
      return next;
    });
  }, []);

  return (
    <div className="flex flex-col h-screen overflow-hidden" style={{ backgroundColor: "var(--bg)" }}>
      <TopBar
        sidebarOpen={sidebarOpen}
        onMenuClick={toggleSidebar}
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

        <main className="flex-1 overflow-auto p-4 pb-16 lg:p-6 lg:pb-6">{children}</main>
      </div>

      {/* Mobile: bottom tab bar */}
      <BottomTabBar />
    </div>
  );
}
