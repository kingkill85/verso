# Design System

Verso's visual identity is warm, literary, and intentional. It draws from the feeling of a well-curated personal bookshelf — not a tech dashboard.

## Design Principles

1. **Literary, not technical** — The UI should feel like a bookstore or a reading nook, not a file manager. Book covers are the hero. Serif headings, warm tones, soft shadows.
2. **Book-first navigation** — The book detail page is a full-screen experience (like a Spotify artist page), not a modal or sidebar. It's the centerpiece of the app.
3. **Quiet confidence** — Minimal chrome, generous whitespace, no visual clutter. The interface recedes so the content (your books) can shine.
4. **Dark mode native** — Dark mode is the default and the primary design target. Light mode is a well-crafted alternative, not an afterthought.

## Typography

### Font Stack

| Role | Font | Fallback | Usage |
|------|------|----------|-------|
| Display / Headings | Libre Baskerville | Georgia, serif | Page titles, book titles, section headings |
| Body / UI | Outfit | -apple-system, sans-serif | Navigation, labels, metadata, buttons, body text |

### Scale

| Token | Size | Weight | Font | Usage |
|-------|------|--------|------|-------|
| `display-lg` | 28px | 700 | Libre Baskerville | Book page title |
| `display-md` | 26px | 700 | Libre Baskerville | Library page title |
| `heading` | 16px | 700 | Libre Baskerville | Section headings ("Continue Reading", "Details") |
| `body` | 14px | 400 | Outfit | Default body text |
| `body-sm` | 13px | 400 | Outfit | Book metadata, secondary info |
| `caption` | 12px | 400 | Outfit | Authors, dates, muted text |
| `label` | 11px | 500 | Outfit | Tags, badges, form labels |
| `micro` | 10px | 500 | Outfit | Section labels, uppercase UI elements |

### Typography Rules

- Book titles always use Libre Baskerville, bold
- Author names use Libre Baskerville, italic
- Book descriptions use Libre Baskerville, italic, muted color
- All UI elements (buttons, navigation, metadata) use Outfit
- Uppercase + letter-spacing (1.5px) for section labels only (e.g., "SHELVES", "DETAILS")

## Color System

### Dark Mode (Default)

| Token | Value | Usage |
|-------|-------|-------|
| `--bg` | `#12110f` | App background |
| `--surface` | `#1b1915` | Cards, topbar, panels |
| `--card` | `#23201b` | Elevated surfaces, inputs |
| `--border` | `#2e2a24` | Borders, dividers |
| `--text` | `#e8e2d8` | Primary text |
| `--text-dim` | `#968f82` | Secondary text, authors |
| `--text-faint` | `#5c564d` | Muted text, placeholders |
| `--warm` | `#c08b5c` | Accent — buttons, links, progress bars, active states |
| `--warm-hover` | `#d49b6a` | Accent hover state |
| `--warm-glow` | `rgba(192,139,92,0.08)` | Accent background tint (active sidebar item, hover) |
| `--green` | `#6ba078` | Success — completed badge, finished indicator |
| `--progress-bg` | `#2e2a24` | Progress bar track |
| `--sidebar-bg` | `#17150f` | Sidebar background (slightly darker than bg) |

### Light Mode

| Token | Value | Usage |
|-------|-------|-------|
| `--bg` | `#f6f1ea` | App background |
| `--surface` | `#ffffff` | Cards, topbar, panels |
| `--card` | `#f0ebe3` | Elevated surfaces, inputs |
| `--border` | `#e0d8cc` | Borders, dividers |
| `--text` | `#2a2520` | Primary text |
| `--text-dim` | `#8a8078` | Secondary text |
| `--text-faint` | `#b0a898` | Muted text |
| `--warm` | `#a06830` | Accent |
| `--warm-hover` | `#b47838` | Accent hover |
| `--warm-glow` | `rgba(160,104,48,0.06)` | Accent background tint |
| `--green` | `#4a8a5a` | Success |
| `--progress-bg` | `#e0d8cc` | Progress bar track |
| `--sidebar-bg` | `#eee8df` | Sidebar background |

### Book Cover Palette

Book covers use a set of 12 rich gradient palettes, assigned by book ID. Each palette has:
- `bg`: Two-tone gradient for the cover background
- `accent`: Text color for title and author on the cover
- `dark`: Deep tone used for the book page hero gradient

The covers are designed to look like cloth-bound hardcovers with decorative lines, centered typography, and a spine shadow on the left edge. When real cover art is available (from metadata enrichment), it replaces the generated cover entirely.

## Layout

### App Shell

```
┌──────────┬─────────────────────────────────┐
│          │  Top Bar                         │
│          │  [☰] [🔍 Search...    ] [☀️/🌙]  │
│ Sidebar  ├─────────────────────────────────┤
│          │                                  │
│ Shelves  │  Content Area                    │
│ list     │  (scrollable)                    │
│          │                                  │
│          │  - Library grid                  │
│ ──────── │  - Book page (full view)         │
│ Import   │  - Reader (full screen)          │
│ New Shelf│  - Settings                      │
│ Settings │                                  │
└──────────┴─────────────────────────────────┘
```

- **Sidebar**: 256px wide, fixed. Contains brand, shelf list, and footer actions.
- **Top bar**: Sticky. Contains hamburger (mobile), search, and theme toggle.
- **Content area**: Scrollable. Renders the active page.

### Responsive Breakpoints

