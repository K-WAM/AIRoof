// Tour-based industries (care homes, daycares) in the demo: the shared seed's calls are written for "send someone to
// an address", which reads wrong to an admissions director. This swaps in calls that sound like their front desk —
// a family booking a tour, a hospital discharge in a hurry, and the call that sells the product: someone asking about
// a resident/child, and the AI refusing to say anything while getting them to a person. Requests also carry the
// intake the AI captures (who is calling, how they heard of you), so the Pipeline shows it. Roofing and every other
// industry keep the shared seed untouched.
import type { DemoCallTurn, DemoSeed } from "./demoSeed";
import { VERTICAL_TEMPLATES, type VerticalId } from "./templates";

type TourVertical = "care-homes" | "daycares";
type CallScript = { summary: string; outcome?: DemoSeed["calls"][number]["outcome"]; callerName?: string; turns: Array<[DemoCallTurn["role"], string]> };

// Keyed by the shared seed's deterministic call ids, so "This call produced" links keep pointing at the same requests.
const CALLS: Record<TourVertical, Record<string, CallScript>> = {
  "care-homes": {
    call_demo_1: { summary: "Independent living tour booked for a couple.", turns: [
      ["caller", "Hi, my wife and I are starting to look at independent living. Could we come and see the community?"],
      ["agent", "We'd love to show you around. Who's calling, and is the tour for the two of you?"],
      ["caller", "Jordan Blake. Yes, both of us. We found you online."],
      ["agent", "Thank you, Jordan. I've booked your tour with our Admissions Director for tomorrow at 9 and sent the confirmation."],
    ] },
    call_demo_2: { summary: "Assisted living for a parent — referred by the hospital; admissions to call back about openings and rates.", turns: [
      ["caller", "Hello, the discharge planner at the hospital gave me your number. I'm looking at assisted living for my mother."],
      ["agent", "I'm glad you called. Can I take your name and the best number to reach you?"],
      ["caller", "Priya Shah, this number. What does it cost, and do you have a room?"],
      ["agent", "Rates and openings depend on the room and care level, so I can't quote them, but I've asked admissions to call you back today with both."],
    ] },
    call_demo_3: { summary: "Memory care tour booked with the Memory Care Liaison.", turns: [
      ["caller", "Hi, we're looking at memory care for my father. Can we visit?"],
      ["agent", "Of course. I'll book you with our Memory Care Liaison, who can answer care questions in person. What day suits you?"],
      ["caller", "Marcus Lee. Any weekday morning."],
      ["agent", "Thank you, Marcus. You're booked for tomorrow at 11, and the confirmation is on its way."],
    ] },
    call_demo_4: { summary: "After-hours tour request — booked, waiting for your confirmation.", outcome: "escalated", turns: [
      ["agent", "Thanks for calling — this is Elena. Admissions is closed, but I can still help."],
      ["caller", "I know it's late. My dad leaves the hospital next week and we need assisted living fast. This is Dana Cole."],
      ["agent", "I'm sorry you're juggling that, Dana. I can request a tour now and mark it urgent for admissions. What's a good email for the confirmation?"],
      ["caller", "dana.cole@example.com. As early as possible, please."],
      ["agent", "Done. I've requested the earliest tour and flagged it for admissions first thing in the morning."],
    ] },
    call_demo_5: { summary: "Caller asked how a resident is doing — nothing shared; sent to the nursing station.", outcome: "escalated", callerName: "Caller about a resident", turns: [
      ["caller", "Hi, my aunt lives there, room 12. Can you tell me how she's doing today?"],
      ["agent", "I understand you're worried. I can't share or confirm anything about residents over the phone, but I can put you through to the nursing station now."],
      ["caller", "Okay, yes please."],
      ["agent", "Connecting you now. If it's an emergency, please call 911."],
    ] },
    call_demo_6: { summary: "Independent living tour — next-day slot booked.", turns: [
      ["caller", "Can I come and look around today or tomorrow? I'm thinking about moving in myself."],
      ["agent", "Absolutely. May I have your name?"],
      ["caller", "Tom Becker. A friend of mine lives there and loves it."],
      ["agent", "That's lovely to hear, Tom. I've booked your tour for tomorrow at 1:30."],
    ] },
    call_demo_7: { summary: "Asked about Medicaid and costs — admissions consultation requested.", turns: [
      ["caller", "Do you take Medicaid or long-term care insurance?"],
      ["agent", "Admissions confirms payment options for each family — I can't guarantee coverage on the phone. Shall I set up a call with them?"],
      ["caller", "Yes. Lena Park, this number."],
      ["agent", "Thank you, Lena. Admissions will call you to go through costs and coverage."],
    ] },
    call_demo_8: { summary: "Assisted living tour for next week confirmed.", turns: [
      ["caller", "Hi, I'd like to book an assisted living tour next week for my mom and me."],
      ["agent", "Happy to. Your name, please?"],
      ["caller", "Owen Grant."],
      ["agent", "Thank you, Owen. You're booked, and I've sent the confirmation by text."],
    ] },
  },
  daycares: {
    call_demo_1: { summary: "Center tour booked for a toddler.", turns: [
      ["caller", "Hi, we just moved here and need daycare for our two-year-old. Can we see the center?"],
      ["agent", "Welcome! I can book a tour with our director. May I have your name?"],
      ["caller", "Jordan Blake. Mornings are best."],
      ["agent", "Thank you, Jordan. You're booked for tomorrow at 9, and the confirmation is on its way."],
    ] },
    call_demo_2: { summary: "Infant room opening — added to the waitlist; director to call back.", turns: [
      ["caller", "Do you have any openings in the infant room? I go back to work in March."],
      ["agent", "The infant room fills quickly. I can add you to the waitlist and have the director call you. Your name and number?"],
      ["caller", "Priya Shah, this number."],
      ["agent", "Thank you, Priya. You're on the waitlist, and the director will call you about openings and tuition."],
    ] },
    call_demo_3: { summary: "Infant/toddler program tour booked.", turns: [
      ["caller", "Hi, what's your infant program like? Could I visit?"],
      ["agent", "The best way to see it is a tour with our Infant Room Lead. What day works?"],
      ["caller", "Marcus Lee. Any weekday."],
      ["agent", "Great, Marcus. You're booked for tomorrow at 11."],
    ] },
    call_demo_4: { summary: "After-hours tour request — booked, waiting for your confirmation.", outcome: "escalated", turns: [
      ["agent", "Thanks for calling — this is Wren. The center is closed, but I can still help."],
      ["caller", "Our sitter just quit and I need full-time care soon. This is Dana Cole."],
      ["agent", "That's stressful — let's get you in quickly. I can request a tour now. What's a good email for the confirmation?"],
      ["caller", "dana.cole@example.com."],
      ["agent", "Done. I've requested the earliest tour and flagged it for the director in the morning."],
    ] },
    call_demo_5: { summary: "Caller asked about a child and pickup — nothing shared; sent to the director.", outcome: "escalated", callerName: "Caller about a child", turns: [
      ["caller", "Hi, is Leo there today? I'm his uncle and I'd like to pick him up early."],
      ["agent", "I can't confirm whether any child is here, and pickups are only arranged with staff in person. I'll put you through to the director now."],
      ["caller", "Oh — okay."],
      ["agent", "Connecting you now."],
    ] },
    call_demo_6: { summary: "Center tour — next-day slot booked.", turns: [
      ["caller", "Can we tour today or tomorrow? We need something by next month."],
      ["agent", "Sure. Your name, please?"],
      ["caller", "Tom Becker. A neighbor recommended you."],
      ["agent", "Thank you, Tom. You're booked for tomorrow at 1:30."],
    ] },
    call_demo_7: { summary: "Pre-K and after-school questions — director to call back.", turns: [
      ["caller", "Do you have a Pre-K program, and after-school for next year?"],
      ["agent", "We do. The director can go through the programs and tuition. May I take your name?"],
      ["caller", "Lena Park, this number."],
      ["agent", "Thank you, Lena. The director will call you back."],
    ] },
    call_demo_8: { summary: "Tour next week confirmed.", turns: [
      ["caller", "I'd like to book a tour next week for my daughter, she's three."],
      ["agent", "Happy to. Your name, please?"],
      ["caller", "Owen Grant."],
      ["agent", "Thank you, Owen. You're booked, and I've sent the confirmation."],
    ] },
  },
};

