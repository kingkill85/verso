import { Link, useLocation } from "@tanstack/react-router";
import { useAuth } from "@/hooks/use-auth";
import { trpc } from "@/trpc";
import { getAccessToken } from "@/lib/auth";

export function Sidebar({ onClose }: { onClose?: () => void }) {
  const { user } = useAuth();
  const location = useLocation();
  const isActive = (path: string) => location.pathname === path;
  const shelvesQuery = trpc.shelves.list.useQuery();

  const allShelves = shelvesQuery.data ?? [];
  const defaultShelves = allShelves.filter((s) => s.isDefault === true);
  const userShelves = allShelves.filter((s) => !s.isDefault);

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
        {defaultShelves.map((shelf) => (
          <SidebarItem
            key={shelf.id}
            to="/shelves/$id"
            params={{ id: shelf.id }}
            label={shelf.name}
            emoji={shelf.emoji ?? "📁"}
            active={isActive(`/shelves/${shelf.id}`)}
            count={shelf.bookCount}
            badge={shelf.isSmart ? "smart" : undefined}
            onClick={onClose}
          />
        ))}

        <div className="px-3 mb-2 mt-6 flex items-center justify-between">
          <span className="text-[10px] font-medium uppercase tracking-[1.5px]" style={{ color: "var(--text-faint)" }}>
            Shelves
          </span>
          <Link to="/shelves/new"
            className="w-5 h-5 flex items-center justify-center rounded text-xs transition-colors hover:opacity-80"
            style={{ color: "var(--text-faint)" }}>
            +
          </Link>
        </div>
        {userShelves.map((shelf) => (
          <SidebarItem
            key={shelf.id}
            to="/shelves/$id"
            params={{ id: shelf.id }}
            label={shelf.name}
            emoji={shelf.emoji ?? "📁"}
            active={isActive(`/shelves/${shelf.id}`)}
            count={shelf.bookCount}
            badge={shelf.isSmart ? "smart" : undefined}
            onClick={onClose}
          />
        ))}

        <div className="px-3 mb-2 mt-6 text-[10px] font-medium uppercase tracking-[1.5px]" style={{ color: "var(--text-faint)" }}>
          Actions
        </div>
        <SidebarItem to="/stats" label="Stats" emoji="📊" active={isActive("/stats")} onClick={onClose} />
        <SidebarItem to="/upload" label="Upload" emoji="📤" active={isActive("/upload")} onClick={onClose} />
        <SidebarItem to="/import" label="Import" emoji="📥" active={isActive("/import")} onClick={onClose} />
      </nav>

      <div className="p-4 border-t" style={{ borderColor: "var(--border)" }}>
        {/* Export button */}
        <button
          onClick={async () => {
            const token = getAccessToken();
            if (!token) return;
            try {
              const res = await fetch("/api/export/library", {
                headers: { Authorization: `Bearer ${token}` },
              });
              if (!res.ok) throw new Error("Export failed");
              const blob = await res.blob();
              const url = URL.createObjectURL(blob);
              const a = document.createElement("a");
              const date = new Date().toISOString().slice(0, 10);
              a.href = url;
              a.download = `verso-backup-${date}.zip`;
              a.click();
              URL.revokeObjectURL(url);
            } catch (err) {
              console.error("Export failed:", err);
            }
          }}
          className="w-full flex items-center gap-3 rounded-lg mb-3 transition-colors hover:opacity-80"
          style={{
            padding: "10px 22px",
            fontSize: "13.5px",
            color: "var(--text-dim)",
          }}
        >
          <span className="w-[22px] text-base">💾</span>
          <span className="flex-1 text-left">Export Library</span>
        </button>
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

function SidebarItem({ to, params, label, emoji, active, count, badge, onClick }: {
  to: string; params?: Record<string, string>; label: string; emoji: string; active: boolean; count?: number; badge?: string; onClick?: () => void;
}) {
  return (
    <Link to={to} params={params} onClick={onClick}
      className="flex items-center gap-3 rounded-lg transition-colors"
      style={{
        padding: "10px 22px", fontSize: "13.5px",
        color: active ? "var(--warm)" : "var(--text-dim)",
        backgroundColor: active ? "var(--warm-glow)" : "transparent",
        fontWeight: active ? 500 : 400,
      }}>
      <span className="w-[22px] text-base">{emoji}</span>
      <span className="flex-1">{label}</span>
      {badge ? (
        <span className="text-[11px] italic opacity-60">{badge}</span>
      ) : count !== undefined ? (
        <span className="text-[11px] opacity-60">{count}</span>
      ) : null}
    </Link>
  );
}
