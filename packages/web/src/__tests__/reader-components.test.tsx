import { describe, it, expect, vi } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";
import { ReaderTopBar } from "@/components/reader/reader-top-bar";
import { ReaderBottomBar } from "@/components/reader/reader-bottom-bar";
import { TapZones } from "@/components/reader/tap-zones";
import { SettingsPanel } from "@/components/reader/settings-panel";
import type { ReaderSettings } from "@/hooks/use-epub-reader";

const defaultSettings: ReaderSettings = {
  fontSize: 16,
  fontFamily: "serif",
  lineSpacing: "normal",
  margins: "normal",
  theme: "dark",
  flow: "paginated",
};

describe("ReaderTopBar", () => {
  it("renders title and buttons", () => {
    render(
      <ReaderTopBar
        title="Test Book"
        visible={true}
        onClose={vi.fn()}
        onToggleSidebar={vi.fn()}
        onToggleSettings={vi.fn()}
        onToggleBookmark={vi.fn()}
        isBookmarked={false}
      />
    );
    expect(screen.getByText("Test Book")).toBeInTheDocument();
    expect(screen.getByText("✕")).toBeInTheDocument();
    expect(screen.getByText("☰")).toBeInTheDocument();
    expect(screen.getByText("⚙")).toBeInTheDocument();
  });

  it("calls onClose when close button is clicked", () => {
    const onClose = vi.fn();
    render(
      <ReaderTopBar
        title="Test"
        visible={true}
        onClose={onClose}
        onToggleSidebar={vi.fn()}
        onToggleSettings={vi.fn()}
        onToggleBookmark={vi.fn()}
        isBookmarked={false}
      />
    );
    fireEvent.click(screen.getByText("✕"));
    expect(onClose).toHaveBeenCalledOnce();
  });

  it("calls onToggleSidebar when TOC button is clicked", () => {
    const onToggleSidebar = vi.fn();
    render(
      <ReaderTopBar
        title="Test"
        visible={true}
        onClose={vi.fn()}
        onToggleSidebar={onToggleSidebar}
        onToggleSettings={vi.fn()}
        onToggleBookmark={vi.fn()}
        isBookmarked={false}
      />
    );
    fireEvent.click(screen.getByText("☰"));
    expect(onToggleSidebar).toHaveBeenCalledOnce();
  });

  it("calls onToggleSettings when settings button is clicked", () => {
    const onToggleSettings = vi.fn();
    render(
      <ReaderTopBar
        title="Test"
        visible={true}
        onClose={vi.fn()}
        onToggleSidebar={vi.fn()}
        onToggleSettings={onToggleSettings}
        onToggleBookmark={vi.fn()}
        isBookmarked={false}
      />
    );
    fireEvent.click(screen.getByText("⚙"));
    expect(onToggleSettings).toHaveBeenCalledOnce();
  });

  it("hides with opacity when not visible", () => {
    const { container } = render(
      <ReaderTopBar
        title="Test"
        visible={false}
        onClose={vi.fn()}
        onToggleSidebar={vi.fn()}
        onToggleSettings={vi.fn()}
        onToggleBookmark={vi.fn()}
        isBookmarked={false}
      />
    );
    const bar = container.firstElementChild as HTMLElement;
    expect(bar.style.opacity).toBe("0");
    expect(bar.style.pointerEvents).toBe("none");
  });
});

describe("ReaderBottomBar", () => {
  it("shows percentage", () => {
    render(<ReaderBottomBar percentage={42} visible={true} />);
    expect(screen.getByText("42%")).toBeInTheDocument();
  });

  it("renders progress bar at correct width", () => {
    const { container } = render(<ReaderBottomBar percentage={75} visible={true} />);
    const fill = container.querySelector('[style*="width: 75%"]');
    expect(fill).toBeInTheDocument();
  });

  it("hides when not visible", () => {
    const { container } = render(<ReaderBottomBar percentage={50} visible={false} />);
    const bar = container.firstElementChild as HTMLElement;
    expect(bar.style.opacity).toBe("0");
  });
});