| Breakpoint | Sidebar | Layout Changes |
|-----------|---------|---------------|
| ≥1024px (desktop) | Visible, static | Full grid, side-by-side layouts |
| 768–1023px (tablet) | Hidden, overlay | Slightly smaller grid |
| <768px (mobile) | Hidden, slide-in overlay | Stacked layouts, smaller covers, book page hero stacks vertically and centers |

On mobile, the sidebar opens via hamburger menu and overlays the content with a semi-transparent backdrop.

## Key Pages

### Library View
- Header: shelf name + emoji, book count, stats summary
- "Continue Reading" section (only on "All Books"): horizontal cards with mini covers, title, progress bar
- Book grid: auto-fill grid of book covers, min column width 135px, 22px gap
- Each book cell: cover, title (2-line clamp), author, star rating

### Book Page (Full View)
This is the most important page. It replaces the content area (not a modal).

- **Hero section**: Full-width gradient background derived from book cover palette. Contains:
  - Back button ("← Library")
  - Large book cover (160×240px)
  - Title (display-lg), author (italic), star rating, genre/year/page tags
  - Primary action button (pill-shaped): "Continue Reading" / "Start Reading" / "Read Again"
  - Bookmark and more-options icon buttons
- **Progress section** (if currently reading): card with progress bar, page count, pages remaining
- **Completed section** (if finished): green-tinted card with checkmark
- **About section**: book description in italic serif
- **Details section**: 2-column grid of metadata cards (publisher, year, language, ISBN, date added)
- **Similar books**: horizontal scroll row of small covers from same genre/author

### Reader View
- Full-screen (hides sidebar and topbar)
- Minimal reader chrome:
  - Top: book title (subtle), close button
  - Bottom: progress bar, page indicator
  - Side: tap zones for page turn
- Settings panel (slide-in): font size, font family, line spacing, theme (light/dark/sepia), margins
- Table of contents panel (slide-in from left)
- Long-press for highlight/annotate

### Settings Page
- Profile section: display name, avatar, email
- Authentication: password change, OIDC link/unlink
- API Keys: list, create, revoke
- Appearance: theme preference (dark/light/system)
- Import/Export: library backup, OPDS settings

## Components

### BookCover
The generated cover component for books without real cover art:
- Aspect ratio: 2:3
- Rich gradient background from the palette
- Spine shadow (left edge, 6px gradient from dark to transparent)
- Decorative horizontal lines (top and bottom, subtle accent color, 25% opacity)
- Title: centered, serif, bold, accent color, max 3 lines with ellipsis
- Divider: small centered line (20px)
- Author: centered, sans-serif, light weight, accent color at 60% opacity

Available sizes:
| Context | Width | Height |
|---------|-------|--------|
| Grid cell | 120px | 176px |
| Reading card (mini) | 52px | 76px |
| Book page hero | 160px | 240px |
| Similar row | 90px | 132px |
| OPDS thumbnail | 80px | 120px |

### Progress Bar
- Track: `--progress-bg` color, rounded
- Fill: `--warm` color, rounded, animated width transition (0.6s ease)
- Thin variant (3–4px): on book covers, reading cards
- Standard variant (6px): on book page progress section

### Tags/Badges
- Pill-shaped: `border-radius: 20px`
- Background: `rgba(255,255,255,0.06)` dark / `rgba(0,0,0,0.04)` light
- Border: `1px solid var(--border)`
- Text: `--text-dim`, 12px
- Used for: genre, year, page count, format

### Buttons
- **Primary (CTA)**: `--warm` background, white text, pill-shaped (`border-radius: 24px`), 14px, font-weight 600. Hover: scale 1.02 + lighter shade.
- **Secondary**: `--card` background, `--text-dim` text, `1px solid var(--border)`. Hover: border lightens.
- **Icon button**: 42px circle, subtle background, `--text-dim`. Hover: text brightens.
- **Ghost**: No background, `--text-dim` text. Hover: `--warm-glow` background.

### Sidebar Item
- Padding: 10px 22px
- Text: 13.5px, `--text-dim`
- Active: `--warm` text, `--warm-glow` background, font-weight 500
- Hover: `--text` color, `--warm-glow` background
- Emoji icon: 16px, 22px fixed width
- Count badge: right-aligned, 11px, 60% opacity

### Search Input
- 10px vertical padding, 38px left padding (room for icon)
- `--card` background, `--border` border
- Focus: `--warm` border
- Placeholder: `--text-faint`
- Border radius: 10px

## Animation

- **Page transitions**: 0.3s fade-in (`opacity: 0 → 1`)
- **Card entrance**: Staggered fade-up (`translateY(8px) → 0`, 0.4s ease, 0.03s delay per card)
- **Hover lift**: `translateY(-6px)` on book cards, `translateY(-2px)` on reading cards, 0.25s ease
- **Progress bars**: Width transition 0.6s ease
- **Sidebar slide**: `translateX(-100%) → 0`, 0.3s ease (mobile)
- **Theme switch**: CSS variables change instantly (no transition on theme toggle — feels snappier)

## Iconography

The app uses emoji for icons throughout:
- Shelf icons: user-selectable emoji
- UI actions: 🔍 search, ☀️/🌙 theme, ☰ menu, 📤 import, ⚙ settings
- Status: ✓ completed badge, ▶ reading action

For future iterations, consider migrating to Lucide icons for a more polished look while keeping emoji as an option for shelf personalization.
