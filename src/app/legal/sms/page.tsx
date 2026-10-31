import type { Metadata } from "next";
import { COMPANY, LEGAL_PATHS, LEGAL_UPDATED } from "@/lib/legal/version";

export const metadata: Metadata = { title: `Text Message Terms — ${COMPANY.product}` };

// The page carriers' A2P 10DLC reviewers check: program name, message types, how people opt in, frequency, rates, STOP/HELP,
// carrier disclaimer, consent not a condition of purchase, and the privacy promise. Keep all of them if you edit it.
export default function SmsTermsPage() {
  return (
    <article>
      <h1>Text Message Terms</h1>
      <p className="legal-meta">Last updated {LEGAL_UPDATED}</p>

      <h2>The program</h2>
      <p>
        <strong>{COMPANY.product} appointment notifications</strong> are text messages sent by {COMPANY.legalName} on behalf of service
        businesses that use {COMPANY.product} (for example, the roofing company you called). Luxor may also text people who ask Luxor to
        contact them about {COMPANY.product}.
      </p>

      <h2>What we send</h2>
      <ul>
        <li>a notice that your booking request was received;</li>
        <li>appointment confirmations, changes and reminders;</li>
        <li>notices to a business’s own staff about visits assigned to them; and</li>
        <li>replies about a request you made.</li>
      </ul>
      <p>We do not send marketing texts under this program.</p>

      <h2>How you agree to receive texts</h2>
      <p>
        You opt in by saying yes when the business’s phone assistant asks, “Is it OK to text you about this appointment at this number?”,
        by entering your number on a form that shows these terms, or by texting the business first. Agreeing to texts is not a condition
        of buying any goods or services.
      </p>

      <h2>Frequency and cost</h2>
      <p>
        Message frequency varies, usually one to five messages per appointment. <strong>Message and data rates may apply.</strong> Check
        your mobile plan for details.
      </p>

      <h2>Stopping and help</h2>
      <ul>
        <li>Reply <strong>STOP</strong> (or END, CANCEL, UNSUBSCRIBE, QUIT) to stop. You will get one message confirming you are unsubscribed.</li>
        <li>Reply <strong>START</strong> to receive texts again.</li>
        <li>Reply <strong>HELP</strong> for help, call the business at the number in the message, or email {COMPANY.email}.</li>
      </ul>

      <h2>Carriers</h2>
      <p>
        Available on most U.S. and Canadian carriers. Mobile carriers are not liable for delayed or undelivered messages. Texts may not
        arrive if your phone is off, out of range, or your carrier blocks them.
      </p>

      <h2>Privacy</h2>
      <p>
        <strong>
          We do not sell, rent or share mobile phone numbers or text-message opt-in consent with third parties or affiliates for marketing
          or promotional purposes.
        </strong>{" "}
        Read our <a href={LEGAL_PATHS.privacy}>Privacy Policy</a> and <a href={LEGAL_PATHS.terms}>Terms of Service</a>.
      </p>

      <h2>For businesses using {COMPANY.product}</h2>
      <p>
        You may text only people who contacted you or agreed to receive texts, only about their request or appointment, and you must honor
        opt-outs. Marketing texts and telephone solicitations are not allowed through the Service without the prior express written consent
        required by the Telephone Consumer Protection Act and the Florida Telephone Solicitation Act. In Canada, texts must meet Canada’s
        Anti-Spam Legislation.
      </p>
    </article>
  );
}
