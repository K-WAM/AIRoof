import type { ParsedUpdate } from "@/types/jobs";

/**
 * The fully worked roofing job seeded into `demo-roofing` (DEMO-READINESS-PLAN.md §3 D3,
 * consumed by D1 step 4). Field updates are relative to seed time via `minutesAgo`.
 */
export interface WorkedJobSeed {
  title: string;
  clientName: string;
  /** +1305555xxxx — reserved for fictional use. */
  clientPhone: string;
  /** @example.com — reserved for fictional use. */
  clientEmail: string;
  /** South Florida address. */
  address: string;
  /** One of the roofing `approvedServices`. */
  serviceType: string;
  /** The caller's reason, as the AI captured it. */
  notes: string;
  updates: Array<{
    rawText: string;
    submittedBy: string;
    minutesAgo: number;
    language: "en" | "es";
    rawTextEn?: string;
    parsed: ParsedUpdate;
  }>;
  /** Every id must exist in `WORK_CATALOG_STARTER.roofing`. */
  findingItemIds: string[];
}

export const ROOFING_WORKED_JOB: WorkedJobSeed = {
  title: "Roof inspection — 1420 Palm Way, Fort Lauderdale",
  clientName: "Maria Ortega",
  clientPhone: "+13055550142",
  clientEmail: "maria.ortega@example.com",
  address: "1420 Palm Way, Fort Lauderdale, FL 33304",
  serviceType: "Roof inspection",
  notes:
    "Caller says she has six cracked tiles on the south slope and the vent pipe boot looks split. She wants an inspection and repair before the next storm.",
  updates: [
    {
      rawText: "Marco arrived on site at 8 this morning.",
      submittedBy: "Marco",
      minutesAgo: 360,
      language: "en",
      parsed: {
        timeline: [{ time: "8:00 AM", description: "Marco arrived on site." }],
        materials: [],
        labor: [],
        issues: [],
        invoiceSuggestions: [],
      },
    },
    {
      rawText:
        "Encontré seis tejas quebradas en la pendiente sur y el collarín del tubo de ventilación está partido.",
      rawTextEn:
        "I found six cracked tiles on the south slope, and the vent pipe boot is split.",
      submittedBy: "Marco",
      minutesAgo: 300,
      language: "es",
      parsed: {
        timeline: [
          { description: "Walked the south slope and checked the vent penetration." },
        ],
        materials: [],
        labor: [],
        issues: [
          {
            description: "Six cracked tiles on the south slope.",
            severity: "medium",
            resolution: "Replace the damaged tiles with matching pieces and re-bed them.",
          },
          {
            description: "Split pipe boot at the vent penetration.",
            severity: "high",
            resolution: "Replace the pipe boot flashing and seal the joint.",
          },
        ],
        invoiceSuggestions: [],
        transcriptEn:
          "I found six cracked tiles on the south slope, and the vent pipe boot is split.",
        sourceLanguage: "es",
      },
    },
    {
      rawText:
        "Marco left the site at 11, three hours on the inspection. The customer wants a quote for the tiles and the pipe boot.",
      submittedBy: "Marco",
      minutesAgo: 180,
      language: "en",
      parsed: {
        timeline: [
          { time: "11:00 AM", description: "Inspection finished; the customer asked for a quote for the tiles and the pipe boot." },
        ],
        materials: [],
        labor: [
          {
            description: "Marco",
            hours: 3,
            arrivalTime: "8:00 AM",
            departureTime: "11:00 AM",
          },
        ],
        issues: [],
        invoiceSuggestions: [],
      },
    },
  ],
  findingItemIds: ["starter-roofing-tile-cracked", "starter-roofing-flashing-pipe-collar"],
};
