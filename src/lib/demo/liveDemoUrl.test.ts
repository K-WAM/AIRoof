import { describe, expect, it } from "vitest";
import { liveDemoUrl } from "./liveDemoUrl";

describe("public live-demo scheduling link", () => {
  it.each(["http://calendly.com/luxor/demo", "javascript:alert(1)", "https://calendly.com.evil.test/demo", "https://user:pass@calendly.com/demo", "invalid"])("rejects unsafe/unexpected scheduling destinations: %s", (url) => {
    expect(liveDemoUrl(url)).toBe("https://luxordev.com/demo?source=airoof");
  });
  it("uses the existing scheduler until an actual Calendly event is configured", () => {
    expect(liveDemoUrl("")).toBe("https://luxordev.com/demo?source=airoof");
    expect(liveDemoUrl("https://calendly.com/example/demo")).toBe("https://calendly.com/example/demo");
  });
});
