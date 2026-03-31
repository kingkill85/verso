import { createFileRoute, useNavigate, Link } from "@tanstack/react-router";
import { useState, useEffect } from "react";
import { useTranslation } from "react-i18next";
import { trpc } from "@/trpc";
import { useAuth } from "@/hooks/use-auth";

export const Route = createFileRoute("/_app/admin/logs")({
  component: AdminLogsPage,
});

const TYPE_COLORS: Record<string, string> = {
  "sync.push": "#3b82f6",
  "sync.pull": "#6366f1",
  upload: "#22c55e",
  import: "#14b8a6",
  export: "#f59e0b",
  "metadata.apply": "#a855f7",
  "hash.save": "#78716c",
};

const LEVEL_COLORS: Record<string, string> = {
  info: "var(--text-dim)",
  warn: "#f59e0b",
  error: "#ef4444",
};

function timeAgo(dateStr: string): string {
  const now = Date.now();
  const then = new Date(dateStr).getTime();
  const seconds = Math.floor((now - then) / 1000);
  if (seconds < 60) return `${seconds}s ago`;
  const minutes = Math.floor(seconds / 60);
  if (minutes < 60) return `${minutes}m ago`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `${hours}h ago`;
  const days = Math.floor(hours / 24);
  return `${days}d ago`;
}

function formatSummary(entry: any): string {
  const d = entry.details || {};
  switch (entry.type) {
    case "sync.push":
      if (d.matched === false) return `KOReader sync — no book match (MD5: ${d.md5?.slice(0, 8)}…)`;
      return `KOReader synced${entry.bookTitle ? ` "${entry.bookTitle}"` : ""} — ${d.percentage ?? "?"}% — XPointer→CFI ${d.xpointerToCfi ?? "?"}`;
    case "sync.pull":
      return `KOReader pulled${entry.bookTitle ? ` "${entry.bookTitle}"` : ""} — ${d.percentage ?? "?"}%`;
    case "upload":
      return `Uploaded${entry.bookTitle ? ` "${entry.bookTitle}"` : ""} (${d.fileFormat ?? "?"})`;
    case "import":
      return `Library imported (${d.format ?? "zip"})`;
    case "export":
      return `Library exported — ${d.bookCount ?? "?"} books`;
    case "hash.save":
      return `Hash ${d.status}${entry.bookTitle ? ` for "${entry.bookTitle}"` : ""} — ${d.md5?.slice(0, 12)}…${d.error ? ` (${d.error})` : ""}`;
    case "metadata.apply":
      return `Metadata applied to${entry.bookTitle ? ` "${entry.bookTitle}"` : ""} — ${(d.fields ?? []).join(", ")} (${d.source ?? "?"})`;
    default:
      return entry.type;
  }
}

