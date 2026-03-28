import { useTranslation } from "react-i18next";

function formatMinutes(minutes: number): string {
  if (minutes < 60) return `${minutes}m`;
  const h = Math.floor(minutes / 60);
  const m = minutes % 60;
  return m > 0 ? `${h}h ${m}m` : `${h}h`;
}

interface SummaryCardsProps {
  timeReadMinutes: number;
  booksFinished: number;
  booksInProgress: number;
  currentStreak: number;
  avgMinutesPerDay: number;
}

export function SummaryCards({
  timeReadMinutes,
  booksFinished,
  booksInProgress,
  currentStreak,
  avgMinutesPerDay,
}: SummaryCardsProps) {
  const { t } = useTranslation();
  const cards = [
    { value: formatMinutes(timeReadMinutes), label: t("stats.timeRead") },
    { value: String(booksFinished), label: t("stats.booksFinished") },
    { value: String(booksInProgress), label: t("stats.inProgress") },
    { value: `${currentStreak}d`, label: t("stats.currentStreak") },
    { value: formatMinutes(avgMinutesPerDay), label: t("stats.dailyAverage") },
  ];

  return (
    <div className="grid grid-cols-2 gap-3 sm:grid-cols-5">
      {cards.map((card) => (
        <div
          key={card.label}
          className="rounded-xl p-4 flex flex-col items-center gap-1 text-center"
          style={{ backgroundColor: "var(--card)" }}
        >
          <span
            className="font-display text-2xl font-bold"
            style={{ color: "var(--warm)" }}
          >
            {card.value}
          </span>
          <span className="text-xs" style={{ color: "var(--text-dim)" }}>
            {card.label}
          </span>
        </div>
      ))}
    </div>
  );
}
