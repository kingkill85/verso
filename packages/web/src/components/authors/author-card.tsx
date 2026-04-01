import { Link } from "@tanstack/react-router";
import { useTranslation } from "react-i18next";

type AuthorCardProps = {
  id: string;
  name: string;
  imagePath?: string | null;
  bookCount: number;
};

function getInitials(name: string): string {
  return name
    .split(" ")
    .map((w) => w[0])
    .filter(Boolean)
    .slice(0, 2)
    .join("")
    .toUpperCase();
}

function hashColor(name: string): string {
  let hash = 0;
  for (let i = 0; i < name.length; i++) {
    hash = name.charCodeAt(i) + ((hash << 5) - hash);
  }
  const hue = Math.abs(hash) % 360;
  return `hsl(${hue}, 35%, 35%)`;
}

export function AuthorCard({ id, name, imagePath, bookCount }: AuthorCardProps) {
  const { t } = useTranslation();

  return (
    <Link
      to="/authors/$id"
      params={{ id }}
      className="block rounded-xl p-4 text-center transition-transform duration-200 hover:-translate-y-1"
      style={{ backgroundColor: "var(--card)" }}
    >
      <div
        className="w-20 h-20 rounded-full mx-auto mb-2.5 flex items-center justify-center text-2xl font-bold text-white overflow-hidden"
        style={{ backgroundColor: hashColor(name) }}
      >
        {imagePath ? (
          <img
            src={`/api/authors/${id}/photo`}
            alt={name}
            className="w-full h-full object-cover"
            onError={(e) => {
              (e.target as HTMLImageElement).style.display = "none";
              (e.target as HTMLImageElement).parentElement!.textContent = getInitials(name);
            }}
          />
        ) : (
          getInitials(name)
        )}
      </div>
      <p
        className="font-display text-sm font-semibold line-clamp-1"
        style={{ color: "var(--text)" }}
      >
        {name}
      </p>
      <p className="text-[11px] mt-0.5" style={{ color: "var(--text-dim)" }}>
        {t("authors.books", { count: bookCount })}
      </p>
    </Link>
  );
}
