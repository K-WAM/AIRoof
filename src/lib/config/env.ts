const CAPABILITIES: Record<string, string[]> = {
  openai: ["OPENAI_API_KEY"],
  deepseek: ["DEEPSEEK_API_KEY"],
  resend: ["RESEND_API_KEY", "RESEND_FROM"],
  vapi: ["VAPI_API_KEY", "VAPI_WEBHOOK_SECRET"],
  firebase: ["FIREBASE_SERVICE_ACCOUNT_JSON"],
  cron: ["CRON_SECRET"],
} as const;

export type EnvStatus = "configured" | "not_configured";

function isProduction(): boolean {
  return process.env.NODE_ENV === "production";
}

function resolveEnv(name: string): string | undefined {
  const val = process.env[name];
  if (val === undefined || val === "") return undefined;
  return val;
}

export function getEnv(name: string): string | undefined {
  return resolveEnv(name);
}

export function requireEnv(name: string): string {
  const val = resolveEnv(name);
  if (val === undefined) {
    if (isProduction()) {
      throw new Error(
        `Required environment variable ${name} is not set`,
      );
    }
    console.warn(
      `Environment variable ${name} is not set — returning empty string (non-production)`,
    );
    return "";
  }
  return val;
}

export function getCapabilityStatus(name: string): EnvStatus {
  const requiredVars = CAPABILITIES[name];
  if (!requiredVars) return "not_configured";
  return requiredVars.every((v) => resolveEnv(v) !== undefined)
    ? "configured"
    : "not_configured";
}

export function getCapabilityReport(): Record<string, EnvStatus> {
  const report: Record<string, EnvStatus> = {};
  for (const name of Object.keys(CAPABILITIES)) {
    report[name] = getCapabilityStatus(name);
  }
  return report;
}