function AdminLogsPage() {
  const { t } = useTranslation();
  const { user: currentUser } = useAuth();
  const navigate = useNavigate();

  useEffect(() => {
    if (currentUser && currentUser.role !== "admin") {
      navigate({ to: "/home" });
    }
  }, [currentUser, navigate]);

  const [typeFilter, setTypeFilter] = useState("");
  const [levelFilter, setLevelFilter] = useState("");
  const [limit] = useState(100);
  const [offset, setOffset] = useState(0);
  const [expandedId, setExpandedId] = useState<string | null>(null);

  const logsQuery = trpc.admin.activityLog.useQuery({
    type: typeFilter || undefined,
    level: levelFilter || undefined,
    limit,
    offset,
  });

  const entries = logsQuery.data ?? [];

  return (
    <div className="max-w-4xl mx-auto px-4 py-8">
      {/* Admin nav */}
      <div className="flex gap-4 mb-6">
        <Link
          to="/admin/users"
          className="text-sm font-medium transition-colors"
          style={{ color: "var(--text-dim)" }}
        >
          {t("admin.users")}
        </Link>
        <span
          className="text-sm font-medium"
          style={{ color: "var(--warm)" }}
        >
          {t("admin.logs", "Activity Log")}
        </span>
      </div>

      <h1
        className="text-xl font-display font-semibold mb-6"
        style={{ color: "var(--text)" }}
      >
        {t("admin.activityLog", "Activity Log")}
      </h1>

      {/* Filters */}
      <div className="flex gap-3 mb-4">
        <select
          value={typeFilter}
          onChange={(e) => { setTypeFilter(e.target.value); setOffset(0); }}
          className="px-3 py-1.5 rounded-md text-sm"
          style={{ backgroundColor: "var(--card)", borderColor: "var(--border)", color: "var(--text)", border: "1px solid var(--border)" }}
        >
          <option value="">{t("admin.allEvents")}</option>
          <option value="sync.push">{t("admin.syncPush")}</option>
          <option value="sync.pull">{t("admin.syncPull")}</option>
          <option value="upload">{t("admin.upload")}</option>
          <option value="import">{t("admin.import")}</option>
          <option value="export">{t("admin.export")}</option>
          <option value="metadata.apply">{t("admin.metadata")}</option>
        </select>
        <select
          value={levelFilter}
          onChange={(e) => { setLevelFilter(e.target.value); setOffset(0); }}
          className="px-3 py-1.5 rounded-md text-sm"
          style={{ backgroundColor: "var(--card)", borderColor: "var(--border)", color: "var(--text)", border: "1px solid var(--border)" }}
        >
          <option value="">{t("admin.allLevels")}</option>
          <option value="info">{t("admin.info")}</option>
          <option value="warn">{t("admin.warning")}</option>
          <option value="error">{t("admin.error")}</option>
        </select>
      </div>

      {/* Log entries */}
      <div className="space-y-1">
        {entries.length === 0 && (
          <p className="text-sm py-8 text-center" style={{ color: "var(--text-faint)" }}>
            {t("admin.noLogs")}
          </p>
        )}
        {entries.map((entry: any) => (
          <div
            key={entry.id}
            className="rounded-md px-3 py-2 cursor-pointer hover:opacity-90 transition-opacity"
            style={{ backgroundColor: "var(--card)" }}
            onClick={() => setExpandedId(expandedId === entry.id ? null : entry.id)}
          >
            <div className="flex items-center gap-2">
              <span
                className="text-[10px] font-mono px-1.5 py-0.5 rounded"
                style={{
                  backgroundColor: TYPE_COLORS[entry.type] ?? "var(--border)",
                  color: "#fff",
                }}
              >
                {entry.type}
              </span>
              {entry.level !== "info" && (
                <span
                  className="text-[10px] font-semibold uppercase"
                  style={{ color: LEVEL_COLORS[entry.level] ?? "var(--text-dim)" }}
                >
                  {entry.level}
                </span>
              )}
              <span className="text-xs flex-1" style={{ color: "var(--text)" }}>
                {formatSummary(entry)}
              </span>
              <span className="text-[11px] shrink-0" style={{ color: "var(--text-faint)" }}>
                {timeAgo(entry.createdAt)}
              </span>
            </div>
            {expandedId === entry.id && entry.details && (
              <pre
                className="mt-2 text-[11px] p-2 rounded overflow-x-auto"
                style={{ backgroundColor: "var(--bg)", color: "var(--text-dim)" }}
              >
                {JSON.stringify(entry.details, null, 2)}
              </pre>
            )}
          </div>
        ))}
      </div>

      {/* Pagination */}
      {entries.length >= limit && (
        <div className="flex justify-center mt-4">
          <button
            onClick={() => setOffset((o) => o + limit)}
            className="px-4 py-2 rounded-md text-sm"
            style={{ backgroundColor: "var(--card)", color: "var(--text-dim)", border: "1px solid var(--border)" }}
          >
            {t("admin.loadMore")}
          </button>
        </div>
      )}
      {offset > 0 && (
        <div className="flex justify-center mt-2">
          <button
            onClick={() => setOffset(0)}
            className="text-xs"
            style={{ color: "var(--text-faint)" }}
          >
            {t("admin.backToNewest")}
          </button>
        </div>
      )}
    </div>
  );
}
