import { createFileRoute } from "@tanstack/react-router";
import { useRef, useCallback } from "react";
import { useDropzone } from "react-dropzone";
import { trpc } from "@/trpc";
import { getAccessToken } from "@/lib/auth";
import { BookGrid } from "@/components/books/book-grid";

export const Route = createFileRoute("/_app/")({
  component: LibraryPage,
});

function LibraryPage() {
  const fileInputRef = useRef<HTMLInputElement>(null);
  const utils = trpc.useUtils();

  const booksQuery = trpc.books.list.useQuery({
    sort: "recent",
    limit: 50,
  });

  const handleUpload = useCallback(
    async (files: File[]) => {
      const token = getAccessToken();
      if (!token || files.length === 0) return;

      for (const file of files) {
        const formData = new FormData();
        formData.append("file", file);

        try {
          await fetch("/api/upload", {
            method: "POST",
            headers: { Authorization: `Bearer ${token}` },
            body: formData,
          });
        } catch {
          // Upload errors are handled silently for now
        }
      }

      utils.books.list.invalidate();
    },
    [utils],
  );

  const { getRootProps, isDragActive } = useDropzone({
    onDrop: handleUpload,
    accept: {
      "application/epub+zip": [".epub"],
      "application/pdf": [".pdf"],
    },
    noClick: true,
    noKeyboard: true,
  });

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.files) {
      handleUpload(Array.from(e.target.files));
      e.target.value = "";
    }
  };

  const bookCount = booksQuery.data?.total ?? 0;

  return (
    <div {...getRootProps()} className="relative min-h-full">

      {/* Drag overlay */}
      {isDragActive && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center"
          style={{ backgroundColor: "rgba(0,0,0,0.5)" }}
        >
          <div
            className="rounded-2xl border-2 border-dashed px-12 py-10 text-center"
            style={{
              borderColor: "var(--warm)",
              backgroundColor: "var(--surface)",
            }}
          >
            <p
              className="font-display text-xl font-semibold"
              style={{ color: "var(--warm)" }}
            >
              Drop books here
            </p>
            <p
              className="text-sm mt-1"
              style={{ color: "var(--text-dim)" }}
            >
              EPUB and PDF files supported
            </p>
          </div>
        </div>
      )}

      {/* Header */}
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1
            className="font-display text-[26px] font-bold"
            style={{ color: "var(--text)" }}
          >
            Library
          </h1>
          {bookCount > 0 && (
            <p
              className="text-sm mt-0.5"
              style={{ color: "var(--text-dim)" }}
            >
              {bookCount} {bookCount === 1 ? "book" : "books"}
            </p>
          )}
        </div>

        <div>
          <input
            ref={fileInputRef}
            type="file"
            accept=".epub,.pdf"
            multiple
            className="hidden"
            onChange={handleFileChange}
          />
          <button
            onClick={() => fileInputRef.current?.click()}
            className="px-5 py-2 rounded-full text-sm font-semibold text-white transition-transform hover:scale-[1.02]"
            style={{ backgroundColor: "var(--warm)" }}
          >
            Upload
          </button>
        </div>
      </div>

      {/* Book grid */}
      {booksQuery.isLoading ? (
        <div
          className="flex items-center justify-center py-20"
          style={{ color: "var(--text-dim)" }}
        >
          <p className="text-sm">Loading your library...</p>
        </div>
      ) : (
        <BookGrid books={booksQuery.data?.books ?? []} />
      )}
    </div>
  );
}
