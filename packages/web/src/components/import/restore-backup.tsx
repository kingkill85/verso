import { useState, useCallback } from "react";
import { useTranslation } from "react-i18next";
import { useDropzone } from "react-dropzone";
import { getAccessToken } from "@/lib/auth";
import { CheckIcon } from "@/components/icons";

type RestoreState =
  | { phase: "idle" }
  | { phase: "uploading" }
  | { phase: "done"; books: number; shelves: number; annotations: number }
  | { phase: "error"; message: string };

export function RestoreBackup() {
  const { t } = useTranslation();
  const [state, setState] = useState<RestoreState>({ phase: "idle" });

  const onDrop = useCallback(async (files: File[]) => {
    const file = files[0];
    if (!file) return;

    setState({ phase: "uploading" });
    const token = getAccessToken();

    const formData = new FormData();
    formData.append("file", file);

    try {
      const res = await fetch("/api/import/restore", {
        method: "POST",
        headers: {
          ...(token ? { Authorization: `Bearer ${token}` } : {}),
        },
        body: formData,
      });

      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        throw new Error(data.error || `Restore failed (${res.status})`);
      }

      const data = await res.json();
      const imported = data.imported ?? data;
      setState({
        phase: "done",
        books: imported.books ?? 0,
        shelves: imported.shelves ?? 0,
        annotations: imported.annotations ?? 0,
      });
    } catch (err: any) {
      setState({ phase: "error", message: err.message || "Restore failed" });
    }
  }, []);

  const { getRootProps, getInputProps, isDragActive } = useDropzone({
    onDrop,
    accept: { "application/zip": [".zip"] },
    maxFiles: 1,
    disabled: state.phase === "uploading",
  });

  if (state.phase === "uploading") {
    return (
      <div
        className="rounded-xl border-2 border-dashed p-12 text-center"
        style={{
          borderColor: "var(--warm)",
          backgroundColor: "var(--warm-glow)",
        }}
      >
        <p
          className="font-display text-lg font-semibold mb-2"
          style={{ color: "var(--warm)" }}
        >
          {t("restore.restoring")}
        </p>
        <p className="text-sm" style={{ color: "var(--text-dim)" }}>
          {t("restore.pleaseWait")}
        </p>
      </div>
    );
  }

  if (state.phase === "done") {
    return (
      <div
        className="rounded-xl p-8 text-center"
        style={{ backgroundColor: "var(--card)" }}
      >
        <p
          className="font-display text-xl font-bold mb-2"
          style={{ color: "var(--green)" }}
        >
          <CheckIcon size={22} className="inline -mt-0.5" /> {t("restore.complete")}
        </p>
        <div
          className="flex justify-center gap-6 mt-4 text-sm"
          style={{ color: "var(--text-dim)" }}
        >
          <span>
            <span
              className="font-semibold text-base"
              style={{ color: "var(--text)" }}
            >
              {state.books}
            </span>{" "}
            {t("restore.books")}
          </span>
          <span>
            <span
              className="font-semibold text-base"
              style={{ color: "var(--text)" }}
            >
              {state.shelves}
            </span>{" "}
            {t("restore.shelves")}
          </span>
          <span>
            <span
              className="font-semibold text-base"
              style={{ color: "var(--text)" }}
            >
              {state.annotations}
            </span>{" "}
            {t("restore.annotations")}
          </span>
        </div>
        <button
          onClick={() => setState({ phase: "idle" })}
          className="mt-6 text-sm px-4 py-2 rounded-full border transition-colors"
          style={{ color: "var(--text-dim)", borderColor: "var(--border)" }}
        >
          {t("restore.restoreAnother")}
        </button>
      </div>
    );
  }

  if (state.phase === "error") {
    return (
      <div>
        <div
          className="rounded-xl border-2 border-dashed p-12 text-center mb-4"
          style={{
            borderColor: "#ef4444",
            backgroundColor: "var(--card)",
          }}
        >
          <p className="font-display text-lg font-semibold mb-2 text-red-500">
            {t("restore.failed")}
          </p>
          <p className="text-sm text-red-400 mb-4">{state.message}</p>
          <button
            onClick={() => setState({ phase: "idle" })}
            className="text-sm px-4 py-2 rounded-full border transition-colors"
            style={{ color: "var(--text-dim)", borderColor: "var(--border)" }}
          >
            {t("restore.tryAgain")}
          </button>
        </div>
      </div>
    );
  }

  // Idle — show drop zone
  return (
    <div>
      <div
        {...getRootProps()}
        className="rounded-xl border-2 border-dashed p-12 text-center cursor-pointer transition-colors"
        style={{
          borderColor: isDragActive ? "var(--warm)" : "var(--border)",
          backgroundColor: isDragActive ? "var(--warm-glow)" : "var(--card)",
        }}
      >
        <input {...getInputProps()} />
        <p
          className="font-display text-lg font-semibold mb-2"
          style={{ color: isDragActive ? "var(--warm)" : "var(--text)" }}
        >
          {isDragActive ? t("restore.dropHere") : t("restore.dropBackup")}
        </p>
        <p className="text-sm mb-4" style={{ color: "var(--text-dim)" }}>
          {t("restore.orBrowse")}
        </p>
        <p className="text-xs" style={{ color: "var(--text-faint)" }}>
          {t("restore.acceptsZip")}
        </p>
      </div>
    </div>
  );
}