// What the AI captured on each request — select options copied from the template's intake fields (a test pins that
// every value is a real option, so a template edit cannot leave the demo showing an answer the AI could never give).
const CARE_HOME_INTAKE: Array<Record<string, string>> = [
  { "community-type": "Assisted living community", "calling-for": "A parent", "referral-source": "Hospital or doctor", "desired-start-date": "Within a month" },
  { "community-type": "Memory care community", "calling-for": "A parent", "referral-source": "Online search" },
  { "community-type": "Independent living community", "calling-for": "Myself", "referral-source": "Friend or family", "room-preference": "One bedroom" },
  { "community-type": "Not sure yet", "calling-for": "A spouse or partner", "referral-source": "Placement agency" },
  { "community-type": "Assisted living community", "calling-for": "A hospital, doctor or agency", "referral-source": "Hospital or doctor" },
];
const DAYCARE_INTAKE: Array<Record<string, string>> = [
  { "child-age-range": "Infant (0–12 months)", program: "Full-time", "desired-start-date": "March" },
  { "child-age-range": "Pre-K (4–5 years)", program: "After-school" },
  { "child-age-range": "Toddler (1–2 years)", program: "Full-time", "desired-start-date": "Next month" },
  { "child-age-range": "Preschool (3–4 years)", program: "Part-time" },
  { "child-age-range": "Toddler (1–2 years)", program: "Part-time" },
];
export const TOUR_INTAKE: Record<TourVertical, Array<Record<string, string>>> = { "care-homes": CARE_HOME_INTAKE, daycares: DAYCARE_INTAKE };

export function isTourVertical(verticalId: VerticalId): verticalId is TourVertical {
  return verticalId === "care-homes" || verticalId === "daycares";
}

/** Rewrites the shared seed for a tour industry; returns it unchanged for every other industry. */
export function tailorTourSeed(verticalId: VerticalId, seed: DemoSeed): DemoSeed {
  if (!isTourVertical(verticalId)) return seed;
  const scripts = CALLS[verticalId];
  const intake = TOUR_INTAKE[verticalId];
  const intro: [DemoCallTurn["role"], string] = ["agent", `Thanks for calling — this is ${VERTICAL_TEMPLATES[verticalId].agentName}. How can I help?`];
  return {
    ...seed,
    calls: seed.calls.map((call) => {
      const script = scripts[call.callId];
      if (!script) return call;
      return {
        ...call,
        summary: script.summary,
        outcome: script.outcome ?? call.outcome,
        callerName: script.callerName ?? call.callerName,
        messages: (script.turns[0][0] === "agent" ? script.turns : [intro, ...script.turns]).map(([role, text]) => ({ role, text })),
      };
    }),
    leads: seed.leads.map((lead, i) => ({ ...lead, intake: intake[i % intake.length] })),
    appointments: seed.appointments.map((appt, i) => ({ ...appt, intake: intake[i % intake.length] })),
  };
}
