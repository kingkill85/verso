import { useState, useRef, useEffect } from "react";
import { Link, useLocation, useNavigate } from "@tanstack/react-router";
import { useTranslation } from "react-i18next";
import { useAuth } from "@/hooks/use-auth";
import { trpc } from "@/trpc";
import {
  HomeIcon,
  BookOpenIcon,
  PenIcon,
  MoreHorizontalIcon,
  BarChartIcon,
  UploadIcon,
  DownloadIcon,
  UsersIcon,
  ScrollTextIcon,
  renderShelfIcon,
  translateShelfName,
} from "@/components/icons";
import { BookmarkPlus, User, LogOut } from "lucide-react";

export function BottomTabBar() {
  const { t } = useTranslation();
  const { user, logout } = useAuth();
  const navigate = useNavigate();
  const location = useLocation();
  const isActive = (path: string) => location.pathname.startsWith(path);
  const [moreOpen, setMoreOpen] = useState(false);
  const menuRef = useRef<HTMLDivElement>(null);

  const shelvesQuery = trpc.shelves.list.useQuery();
  const allShelves = shelvesQuery.data ?? [];
  const defaultShelves = allShelves.filter((s) => s.isDefault === true);
  const userShelves = allShelves.filter((s) => !s.isDefault);

  const isAdmin = user?.role === "admin";

  // Close menu on outside click
  useEffect(() => {
    if (!moreOpen) return;
    const handler = (e: MouseEvent) => {
      if (menuRef.current && !menuRef.current.contains(e.target as Node)) {
        setMoreOpen(false);
      }
    };
    document.addEventListener("mousedown", handler);
    return () => document.removeEventListener("mousedown", handler);
  }, [moreOpen]);

  // Close menu on navigation
  useEffect(() => {
    setMoreOpen(false);
  }, [location.pathname]);

  const moreActive = isActive("/stats") || isActive("/account") || isActive("/shelves") || isActive("/upload") || isActive("/import") || isActive("/admin");

  const tabs = [
    { to: "/home", label: t("nav.home"), icon: <HomeIcon size={20} />, active: isActive("/home") },
    { to: "/library", label: t("nav.library"), icon: <BookOpenIcon size={20} />, active: isActive("/library") },
    { to: "/authors", label: t("nav.authors"), icon: <PenIcon size={20} />, active: isActive("/authors") },
  ];

  return (
    <>
      {/* Backdrop */}
      {moreOpen && (
        <div className="fixed inset-0 bg-black/40 z-40 lg:hidden" onClick={() => setMoreOpen(false)} />
      )}

      <nav
        className="fixed bottom-0 left-0 right-0 z-50 border-t flex items-center justify-around lg:hidden"
        style={{
          backgroundColor: "var(--surface)",
          borderColor: "var(--border)",
          paddingBottom: "env(safe-area-inset-bottom, 0px)",
        }}
      >
        {tabs.map((tab) => (
          <Link
            key={tab.to}
            to={tab.to}
            className="flex flex-col items-center gap-0.5 py-2 px-3 min-w-0 flex-1 transition-colors"
            style={{ color: tab.active ? "var(--warm)" : "var(--text-faint)" }}
          >
            {tab.icon}
            <span className="text-[10px] font-medium truncate">{tab.label}</span>
          </Link>
        ))}

        {/* More tab */}
        <div className="relative flex-1" ref={menuRef}>
          <button
            onClick={() => setMoreOpen((v) => !v)}
            className="flex flex-col items-center gap-0.5 py-2 px-3 w-full transition-colors"
            style={{ color: moreActive || moreOpen ? "var(--warm)" : "var(--text-faint)" }}
          >
            <MoreHorizontalIcon size={20} />
            <span className="text-[10px] font-medium">{t("nav.more")}</span>
          </button>

          {/* More menu — bottom sheet style */}
          {moreOpen && (
            <div
              className="absolute bottom-full right-0 mb-2 w-64 rounded-xl border shadow-lg overflow-hidden max-h-[70vh] overflow-y-auto"
              style={{ backgroundColor: "var(--surface)", borderColor: "var(--border)" }}
            >
              {/* Shelves */}
              <div className="px-4 pt-3 pb-1">
                <span className="text-[10px] font-medium uppercase tracking-[1.5px]" style={{ color: "var(--text-faint)" }}>
                  {t("nav.shelves")}
                </span>
              </div>
              {defaultShelves.map((shelf) => (
                <MoreMenuItem
                  key={shelf.id}
                  to="/shelves/$id"
                  params={{ id: shelf.id }}
                  icon={renderShelfIcon(shelf.emoji, shelf.name, 16)}
                  label={translateShelfName(shelf.name, t)}
                  count={shelf.bookCount}
                  active={isActive(`/shelves/${shelf.id}`)}
                />
              ))}
              {userShelves.map((shelf) => (
                <MoreMenuItem
                  key={shelf.id}
                  to="/shelves/$id"
                  params={{ id: shelf.id }}
                  icon={renderShelfIcon(shelf.emoji, shelf.name, 16)}
                  label={shelf.name}
                  count={shelf.bookCount}
                  active={isActive(`/shelves/${shelf.id}`)}
                />
              ))}

              <div className="h-px mx-3 my-1" style={{ backgroundColor: "var(--border)" }} />

              {/* General */}
              <MoreMenuItem to="/stats" icon={<BarChartIcon size={16} />} label={t("nav.stats")} active={isActive("/stats")} />
              <MoreMenuItem to="/account" icon={<User size={16} />} label={t("nav.account")} active={isActive("/account")} />

              {/* Admin */}
              {isAdmin && (
                <>
                  <div className="h-px mx-3 my-1" style={{ backgroundColor: "var(--border)" }} />
                  <div className="px-4 pt-2 pb-1">
                    <span className="text-[10px] font-medium uppercase tracking-[1.5px]" style={{ color: "var(--text-faint)" }}>
                      {t("nav.admin")}
                    </span>
                  </div>
                  <MoreMenuItem to="/upload" icon={<UploadIcon size={16} />} label={t("nav.upload")} active={isActive("/upload")} />
                  <MoreMenuItem to="/import" icon={<DownloadIcon size={16} />} label={t("nav.import")} active={isActive("/import")} />
                  <MoreMenuItem to="/admin/users" icon={<UsersIcon size={16} />} label={t("nav.users")} active={isActive("/admin/users")} />
                  <MoreMenuItem to="/admin/logs" icon={<ScrollTextIcon size={16} />} label={t("nav.logs", "Activity Log")} active={isActive("/admin/logs")} />
                </>
              )}

              <div className="h-px mx-3 my-1" style={{ backgroundColor: "var(--border)" }} />

              {/* Logout */}
              <button
                onClick={() => {
                  logout();
                  navigate({ to: "/login" });
                }}
                className="w-full flex items-center gap-3 px-4 py-2.5 text-sm transition-colors"
                style={{ color: "var(--text-faint)" }}
              >
                <LogOut size={16} />
                <span>{t("nav.logout")}</span>
              </button>

              <div className="h-1" />
            </div>
          )}
        </div>
      </nav>
    </>
  );
}

function MoreMenuItem({ to, params, icon, label, count, active }: {
  to: string;
  params?: Record<string, string>;
  icon: React.ReactNode;
  label: string;
  count?: number;
  active?: boolean;
}) {
  return (
    <Link
      to={to}
      params={params}
      className="flex items-center gap-3 px-4 py-2.5 text-sm transition-colors"
      style={{ color: active ? "var(--warm)" : "var(--text)" }}
    >
      <span className="w-4 flex items-center justify-center" style={{ color: active ? "var(--warm)" : "var(--text-dim)" }}>
        {icon}
      </span>
      <span className="flex-1 truncate">{label}</span>
      {count !== undefined && count > 0 && (
        <span className="text-[11px]" style={{ color: "var(--text-faint)" }}>{count}</span>
      )}
    </Link>
  );
}
