import { describe, expect, it } from "vitest";
import { distinctLines } from "../demoLineDisplay";
import type { PhoneLineView } from "@/types/phoneLine";

const line = (lineId: string, e164: string, status: PhoneLineView["status"]): PhoneLineView => ({
  lineId, e164, status, businessId: "demo-roofing", display: e164,
  country: "US", label: "Demo", purpose: "demo", nextStep: "",
  sms: { status: "not_configured", purposes: [], isDefaultSender: false },
});

describe("Demo Studio line display", () => {
  it("shows a duplicated number once and uses its most advanced status", () => {
    const result = distinctLines([
      line("older", "+16892042643", "draft"),
      line("canada", "+17789079769", "connected"),
      line("newer", "+16892042643", "live"),
    ]);
    expect(result).toHaveLength(2);
    expect(result[0]).toMatchObject({ records: 2, line: { lineId: "newer", status: "live" } });
  });
});
