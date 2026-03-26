import { useRef, useState, useEffect, useCallback } from "react";
import ePub, { type Book, type Rendition, type NavItem } from "epubjs";
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
  dyslexic: "'OpenDyslexic', 'Comic Sans MS', sans-serif",
};

const LINE_HEIGHT_MAP: Record<ReaderSettings["lineSpacing"], number> = {
  compact: 1.4,
  normal: 1.7,
  relaxed: 2.0,
};

const MARGIN_MAP: Record<ReaderSettings["margins"], number> = {
  narrow: 20,
  normal: 60,
  wide: 120,
};

const THEME_MAP: Record<ReaderSettings["theme"], { body: Record<string, string> }> = {
  light: { body: { color: "#2a2520", background: "#f6f1ea" } },
  dark: { body: { color: "#e8e2d8", background: "#12110f" } },
  sepia: { body: { color: "#5b4636", background: "#f4ecd8" } },
};

type UseEpubReaderOptions = {
  bookId: string;
  initialCfi?: string | null;
  enabled?: boolean;
};

export function useEpubReader({ bookId, initialCfi, enabled = true }: UseEpubReaderOptions) {
  const containerRef = useRef<HTMLDivElement>(null);
  const bookRef = useRef<Book | null>(null);
  const renditionRef = useRef<Rendition | null>(null);

  const [isLoaded, setIsLoaded] = useState(false);
  const [settingsVersion, setSettingsVersion] = useState(0);
  const [currentCfi, setCurrentCfi] = useState<string | null>(initialCfi ?? null);
  const [percentage, setPercentage] = useState(0);
  const [toc, setToc] = useState<NavItem[]>([]);
  const [currentChapter, setCurrentChapter] = useState("");
  const [settings, setSettingsState] = useState<ReaderSettings>(loadSettings);

  const applyStyles = useCallback((rendition: Rendition, s: ReaderSettings) => {
    const themeStyles = THEME_MAP[s.theme];
    rendition.themes.override("color", themeStyles.body.color);
    rendition.themes.override("background", themeStyles.body.background);
    rendition.themes.override("font-family", FONT_MAP[s.fontFamily]);
    rendition.themes.override("font-size", `${s.fontSize}px`);
    rendition.themes.override("line-height", `${LINE_HEIGHT_MAP[s.lineSpacing]}`);
  }, []);

  // Use a ref for currentCfi so updateSettings always reads the latest value
  const currentCfiRef = useRef<string | null>(initialCfi ?? null);
  useEffect(() => {
    currentCfiRef.current = currentCfi;
  }, [currentCfi]);

  useEffect(() => {
    if (!containerRef.current || !enabled) return;

    let cancelled = false;
    const container = containerRef.current;

    async function init() {
      const token = getAccessToken();
      const response = await fetch(`/api/books/${bookId}/file`, {
        headers: token ? { Authorization: `Bearer ${token}` } : {},
      });
      if (!response.ok || cancelled) return;
      const arrayBuffer = await response.arrayBuffer();
      if (cancelled) return;

      const book = ePub(arrayBuffer);
      bookRef.current = book;
      await book.opened;
      if (cancelled) return;

      const rendition = book.renderTo(container, {
        width: "100%",
        height: "100%",
        flow: loadSettings().flow === "scrolled" ? "scrolled" : "paginated",
        spread: "none",
        allowScriptedContent: true,
      });
      renditionRef.current = rendition;

      const s = loadSettings();
      applyStyles(rendition, s);
      rendition.themes.override("padding", `0 ${MARGIN_MAP[s.margins]}px`);

      const nav = await book.loaded.navigation;
      if (!cancelled) setToc(nav.toc);

      if (initialCfi) {
        await rendition.display(initialCfi);
      } else {
        await rendition.display();
      }

      if (!cancelled) setIsLoaded(true);

      function onRelocated(location: any) {
        if (cancelled) return;
        const cfi = location.start?.cfi;
        if (cfi) {
          setCurrentCfi(cfi);
          currentCfiRef.current = cfi;
        }

        const pct = book.locations
          ? Math.round((location.start?.percentage ?? 0) * 100)
          : 0;
        setPercentage(pct);

        const currentHref = location.start?.href;
        if (currentHref && nav.toc) {
          const chapter = nav.toc.find(
            (item: NavItem) => currentHref.includes(item.href.split("#")[0])
          );
          if (chapter) setCurrentChapter(chapter.label.trim());
        }
      }

      rendition.on("relocated", onRelocated);
      // Store handler for reuse on flow change
      (bookRef.current as any)._onRelocated = onRelocated;

      await book.locations.generate(1024);
      if (renditionRef.current && !cancelled) {
        const currentLocation = renditionRef.current.currentLocation();
        if (currentLocation) {
          const pct = Math.round(
            ((currentLocation as any).start?.percentage ?? 0) * 100
          );
          setPercentage(pct);
        }
      }
    }

    init();

    return () => {
      cancelled = true;
      if (renditionRef.current) {
        renditionRef.current.destroy();
        renditionRef.current = null;
      }
      if (bookRef.current) {
        bookRef.current.destroy();
        bookRef.current = null;
      }
      container.innerHTML = "";
    };
  }, [bookId, initialCfi, applyStyles, enabled]);

  const nextPage = useCallback(() => {
    renditionRef.current?.next();
  }, []);

  const prevPage = useCallback(() => {
    renditionRef.current?.prev();
  }, []);

  const goTo = useCallback((href: string) => {
    renditionRef.current?.display(href);
  }, []);

  const updateSettings = useCallback((partial: Partial<ReaderSettings>) => {
    setSettingsVersion((v) => v + 1);
    setSettingsState((prev) => {
      const next = { ...prev, ...partial };
      saveSettings(next);

      const rendition = renditionRef.current;
      if (rendition) {
        applyStyles(rendition, next);
        rendition.themes.override("padding", `0 ${MARGIN_MAP[next.margins]}px`);

        if (partial.flow && partial.flow !== prev.flow) {
          const cfiValue = currentCfiRef.current;
          const container = containerRef.current;
          if (container && bookRef.current) {
            rendition.destroy();
            const newRendition = bookRef.current.renderTo(container, {
              width: "100%",
              height: "100%",
              flow: next.flow === "scrolled" ? "scrolled" : "paginated",
              spread: "none",
              allowScriptedContent: true,
            });
            renditionRef.current = newRendition;
            applyStyles(newRendition, next);
            newRendition.themes.override("padding", `0 ${MARGIN_MAP[next.margins]}px`);
            // Re-register relocated handler on new rendition
            const onRelocated = (bookRef.current as any)._onRelocated;
            if (onRelocated) newRendition.on("relocated", onRelocated);
            if (cfiValue) {
              newRendition.display(cfiValue);
            } else {
              newRendition.display();
            }
          }
        }
      }

      return next;
    });
  }, [applyStyles]);

  return {
    containerRef,
    renditionRef,
    isLoaded,
    currentCfi,
    percentage,
    toc,
    currentChapter,
    settings,
    nextPage,
    prevPage,
    goTo,
    updateSettings,
    settingsVersion,
  };
}
