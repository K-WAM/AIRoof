import { describe, expect, it, vi } from "vitest";

import { loadBusinesses } from "@/app/admin/businesses/loadBusinesses";
import { PageError } from "@/components/ui/PageError";

describe("admin businesses truthful loading", () => {
  it("keeps an injected fetch failure distinct from an empty-success result", async () => {
    const fetchImpl = vi.fn(async () =>
      new Response(JSON.stringify({ error: "unavailable" }), {
        status: 503,
        headers: { "Content-Type": "application/json" },
      })
    ) as unknown as typeof fetch;

    const result = await loadBusinesses(fetchImpl);

    expect(result).toEqual({ status: "error" });
    expect("businesses" in result).toBe(false);

    const errorState = PageError({ message: "Businesses could not be loaded." });
    expect(errorState.props.role).toBe("alert");
  });
});
