// Re-export Lucide icons with our old names for backward compatibility
export {
  House as HomeIcon,
  BookOpen as BookOpenIcon,
  BarChart3 as BarChartIcon,
  Upload as UploadIcon,
  Download as DownloadIcon,
  Users as UsersIcon,
  Archive as ArchiveIcon,
  Menu as MenuIcon,
  X as XIcon,
  Sun as SunIcon,
  Moon as MoonIcon,
  MoreHorizontal as MoreHorizontalIcon,
  Bookmark as BookmarkIcon,
  Check as CheckIcon,
  CheckCircle as CheckCircleIcon,
  Folder as FolderIcon,
  BookOpen as ReadingIcon,
  BookmarkPlus as BookmarkPlusIcon,
  Star as StarIcon,
  Clock as ClockIcon,
  Heart as HeartIcon,
  Glasses as GlassesIcon,
  Flame as FlameIcon,
  Tag as TagIcon,
  Layers as LayersIcon,
} from "lucide-react";

import type { ReactNode } from "react";
import type { LucideProps } from "lucide-react";
import {
  BookOpen, BookmarkPlus, Star, Clock, CheckCircle, Bookmark,
  Heart, Glasses, Flame, Tag, Layers, Folder, BarChart3,
} from "lucide-react";

// Map of all choosable shelf icons (for the icon picker)
export const SHELF_ICONS: Record<string, React.ComponentType<LucideProps>> = {
  bookmark: Bookmark,
  "book-open": BookOpen,
  "bookmark-plus": BookmarkPlus,
  star: Star,
  clock: Clock,
  "check-circle": CheckCircle,
  heart: Heart,
  glasses: Glasses,
  flame: Flame,
  tag: Tag,
  layers: Layers,
  folder: Folder,
  "bar-chart": BarChart3,
};

/** Render a shelf icon — supports "icon:key" strings, emoji strings, or null (falls back by name) */
export function renderShelfIcon(emoji: string | null | undefined, shelfName: string, size = 18): ReactNode {
  if (emoji?.startsWith("icon:")) {
    const key = emoji.slice(5);
    const IconComponent = SHELF_ICONS[key];
    if (IconComponent) return <IconComponent size={size} />;
  }
  if (emoji) return emoji;
  return getShelfIcon(shelfName, size);
}

/** Translate a default shelf name if it has a translation key */
export function translateShelfName(name: string, t: (key: string) => string): string {
  const keyMap: Record<string, string> = {
    "Currently Reading": "shelf.currentlyReading",
    "Want to Read": "shelf.wantToRead",
    "Favorites": "shelf.favorites",
    "Recently Added": "shelf.recentlyAdded",
    "Finished": "shelf.finished",
  };
  const key = keyMap[name];
  return key ? t(key) : name;
}

/** Map a default shelf name to its icon component */
export function getShelfIcon(shelfName: string, size = 18): ReactNode {
  switch (shelfName) {
    case "Currently Reading": return <BookOpen size={size} />;
    case "Want to Read": return <BookmarkPlus size={size} />;
    case "Favorites": return <Star size={size} />;
    case "Recently Added": return <Clock size={size} />;
    case "Finished": return <CheckCircle size={size} />;
    default: return <Bookmark size={size} />;
  }
}
