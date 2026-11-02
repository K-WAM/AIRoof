import { describe, expect, it } from "vitest";
import { fieldResponse } from "./fieldResponse";

const payload = {
  job: { jobId: "J-1", invoiceId: "I-1", quoteId: "Q-1", totalLaborHours: 8,
    parsed: { materials: [{ item: "Tile", quantity: "12", cost: 35 }], labor: [{ description: "Ana", hours: 8, rate: 65 }],
      invoiceSuggestions: [{ description: "Work", unitPrice: 90, total: 90 }] },
    findings: [{ problem: "Cracked tile", lines: [{ description: "Replace", quantity: 12, unitPrice: 4 }] }],
    invoice: { total: 500 }, quote: { subtotal: 400 }, quoteAmount: 400, invoiceTotal: 500,
    customerSubtotal: 400, calculatedSubtotal: 390, balanceDue: 100, pricing: { Tile: 4 }, rates: { roofer: 65 },
  },
  proposedCorrection: { currentTotal: 12, newTotal: 15, oldValue: 3, newValue: 6 },
};

describe("field response price boundary", () => {
  for (const user of [{ uid: "field:b:session", role: "viewer" as const }, { uid: "field:b:legacy", role: "viewer" as const }, { uid: "crew-login", role: "crew" as const }]) {
    it(`removes nested prices for ${user.uid} while preserving quantities, hours and corrections`, () => {
      expect(fieldResponse(payload, user)).toEqual({
        job: { jobId: "J-1", invoiceId: "I-1", quoteId: "Q-1", totalLaborHours: 8,
          parsed: { materials: [{ item: "Tile", quantity: "12" }], labor: [{ description: "Ana", hours: 8 }] },
          findings: [{ problem: "Cracked tile", lines: [{ description: "Replace", quantity: 12 }] }],
        }, proposedCorrection: payload.proposedCorrection,
      });
      expect(payload.job.findings[0].lines[0].unitPrice).toBe(4); // storage/source is untouched
    });
  }
  for (const role of ["owner", "staff", "viewer", "superadmin"] as const) {
    it(`returns the exact original payload for an authorized ${role}`, () => {
      expect(fieldResponse(payload, { uid: "office", role })).toBe(payload);
    });
  }
});
