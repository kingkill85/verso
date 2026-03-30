import { useRef, useState, useEffect, useCallback } from "react";
import { getAccessToken } from "@/lib/auth";

export type ReaderSettings = {
  fontSize: number;
  fontFamily: "serif" | "sans-serif" | "dyslexic";
  lineSpacing: "compact" | "normal" | "relaxed";
  margins: "narrow" | "normal" | "wide";
  theme: "light" | "dark" | "sepia";
  flow: "paginated" | "scrolled";
};

const DEFAULT_SETTINGS: ReaderSettings = {
  fontSize: 16,
  fontFamily: "serif",
  lineSpacing: "normal",
  margins: "normal",
  theme: "dark",
  flow: "paginated",
};

const SETTINGS_KEY = "verso-reader-settings";

function loadSettings(): ReaderSettings {
  try {
    const stored = localStorage.getItem(SETTINGS_KEY);
    if (stored) return { ...DEFAULT_SETTINGS, ...JSON.parse(stored) };
  } catch {}
  return DEFAULT_SETTINGS;
}

function saveSettings(settings: ReaderSettings) {
  localStorage.setItem(SETTINGS_KEY, JSON.stringify(settings));
}

const FONT_MAP: Record<ReaderSettings["fontFamily"], string> = {
  serif: "'Libre Baskerville', Georgia, serif",
  "sans-serif": "'Outfit', -apple-system, sans-serif",
  dyslexic: "'OpenDyslexic', sans-serif",
};

const LINE_HEIGHT_MAP: Record<ReaderSettings["lineSpacing"], string> = {
  compact: "1.4",
  normal: "1.7",
  relaxed: "2.0",
};

const MARGIN_MAP: Record<ReaderSettings["margins"], string> = {
  narrow: "20px",
  normal: "60px",
  wide: "120px",
};

const THEME_MAP: Record<ReaderSettings["theme"], { color: string; background: string }> = {
  light: { color: "#2a2520", background: "#f6f1ea" },
  dark: { color: "#e8e2d8", background: "#12110f" },
  sepia: { color: "#5b4636", background: "#f4ecd8" },
};

export type TocItem = {
  id?: string;
  label: string;
  href: string;
  subitems?: TocItem[];
};

type UseReaderOptions = {
  bookId: string;
  initialCfi?: string | null;
  initialPercentage?: number | null;
  enabled?: boolean;
};

function buildStylesheet(s: ReaderSettings): string {
  const theme = THEME_MAP[s.theme];
  return `
    @namespace epub "http://www.idpf.org/2007/ops";
    @font-face {
      font-family: "OpenDyslexic";
      src: url("https://cdn.jsdelivr.net/npm/open-dyslexic@1.0.3/woff/OpenDyslexic-Regular.woff") format("woff");
      font-weight: 400; font-style: normal; font-display: swap;
    }
    @font-face {
      font-family: "OpenDyslexic";
      src: url("https://cdn.jsdelivr.net/npm/open-dyslexic@1.0.3/woff/OpenDyslexic-Bold.woff") format("woff");
      font-weight: 700; font-style: normal; font-display: swap;
    }
    @font-face {
      font-family: "OpenDyslexic";
      src: url("https://cdn.jsdelivr.net/npm/open-dyslexic@1.0.3/woff/OpenDyslexic-Italic.woff") format("woff");
      font-weight: 400; font-style: italic; font-display: swap;
    }
    html, body {
      color: ${theme.color} !important;
      background: ${theme.background} !important;
      font-family: ${FONT_MAP[s.fontFamily]} !important;
      font-size: ${s.fontSize}px !important;
      line-height: ${LINE_HEIGHT_MAP[s.lineSpacing]} !important;
    }
  `;
}

