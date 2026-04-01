import { createFileRoute, Link } from "@tanstack/react-router";
import { useTranslation } from "react-i18next";
import { ShelfForm } from "@/components/shelves/shelf-form";
import { BackButton } from "@/components/back-button";

export const Route = createFileRoute("/_app/shelves/new")({
  component: ShelfNewPage,
});

function ShelfNewPage() {
  const { t } = useTranslation();
  return (
    <div className="max-w-lg mx-auto animate-in fade-in">
      <BackButton />
      <h1 className="font-display text-xl font-bold mb-6" style={{ color: "var(--text)" }}>{t("shelf.newShelf")}</h1>
      <div className="rounded-xl p-5" style={{ backgroundColor: "var(--card)" }}>
        <ShelfForm />
      </div>
    </div>
  );
}
