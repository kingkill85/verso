import { createFileRoute, Link } from "@tanstack/react-router";
import { ShelfForm } from "@/components/shelves/shelf-form";

export const Route = createFileRoute("/_app/shelves/new")({
  component: ShelfNewPage,
});

function ShelfNewPage() {
  return (
    <div className="max-w-lg mx-auto animate-in fade-in">
      <Link to="/library" className="inline-flex items-center text-sm mb-6 transition-colors hover:opacity-80" style={{ color: "var(--text-dim)" }}>
        <svg className="w-4 h-4 mr-1" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7" />
        </svg>
        Back to library
      </Link>
      <h1 className="font-display text-xl font-bold mb-6" style={{ color: "var(--text)" }}>New Shelf</h1>
      <div className="rounded-xl p-5" style={{ backgroundColor: "var(--card)" }}>
        <ShelfForm />
      </div>
    </div>
  );
}
