import { useMemo } from "react";

type BookCoverSize = "sm" | "md" | "lg" | "xl";

type BookCoverProps = {
  bookId: string;
  title: string;
  author?: string;
  coverPath?: string | null;
  size?: BookCoverSize;
};

const sizeMap: Record<BookCoverSize, { width: number; height: number }> = {
  sm: { width: 52, height: 76 },
  md: { width: 90, height: 132 },
  lg: { width: 120, height: 176 },
  xl: { width: 160, height: 240 },
};

const fontSizeMap: Record<BookCoverSize, { title: string; author: string }> = {
  sm: { title: "7px", author: "5px" },
  md: { title: "10px", author: "8px" },
  lg: { title: "12px", author: "9px" },
  xl: { title: "14px", author: "11px" },
};

const gradientPalette = [
  ["#8B4513", "#D2691E"],
  ["#2F4F4F", "#4A7C6F"],
  ["#4A3728", "#7B5B3A"],
  ["#1a3a4a", "#2d6a7a"],
  ["#3b2e5a", "#6b4f8a"],
  ["#5a3e2b", "#8b6d4a"],
  ["#2e4a3b", "#4a7a5b"],
  ["#4a2e3b", "#7a4a5b"],
];

function hashString(str: string): number {
  let hash = 0;
  for (let i = 0; i < str.length; i++) {
    hash = (hash << 5) - hash + str.charCodeAt(i);
    hash |= 0;
  }
  return Math.abs(hash);
}

export function BookCover({
  bookId,
  title,
  author,
  coverPath,
  size = "md",
}: BookCoverProps) {
  const { width, height } = sizeMap[size];
  const fontSize = fontSizeMap[size];

  const gradient = useMemo(() => {
    const idx = hashString(bookId) % gradientPalette.length;
    return gradientPalette[idx];
  }, [bookId]);

  if (coverPath) {
    return (
      <div
        className="relative overflow-hidden rounded-[3px] shrink-0"
        style={{ width, height }}
      >
        <img
          src={`/api/covers/${bookId}`}
          alt={title}
          className="w-full h-full object-cover"
          loading="lazy"
        />
        {/* Spine shadow */}
        <div
          className="absolute inset-y-0 left-0 w-[3px]"
          style={{
            background:
              "linear-gradient(to right, rgba(0,0,0,0.15), transparent)",
          }}
        />
      </div>
    );
  }

  return (
    <div
      className="relative overflow-hidden rounded-[3px] shrink-0 flex flex-col items-center justify-center p-2 text-center"
      style={{
        width,
        height,
        background: `linear-gradient(145deg, ${gradient[0]}, ${gradient[1]})`,
      }}
    >
      <span
        className="font-display font-bold text-white leading-tight line-clamp-3"
        style={{ fontSize: fontSize.title }}
      >
        {title}
      </span>
      {author && (
        <span
          className="font-display italic text-white/70 mt-1 line-clamp-1"
          style={{ fontSize: fontSize.author }}
        >
          {author}
        </span>
      )}
      {/* Spine shadow */}
      <div
        className="absolute inset-y-0 left-0 w-[3px]"
        style={{
          background:
            "linear-gradient(to right, rgba(0,0,0,0.2), transparent)",
        }}
      />
    </div>
  );
}
