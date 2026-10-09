import type { WorkedJobSeed } from "./demoSeedRoofing";

/**
 * The worked dog-walking visit seeded into the pet-care demo: the walker's visit report (one English note, one
 * Spanish), already read by the AI, with the walk on it as a priced line — so "Next: send the invoice" is one tap.
 * "30-minute walk" matches the starter price list, so the invoice fills in its price.
 */
export const PET_CARE_WORKED_VISIT: WorkedJobSeed & { status: string } = {
  title: "30-minute walk — Bella",
  clientName: "Emma Brooks",
  clientPhone: "+13055550188",
  clientEmail: "emma.brooks@example.com",
  address: "742 Sunset Dr, Coral Gables, FL 33143",
  serviceType: "Dog walks (30 or 60 minutes)",
  notes: "Caller wants a midday walk for Bella (golden retriever) on weekdays. Lockbox code is in the client notes.",
  status: "complete",
  findingItemIds: [],
  updates: [
    {
      rawText: "Walked Bella 30 minutes around the park. She peed and pooped, drank water, and the back door is locked.",
      submittedBy: "Sam",
      minutesAgo: 120,
      language: "en",
      parsed: {
        timeline: [
          { time: "12:00 PM", description: "Picked up Bella; 30-minute walk around the park." },
          { description: "Pee and poop, fresh water, back door locked." },
        ],
        materials: [{ item: "30-minute walk", quantity: "1", unit: "visit" }],
        labor: [{ description: "Sam — walk", hours: 0.5 }],
        issues: [],
        invoiceSuggestions: [],
      },
    },
    {
      rawText: "Bella comió su comida y le dejé agua fresca. Está tranquila.",
      rawTextEn: "Bella ate her food and I left her fresh water. She's calm.",
      submittedBy: "Sam",
      minutesAgo: 100,
      language: "es",
      parsed: {
        timeline: [{ description: "Fed Bella and left fresh water; she's settled." }],
        materials: [],
        labor: [],
        issues: [],
        invoiceSuggestions: [],
      },
    },
  ],
};
