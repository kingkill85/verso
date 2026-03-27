import { createFileRoute, Link } from "@tanstack/react-router";
import { trpc } from "@/trpc";
import { ShelfForm } from "@/components/shelves/shelf-form";

export const Route = createFileRoute("/_app/shelves/$id_/edit")({
  component: ShelfEditPage,
});

function ShelfEditPage() {
  const { id } = Route.useParams();
  const shelfQuery = trpc.shelves.byId.useQuery({ id });

  if (shelfQuery.isLoading) {
    return <div className="flex items-center justify-center py-20" style={{ color: "var(--text-dim)" }}><p className="text-sm">Loading...</p></div>;
  }
  if (shelfQuery.error || !shelfQuery.data) {
    return (
      <div className="flex flex-col items-center justify-center py-20 text-center">
        <p className="font-display text-lg" style={{ color: "var(--text)" }}>Shelf not found</p>
        <button onClick={() => window.history.back()} className="text-sm mt-2" style={{ color: "var(--warm)" }}>Back</button>
      </div>
    );
  }

  const shelf = shelfQuery.data;

  return (
    <div className="max-w-lg mx-auto animate-in fade-in">
      <Link to="/shelves/$id" params={{ id }} className="inline-flex items-center text-sm mb-6 transition-colors hover:opacity-80" style={{ color: "var(--text-dim)" }}>
        <svg className="w-4 h-4 mr-1" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7" />
        </svg>
        Back to {shelf.name}
      </Link>
      <h1 className="font-display text-xl font-bold mb-6" style={{ color: "var(--text)" }}>Edit Shelf</h1>
      <div className="rounded-xl p-5" style={{ backgroundColor: "var(--card)" }}>
        <ShelfForm editShelf={{
          id: shelf.id,
          name: shelf.name,
          emoji: shelf.emoji,
          description: shelf.description,
          isSmart: shelf.isSmart,
          smartFilter: shelf.smartFilter,
        }} />
      </div>
    </div>
  );
}