export function useReader({ bookId, initialCfi, initialPercentage, enabled = true }: UseReaderOptions) {
  const containerRef = useRef<HTMLDivElement>(null);
  const viewRef = useRef<any>(null);

  const [isLoaded, setIsLoaded] = useState(false);
  const [settingsVersion, setSettingsVersion] = useState(0);
  const [currentCfi, setCurrentCfi] = useState<string | null>(initialCfi ?? null);
  const [percentage, setPercentage] = useState(0);
  const [toc, setToc] = useState<TocItem[]>([]);
  const [currentChapter, setCurrentChapter] = useState("");
  const [settings, setSettingsState] = useState<ReaderSettings>(loadSettings);

  const currentCfiRef = useRef<string | null>(initialCfi ?? null);
  useEffect(() => {
    currentCfiRef.current = currentCfi;
  }, [currentCfi]);

  useEffect(() => {
    if (!containerRef.current || !enabled) return;

    let cancelled = false;
    const container = containerRef.current;

    async function init() {
      // Dynamic import to avoid SSR issues with Web Components
      const { makeBook } = await import("@/lib/foliate/view.js");
      const { Overlayer } = await import("@/lib/foliate/overlayer.js");

      // Fetch book file
      const token = getAccessToken();
      const response = await fetch(`/api/books/${bookId}/file`, {
        headers: token ? { Authorization: `Bearer ${token}` } : {},
      });
      if (!response.ok || cancelled) return;
      const blob = await response.blob();
      if (cancelled) return;

      // Create view element
      const view = document.createElement("foliate-view") as any;
      container.appendChild(view);
      viewRef.current = view;

      // Open book
      const book = await makeBook(blob);
      await view.open(book);
      if (cancelled) return;

      // Set TOC
      if (book.toc) {
        setToc(book.toc);
      }

      // Apply settings
      const s = loadSettings();
      view.renderer.setAttribute("flow", s.flow === "scrolled" ? "scrolled" : "paginated");
      view.renderer.setAttribute("margin", MARGIN_MAP[s.margins]);
      view.renderer.setStyles(buildStylesheet(s));

      // Handle relocate events
      view.addEventListener("relocate", (e: any) => {
        if (cancelled) return;
        const { cfi, fraction, tocItem } = e.detail;
        if (cfi) {
          setCurrentCfi(cfi);
          currentCfiRef.current = cfi;
        }
        setPercentage(Math.round((fraction ?? 0) * 100));
        if (tocItem?.label) {
          setCurrentChapter(tocItem.label.trim());
        }
      });

      // Handle annotation drawing
      view.addEventListener("draw-annotation", (e: any) => {
        const { draw, annotation } = e.detail;
        const color = annotation?.color || "yellow";
        const colorMap: Record<string, string> = {
          yellow: "rgba(250,204,21,0.4)",
          green: "rgba(34,197,94,0.4)",
          blue: "rgba(59,130,246,0.35)",
          pink: "rgba(236,72,153,0.35)",
        };
        draw(Overlayer.highlight, { color: colorMap[color] || colorMap.yellow });
      });

      // Navigate to initial position
      if (initialCfi) {
        await view.init({ lastLocation: initialCfi });
      } else if (initialPercentage && initialPercentage > 0) {
        // kosync-synced position — use percentage
        await view.goToFraction(initialPercentage / 100);
      } else {
        await view.init({ showTextStart: true });
      }

      if (!cancelled) setIsLoaded(true);
    }

    init();

    return () => {
      cancelled = true;
      if (viewRef.current) {
        viewRef.current.close?.();
        viewRef.current.remove();
        viewRef.current = null;
      }
      container.innerHTML = "";
    };
  }, [bookId, initialCfi, initialPercentage, enabled]);

  const nextPage = useCallback(() => {
    viewRef.current?.next();
  }, []);

  const prevPage = useCallback(() => {
    viewRef.current?.prev();
  }, []);

  const goTo = useCallback((target: string) => {
    viewRef.current?.goTo(target);
  }, []);

  const addAnnotation = useCallback((cfi: string, color?: string) => {
    viewRef.current?.addAnnotation({ value: cfi, color: color || "yellow" });
  }, []);

  const removeAnnotation = useCallback((cfi: string) => {
    viewRef.current?.deleteAnnotation({ value: cfi });
  }, []);

  const updateSettings = useCallback((partial: Partial<ReaderSettings>) => {
    setSettingsVersion((v) => v + 1);
    setSettingsState((prev) => {
      const next = { ...prev, ...partial };
      saveSettings(next);

      const view = viewRef.current;
      if (view?.renderer) {
        view.renderer.setStyles(buildStylesheet(next));
        view.renderer.setAttribute("margin", MARGIN_MAP[next.margins]);

        if (partial.flow && partial.flow !== prev.flow) {
          view.renderer.setAttribute("flow", next.flow === "scrolled" ? "scrolled" : "paginated");
        }
      }

      return next;
    });
  }, []);

  return {
    containerRef,
    viewRef,
    isLoaded,
    currentCfi,
    percentage,
    toc,
    currentChapter,
    settings,
    nextPage,
    prevPage,
    goTo,
    addAnnotation,
    removeAnnotation,
    updateSettings,
    settingsVersion,
  };
}
