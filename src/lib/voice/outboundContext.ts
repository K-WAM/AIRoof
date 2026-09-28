// What the phone AI needs to know when WE call the customer (Pipeline "Call Back", the review card's
// "Have the AI phone them to confirm", "AI call back to collect it").
//
// Pure: the outbound route loads the request doc and the tenant config, this module turns them into the
// spoken opener and a prompt section. Without it the agent answered an outbound call with its inbound
// greeting ("Thanks for calling …") and no idea which booking it was calling about.

import type { BusinessConfig } from "@/types";
import { composeGreetingWithDisclosure, resolveRecordingDisclosure } from "@/lib/recordingDisclosure";
import { cleanCallerName } from "@/lib/format/name";

export type OutboundPurpose = "confirm" | "callback";

/** The fields of an appointment or lead doc this module reads. Everything is caller-supplied text. */
export interface OutboundRequestRecord {
  kind: "appointment" | "lead";
  callerName?: string;
  serviceType?: string;
  serviceRequested?: string;
  address?: string;
  startTime?: number;
}

export interface OutboundCallContext {
  firstMessage: string;
  promptSection: string;
}

/** Caller-supplied text goes into a system prompt: one line, bounded length. */
function clean(value: string | undefined, max = 120): string | undefined {
  if (typeof value !== "string") return undefined;
  const text = value.replace(/\s+/g, " ").trim().slice(0, max);
  return text || undefined;
}

export function formatAppointmentTime(startTime: number, timezone: string | undefined): string {
  const tz = timezone || "America/New_York";
  const day = new Date(startTime).toLocaleDateString("en-US", { weekday: "long", month: "long", day: "numeric", timeZone: tz });
  const time = new Date(startTime).toLocaleTimeString("en-US", { hour: "numeric", minute: "2-digit", timeZone: tz });
  return `${day} at ${time}`;
}

export function buildOutboundCallContext(
  config: Pick<BusinessConfig, "businessName" | "agentName" | "timezone" | "recordingDisclosure" | "agentLanguage">,
  purpose: OutboundPurpose,
  record: OutboundRequestRecord | null
): OutboundCallContext {
  const agent = clean(config.agentName, 40) ?? "the receptionist";
  const business = clean(config.businessName, 80) ?? "the office";
  // Older bookings stored "Es Carla Esnaida"; the confirmation call opened with "Hi Es" (2026-09-28).
  const rawName = clean(record?.callerName, 60);
  const name = rawName ? cleanCallerName(rawName) : undefined;
  const firstName = name?.split(" ")[0];
  const service = clean(record?.serviceType ?? record?.serviceRequested, 80);
  const address = clean(record?.address);
  const when = record?.kind === "appointment" && typeof record.startTime === "number" && Number.isFinite(record.startTime)
    ? formatAppointmentTime(record.startTime, config.timezone)
    : undefined;
  const serviceNoun = service ? service.toLowerCase() : "appointment";
  const hello = `Hi${firstName ? ` ${firstName}` : ""}, this is ${agent} from ${business}.`;

  let opener: string;
  let purposeLines: string[];
  if (purpose === "confirm" && when) {
    opener = `${hello} I'm calling to confirm your ${serviceNoun} on ${when}. Does that time still work for you?`;
    purposeLines = [
      `Purpose: the office has CONFIRMED this appointment and asked you to let the customer know.`,
      `- If the time works, thank them, say it is confirmed, say goodbye and end the call (end_call). Don't ask "anything else?" unless they have a question.`,
      `- If they need a different time, follow the move-an-appointment steps (lookupAppointment finds it by their phone number).`,
      `- If they want to cancel, follow the cancel steps.`,
    ];
  } else if (when) {
    opener = `${hello} I'm calling about your ${serviceNoun} request for ${when}. Do you have a minute?`;
    purposeLines = [
      `Purpose: the office asked you to call them back about this appointment request. It is not confirmed yet — do not say it is.`,
      `- Collect anything missing (name, address, what the problem is) and help them exactly as you would a caller who phoned in.`,
    ];
  } else {
    opener = `${hello} I'm returning your call${service ? ` about ${serviceNoun}` : ""}. Do you have a minute?`;
    purposeLines = [
      `Purpose: the office asked you to call them back about their request.`,
      `- Help them exactly as you would a caller who phoned in: answer questions, book with the tools, or take a message with createLead.`,
    ];
  }

  const details = [
    name && `- Name: ${name}`,
    service && `- Service: ${service}`,
    when && `- Appointment: ${when}`,
    address && `- Address: ${address}`,
  ].filter(Boolean);

  const promptSection = [
    `## This call: YOU are calling the customer`,
    `You placed this call; the customer did not call you. Your first sentence has already introduced you and the reason — do not greet them again or ask why they are calling.`,
    ...(details.length > 0 ? [`What the office has on file (the customer's own words from their earlier call):`, ...details] : []),
    ...purposeLines,
    // 2026-09-28: the agent left a message on Carla's voicemail, then asked "Are you still there?" nine times. The
    // shared agent now has voicemail_detection (it plays one short message and hangs up) and end_call.
    `- Voicemail: if you hear a voicemail greeting or answering machine ("leave a message", "after the tone", "not available", a beep), call voicemail_detection straight away — it leaves one short message and hangs up. Never ask whether anyone is there. If that tool is not available, leave one short message (who you are, which business, that you are calling about their ${serviceNoun}, please call this number back) and end the call.`,
    `- If someone other than ${name ?? "the customer"} answers, say you are calling for ${firstName ?? "them"} about an appointment, ask them to have ${firstName ?? "them"} call this number back, thank them and end the call. Do not share the address or other details.`,
  ].join("\n");

  return {
    firstMessage: composeGreetingWithDisclosure(opener, resolveRecordingDisclosure(config)),
    promptSection,
  };
}
