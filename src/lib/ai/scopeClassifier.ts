// Deterministic scope classifier — rejects off-topic BEFORE model call
import type { BusinessConfig, ScopeClassification } from "@/types";

const OFF_TOPIC_PATTERNS = [
  /stock\s+market|crypto|bitcoin|stocks|investments?|etf|mutual\s+fund/i,
  /\bpolitics?|election|president|congress|senate|parliament/i,
  /\bmedical\s+advice|diagnosis|disease|prescription|medication|treatment/i,
  /\blegal\s+advice|lawsuit|attorney|law|contract|copyright/i,
  /\bfinancial\s+advice|tax|irs|accounting|mortgage|loan/i,
  /\bgeneral\s+news|current\s+events|latest\s+news|today's\s+news/i,
  /\bsports|football|basketball|soccer|baseball|hockey/i,
  /\bentertainment|movies?|tv\s+show|celebrity|actor|actress|music/i,
  /\brelationship\s+advice|dating|marriage|divorce|affair/i,
  /\bcoding|programming|software|development|algorithm|javascript/i,
  /\bgeneral\s+knowledge|trivia|how\s+do\s+i\s+[\w\s]+\?/i,
];

const ALLOWED_SERVICE_PATTERNS = [
  /schedule|book|appointment|time|when|available|call\s+back|urgent|emergency/i,
  /service|repair|install|maintenance|inspect|estimate|quote|price/i,
  /open|hours|location|address|service\s+area|coverage|zone/i,
  /existing|confirm|reschedule|cancel|modify|change/i,
  /message|tell|let\s+know|inform|update|notify/i,
];

export function classifyMessage(
  message: string,
  businessConfig: BusinessConfig
): ScopeClassification {
  // Trim and lowercase for matching
  const normalized = message.toLowerCase().trim();

  // Check off-topic patterns first (hard no)
  for (const pattern of OFF_TOPIC_PATTERNS) {
    if (pattern.test(normalized)) {
      return {
        category: "off_topic",
        confidence: 0.95,
        reason: `Message contains off-topic keyword/phrase not allowed for ${businessConfig.businessName}`,
        allowedToAnswer: false,
      };
    }
  }

  // Check disallowed topics from business config
  if (businessConfig.disallowedTopics) {
    for (const topic of businessConfig.disallowedTopics) {
      if (normalized.includes(topic.toLowerCase())) {
        return {
          category: "off_topic",
          confidence: 0.9,
          reason: `Message mentions "${topic}", which is not allowed`,
          allowedToAnswer: false,
        };
      }
    }
  }

  // Detect emergency keywords
  if (/emergency|urgent|critical|danger|leak.*now|flooding|fire|electrical/i.test(normalized)) {
    return {
      category: "emergency",
      confidence: 0.9,
      reason: "Message contains emergency keywords",
      allowedToAnswer: true,
    };
  }

  // Detect scheduling intent
  if (ALLOWED_SERVICE_PATTERNS.some((p) => p.test(normalized))) {
    if (
      /schedule|book|appointment|time|when|available|call\s+back/i.test(
        normalized
      )
    ) {
      return {
        category: "scheduling",
        confidence: 0.85,
        reason: "Message intent: book appointment or check availability",
        allowedToAnswer: true,
      };
    }

    if (/price|cost|how\s+much|estimate|quote/i.test(normalized)) {
      return {
        category: "pricing_question",
        confidence: 0.8,
        reason: "Message intent: pricing inquiry",
        allowedToAnswer: true,
      };
    }

    if (
      /service|repair|install|maintenance|inspect|help|do\s+you/i.test(
        normalized
      )
    ) {
      return {
        category: "service_question",
        confidence: 0.8,
        reason: "Message intent: service question",
        allowedToAnswer: true,
      };
    }

    if (/hours|open|location|address|service\s+area/i.test(normalized)) {
      return {
        category: "service_question",
        confidence: 0.75,
        reason: "Message intent: business info question",
        allowedToAnswer: true,
      };
    }

    if (/reschedule|cancel|modify|change|existing\s+appointment/i.test(normalized)) {
      return {
        category: "existing_appointment",
        confidence: 0.8,
        reason: "Message intent: modify existing appointment",
        allowedToAnswer: true,
      };
    }

    if (/complaint|issue|problem|unhappy|unsatisfied/i.test(normalized)) {
      return {
        category: "complaint",
        confidence: 0.75,
        reason: "Message contains complaint",
        allowedToAnswer: true,
      };
    }
  }

  // Unknown but likely business-related
  if (normalized.length > 5) {
    return {
      category: "unknown",
      confidence: 0.5,
      reason: "Message intent unclear but does not match off-topic patterns",
      allowedToAnswer: true,
    };
  }

  // Too short or empty
  return {
    category: "unknown",
    confidence: 0.3,
    reason: "Message too short to classify",
    allowedToAnswer: true,
  };
}

// Approved redirect response for off-topic requests
export function getOffTopicResponse(businessConfig: BusinessConfig): string {
  return `I can only help with ${businessConfig.businessName} services, scheduling, or messages for the team. Would you like to book an appointment or leave a message?`;
}
