import { LEGAL_PATHS } from "@/lib/legal/version";

// The no-friction acceptance line (owner, 2026-10-30/31: "like modern apps", nothing to tick or read first): one short
// line right under the button that signs someone in or starts a demo — pressing it is the agreement. Keep it next to the
// button and readable: courts enforce this "sign-in-wrap" only when the notice is conspicuous at the moment of the click.
export function LegalConsent({ action, contact = false }: { action: string; contact?: boolean }) {
  return (
    <p className="legal-consent">
      By {action}, you agree to our{" "}
      <a href={LEGAL_PATHS.terms} target="_blank" rel="noopener">Terms</a> and{" "}
      <a href={LEGAL_PATHS.privacy} target="_blank" rel="noopener">Privacy Policy</a> and confirm you’re 18+.
      {contact && (
        <>
          {" "}We may call or text the number you give us about your request (<a href={LEGAL_PATHS.sms} target="_blank" rel="noopener">rates may apply, reply STOP to opt out</a>).
        </>
      )}
    </p>
  );
}
