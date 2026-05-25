// Minimal Vapi webhook payload types. We only model the fields we use —
// Vapi's payloads have many more fields we don't care about.

export interface VapiCall {
  id: string;
  assistantId?: string;
  phoneNumberId?: string;
  customer?: {
    number?: string;
    name?: string;
  };
  startedAt?: string;
  endedAt?: string;
}

export interface VapiFunctionCallMessage {
  type: "function-call" | "tool-calls";
  call: VapiCall;
  // "function-call" shape (older)
  functionCall?: {
    name: string;
    parameters: Record<string, unknown>;
  };
  // "tool-calls" shape (newer; an array of calls)
  toolCalls?: Array<{
    id: string;
    type: "function";
    function: {
      name: string;
      arguments: string | Record<string, unknown>;
    };
  }>;
}

export interface VapiTranscriptMessage {
  type: "transcript";
  call: VapiCall;
  role: "user" | "assistant";
  transcriptType: "partial" | "final";
  transcript: string;
}

export interface VapiStatusUpdateMessage {
  type: "status-update";
  call: VapiCall;
  status: "queued" | "ringing" | "in-progress" | "forwarding" | "ended";
}

export interface VapiEndOfCallReportMessage {
  type: "end-of-call-report";
  call: VapiCall;
  endedReason?: string;
  summary?: string;
  transcript?: string;
  recordingUrl?: string;
  messages?: Array<{
    role: "user" | "assistant" | "bot" | "system" | "function" | "tool";
    message?: string;
    content?: string;
    time?: number;
    secondsFromStart?: number;
  }>;
  cost?: number;
  costBreakdown?: Record<string, unknown>;
}

export type VapiMessage =
  | VapiFunctionCallMessage
  | VapiTranscriptMessage
  | VapiStatusUpdateMessage
  | VapiEndOfCallReportMessage
  | { type: string; call: VapiCall; [key: string]: unknown };

export interface VapiWebhookPayload {
  message: VapiMessage;
}

export interface VapiToolResult {
  result?: string;
  error?: string;
}
