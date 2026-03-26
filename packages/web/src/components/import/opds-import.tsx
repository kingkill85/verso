import { useState } from "react";
import { getAccessToken } from "@/lib/auth";

type Phase = "connect" | "browse" | "importing";

type OpdsNavigationEntry = {
  title: string;
  href: string;
  description?: string;
};

type OpdsBookEntry = {
  id: string;
  title: string;
  author?: string;
  summary?: string;
  acquisitionUrl: string;
  coverUrl?: string;
  format?: string;
};

type OpdsCatalog = {
  title: string;
  nextUrl?: string;
} & (
  | { type: "navigation"; entries: OpdsNavigationEntry[] }
  | { type: "acquisition"; entries: OpdsBookEntry[] }
);

type ImportStatus = {
  id: string;
  title: string;
  status: "pending" | "downloading" | "processing" | "done" | "failed";
  error?: string;
};

export function OpdsImport() {
  const [phase, setPhase] = useState<Phase>("connect");
  const [url, setUrl] = useState("");
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [connecting, setConnecting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Browse state
  const [catalogTitle, setCatalogTitle] = useState("");
  const [feedStack, setFeedStack] = useState<OpdsCatalog[]>([]);
  const [currentFeed, setCurrentFeed] = useState<OpdsCatalog | null>(null);
  const [selected, setSelected] = useState<Set<string>>(new Set());

  // Import state
  const [importStatuses, setImportStatuses] = useState<ImportStatus[]>([]);

  const connect = async () => {
    if (!url.trim()) return;
    setConnecting(true);
    setError(null);
    const token = getAccessToken();
    try {
      const res = await fetch("/api/import/opds/browse", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          ...(token ? { Authorization: `Bearer ${token}` } : {}),
        },
        body: JSON.stringify({
          url: url.trim(),
          ...(username ? { username } : {}),
          ...(password ? { password } : {}),
        }),
      });
      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        throw new Error(data.error || `Connection failed (${res.status})`);
      }
      const catalog: OpdsCatalog = await res.json();
      setCatalogTitle(catalog.title || "OPDS Catalog");
      setCurrentFeed(catalog);
      setFeedStack([]);
      setSelected(new Set());
      setPhase("browse");
    } catch (err: any) {
      setError(err.message || "Failed to connect");
    } finally {
      setConnecting(false);
    }
  };

  const navigateTo = async (navUrl: string) => {
    setError(null);
    const token = getAccessToken();
    try {
      const res = await fetch("/api/import/opds/browse", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          ...(token ? { Authorization: `Bearer ${token}` } : {}),
        },
        body: JSON.stringify({
          url: navUrl,
          ...(username ? { username } : {}),
          ...(password ? { password } : {}),
        }),
      });
      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        throw new Error(data.error || `Navigation failed (${res.status})`);
      }
      const catalog: OpdsCatalog = await res.json();
      setFeedStack((prev) => [...prev, currentFeed!]);
      setCurrentFeed(catalog);
      setSelected(new Set());
    } catch (err: any) {
      setError(err.message || "Navigation failed");
    }
  };

  const goBack = () => {
    if (feedStack.length === 0) {
      setPhase("connect");
      setCurrentFeed(null);
      return;
    }
    const prev = feedStack[feedStack.length - 1];
    setFeedStack((s) => s.slice(0, -1));
    setCurrentFeed(prev);
    setSelected(new Set());
    setError(null);
  };

  const isNavFeed = currentFeed?.type === "navigation";
  const navigationEntries = isNavFeed ? (currentFeed?.entries as OpdsNavigationEntry[]) : [];
  const acquisitionEntries = !isNavFeed && currentFeed?.type === "acquisition"
    ? (currentFeed.entries as OpdsBookEntry[])
    : [];

  const toggleSelect = (id: string) => {
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  const selectAll = () => {
    setSelected(new Set(acquisitionEntries.map((e) => e.id)));
  };

  const startImport = async () => {
    const entriesToImport = acquisitionEntries.filter((e) =>
      selected.has(e.id)
    );
    if (entriesToImport.length === 0) return;

    const statuses: ImportStatus[] = entriesToImport.map((e) => ({
      id: e.id,
      title: e.title,
      status: "pending",
    }));
    setImportStatuses(statuses);
    setPhase("importing");

    const token = getAccessToken();
    try {
      const res = await fetch("/api/import/opds/stream", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          ...(token ? { Authorization: `Bearer ${token}` } : {}),
        },
        body: JSON.stringify({
          entries: entriesToImport,
          ...(username ? { username } : {}),
          ...(password ? { password } : {}),
        }),
      });

      if (!res.ok || !res.body) {
        throw new Error(`Import failed (${res.status})`);
      }

      const reader = res.body.getReader();
      const decoder = new TextDecoder();
      let buffer = "";

      while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        buffer += decoder.decode(value, { stream: true });
        const parts = buffer.split("\n\n");
        buffer = parts.pop() ?? "";

        for (const part of parts) {
          const line = part.trim();
          if (!line.startsWith("data:")) continue;
          try {
            const event = JSON.parse(line.slice(5).trim());
            setImportStatuses((prev) =>
              prev.map((s) =>
                s.id === event.id
                  ? {
                      ...s,
                      status: event.status,
                      error: event.error,
                    }
                  : s
              )
            );
          } catch {
            // skip malformed events
          }
        }
      }
    } catch (err: any) {
      setImportStatuses((prev) =>
        prev.map((s) =>
          s.status === "pending" || s.status === "downloading"
            ? { ...s, status: "failed", error: err.message }
            : s
        )
      );
    }
  };

  // Phase: connect
  if (phase === "connect") {
    return (
      <div>
        <div
          className="rounded-xl p-6 space-y-4"
          style={{ backgroundColor: "var(--card)" }}
        >
          <div>
            <label
              className="block text-sm font-medium mb-1.5"
              style={{ color: "var(--text)" }}
            >
              OPDS Server URL
            </label>
            <input
              type="url"
              value={url}
              onChange={(e) => setUrl(e.target.value)}
              onKeyDown={(e) => e.key === "Enter" && connect()}
              placeholder="OPDS server URL (e.g. http://booklore:6060/api/v1/opds)"
              className="w-full rounded-lg px-3 py-2 text-sm outline-none"
              style={{
                backgroundColor: "var(--bg)",
                border: "1px solid var(--border)",
                color: "var(--text)",
              }}
            />
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div>
              <label
                className="block text-sm font-medium mb-1.5"
                style={{ color: "var(--text)" }}
              >
                Username{" "}
                <span style={{ color: "var(--text-faint)" }}>(optional)</span>
              </label>
              <input
                type="text"
                value={username}
                onChange={(e) => setUsername(e.target.value)}
                placeholder="Username"
                className="w-full rounded-lg px-3 py-2 text-sm outline-none"
                style={{
                  backgroundColor: "var(--bg)",
                  border: "1px solid var(--border)",
                  color: "var(--text)",
                }}
              />
            </div>
            <div>
              <label
                className="block text-sm font-medium mb-1.5"
                style={{ color: "var(--text)" }}
              >
                Password{" "}
                <span style={{ color: "var(--text-faint)" }}>(optional)</span>
              </label>
              <input
                type="password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                onKeyDown={(e) => e.key === "Enter" && connect()}
                placeholder="Password"
                className="w-full rounded-lg px-3 py-2 text-sm outline-none"
                style={{
                  backgroundColor: "var(--bg)",
                  border: "1px solid var(--border)",
                  color: "var(--text)",
                }}
              />
            </div>
          </div>

          {error && (
            <p className="text-sm text-red-500">{error}</p>
          )}

          <button
            onClick={connect}
            disabled={connecting || !url.trim()}
            className="w-full py-2.5 rounded-lg text-sm font-semibold text-white transition-opacity disabled:opacity-50"
            style={{ backgroundColor: "var(--warm)" }}
          >
            {connecting ? "Connecting..." : "Connect"}
          </button>
        </div>
      </div>
    );
  }

  // Phase: importing
  if (phase === "importing") {
    const done = importStatuses.filter((s) => s.status === "done").length;
    const failed = importStatuses.filter((s) => s.status === "failed").length;
    const total = importStatuses.length;
    const finished = done + failed;

    return (
      <div>
        <div className="flex items-center justify-between mb-4">
          <h2 className="text-base font-semibold" style={{ color: "var(--text)" }}>
            Importing {total} {total === 1 ? "book" : "books"}
          </h2>
          <p className="text-sm" style={{ color: "var(--text-dim)" }}>
            {finished} / {total} done
          </p>
        </div>

        <div className="space-y-2">
          {importStatuses.map((s) => (
            <div
              key={s.id}
              className="flex items-center gap-3 rounded-lg px-4 py-3"
              style={{ backgroundColor: "var(--card)" }}
            >
              <div className="flex-1 min-w-0">
                <p
                  className="text-sm font-medium truncate"
                  style={{ color: "var(--text)" }}
                >
                  {s.title}
                </p>
              </div>
              <span
                className="text-xs font-medium shrink-0"
                style={{
                  color:
                    s.status === "done"
                      ? "var(--green)"
                      : s.status === "failed"
                        ? "#ef4444"
                        : s.status === "pending"
                          ? "var(--text-faint)"
                          : "var(--warm)",
                }}
              >
                {s.status === "pending" && "Waiting..."}
                {s.status === "downloading" && "Downloading..."}
                {s.status === "processing" && "Processing..."}
                {s.status === "done" && "✓ Done"}
                {s.status === "failed" && (s.error || "Failed")}
              </span>
            </div>
          ))}
        </div>

        {finished === total && (
          <button
            onClick={() => {
              setPhase("browse");
              setImportStatuses([]);
            }}
            className="mt-4 text-sm px-4 py-2 rounded-full border"
            style={{ color: "var(--text-dim)", borderColor: "var(--border)" }}
          >
            ← Back to catalog
          </button>
        )}
      </div>
    );
  }

  // Phase: browse
  return (
    <div>
      <div className="flex items-center gap-3 mb-4">
        <button
          onClick={goBack}
          className="text-sm px-3 py-1.5 rounded-full border transition-colors"
          style={{ color: "var(--text-dim)", borderColor: "var(--border)" }}
        >
          ← Back
        </button>
        <h2
          className="text-base font-semibold truncate"
          style={{ color: "var(--text)" }}
        >
          {currentFeed?.title || catalogTitle}
        </h2>
      </div>

      {error && (
        <p className="text-sm text-red-500 mb-4">{error}</p>
      )}

      {/* Navigation entries */}
      {navigationEntries.length > 0 && (
        <div className="space-y-2 mb-4">
          {navigationEntries.map((entry, i) => (
            <button
              key={entry.href || i}
              onClick={() => entry.href && navigateTo(entry.href)}
              className="w-full flex items-center gap-3 rounded-lg px-4 py-3 text-left transition-opacity hover:opacity-80"
              style={{ backgroundColor: "var(--card)" }}
            >
              <span className="text-lg">📁</span>
              <div className="flex-1 min-w-0">
                <p
                  className="text-sm font-medium truncate"
                  style={{ color: "var(--text)" }}
                >
                  {entry.title}
                </p>
              </div>
              <span style={{ color: "var(--text-faint)" }}>›</span>
            </button>
          ))}
        </div>
      )}

      {/* Acquisition entries */}
      {acquisitionEntries.length > 0 && (
        <div>
          <div className="flex items-center justify-between mb-3">
            <p className="text-sm font-medium" style={{ color: "var(--text)" }}>
              {selected.size > 0
                ? `${selected.size} selected`
                : `${acquisitionEntries.length} books`}
            </p>
            <div className="flex gap-2">
              <button
                onClick={selectAll}
                className="text-xs px-3 py-1.5 rounded-full border transition-colors"
                style={{
                  color: "var(--text-dim)",
                  borderColor: "var(--border)",
                }}
              >
                Select all
              </button>
              {selected.size > 0 && (
                <button
                  onClick={startImport}
                  className="text-sm px-5 py-1.5 rounded-full font-semibold text-white transition-transform hover:scale-[1.02]"
                  style={{ backgroundColor: "var(--warm)" }}
                >
                  Import {selected.size} {selected.size === 1 ? "book" : "books"}
                </button>
              )}
            </div>
          </div>

          <div className="space-y-2">
            {acquisitionEntries.map((entry) => (
              <div
                key={entry.id}
                className="flex items-center gap-3 rounded-lg px-4 py-3 cursor-pointer transition-opacity hover:opacity-80"
                style={{ backgroundColor: "var(--card)" }}
                onClick={() => toggleSelect(entry.id)}
              >
                <input
                  type="checkbox"
                  checked={selected.has(entry.id)}
                  onChange={() => toggleSelect(entry.id)}
                  onClick={(e) => e.stopPropagation()}
                  className="rounded"
                  style={{ accentColor: "var(--warm)" }}
                />
                <div className="flex-1 min-w-0">
                  <p
                    className="text-sm font-medium truncate"
                    style={{ color: "var(--text)" }}
                  >
                    {entry.title}
                  </p>
                  <p
                    className="text-xs truncate"
                    style={{ color: "var(--text-dim)" }}
                  >
                    {[entry.author, entry.format].filter(Boolean).join(" · ")}
                  </p>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {navigationEntries.length === 0 && acquisitionEntries.length === 0 && (
        <p
          className="text-sm text-center py-8"
          style={{ color: "var(--text-faint)" }}
        >
          No entries found in this feed.
        </p>
      )}
    </div>
  );
}
