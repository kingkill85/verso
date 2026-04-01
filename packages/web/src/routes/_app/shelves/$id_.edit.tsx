import { createFileRoute, Link } from "@tanstack/react-router";
import { useTranslation } from "react-i18next";
import { trpc } from "@/trpc";
import { ShelfForm } from "@/components/shelves/shelf-form";
import { BackButton } from "@/components/back-button";

export const Route = createFileRoute("/_app/shelves/$id_/edit")({
  component: ShelfEditPage,
});

function ShelfEditPage() {
  const { t } = useTranslation();
  const { id } = Route.useParams();
  const shelfQuery = trpc.shelves.byId.useQuery({ id });

  if (shelfQuery.isLoading) {
    return <div className="flex items-center justify-center py-20" style={{ color: "var(--text-dim)" }}><p className="text-sm">{t("common.loading")}</p></div>;
  }
  if (shelfQuery.error || !shelfQuery.data) {
    return (
      <div className="flex flex-col items-center justify-center py-20 text-center">
        <p className="font-display text-lg" style={{ color: "var(--text)" }}>{t("shelf.notFound")}</p>
        <button onClick={() => window.history.back()} className="text-sm mt-2" style={{ color: "var(--warm)" }}>{t("common.back")}</button>
      </div>
    );
  }

  const shelf = shelfQuery.data;

  return (
    <div className="max-w-lg mx-auto animate-in fade-in">
      <BackButton label={t("edit.backTo", { name: shelf.name })} />
      <h1 className="font-display text-xl font-bold mb-6" style={{ color: "var(--text)" }}>{t("shelf.editShelf")}</h1>
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
