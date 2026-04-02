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

export type TextSelection = {
  range: Range;
  doc: Document;
  index: number;
  pos: { x: number; y: number };
};

type UseReaderOptions = {
  bookId: string;
  format?: "epub" | "pdf";
  initialCfi?: string | null;
  initialPercentage?: number | null;
  enabled?: boolean;
  onTextSelect?: (selection: TextSelection | null) => void;
  onTap?: (zone: "prev" | "next" | "center") => void;
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
    }
    * {
      color: inherit !important;
      font-family: ${FONT_MAP[s.fontFamily]} !important;
      font-size: ${s.fontSize}px !important;
      line-height: ${LINE_HEIGHT_MAP[s.lineSpacing]} !important;
      -webkit-text-fill-color: inherit !important;
    }
  `;
}

export function useReader({ bookId, format = "epub", initialCfi, initialPercentage, enabled = true, onTextSelect, onTap }: UseReaderOptions) {
  const containerRef = useRef<HTMLDivElement>(null);
  const viewRef = useRef<any>(null);
  // Track annotations so we can re-apply them when foliate-js loads new sections
  const annotationsMapRef = useRef<Map<string, string>>(new Map());
  const onTextSelectRef = useRef(onTextSelect);
  onTextSelectRef.current = onTextSelect;
  const onTapRef = useRef(onTap);
  onTapRef.current = onTap;

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

      // Convert Blob to File — foliate-js checks file.name for format detection
      const isPDF = format === "pdf";
      const file = new File(
        [blob],
        isPDF ? "book.pdf" : "book.epub",
        { type: isPDF ? "application/pdf" : "application/epub+zip" },
      );

      // Create view element
      const view = document.createElement("foliate-view") as any;
      container.appendChild(view);
      viewRef.current = view;

      // Open book
      const book = await makeBook(file);
      await view.open(book);
      if (cancelled) return;

      // Set TOC
      if (book.toc) {
        setToc(book.toc);
      }

      // Apply settings (skip for PDFs — canvas-rendered, styles don't apply)
      if (!isPDF) {
        const s = loadSettings();
        view.renderer.setAttribute("flow", s.flow === "scrolled" ? "scrolled" : "paginated");
        view.renderer.setAttribute("margin", MARGIN_MAP[s.margins]);
        view.renderer.setStyles(buildStylesheet(s));
      }

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

      // Handle annotation drawing — foliate-js emits this when addAnnotation resolves to a loaded section
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

      // Text selection — register on each section's document via load event
      view.addEventListener("load", (e: any) => {
        const doc = e.detail?.doc;
        const index = e.detail?.index ?? -1;
        if (!doc) return;
        doc.addEventListener("pointerup", () => {
          const sel = doc.getSelection();
          if (!sel || sel.isCollapsed || !sel.toString().trim()) {
            onTextSelectRef.current?.(null);
            return;
          }
          const range = sel.getRangeAt(0);
          const rect = range.getBoundingClientRect();
          const iframe = doc.defaultView?.frameElement as HTMLIFrameElement | null;
          const iframeRect = iframe?.getBoundingClientRect();
          const x = (iframeRect?.left ?? 0) + rect.left + rect.width / 2;
          const y = (iframeRect?.top ?? 0) + rect.top - 10;
          onTextSelectRef.current?.({ range, doc, index, pos: { x, y } });
        });
        doc.addEventListener("click", (e: MouseEvent) => {
          const sel = doc.getSelection?.();
          if (sel && sel.toString().trim().length > 0) return;
          const iframe = doc.defaultView?.frameElement as HTMLIFrameElement | null;
          const iframeRect = iframe?.getBoundingClientRect();
          const absoluteX = (iframeRect?.left ?? 0) + e.clientX;
          const relX = absoluteX / window.innerWidth;
          if (relX < 0.25) onTapRef.current?.("prev");
          else if (relX > 0.75) onTapRef.current?.("next");
          else onTapRef.current?.("center");
        });
      });

      // Re-apply all tracked annotations when a new section's overlayer is created.
      // Use requestAnimationFrame because the overlayer isn't attached to the
      // renderer yet when create-overlay fires — #getOverlayer would return null.
      view.addEventListener("create-overlay", () => {
        requestAnimationFrame(() => {
          for (const [cfi, color] of annotationsMapRef.current) {
            view.addAnnotation({ value: cfi, color });
          }
        });
      });

      // Navigate to initial position
      try {
        if (initialCfi) {
          await view.init({ lastLocation: initialCfi });
        } else if (initialPercentage && initialPercentage > 0) {
          await view.goToFraction(initialPercentage / 100);
        } else {
          await view.init({});
        }
      } catch (e) {
        console.warn("Failed to navigate to initial position, falling back to start", e);
        try { await view.init({}); } catch { /* ok */ }
      }

      if (!cancelled) setIsLoaded(true);
    }

    init();

    return () => {
      cancelled = true;
      if (viewRef.current) {
        try { viewRef.current.close?.(); } catch { /* renderer may not be initialized */ }
        try { viewRef.current.remove(); } catch { /* ok */ }
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

  const getCFI = useCallback((index: number, range: Range): string | null => {
    try {
      return viewRef.current?.getCFI(index, range) ?? null;
    } catch { return null; }
  }, []);

  const addAnnotation = useCallback((cfi: string, color?: string) => {
    const c = color || "yellow";
    annotationsMapRef.current.set(cfi, c);
    viewRef.current?.addAnnotation({ value: cfi, color: c });
  }, []);

  const removeAnnotation = useCallback((cfi: string) => {
    annotationsMapRef.current.delete(cfi);
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
    isPDF: format === "pdf",
    currentCfi,
    percentage,
    toc,
    currentChapter,
    settings,
    nextPage,
    prevPage,
    goTo,
    getCFI,
    addAnnotation,
    removeAnnotation,
    updateSettings,
    settingsVersion,
  };
}
