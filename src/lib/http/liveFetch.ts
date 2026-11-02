/** Component-owned memory only. Keys include tenant and filters; errors never replace a good cached response.
 * A periodic full read also recovers from an old writer that forgot to bump updatedAt on a non-latest document.
 */
export function createLiveFetch(fetchImpl: typeof fetch = fetch) {
  const cache = new Map<string, { version: string; data: unknown; loadedAt: number }>();
  return async (url: string): Promise<Response> => {
    const hit = cache.get(url);
    const separator = url.includes("?") ? "&" : "?";
    const version = hit && Date.now() - hit.loadedAt < 5 * 60_000 ? hit.version : "";
    const response = await fetchImpl(`${url}${separator}pollVersion=${encodeURIComponent(version)}`, { cache: "no-store" });
    if (!response.ok) return response;
    const data = await response.clone().json();
    if (data.unchanged && hit) return Response.json(hit.data);
    if (typeof data.pollVersion === "string") {
      if (cache.size >= 50 && !cache.has(url)) cache.delete(cache.keys().next().value!);
      cache.set(url, { version: data.pollVersion, data, loadedAt: Date.now() });
    }
    return response;
  };
}
