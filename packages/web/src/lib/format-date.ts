export function formatDate(dateStr: string, locale?: string, short?: boolean): string {
  return new Date(dateStr).toLocaleDateString(locale ?? "en", {
    year: "numeric",
    month: short ? "short" : "long",
    day: "numeric",
  });
}

export function formatDateCompact(dateStr: string, locale?: string): string {
  return new Date(dateStr).toLocaleDateString(locale ?? "en", {
    month: "short",
    day: "numeric",
  });
}
