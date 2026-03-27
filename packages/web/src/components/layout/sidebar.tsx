import { Link, useLocation, useNavigate } from "@tanstack/react-router";
import { useTranslation } from "react-i18next";
import { useAuth } from "@/hooks/use-auth";
import { trpc } from "@/trpc";
import { getAccessToken } from "@/lib/auth";
import type { ReactNode } from "react";
import {
  HomeIcon,
  BookOpenIcon,
  BarChartIcon,
  UploadIcon,
  DownloadIcon,
  UsersIcon,
  ArchiveIcon,
  BookmarkIcon,
  renderShelfIcon,
  translateShelfName,
} from "@/components/icons";

export function Sidebar({ onClose }: { onClose?: () => void }) {
  const { t } = useTranslation();
  const { user, logout } = useAuth();
  const navigate = useNavigate();
  const location = useLocation();
  const isActive = (path: string) => location.pathname === path;
  const shelvesQuery = trpc.shelves.list.useQuery();

  const allShelves = shelvesQuery.data ?? [];
  const defaultShelves = allShelves.filter((s) => s.isDefault === true);
  const userShelves = allShelves.filter((s) => !s.isDefault);

  return (
    <aside className="h-full flex flex-col" style={{ backgroundColor: "var(--sidebar-bg)" }}>
      <nav className="flex-1 overflow-y-auto px-3 pt-4">
        <div className="px-3 mb-2 text-[10px] font-medium uppercase tracking-[1.5px]" style={{ color: "var(--text-faint)" }}>
          {t("nav.library")}
        </div>
        <SidebarItem to="/home" label={t("nav.home")} icon={<HomeIcon />} active={isActive("/home")} onClick={onClose} />
        <SidebarItem to="/library" label={t("nav.library")} icon={<BookOpenIcon />} active={isActive("/library")} onClick={onClose} />
        {defaultShelves.map((shelf) => (
          <SidebarItem
            key={shelf.id}
            to="/shelves/$id"
            params={{ id: shelf.id }}
            label={translateShelfName(shelf.name, t)}
            icon={renderShelfIcon(shelf.emoji, shelf.name)}
            active={isActive(`/shelves/${shelf.id}`)}
            count={shelf.bookCount}
            badge={shelf.isSmart ? "smart" : undefined}
            onClick={onClose}
          />
        ))}

        <div className="px-3 mb-2 mt-6 flex items-center justify-between">
          <span className="text-[10px] font-medium uppercase tracking-[1.5px]" style={{ color: "var(--text-faint)" }}>
            {t("nav.shelves")}
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
            icon={renderShelfIcon(shelf.emoji, shelf.name)}
            active={isActive(`/shelves/${shelf.id}`)}
            count={shelf.bookCount}
            badge={shelf.isSmart ? "smart" : undefined}
            onClick={onClose}
          />
        ))}

        <SidebarItem to="/stats" label={t("nav.stats")} icon={<BarChartIcon />} active={isActive("/stats")} onClick={onClose} />

        {user?.role === "admin" && (
          <>
            <div className="px-3 mb-2 mt-6 text-[10px] font-medium uppercase tracking-[1.5px]" style={{ color: "var(--text-faint)" }}>
              {t("nav.admin")}
            </div>
            <SidebarItem to="/upload" label={t("nav.upload")} icon={<UploadIcon />} active={isActive("/upload")} onClick={onClose} />
            <SidebarItem to="/import" label={t("nav.import")} icon={<DownloadIcon />} active={isActive("/import")} onClick={onClose} />
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
              className="flex items-center gap-3 rounded-lg transition-colors w-full"
              style={{
                padding: "10px 22px",
                fontSize: "13.5px",
                color: "var(--text-dim)",
              }}
            >
              <span className="w-[22px] flex items-center justify-center"><ArchiveIcon /></span>
              <span className="flex-1 text-left">{t("nav.export")}</span>
            </button>
            <SidebarItem to="/admin/users" label={t("nav.users")} icon={<UsersIcon />} active={isActive("/admin/users")} onClick={onClose} />
          </>
        )}
      </nav>

      <div className="p-4 border-t shrink-0 mt-auto" style={{ borderColor: "var(--border)" }}>
        <div className="flex items-center gap-3 px-2">
          <Link to="/account" onClick={onClose}
            className="flex items-center gap-3 flex-1 min-w-0 transition-opacity hover:opacity-80">
            <div className="w-8 h-8 rounded-full flex items-center justify-center text-sm font-medium shrink-0"
              style={{ backgroundColor: "var(--card)", color: "var(--text-dim)" }}>
              {user?.displayName?.[0]?.toUpperCase() || "?"}
            </div>
            <span className="text-sm truncate" style={{ color: "var(--text-dim)" }}>
              {user?.displayName}
            </span>
          </Link>
          <button
            onClick={() => {
              logout();
              navigate({ to: "/login" });
            }}
            title={t("nav.logout")}
            className="shrink-0 w-8 h-8 flex items-center justify-center rounded-lg transition-colors hover:opacity-80"
            style={{ color: "var(--text-faint)" }}
          >
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4" />
              <polyline points="16 17 21 12 16 7" />
              <line x1="21" y1="12" x2="9" y2="12" />
            </svg>
          </button>
        </div>
      </div>

    </aside>
  );
}

function SidebarItem({ to, params, label, icon, active, count, badge, onClick }: {
  to: string; params?: Record<string, string>; label: string; icon: ReactNode; active: boolean; count?: number; badge?: string; onClick?: () => void;
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
      <span className="w-[22px] flex items-center justify-center">{icon}</span>
      <span className="flex-1">{label}</span>
      {badge ? (
        <span className="text-[11px] italic opacity-60">{badge}</span>
      ) : count !== undefined ? (
        <span className="text-[11px] opacity-60">{count}</span>
      ) : null}
    </Link>
  );
}
