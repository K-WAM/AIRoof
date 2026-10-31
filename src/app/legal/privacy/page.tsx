import type { Metadata } from "next";
import { COMPANY, LEGAL_PATHS, LEGAL_UPDATED } from "@/lib/legal/version";

export const metadata: Metadata = { title: `Privacy Policy — ${COMPANY.product}` };

// Keep the provider list in step with the code: a new outside service that receives personal data must be added here.
// The "Text messages" section is what A2P 10DLC reviewers look for (no sharing of mobile numbers or opt-in consent).
const PROVIDERS: Array<[string, string]> = [
  ["Google Firebase", "database, file storage and sign-in"],
  ["Vercel", "web hosting"],
  ["ElevenLabs", "the phone receptionist’s voice, speech recognition and call recordings"],
  ["OpenAI", "transcribing and reading voice notes from the field"],
  ["DeepSeek", "summarizing and sorting calls; it may process data outside the United States, including in China"],
  ["Twilio", "phone numbers, calls and text messages"],
  ["Vapi", "phone calls on lines set up on our earlier phone platform"],
  ["Resend", "sending email"],
  ["PostHog", "counting which pages are viewed (page names only, not what you type)"],
  ["Stripe", "paying Luxor’s own invoices (we never see full card numbers)"],
];

export default function PrivacyPage() {
  return (
    <article>
      <h1>Privacy Policy</h1>
      <p className="legal-meta">Last updated {LEGAL_UPDATED}</p>

      <p>
        {COMPANY.legalName} (“Luxor”, “we”) develops and operates {COMPANY.product}, an AI phone receptionist and business software
        for service businesses. This policy explains what personal information we handle, why, and the choices people have.
      </p>

      <h2>1. Who this policy covers</h2>
      <ul>
        <li><strong>Businesses and their users</strong> — owners, office staff and field workers who use {COMPANY.product}.</li>
        <li><strong>Visitors and prospects</strong> — people who visit our pages, try a demo or ask us to contact them.</li>
        <li>
          <strong>Callers and customers of a business</strong> — people who call, text or email a business that uses{" "}
          {COMPANY.product}. For this information we act as a service provider to that business: the business decides how it is used
          and its own privacy policy applies. Questions about it are best sent to the business; we will help it respond.
        </li>
      </ul>

      <h2>2. Information we collect</h2>
      <ul>
        <li><strong>Account details:</strong> name, email, phone, business name, role, and sign-in information.</li>
        <li>
          <strong>Call and booking details:</strong> caller name, phone number and caller ID, service address, email, what the call was
          about, appointment times, call recordings and transcripts, and text or email messages.
        </li>
        <li><strong>Job and field details:</strong> job notes, voice notes, photos, materials and labor, time-clock entries, quotes, invoices and reports.</li>
        <li><strong>Billing details:</strong> plan, invoices and payment status. Card payments are handled by Stripe; we do not store full card numbers.</li>
        <li>
          <strong>Device and usage details:</strong> a sign-in cookie, the pages viewed, and technical logs such as IP address, browser
          type and time of access. We do not use advertising cookies or track you across other websites.
        </li>
      </ul>
      <p>Please do not give us Social Security numbers, full payment card or bank numbers, or health information. The Service is not built for them.</p>

      <h2>3. How we use information</h2>
      <ul>
        <li>to answer and transcribe calls, book appointments, and send the confirmations and notices a business or its customer asked for;</li>
        <li>to run, secure, support and improve the Service, and to prevent fraud and misuse;</li>
        <li>to bill for the Service and communicate with account holders;</li>
        <li>to reply to prospects who ask us to contact them; and</li>
        <li>to comply with the law and enforce our <a href={LEGAL_PATHS.terms}>Terms of Service</a>.</li>
      </ul>
      <p>
        <strong>We do not sell personal information</strong>, and we do not use one business’s customer information to market to anyone
        else. Where an AI provider offers a setting that limits its use of data to providing the service, we choose it; each provider’s
        own terms also apply.
      </p>

      <h2>4. Who we share information with</h2>
      <p>We share information only as needed to provide the Service, with:</p>
      <ul>
        <li><strong>The business you contacted</strong> — callers’ and customers’ details go to the business they called or wrote to.</li>
        <li>
          <strong>Our service providers</strong>, who process it on our behalf:
          <ul>
            {PROVIDERS.map(([name, purpose]) => <li key={name}><strong>{name}</strong> — {purpose}</li>)}
          </ul>
        </li>
        <li><strong>Authorities and others</strong> when the law requires it, or to protect people, our users or the Service.</li>
        <li><strong>A successor</strong> if Luxor is merged, sold or reorganized, under this policy’s protections.</li>
      </ul>

      <h2>5. Text messages</h2>
      <p>
        Mobile numbers and text-message consent are used only to send the messages a person agreed to receive.{" "}
        <strong>
          We do not sell, rent or share mobile phone numbers or text-message opt-in consent with third parties or affiliates for their
          marketing or promotional purposes.
        </strong>{" "}
        Reply STOP to any message to stop, or HELP for help. Message and data rates may apply. See our{" "}
        <a href={LEGAL_PATHS.sms}>Text Message Terms</a>.
      </p>

      <h2>6. Call recording</h2>
      <p>
        Calls answered by the AI receptionist may be recorded and transcribed so the business has an accurate record, and callers hear a
        notice at the start of the call. Florida and some other states require everyone on a call to consent to recording; by staying on
        the line after the notice, callers consent. Anyone who does not want to be recorded can hang up and contact the business another
        way.
      </p>

      <h2>7. How long we keep information</h2>
      <ul>
        <li>Account and business data: while the account is active, and up to 90 days after it ends (longer only where the law requires).</li>
        <li>Call recordings, transcripts and job records: as long as the business keeps them; a business can delete a call’s transcript and recording.</li>
        <li>Demo and prospect data: only as long as needed for the demo and any follow-up you asked for.</li>
        <li>Backups expire on their normal schedule.</li>
      </ul>

      <h2>8. Security</h2>
      <p>
        We use encryption in transit, access controls, separation between businesses’ data and limited staff access. No system is
        perfectly secure. If a breach of security affects personal information, we will give the notices required by law, including the
        Florida Information Protection Act.
      </p>

      <h2>9. Children</h2>
      <p>
        The Service is for businesses and adults 18 and older. It is not directed to children, and we do not knowingly collect personal
        information from children under 13. If you believe a child’s information was provided to us, contact us and we will delete it,
        working with the business involved where needed.
      </p>

      <h2>10. Your choices and rights</h2>
      <ul>
        <li>You can ask to see, correct or delete your personal information by writing to {COMPANY.email}. We will verify the request first.</li>
        <li>If your information came through a business you contacted, we may forward your request to that business, which decides on it.</li>
        <li>Residents of some states and of Canada have additional privacy rights; we honor requests as those laws require.</li>
        <li>Stop texts any time by replying STOP. Stop non-essential emails with the link or by writing to us.</li>
      </ul>

      <h2>11. Where information is processed</h2>
      <p>
        We are based in the United States and store data with providers in the United States. Some providers listed above process data
        in other countries. By using the Service you understand your information may be processed outside your home country.
      </p>

      <h2>12. Changes</h2>
      <p>
        We may update this policy. If a change is material we will tell account holders by email or in the Service before it takes effect.
        The date at the top shows the latest version.
      </p>

      <h2>13. Contact</h2>
      <p>{COMPANY.legalName} · <a href={`mailto:${COMPANY.email}`}>{COMPANY.email}</a></p>
    </article>
  );
}
