import { describe, expect, it } from "vitest";
import { productForApiPath, productsOf } from "./products";

describe("products", () => {
  it("missing means ON (every existing client keeps everything); only an explicit false turns one off", () => {
    expect(productsOf(undefined)).toEqual({ calls: true, field: true, billing: true });
    expect(productsOf({ products: { calls: false } })).toEqual({ calls: false, field: true, billing: true });
  });

  it("billing needs Jobs & field input (invoices belong to jobs)", () => {
    expect(productsOf({ products: { field: false, billing: true } })).toEqual({ calls: true, field: false, billing: false });
  });

  it("maps every product-owned API path, and leaves shared ones alone", () => {
    expect(productForApiPath("/api/jobs/J-1/invoice")).toBe("billing");
    expect(productForApiPath("/api/jobs/J-1/invoice/send")).toBe("billing");
    expect(productForApiPath("/api/company/billing")).toBe("billing");
    expect(productForApiPath("/api/jobs/J-1/field-audio")).toBe("field");
    expect(productForApiPath("/api/jobs")).toBe("field");
    expect(productForApiPath("/api/timeclock/punch")).toBe("field");
    expect(productForApiPath("/api/jobs/from-request")).toBe("calls");
    expect(productForApiPath("/api/calls/c1")).toBe("calls");
    expect(productForApiPath("/api/businesses/b/appointments/a1")).toBe("calls");
    expect(productForApiPath("/api/businesses/b/leads")).toBe("calls");
    for (const shared of ["/api/company/settings", "/api/company/team", "/api/company/customers", "/api/company/bootstrap", "/api/company/library"]) {
      expect(productForApiPath(shared)).toBeNull();
    }
  });
});
