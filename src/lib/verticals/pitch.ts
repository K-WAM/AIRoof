// What the public demo link (/try/<industry>) leads with, per industry (owner, 2026-10-09: "tailor each product a little
// to appeal to those users" — dental cares about AI answering and booking, dog walkers about scheduling and payment).
// Copy only: every flow step points at a screen that already exists. Record<VerticalId, …> makes tsc fail until a new
// industry writes its pitch.
import type { VerticalId } from "./templates";

export type FlowStep = "call" | "pipeline" | "calendar" | "field" | "invoice" | "paid";

export interface VerticalPitch {
  /** The sandbox business's name — what a prospect sees in the app. */
  demoName: string;
  /** One line under the industry name. */
  headline: string;
  /** Exactly three short benefits, most important first. */
  points: [string, string, string];
  /** The story the demo walks through, in order. */
  flow: FlowStep[];
  /** What to say to the AI on a test call. */
  trySaying: [string, string];
}

const fieldFlow: FlowStep[] = ["call", "calendar", "field", "invoice", "paid"];
const bookingFlow: FlowStep[] = ["call", "pipeline", "calendar"];

export const VERTICAL_PITCH: Record<VerticalId, VerticalPitch> = {
  roofing: {
    demoName: "Apex Roofing (Demo)",
    headline: "Every leak call answered and booked — then quoted, worked and invoiced from the roof.",
    points: ["AI answers 24/7 and books inspections", "Crews update jobs by voice, with photos", "Quote, report and invoice in one place"],
    flow: ["call", "pipeline", "calendar", "field", "invoice", "paid"],
    trySaying: ["My roof is leaking near the chimney.", "Can someone come look at storm damage this week?"],
  },
  hvac: {
    demoName: "CoolBreeze Heating & Air (Demo)",
    headline: "No more missed no-heat calls — booked, dispatched and billed.",
    points: ["AI answers and triages urgent calls 24/7", "Techs log the visit by voice", "Invoice the moment the job is done"],
    flow: fieldFlow,
    trySaying: ["My AC stopped blowing cold air.", "Do you do yearly maintenance plans?"],
  },
  landscaping: {
    demoName: "Greenline Landscaping (Demo)",
    headline: "Book estimates and recurring work while your crews are out mowing.",
    points: ["AI books estimates and recurring service", "Crews log the day by voice", "Invoice straight from the job"],
    flow: fieldFlow,
    trySaying: ["I need weekly lawn care starting next week.", "Can you give me a quote for new sod?"],
  },
  cleaning: {
    demoName: "Sparkle Home Cleaning (Demo)",
    headline: "Book cleans day and night, schedule teams, and get paid.",
    points: ["AI books one-time and recurring cleans", "Teams log the visit by voice", "Invoice and record payment in two taps"],
    flow: fieldFlow,
    trySaying: ["I need a move-out clean on Friday.", "Do you bring your own supplies?"],
  },
  dental: {
    demoName: "Bright Smile Dental (Demo)",
    headline: "Never miss a new patient — the AI answers every call and books the appointment.",
    points: ["Answers every call, after hours too", "Books new patients and same-day emergencies", "Only asks what the front desk needs — no clinical advice"],
    flow: bookingFlow,
    trySaying: ["I'm a new patient and I'd like a cleaning.", "I have a bad toothache — can I be seen today?"],
  },
  "care-homes": {
    demoName: "Willow Gardens Senior Living (Demo)",
    headline: "Every family that calls gets a warm answer and a tour on the calendar.",
    points: ["Books tours and admissions calls 24/7", "Records who is calling and how they heard of you", "Routes urgent and resident calls to live staff — never shares resident details"],
    flow: bookingFlow,
    trySaying: ["I'm looking at assisted living for my mother.", "Can we tour this Saturday?"],
  },
  "property-management": {
    demoName: "Harbor Property Management (Demo)",
    headline: "Maintenance requests captured and routed — emergencies first.",
    points: ["AI takes work orders 24/7", "Emergencies go straight to your on-call", "Vendors scheduled on one calendar"],
    flow: bookingFlow,
    trySaying: ["My kitchen sink is leaking into the unit below.", "When is rent due?"],
  },
  "general-contractors": {
    demoName: "Keystone Builders (Demo)",
    headline: "Every remodel lead answered, estimated and tracked to the final invoice.",
    points: ["AI books estimate visits", "Crews log progress by voice with photos", "Quote, report and invoice per project"],
    flow: ["call", "pipeline", "calendar", "field", "invoice", "paid"],
    trySaying: ["I want a quote for a kitchen remodel.", "Do you pull permits?"],
  },
  electricians: {
    demoName: "Volt Electric (Demo)",
    headline: "Urgent electrical calls answered and booked — no voicemail.",
    points: ["AI triages hazards and books service", "Electricians log work by voice", "Invoice from the job"],
    flow: fieldFlow,
    trySaying: ["Half my outlets stopped working.", "Can you install an EV charger?"],
  },
  "appliance-repair": {
    demoName: "FixRight Appliance Repair (Demo)",
    headline: "Repair calls booked into the right time window, every time.",
    points: ["AI books repair visits 24/7", "Techs note parts and time by voice", "Invoice before you leave the driveway"],
    flow: fieldFlow,
    trySaying: ["My washer won't drain.", "Do you charge for the diagnostic visit?"],
  },
  childcare: {
    demoName: "Little Steps Childcare (Demo)",
    headline: "Parents get answers and a booked consultation — even at night.",
    points: ["AI answers families 24/7", "Books consultations onto your schedule", "Keeps children's details out of the call"],
    flow: bookingFlow,
    trySaying: ["I need a sitter for Friday evenings.", "Are your caregivers background-checked?"],
  },
  daycares: {
    demoName: "Sunshine Daycare (Demo)",
    headline: "Every enrollment call answered and a tour booked.",
    points: ["AI books tours 24/7", "Captures program and start date", "Families get a confirmation right away"],
    flow: bookingFlow,
    trySaying: ["Do you have openings for a toddler?", "Can we tour next Tuesday?"],
  },
  "junk-removal": {
    demoName: "Haul Away Junk Removal (Demo)",
    headline: "Same-day pickups booked while the trucks are rolling.",
    points: ["AI books pickups and estimates volume", "Crews log the load by voice", "Invoice on the spot"],
    flow: fieldFlow,
    trySaying: ["I need a couch and a mattress picked up today.", "How do you price a garage cleanout?"],
  },
  "pet-care": {
    demoName: "Happy Tails Dog Walking (Demo)",
    headline: "Walks booked and scheduled, owners updated, invoices paid — while you're out walking.",
    points: ["AI books walks and meet & greets 24/7", "Schedule walkers on one calendar", "Visit report with photos, then invoice and get paid"],
    flow: ["call", "calendar", "field", "invoice", "paid"],
    trySaying: ["I need someone to walk my dog on weekdays at noon.", "We're new — can we do a meet & greet?"],
  },
};
