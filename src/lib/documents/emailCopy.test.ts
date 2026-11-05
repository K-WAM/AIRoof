import { it, expect } from "vitest";
import { documentEmailSubject } from "./emailCopy";
it("keeps every document number while limiting header length and removing line breaks", () => {
  for (const kind of ["quote", "invoice", "receipt", "report"] as const) {
    const subject = documentEmailSubject(kind, "Example ".repeat(20) + "\r\nBcc: x", "Long service title ".repeat(50), "INV-123456", "Nov 4, 2026");
    expect(subject.length).toBeLessThanOrEqual(90);
    expect(subject).not.toMatch(/[\r\n<>]/);
    if (kind !== "report") expect(subject).toContain("INV-123456");
  }
});
it("uses familiar document subjects", () => {
  expect(documentEmailSubject("quote", "Example", "Entry service", "Q-7")).toBe("Your quote from Example — Entry service (Q-7)");
  expect(documentEmailSubject("invoice", "Example", "", "INV-7", "Nov 4")).toBe("Your invoice from Example — INV-7, due Nov 4");
});
