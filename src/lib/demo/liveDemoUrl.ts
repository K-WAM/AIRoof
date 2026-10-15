const DEFAULT_LIVE_DEMO_URL = "https://luxordev.com/demo?source=airoof";

/** A public scheduling page only; never put contact details into the URL. */
export function liveDemoUrl(value = process.env.LIVE_DEMO_BOOKING_URL): string {
  if (!value) return DEFAULT_LIVE_DEMO_URL;
  try {
    const url = new URL(value);
    if (url.protocol === "https:" && !url.username && !url.password &&
        ["calendly.com", "www.calendly.com", "luxordev.com", "www.luxordev.com"].includes(url.hostname)) return url.href;
  } catch { /* Use the verified public Luxor scheduler for invalid configuration. */ }
  return DEFAULT_LIVE_DEMO_URL;
}
