import { z, type ZodIssue, type ZodType } from "zod";

interface SchemaIssue {
  code: string;
  path: string;
  message: string;
}

export type SchemaParseResult<T> =
  | { ok: true; data: T }
  | { ok: false; issues: SchemaIssue[] };

const MAX_JSON_UNWRAP_DEPTH = 3;
const LOG_PREVIEW_LENGTH = 120;

const PROMPT_INJECTION_PATTERN =
  /<\/?(?:system|assistant|developer|tool)(?:\s|>|$)|\b(?:ignore|disregard|override)\b[\s\S]{0,80}\b(?:instructions?|prompt|policy|system)\b|\b(?:system|developer)\s+(?:message|prompt)\b/i;

export const finiteNumber = z.preprocess((value) => {
  if (typeof value !== "string") return value;
  const normalized = value.trim();
  if (!normalized) return value;
  const converted = Number(normalized);
  return Number.isFinite(converted) ? converted : value;
}, z.number().finite());

export const finiteInteger = finiteNumber.pipe(z.number().int());

export function boundedText(maxLength = 2_000) {
  return z
    .string()
    .trim()
    .min(1)
    .max(maxLength)
    .refine((value) => !/[\0\u0001-\u0008\u000B\u000C\u000E-\u001F]/.test(value), {
      message: "Text contains unsupported control characters",
    });
}

export function modelText(maxLength = 2_000) {
  return boundedText(maxLength).refine((value) => !PROMPT_INJECTION_PATTERN.test(value), {
    message: "Text contains instruction-like control content",
  });
}

export const identifier = boundedText(256).refine(
  (value) => !value.includes("/") && !/^__.*__$/.test(value),
  { message: "Identifier is not path-safe" }
);

function stripCodeFence(value: string): string {
  const trimmed = value.trim();
  const match = trimmed.match(/^```(?:json)?\s*([\s\S]*?)\s*```$/i);
  return match ? match[1] : trimmed;
}

function unwrapStructuredInput(input: unknown): unknown {
  let current = input;
  for (let depth = 0; depth < MAX_JSON_UNWRAP_DEPTH && typeof current === "string"; depth++) {
    const candidate = stripCodeFence(current);
    try {
      const parsed = JSON.parse(candidate) as unknown;
      if (parsed === current) break;
      current = parsed;
    } catch {
      break;
    }
  }
  return current;
}

function genericIssueMessage(issue: ZodIssue): string {
  switch (issue.code) {
    case "invalid_type":
      return "Value has the wrong type";
    case "invalid_enum_value":
      return "Value is not an allowed option";
    case "too_small":
      return "Value is missing or below the allowed minimum";
    case "too_big":
      return "Value exceeds the allowed maximum";
    case "invalid_string":
      return "String format is invalid";
    case "not_finite":
      return "Number must be finite";
    case "custom":
      return "Value failed a safety or consistency check";
    default:
      return "Value is invalid";
  }
}

function issuePath(issue: ZodIssue): string {
  if (issue.path.length === 0) return "$";
  return issue.path
    .map((part) => (typeof part === "number" ? `[${part}]` : part))
    .join(".")
    .replace(/\.\[/g, "[");
}

function inputSummary(input: unknown) {
  let serialized: string;
  try {
    serialized = typeof input === "string" ? input : JSON.stringify(input);
  } catch {
    serialized = "[unserializable]";
  }
  const truncated = serialized.slice(0, LOG_PREVIEW_LENGTH);
  return {
    type: Array.isArray(input) ? "array" : typeof input,
    length: serialized.length,
    shape: truncated.replace(/[A-Za-z0-9]/g, "*"),
    truncated: serialized.length > LOG_PREVIEW_LENGTH,
  };
}

function logFailure(boundary: string, input: unknown, issues: SchemaIssue[]) {
  console.warn("Schema validation rejected input", {
    boundary,
    issues,
    input: inputSummary(input),
  });
}

export function parseSchema<T>(
  schema: ZodType<T, z.ZodTypeDef, unknown>,
  input: unknown,
  boundary: string
): SchemaParseResult<T> {
  try {
    const result = schema.safeParse(unwrapStructuredInput(input));
    if (result.success) return { ok: true, data: result.data };

    const issues = result.error.issues.map((issue) => ({
      code: issue.code,
      path: issuePath(issue),
      message: genericIssueMessage(issue),
    }));
    logFailure(boundary, input, issues);
    return { ok: false, issues };
  } catch {
    const issues = [
      { code: "schema_internal_error", path: "$", message: "Schema validation failed safely" },
    ];
    logFailure(boundary, input, issues);
    return { ok: false, issues };
  }
}