describe("TapZones", () => {
  it("calls onPrev when left zone is clicked", () => {
    const onPrev = vi.fn();
    render(<TapZones onPrev={onPrev} onNext={vi.fn()} onCenter={vi.fn()} />);
    fireEvent.click(screen.getByLabelText("Previous page"));
    expect(onPrev).toHaveBeenCalledOnce();
  });


  it("calls onNext when right zone is clicked", () => {
    const onNext = vi.fn();
    render(<TapZones onPrev={vi.fn()} onNext={onNext} onCenter={vi.fn()} />);
    fireEvent.click(screen.getByLabelText("Next page"));
    expect(onNext).toHaveBeenCalledOnce();
  });
});

describe("SettingsPanel", () => {
  it("renders all setting groups when open", () => {
    render(
      <SettingsPanel
        settings={defaultSettings}
        open={true}
        onClose={vi.fn()}
        onUpdate={vi.fn()}
      />
    );
    expect(screen.getByText("Reader Settings")).toBeInTheDocument();
    expect(screen.getByText("Font")).toBeInTheDocument();
    expect(screen.getByText("Line Spacing")).toBeInTheDocument();
    expect(screen.getByText("Margins")).toBeInTheDocument();
    expect(screen.getByText("Theme")).toBeInTheDocument();
    expect(screen.getByText("View Mode")).toBeInTheDocument();
  });

  it("calls onUpdate when font family is changed", () => {
    const onUpdate = vi.fn();
    render(
      <SettingsPanel
        settings={defaultSettings}
        open={true}
        onClose={vi.fn()}
        onUpdate={onUpdate}
      />
    );
    fireEvent.click(screen.getByText("Sans"));
    expect(onUpdate).toHaveBeenCalledWith({ fontFamily: "sans-serif" });
  });

  it("calls onUpdate when theme is changed", () => {
    const onUpdate = vi.fn();
    render(
      <SettingsPanel
        settings={defaultSettings}
        open={true}
        onClose={vi.fn()}
        onUpdate={onUpdate}
      />
    );
    fireEvent.click(screen.getByText("Sepia"));
    expect(onUpdate).toHaveBeenCalledWith({ theme: "sepia" });
  });

  it("calls onUpdate when line spacing is changed", () => {
    const onUpdate = vi.fn();
    render(
      <SettingsPanel
        settings={defaultSettings}
        open={true}
        onClose={vi.fn()}
        onUpdate={onUpdate}
      />
    );
    fireEvent.click(screen.getByText("Relaxed"));
    expect(onUpdate).toHaveBeenCalledWith({ lineSpacing: "relaxed" });
  });

  it("calls onUpdate when margins are changed", () => {
    const onUpdate = vi.fn();
    render(
      <SettingsPanel
        settings={defaultSettings}
        open={true}
        onClose={vi.fn()}
        onUpdate={onUpdate}
      />
    );
    fireEvent.click(screen.getByText("Wide"));
    expect(onUpdate).toHaveBeenCalledWith({ margins: "wide" });
  });

  it("calls onUpdate when view mode is changed", () => {
    const onUpdate = vi.fn();
    render(
      <SettingsPanel
        settings={defaultSettings}
        open={true}
        onClose={vi.fn()}
        onUpdate={onUpdate}
      />
    );
    fireEvent.click(screen.getByText("Scrolling"));
    expect(onUpdate).toHaveBeenCalledWith({ flow: "scrolled" });
  });

  it("calls onClose when backdrop is clicked", () => {
    const onClose = vi.fn();
    const { container } = render(
      <SettingsPanel
        settings={defaultSettings}
        open={true}
        onClose={onClose}
        onUpdate={vi.fn()}
      />
    );
    // Backdrop is the first child (bg-black/40 div)
    const backdrop = container.querySelector(".bg-black\\/40");
    expect(backdrop).toBeInTheDocument();
    fireEvent.click(backdrop!);
    expect(onClose).toHaveBeenCalledOnce();
  });

  it("highlights active settings", () => {
    render(
      <SettingsPanel
        settings={{ ...defaultSettings, fontFamily: "sans-serif" }}
        open={true}
        onClose={vi.fn()}
        onUpdate={vi.fn()}
      />
    );
    const sansButton = screen.getByText("Sans");
    expect(sansButton.style.color).toContain("var(--warm)");
  });
});
