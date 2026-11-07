# Brand And Color Guidelines

The site palette lives in `src/styles/foundations/tokens.css`. Use its CSS variables instead of adding local color values so site pages and CMS previews stay consistent.

## Palette

| Token                          | Color                    | Use                                           |
| ------------------------------ | ------------------------ | --------------------------------------------- |
| `--ink`                        | `#1e1a28`                | Main text                                     |
| `--muted`                      | `#615f68`                | Supporting text and metadata                  |
| `--brand-primary`              | `#671e7d`                | Primary actions and brand emphasis            |
| `--brand-link`                 | `#420454`                | Links and action hover states                 |
| `--brand-forest`               | `#0d522b`                | Secondary brand accent and forest hero        |
| `--brand-rose`                 | `#cc808d`                | Small accents, markers, and active navigation |
| `--brand-apricot`              | `#cc8a6c`                | Warm supporting accent and notices            |
| `--brand-berry`                | `#77364b`                | Warm, high-contrast text on rose surfaces     |
| `--paper`                      | `#fff`                   | White surfaces and inverse text               |
| `--canvas`                     | `#fdfbfc`                | Near-white page background                    |
| `--wash`                       | `#fbf2f4`                | Pale rose sections and control states         |
| `--surface-tint-green`         | `#eef5ef`                | Library service panels                        |
| `--surface-tint-rose`          | `#f8edf1`                | Image testimonials                            |
| `--surface-tint-rose-pale`     | `#fbf2f4`                | FAQ group background                          |
| `--surface-tint-apricot`       | `#fbf0e9`                | Standalone quote panels                       |
| `--surface-tint-plum`          | `#fcf5fc`                | Nearby-library controls                       |
| `--surface-tint-plum-selected` | `#f5e6f8`                | Selected nearby-library filters               |
| `--line` / `--line-strong`     | `#d2d1d4` / `#bcbabf`    | Quiet boundaries for controls and data        |
| `--line-plum-soft`             | `#e7d2ec`                | Nearby-library control boundary               |
| `--line-rose-soft`             | `#e6c0c8`                | Subtle card hover boundary                    |
| `--focus`                      | `#6495ed`                | Functional keyboard focus indicator           |
| `--lightbox-overlay`           | `rgba(30, 26, 40, 0.82)` | Modal image viewer backdrop                   |

## Pairing Rules

- Use `--ink` for body text and `--muted` only for secondary information.
- Use `--brand-primary` for filled primary actions; use `--brand-link` for links and hover states.
- Keep `--brand-forest`, `--brand-rose`, and `--brand-apricot` as accents. Avoid placing saturated brand colors next to one another without a clear role.
- Choose one tinted surface per component and pair it with `--ink` or a dark text token. In particular, do not pair plum text with a green tint.
- Avoid thin borders and grey dividing rules across content sections. Prefer generous spacing and solid block tinted backgrounds to separate sections and controls.
- Reserve light-coloured borders (such as 3px `--surface-tint-rose`) for exceptional cases where visual bounding is required, such as the interactive map (`.library-map`), matching the soft rose tint used on hero tags and testimonials.
- Avoid color clashes on hover: when hovering elements on rose or wash surfaces (such as library listings), use harmonious plum tints (`--surface-tint-plum-selected` with inset `--brand-primary`), never green on rose.
- Use the near-white `--canvas` for the page background, reserve `--wash` for tinted sections and controls, and use white `--paper` surfaces for clear contrast, including the full-width site header.
- Keep `--focus` distinct from decorative brand colors so keyboard focus remains easy to find.
- When changing a surface or its text color, check the contrast in both the default and selected/open states.
- Use normal titlecase or sentence case for all labels, badges, pills, and buttons (e.g. *Today*, *Now*, *Open now*). All-uppercase text (`text-transform: uppercase`) is never used anywhere across the site.

## Standardized Pills, Badges, and Chips

To maintain a cohesive visual identity without visual clutter or arbitrary borders, the site uses a limited set of standardized pill badges and chips:

1. **Primary / Plum Pill** (`.distance-badge`, `.filter-badge`, `.facility-chip--service`):
   - Surface: `var(--surface-tint-plum-selected)` or `var(--surface-tint-plum)`
   - Foreground: `var(--brand-link)` or `var(--brand-primary)`
   - Border: `0` (solid block tint)
   - Use: Distance badges, active filters, core library services, and selected filter states.

2. **Rose / Berry Pill** (`.hero-tag`, `.live-status-pill.is-closed`):
   - Surface: `var(--surface-tint-rose)`
   - Foreground: `var(--brand-berry)` with `var(--brand-primary)` icon
   - Border: `0` (solid block tint)
   - Use: Hero metadata pills (country, library operating model, service count) and closed status indicators.

3. **Green / Forest Status Pill** (`.live-status-pill.is-open`, `.facility-chip--accessibility`):
   - Surface: `var(--surface-tint-green)`
   - Foreground: `var(--brand-forest)`
   - Border: `0` (solid block tint)
   - Use: Live open status ("Open now") and accessibility feature chips.

4. **Apricot / Warm Notice Pill** (`.facility-chip--colocated`):
   - Surface: `var(--surface-tint-apricot)`
   - Foreground: `var(--brand-apricot)` or `var(--ink)`
   - Border: `0` (solid block tint)
   - Use: Co-located community services and warm notices.

All pills and chips share:
- Border radius: `999px` for pill badges; `var(--card-radius)` (8px) for feature chips.
- No thin or grey borders (`border: 0`). Block tinted backgrounds only.
- Standardized padding (`0.35rem 0.85rem` for pills, `0.45rem 0.8rem` for chips).
- Titlecase / sentence case text only: all-uppercase styling is strictly forbidden.
