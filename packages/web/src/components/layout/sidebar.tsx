import { Link, useLocation } from "@tanstack/react-router";
import { useAuth } from "@/hooks/use-auth";

export function Sidebar({ onClose }: { onClose?: () => void }) {
  const { user } = useAuth();
  const location = useLocation();
  const isActive = (path: string) => location.pathname === path;

  return (
    <aside className="h-screen flex flex-col overflow-y-auto" style={{ backgroundColor: "var(--sidebar-bg)" }}>
      <div className="p-6 pb-4">
        <h1 className="font-display text-xl font-bold" style={{ color: "var(--warm)" }}>Verso</h1>
      </div>

      <nav className="flex-1 px-3">
        <div className="px-3 mb-2 text-[10px] font-medium uppercase tracking-[1.5px]" style={{ color: "var(--text-faint)" }}>
          Library
        </div>
        <SidebarItem to="/" label="All Books" emoji="📚" active={isActive("/")} onClick={onClose} />
      </nav>

      <div className="p-4 border-t" style={{ borderColor: "var(--border)" }}>
        <div className="flex items-center gap-3 px-2">
          <div className="w-8 h-8 rounded-full flex items-center justify-center text-sm font-medium"
            style={{ backgroundColor: "var(--card)", color: "var(--text-dim)" }}>
            {user?.displayName?.[0]?.toUpperCase() || "?"}
          </div>
          <span className="text-sm truncate" style={{ color: "var(--text-dim)" }}>
            {user?.displayName}
          </span>
        </div>
      </div>
    </aside>
  );
}

function SidebarItem({ to, label, emoji, active, count, onClick }: {
  to: string; label: string; emoji: string; active: boolean; count?: number; onClick?: () => void;
}) {
  return (
    <Link to={to} onClick={onClick}
      className="flex items-center gap-3 rounded-lg transition-colors"
      style={{
        padding: "10px 22px", fontSize: "13.5px",
        color: active ? "var(--warm)" : "var(--text-dim)",
        backgroundColor: active ? "var(--warm-glow)" : "transparent",
        fontWeight: active ? 500 : 400,
      }}>
      <span className="w-[22px] text-base">{emoji}</span>
      <span className="flex-1">{label}</span>
      {count !== undefined && <span className="text-[11px] opacity-60">{count}</span>}
    </Link>
  );
}
