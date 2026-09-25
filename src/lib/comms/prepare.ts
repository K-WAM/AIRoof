// Pure helpers that make outbound HTML mail deliverable. Kept out of send.ts so they can be unit-tested
// without a Resend client.
//
// Why this exists: Gmail, Outlook and Apple Mail refuse to render `<img src="data:...">`, so a logo or job
// photo embedded as a base64 data URI arrives as a broken image. The reliable fix is a CID attachment
// (`<img src="cid:...">` + an attachment carrying the same content_id), which every major client renders inline.

export interface InlineAttachment {
  filename: string;
  content: string; // bare base64
  contentType: string;
  contentId: string;
}

const DATA_URI_IMG = /src=(["'])data:image\/(png|jpe?g|gif|webp);base64,([A-Za-z0-9+/=\s]+?)\1/gi;

/** Swap every base64 image data-URI in `html` for a `cid:` reference and return the matching attachments. */
export function extractInlineImages(html: string): { html: string; attachments: InlineAttachment[] } {
  const attachments: InlineAttachment[] = [];
  const seen = new Map<string, string>(); // base64 -> contentId, so a logo repeated in a template ships once
  const out = html.replace(DATA_URI_IMG, (_m, quote: string, ext: string, b64: string) => {
    const clean = b64.replace(/\s+/g, "");
    let cid = seen.get(clean);
    if (!cid) {
      const n = attachments.length + 1;
      cid = `img${n}@luxor`;
      const norm = ext.toLowerCase() === "jpg" ? "jpeg" : ext.toLowerCase();
      seen.set(clean, cid);
      attachments.push({
        filename: `image-${n}.${norm === "jpeg" ? "jpg" : norm}`,
        content: clean,
        contentType: `image/${norm}`,
        contentId: cid,
      });
    }
    return `src=${quote}cid:${cid}${quote}`;
  });
  return { html: out, attachments };
}

/** A readable plain-text alternative. HTML-only mail scores worse with spam filters than multipart mail. */
export function htmlToText(html: string): string {
  return html
    .replace(/<(style|script|head)[\s\S]*?<\/\1>/gi, "")
    .replace(/<img[^>]*alt=(["'])(.*?)\1[^>]*>/gi, "")
    .replace(/<\/(p|div|tr|h[1-6]|li|table)>/gi, "\n")
    .replace(/<br\s*\/?>/gi, "\n")
    .replace(/<\/t[dh]>/gi, "  ")
    .replace(/<[^>]+>/g, "")
    .replace(/&nbsp;/g, " ")
    .replace(/&middot;/g, "·")
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/[ \t]+\n/g, "\n")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
}

/** Parse the bare address out of `Name <addr>` or `addr`. */
export function addressOf(from: string): string {
  const m = from.match(/<([^>]+)>/);
  return (m ? m[1] : from).trim();
}

/**
 * Build the `From` header: the tenant's business name as the display name on the platform's single verified
 * address (recipients see "Apex Roofing", DKIM/SPF/DMARC still align on luxordev.com). Falls back to the
 * configured RESEND_FROM untouched when no tenant name is given.
 */
export function buildFrom(configuredFrom: string, displayName?: string | null): string {
  const name = (displayName ?? "").replace(/[\r\n"<>\\]/g, " ").replace(/\s+/g, " ").trim().slice(0, 60);
  if (!name) return configuredFrom;
  return `"${name}" <${addressOf(configuredFrom)}>`;
}
