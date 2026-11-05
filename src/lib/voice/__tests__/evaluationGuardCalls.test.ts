import { afterEach, describe, expect, it, vi } from "vitest";
import type { BusinessConfig } from "@/types";
import { getVoiceProvider } from "@/lib/voice/provider";
import { EvaluationGuardError } from "@/lib/comms/evaluationGuard";

// Backstop: even if a route forgets the check, neither provider places a call for a business under evaluation —
// and it refuses BEFORE any network request.
describe("outbound calls under the evaluation guard", () => {
  afterEach(() => vi.unstubAllGlobals());

  for (const voiceProvider of ["vapi", "elevenlabs"] as const) {
    it(`${voiceProvider}: refuses a customer number without touching the network`, async () => {
      const fetchMock = vi.fn();
      vi.stubGlobal("fetch", fetchMock);
      const config = {
        businessName: "Eval Co",
        voiceProvider,
        vapiAssistantId: "a",
        vapiPhoneNumberId: "p",
        elevenlabs: { agentId: "agent", phoneNumberId: "phone" },
        outboundEmailAllowlist: ["owner@example.com"],
        outboundPhoneAllowlist: ["+13055550101"],
      } as unknown as BusinessConfig;
      vi.spyOn(console, "warn").mockImplementation(() => {});
      await expect(
        getVoiceProvider(config).startOutboundCall({ config, targetPhone: "+13055550188", metadata: { businessId: "eval" } })
      ).rejects.toBeInstanceOf(EvaluationGuardError);
      expect(fetchMock).not.toHaveBeenCalled();
    });
  }
});
