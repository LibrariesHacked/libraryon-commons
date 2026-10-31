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
- Prefer spacing and tinted surfaces over grey rules for separating content. Keep neutral line tokens for necessary input, table, and popover boundaries, not as filled backgrounds.
- Use the near-white `--canvas` for the page background, reserve `--wash` for tinted sections and controls, and use white `--paper` surfaces for clear contrast, including the full-width site header.
- Keep `--focus` distinct from decorative brand colors so keyboard focus remains easy to find.
- When changing a surface or its text color, check the contrast in both the default and selected/open states.
