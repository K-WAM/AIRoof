Luxor CRM overview: a two-page, US Letter sales PDF with editable, self-contained HTML.
Re-render from the repository root: `node docs/sales/render.cjs` (uses the installed Playwright Chromium; prints backgrounds).
Review PDF pages: `pdftoppm -r 120 -png docs/sales/luxor-crm-overview.pdf docs/sales/luxor-crm-overview`.
