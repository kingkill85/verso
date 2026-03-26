import { Link } from "@tanstack/react-router";
import { trpc } from "@/trpc";
import type { Annotation } from "@verso/shared";

const COLOR_MAP: Record<string, string> = {
  yellow: "#eab308",
  green: "#22c55e",
  blue: "#3b82f6",
  pink: "#ec4899",
};

function formatDate(dateStr: string): string {
  return new Date(dateStr).toLocaleDateString("en-US", {
    year: "numeric",
    month: "short",
    day: "numeric",
  });
}

interface AnnotationsTabProps {
  bookId: string;
}

export function AnnotationsTab({ bookId }: AnnotationsTabProps) {
  const annotationsQuery = trpc.annotations.list.useQuery({ bookId });
  const utils = trpc.useUtils();
  const deleteAnnotation = trpc.annotations.delete.useMutation({
    onSuccess: () => utils.annotations.list.invalidate({ bookId }),
  });

  if (annotationsQuery.isLoading) {
    return (
      <p className="text-sm py-6 text-center" style={{ color: "var(--text-dim)" }}>
        Loading annotations...
      </p>
    );
  }

  const annotations = annotationsQuery.data ?? [];

  if (annotations.length === 0) {
    return (
      <p className="text-sm py-6 text-center" style={{ color: "var(--text-dim)" }}>
        No annotations yet. Open the reader and highlight some text to get started.
      </p>
    );
  }

  // Group by chapter
  const grouped = new Map<string, Annotation[]>();
  for (const ann of annotations) {
    const chapter = ann.chapter ?? "Unknown Chapter";
    if (!grouped.has(chapter)) grouped.set(chapter, []);
    grouped.get(chapter)!.push(ann);
  }

  return (
    <div className="flex flex-col gap-8">
      {Array.from(grouped.entries()).map(([chapter, items]) => (
        <div key={chapter}>
          <h3
            className="text-xs font-semibold uppercase tracking-wider mb-3"
            style={{ color: "var(--text-faint)" }}
          >
            {chapter}
          </h3>
          <div className="flex flex-col gap-3">
            {items.map((ann) => {
              const borderColor = COLOR_MAP[ann.color ?? "yellow"] ?? COLOR_MAP.yellow;
              const content = ann.content ?? "";
              const truncated = content.length > 200 ? content.slice(0, 200) + "…" : content;

              return (
                <div
                  key={ann.id}
                  className="rounded-xl p-4 flex gap-4"
                  style={{ backgroundColor: "var(--card)" }}
                >
                  {/* Colored left border accent */}
                  <div
                    className="shrink-0 w-[3px] rounded-full self-stretch"
                    style={{ backgroundColor: borderColor }}
                  />

                  {/* Content */}
                  <div className="flex-1 min-w-0">
                    <Link
                      to="/books/$id/read"
                      params={{ id: bookId }}
                      search={{ cfi: ann.cfiPosition ?? undefined }}
                      className="block hover:opacity-80 transition-opacity"
                    >
                      <p className="text-sm leading-relaxed" style={{ color: "var(--text)" }}>
                        {truncated}
                      </p>
                    </Link>

                    {ann.note && (
                      <p
                        className="text-sm italic mt-1.5"
                        style={{ color: "var(--text-dim)" }}
                      >
                        {ann.note}
                      </p>
                    )}

                    <p className="text-xs mt-2" style={{ color: "var(--text-faint)" }}>
                      {formatDate(ann.createdAt)}
                    </p>
                  </div>

                  {/* Delete button */}
                  <button
                    onClick={() => deleteAnnotation.mutate({ id: ann.id })}
                    disabled={deleteAnnotation.isPending}
                    className="shrink-0 self-start px-2 py-1 rounded text-xs font-medium transition-opacity hover:opacity-80"
                    style={{ color: "#ef4444" }}
                    aria-label="Delete annotation"
                  >
                    Delete
                  </button>
                </div>
              );
            })}
          </div>
        </div>
      ))}
    </div>
  );
}
