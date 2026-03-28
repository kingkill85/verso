import { createFileRoute } from "@tanstack/react-router";
import { useState, useCallback } from "react";
import { useDropzone } from "react-dropzone";
import { trpc } from "@/trpc";
import { getAccessToken } from "@/lib/auth";
import { XIcon, CheckIcon } from "@/components/icons";

type UploadItem = {
  file: File;
  status: "pending" | "uploading" | "done" | "error";
  error?: string;
};

export const Route = createFileRoute("/_app/upload")({
  component: UploadPage,
});

function UploadPage() {
  const [items, setItems] = useState<UploadItem[]>([]);
  const [uploading, setUploading] = useState(false);
  const utils = trpc.useUtils();

  const onDrop = useCallback((files: File[]) => {
    const newItems = files.map((file) => ({
      file,
      status: "pending" as const,
    }));
    setItems((prev) => [...prev, ...newItems]);
  }, []);

  const { getRootProps, getInputProps, isDragActive } = useDropzone({
    onDrop,
    accept: {
      "application/epub+zip": [".epub"],
      "application/pdf": [".pdf"],
      "application/x-mobipocket-ebook": [".mobi", ".prc"],
      "application/vnd.amazon.ebook": [".azw", ".azw3"],
      "application/x-fictionbook+xml": [".fb2"],
      "application/x-cbz": [".cbz"],
      "application/x-cbr": [".cbr"],
      "application/vnd.openxmlformats-officedocument.wordprocessingml.document": [".docx"],
      "application/rtf": [".rtf"],
    },
  });

  const uploadAll = async () => {
    const token = getAccessToken();
    if (!token) return;

    setUploading(true);

    for (let i = 0; i < items.length; i++) {
      if (items[i].status !== "pending") continue;

      setItems((prev) =>
        prev.map((item, j) =>
          j === i ? { ...item, status: "uploading" } : item
        )
      );

      const formData = new FormData();
      formData.append("file", items[i].file);

      try {
        const res = await fetch("/api/upload", {
          method: "POST",
          headers: { Authorization: `Bearer ${token}` },
          body: formData,
        });

        if (!res.ok) {
          const data = await res.json().catch(() => ({}));
          throw new Error(data.error || `Upload failed (${res.status})`);
        }

        setItems((prev) =>
          prev.map((item, j) =>
            j === i ? { ...item, status: "done" } : item
          )
        );
      } catch (err: any) {
        setItems((prev) =>
          prev.map((item, j) =>
            j === i
              ? { ...item, status: "error", error: err.message }
              : item
          )
        );
      }
    }

    setUploading(false);
    utils.books.list.invalidate();
  };

  const removeItem = (index: number) => {
    setItems((prev) => prev.filter((_, i) => i !== index));
  };

  const clearDone = () => {
    setItems((prev) => prev.filter((item) => item.status !== "done"));
  };

  const pendingCount = items.filter((i) => i.status === "pending").length;
  const doneCount = items.filter((i) => i.status === "done").length;

  return (
    <div className="max-w-2xl mx-auto">
      <h1
        className="font-display text-[26px] font-bold mb-6"
        style={{ color: "var(--text)" }}
      >
        Upload Books
      </h1>

      {/* Drop zone */}
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
          {isDragActive ? "Drop files here" : "Drag & drop books here"}
        </p>
        <p className="text-sm mb-4" style={{ color: "var(--text-dim)" }}>
          or click to browse
        </p>
        <p className="text-xs" style={{ color: "var(--text-faint)" }}>
          Supports EPUB, MOBI, AZW, FB2, CBZ, CBR, DOCX, RTF, and PDF
        </p>
      </div>

      {/* File list */}
      {items.length > 0 && (
        <div className="mt-6">
          <div className="flex items-center justify-between mb-3">
            <p className="text-sm font-medium" style={{ color: "var(--text)" }}>
              {items.length} {items.length === 1 ? "file" : "files"} selected
              {doneCount > 0 && ` · ${doneCount} uploaded`}
            </p>
            <div className="flex gap-2">
              {doneCount > 0 && (
                <button
                  onClick={clearDone}
                  className="text-xs px-3 py-1.5 rounded-full border transition-colors"
                  style={{
                    color: "var(--text-dim)",
                    borderColor: "var(--border)",
                  }}
                >
                  Clear done
                </button>
              )}
              {pendingCount > 0 && (
                <button
                  onClick={uploadAll}
                  disabled={uploading}
                  className="text-sm px-5 py-1.5 rounded-full font-semibold text-white transition-transform hover:scale-[1.02] disabled:opacity-50"
                  style={{ backgroundColor: "var(--warm)" }}
                >
                  {uploading ? "Uploading..." : `Upload ${pendingCount}`}
                </button>
              )}
            </div>
          </div>

          <div className="space-y-2">
            {items.map((item, i) => (
              <div
                key={`${item.file.name}-${i}`}
                className="flex items-center gap-3 rounded-lg px-4 py-3"
                style={{ backgroundColor: "var(--card)" }}
              >
                <div className="flex-1 min-w-0">
                  <p
                    className="text-sm font-medium truncate"
                    style={{ color: "var(--text)" }}
                  >
                    {item.file.name}
                  </p>
                  <p className="text-xs" style={{ color: "var(--text-faint)" }}>
                    {(item.file.size / 1024 / 1024).toFixed(1)} MB
                  </p>
                </div>

                {item.status === "pending" && (
                  <button
                    onClick={() => removeItem(i)}
                    className="text-xs px-2 py-1 rounded"
                    style={{ color: "var(--text-faint)" }}
                  >
                    <XIcon size={14} />
                  </button>
                )}
                {item.status === "uploading" && (
                  <span
                    className="text-xs font-medium"
                    style={{ color: "var(--warm)" }}
                  >
                    Uploading...
                  </span>
                )}
                {item.status === "done" && (
                  <span
                    className="text-xs font-medium"
                    style={{ color: "var(--green)" }}
                  >
                    <CheckIcon size={14} className="inline -mt-0.5" /> Done
                  </span>
                )}
                {item.status === "error" && (
                  <span className="text-xs font-medium text-red-500">
                    {item.error || "Failed"}
                  </span>
                )}
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
