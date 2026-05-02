// Branding constants and shared markup used in PDFs / statements.
// The brand mark is inlined as SVG so the print window doesn't depend
// on bundler-served assets (the new tab gets a fresh document and any
// external <img src=...> would be relative to about:blank).

export const BRAND_NAME = "FluxoConta";
export const BRAND_TAGLINE = "Orçamentos Seguros";
export const BRAND_PRIMARY = "#1d44e8";

/**
 * Inline icon (shield + chart) markup. Square, no wordmark — the wordmark
 * is rendered separately as text alongside the icon so it follows the
 * document's font.
 */
export const BRAND_ICON_SVG = `
<svg viewBox="0 0 200 260" role="img" xmlns="http://www.w3.org/2000/svg" style="height:48px;width:auto;display:block;">
  <defs>
    <linearGradient id="fcPdfShield" x1="0" y1="0" x2="0" y2="1">
      <stop offset="0%" stop-color="#1535c4"/>
      <stop offset="100%" stop-color="#0b1966"/>
    </linearGradient>
    <linearGradient id="fcPdfBar1" x1="0" y1="0" x2="0" y2="1">
      <stop offset="0%" stop-color="#4f83ff"/>
      <stop offset="100%" stop-color="#2a55cc"/>
    </linearGradient>
    <linearGradient id="fcPdfBar2" x1="0" y1="0" x2="0" y2="1">
      <stop offset="0%" stop-color="#6fa0ff"/>
      <stop offset="100%" stop-color="#3b6de0"/>
    </linearGradient>
    <linearGradient id="fcPdfBar3" x1="0" y1="0" x2="0" y2="1">
      <stop offset="0%" stop-color="#96bfff"/>
      <stop offset="100%" stop-color="#5088f0"/>
    </linearGradient>
    <linearGradient id="fcPdfBar4" x1="0" y1="0" x2="0" y2="1">
      <stop offset="0%" stop-color="#bdd5ff"/>
      <stop offset="100%" stop-color="#74a6ff"/>
    </linearGradient>
  </defs>
  <path d="M100,6 L188,46 L188,138 Q188,216 100,248 Q12,216 12,138 L12,46 Z" fill="url(#fcPdfShield)"/>
  <path d="M100,14 L180,52 L180,138 Q180,210 100,240 Q20,210 20,138 L20,52 Z" fill="none" stroke="#3a64f8" stroke-width="1.2" opacity="0.7"/>
  <rect x="42" y="148" width="22" height="24" rx="5" ry="5" fill="url(#fcPdfBar1)"/>
  <rect x="70" y="128" width="22" height="44" rx="5" ry="5" fill="url(#fcPdfBar2)"/>
  <rect x="98" y="104" width="22" height="68" rx="5" ry="5" fill="url(#fcPdfBar3)"/>
  <rect x="126" y="80" width="22" height="92" rx="5" ry="5" fill="url(#fcPdfBar4)"/>
  <polyline points="53,144 81,122 109,98 137,74" fill="none" stroke="#ffffff" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round" opacity="0.9"/>
  <circle cx="53" cy="144" r="4.5" fill="#ffffff" opacity="0.9"/>
  <circle cx="81" cy="122" r="4.5" fill="#ffffff" opacity="0.9"/>
  <circle cx="109" cy="98" r="4.5" fill="#ffffff" opacity="0.9"/>
  <circle cx="137" cy="74" r="5.5" fill="#ffffff"/>
  <path d="M131,68 L143,68 L137,60 Z" fill="#ffffff"/>
</svg>
`;

/**
 * Brand block (icon + wordmark) for PDF/statement headers.
 */
export function brandHeaderBlock(): string {
  return `
    <div style="display:flex;align-items:center;gap:12px;">
      ${BRAND_ICON_SVG}
      <div>
        <h1 style="font-size:28px;font-weight:800;color:${BRAND_PRIMARY};margin-bottom:4px;line-height:1;">${BRAND_NAME}</h1>
        <p style="font-size:12px;color:#6b7280;">${BRAND_TAGLINE}</p>
      </div>
    </div>
  `;
}
