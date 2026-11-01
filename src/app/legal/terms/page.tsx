import type { Metadata } from "next";
import { COMPANY, LEGAL_PATHS, LEGAL_UPDATED } from "@/lib/legal/version";

export const metadata: Metadata = { title: `Terms of Service — ${COMPANY.product}` };

// Owner decisions 2026-10-30 (memory: project-legal-terms-decisions). Florida-specific choices:
// - NO shortened claim deadline: Fla. Stat. § 95.03 voids contract clauses that shorten a statute of limitations.
// - Gross negligence / intentional misconduct can't be excluded in Florida, hence "to the fullest extent permitted by law".
// - Disclaimers and the liability limit are in capitals: Florida courts look for conspicuous wording.
export default function TermsPage() {
  return (
    <article>
      <h1>Terms of Service</h1>
      <p className="legal-meta">Last updated {LEGAL_UPDATED}</p>

      <div className="legal-summary">
        <strong>The short version</strong> (the full terms below are what count):
        <ul>
          <li>{COMPANY.product} is business software for companies, used by adults (18+).</li>
          <li>The AI receptionist is a tool, not a guarantee. It can mishear, miss a call or book the wrong time — check your bookings and documents before you rely on them.</li>
          <li>You must use it lawfully: recording notices, consent before texting, no spam or robocall marketing.</li>
          <li>Your customer data is yours. We don’t sell it.</li>
          <li>We are not liable for lost jobs, profits or customers, and our total liability is limited to what you paid us in the last 3 months.</li>
          <li>Disputes go to individual arbitration in Palm Beach County, Florida — no class actions, no jury.</li>
        </ul>
      </div>

      <h2>1. Agreement</h2>
      <p>
        These Terms of Service (“Terms”) are an agreement between {COMPANY.legalName}, a {COMPANY.state} limited liability company
        (“Luxor”, “we”, “us”), and the business that uses {COMPANY.product}, including the AI phone receptionist, web dashboard,
        field screens, documents and related services (together, the “Service”). “You” means that business and every person who
        uses the Service on its behalf.
      </p>
      <p>
        By signing in, creating or activating an account, starting a demo, or using the Service, you accept these Terms and our{" "}
        <a href={LEGAL_PATHS.privacy}>Privacy Policy</a>. If you accept for a business, you confirm you have authority to bind it.
        If you do not agree, do not use the Service. A signed order form or invoice may add commercial terms; if it conflicts with
        these Terms on fees or scope, the order form controls.
      </p>

      <h2>2. Business use and age</h2>
      <p>
        The Service is for businesses, not for personal, family or household use. You and every person you allow to use it must be at
        least 18 years old. You are responsible for your team members, crews and anyone else you give access to, and for making sure
        they follow these Terms.
      </p>

      <h2>3. Accounts and security</h2>
      <ul>
        <li>Keep passwords and sign-in methods private. You are responsible for activity under your accounts.</li>
        <li>Field links and QR codes work like keys. Share them only with your own workers and stop a link when it is no longer needed.</li>
        <li>Remove access promptly when someone leaves your business.</li>
        <li>Tell us right away at {COMPANY.email} if you suspect unauthorized access.</li>
      </ul>

      <h2>4. What the Service does — and does not do</h2>
      <ul>
        <li>
          <strong>AI can make mistakes.</strong> The receptionist and the tools that read voice notes, summarize calls and draft documents
          use artificial intelligence. They can mishear or misunderstand people, record wrong details, book the wrong time, fail to book,
          or say something inaccurate. You are responsible for reviewing bookings, requests, transcripts, quotes, invoices, reports and
          messages before you rely on them or send them to anyone.
        </li>
        <li>
          <strong>No guarantee every call is answered.</strong> Calls, texts and emails depend on phone carriers, internet services and
          other providers outside our control. Calls can drop or fail and messages can be delayed or undelivered.
        </li>
        <li>
          <strong>Not an emergency service.</strong> The Service does not contact 911 or emergency responders and must not be relied on in
          an emergency. Callers in danger should be told to call 911.
        </li>
        <li>
          <strong>Not professional advice.</strong> Templates and default wording — including draft Florida notices for quotes and
          invoices, invoice text and agent scripts — are starting points, not legal, tax, insurance, engineering or other professional
          advice. You are responsible for the content of everything you send and for meeting the laws that apply to your trade, such as
          licensing requirements, Florida’s Construction Lien Law and consumer protection laws.
        </li>
        <li>
          <strong>Not for health or financial records.</strong> Do not use the Service to store protected health information, Social
          Security numbers, full payment card numbers or bank account numbers. We do not sign HIPAA business associate agreements unless
          we agree to one in writing.
        </li>
      </ul>

      <h2>5. Lawful and compliant use</h2>
      <p>You must use the Service only for lawful business purposes and in line with all laws that apply to you, including:</p>
      <ul>
        <li>
          <strong>Call recording.</strong> {COMPANY.state} requires the consent of everyone on a recorded call (Fla. Stat. § 934.03), and
          other states have similar rules. The receptionist announces that calls may be recorded. You must not turn that notice off
          unless you have confirmed it is lawful for your calls, and you are responsible for any notice or consent your calls require.
        </li>
        <li>
          <strong>Calls and texts.</strong> You must comply with the Telephone Consumer Protection Act, the Florida Telephone Solicitation
          Act (Fla. Stat. § 501.059), carrier rules and Canada’s Anti-Spam Legislation where they apply. Use the Service to call or text
          only people who contacted you or agreed to be contacted, and only about their request or appointment. Do not send marketing
          or telephone solicitations through the Service without the prior express written consent the law requires. Honor every
          opt-out. Our <a href={LEGAL_PATHS.sms}>Text Message Terms</a> also apply.
        </li>
        <li>
          <strong>Email.</strong> Messages you send through the Service must be accurate, identify your business and comply with the
          CAN-SPAM Act.
        </li>
        <li>
          <strong>Fair dealing.</strong> Do not use the Service in a way that is deceptive or unfair to consumers, including under the
          Florida Deceptive and Unfair Trade Practices Act.
        </li>
      </ul>
      <p>You must not:</p>
      <ul>
        <li>harass, threaten, deceive or impersonate anyone, or spoof caller ID;</li>
        <li>send spam, robocalls or bulk unsolicited messages;</li>
        <li>upload unlawful content, malware, or content you don’t have the right to use;</li>
        <li>probe, scan or break security, access another business’s data, or get around usage limits;</li>
        <li>copy, reverse engineer, resell or sublicense the Service, or use it to build a competing product, without our written consent; or</li>
        <li>overload or disrupt the Service or the networks it runs on.</li>
      </ul>
      <p>We may remove content, limit features or suspend access to stop a violation or protect people, the Service or carriers’ networks.</p>

      <h2>6. Your data</h2>
      <ul>
        <li>
          <strong>You own your data.</strong> Information you or your callers, customers and workers put into the Service (“Customer
          Data”), such as contacts, call recordings, transcripts, jobs, photos and documents, belongs to you.
        </li>
        <li>
          <strong>Our permission to use it.</strong> You allow us and our service providers to host, copy, process, transmit and display
          Customer Data to provide, secure, support and improve the Service and as the law requires. We do not sell Customer Data.
        </li>
        <li>
          <strong>Your rights to the data.</strong> You are responsible for having the rights, notices and consents needed to give us
          Customer Data, including information about your callers and customers.
        </li>
        <li>
          <strong>Usage Data.</strong> Information about how the Service is used, including pages, clicks, feature use, call counts
          and lengths, errors and performance, is “Usage Data”. Luxor may use Usage Data to operate, fix and improve the Service.
        </li>
        <li>
          <strong>Support and quality access.</strong> Authorized Luxor staff may view account data, recordings and transcripts to
          provide support, troubleshoot problems, check quality and fix bugs.
        </li>
        <li>
          <strong>AI improvement.</strong> We may use Customer Data, including transcripts and recordings, internally to test, tune
          and improve our own receptionist and features. We do not allow third parties to train their general AI models on Customer
          Data, and we choose provider settings that prevent this where offered.
        </li>
        <li>
          <strong>Fair use and abnormal traffic.</strong> We may limit, pause or block calls and AI features during abusive or
          abnormal traffic. Usage far beyond your plan may be capped or billed. You are responsible for usage from your lines and links.
        </li>
        <li>
          <strong>Aggregated data.</strong> We may use data that has been combined and de-identified so it does not identify you or any
          person, for example to measure performance or improve the Service.
        </li>
        <li>
          <strong>Service providers.</strong> We use the providers listed in our <a href={LEGAL_PATHS.privacy}>Privacy Policy</a>,
          including AI providers. Some process data outside the United States.
        </li>
        <li><strong>Feedback.</strong> If you send us ideas or suggestions, we may use them freely and without obligation to you.</li>
      </ul>

      <h2>7. Security and data incidents</h2>
      <p>
        We use reasonable administrative, technical and physical safeguards designed to protect Customer Data, including encryption in
        transit, access controls and separation between businesses’ data. No system is completely secure. If we determine that a breach
        of security has affected your Customer Data, we will notify you without unreasonable delay and within the time the law requires,
        including the Florida Information Protection Act (Fla. Stat. § 501.171), and we will reasonably cooperate with you. Where the law
        makes you responsible for notifying your own customers, you remain responsible for that notice.
      </p>

      <h2>8. Third-party services</h2>
      <p>
        The Service relies on providers such as phone carriers, AI, email, text messaging, hosting and payment services. We are not
        responsible for their acts, failures or outages, and their own terms may apply to you. Links to outside websites are for
        convenience only.
      </p>

      <h2>9. Fees and payment</h2>
      <ul>
        <li>Fees are set in your order form, plan or invoice. Unless agreed otherwise, the Service is billed month to month and invoices are due on receipt.</li>
        <li>Fees do not include taxes; you pay any sales, use or similar taxes that apply, other than taxes on our income.</li>
        <li>
          If an invoice is more than 10 days overdue, we may limit access to the dashboard after notice. Unless your account is
          cancelled, we do not turn off your phone line for late payment until an invoice is more than 30 days overdue.
        </li>
        <li>Phone numbers we provide are held for your account. If your account is cancelled or more than 30 days overdue, we may release the number. Ask us before cancelling if you want to move (port) it, where the carrier allows.</li>
        <li>Fees already paid are not refundable, except where the law requires or we agree in writing.</li>
        <li>We may change prices with at least 30 days’ notice; the new price applies from your next billing period.</li>
      </ul>

      <h2>10. Changes to the Service and these Terms</h2>
      <p>
        We improve the Service over time and may add, change or remove features. We may update these Terms. If a change is material, we
        will tell you by email or in the Service at least 15 days before it takes effect, except changes required by law or for
        security, which can take effect sooner. Signing in or using the Service after a change takes effect means you accept the updated
        Terms.
      </p>

      <h2>11. Cancelling, suspension and termination</h2>
      <ul>
        <li>Either of us may end a month-to-month subscription with notice; it ends at the close of the current billing period.</li>
        <li>
          We may suspend or end access immediately if you violate these Terms or the law, create a security, legal or carrier risk, or
          fail to pay after notice.
        </li>
        <li>
          After your account ends, you have 30 days to ask us for an export of your Customer Data. We then delete it within 90 days,
          except copies in routine backups (which expire on their normal schedule) or data we must keep by law.
        </li>
        <li>Sections that by their nature should continue — including 6, 12 to 16 and 18 — survive the end of these Terms.</li>
      </ul>

      <h2>12. Disclaimer of warranties</h2>
      <p className="legal-caps">
        THE SERVICE IS PROVIDED “AS IS” AND “AS AVAILABLE.” TO THE FULLEST EXTENT PERMITTED BY LAW, LUXOR DISCLAIMS ALL WARRANTIES, EXPRESS
        OR IMPLIED, INCLUDING WARRANTIES OF MERCHANTABILITY, FITNESS FOR A PARTICULAR PURPOSE, TITLE AND NON-INFRINGEMENT. LUXOR DOES NOT
        WARRANT THAT THE SERVICE WILL BE UNINTERRUPTED, SECURE OR ERROR-FREE, THAT EVERY CALL WILL BE ANSWERED OR EVERY MESSAGE DELIVERED,
        THAT AI OUTPUT, TRANSCRIPTS, BOOKINGS OR DOCUMENTS WILL BE ACCURATE OR COMPLETE, OR THAT THE SERVICE WILL PRODUCE ANY PARTICULAR
        NUMBER OF JOBS, CUSTOMERS OR REVENUE.
      </p>

      <h2>13. Limitation of liability</h2>
      <p className="legal-caps">
        TO THE FULLEST EXTENT PERMITTED BY LAW: (A) LUXOR WILL NOT BE LIABLE FOR ANY INDIRECT, INCIDENTAL, SPECIAL, CONSEQUENTIAL,
        EXEMPLARY OR PUNITIVE DAMAGES, OR FOR LOST PROFITS, REVENUE, JOBS, CUSTOMERS, BUSINESS OPPORTUNITIES OR GOODWILL, LOST OR
        CORRUPTED DATA, OR MISSED, DROPPED, MISHANDLED OR INCORRECTLY BOOKED CALLS, APPOINTMENTS, MESSAGES, TEXTS OR EMAILS, EVEN IF
        ADVISED OF THEIR POSSIBILITY; AND (B) LUXOR’S TOTAL LIABILITY FOR ALL CLAIMS RELATING TO THE SERVICE OR THESE TERMS WILL NOT
        EXCEED THE FEES YOU PAID LUXOR FOR THE SERVICE IN THE THREE (3) MONTHS BEFORE THE EVENT GIVING RISE TO THE CLAIM.
      </p>
      <p>
        These limits apply to every kind of claim, whether in contract, tort (including negligence), statute or otherwise, and they are
        an essential part of the bargain that allows us to offer the Service at its price. They do not limit liability that cannot be
        limited under applicable law.
      </p>

      <h2>14. Indemnity</h2>
      <p>
        You will defend, indemnify and hold harmless Luxor and its members, managers, employees and contractors from any third-party
        claims, losses, fines and costs (including reasonable attorneys’ fees) arising from: your use of the Service; your Customer
        Data; your calls, texts, emails, quotes, invoices, reports and other dealings with your customers and workers; your violation of
        these Terms or of any law, including call recording, telemarketing, texting, licensing and consumer protection laws; or the acts
        of anyone you give access to.
      </p>

      <h2>15. Disputes: arbitration and class action waiver</h2>
      <p className="legal-caps">PLEASE READ THIS SECTION CAREFULLY. IT AFFECTS HOW DISPUTES ARE RESOLVED.</p>
      <ul>
        <li>
          <strong>Talk first.</strong> Before starting a claim, the party with the dispute will send a written description to the other
          (to us at {COMPANY.email}) and both will try in good faith to resolve it for 30 days.
        </li>
        <li>
          <strong>Binding arbitration.</strong> Any dispute that is not resolved will be decided by final, binding arbitration
          administered by the American Arbitration Association under its Commercial Arbitration Rules, before one arbitrator, in{" "}
          {COMPANY.county}. The Federal Arbitration Act governs this section. Judgment on the award may be entered in any court with
          jurisdiction.
        </li>
        <li>
          <strong>Individual claims only.</strong> Claims may be brought only individually, not as a plaintiff or class member in any
          class, collective, consolidated or representative proceeding, and the arbitrator may not combine claims of different businesses.
        </li>
        <li>
          <strong>Exceptions.</strong> Either party may bring an individual claim in small claims court, and either party may ask a court
          for an injunction to stop misuse of the Service, unauthorized access, or infringement of intellectual property.
        </li>
        <li>
          <strong>If this section can’t be enforced.</strong> If arbitration does not apply to a dispute, it will be heard only in the
          state or federal courts located in {COMPANY.county}, and both parties consent to their jurisdiction.
        </li>
      </ul>
      <p className="legal-caps">EACH PARTY WAIVES ANY RIGHT TO A JURY TRIAL AND TO PARTICIPATE IN A CLASS ACTION.</p>

      <h2>16. Governing law</h2>
      <p>
        These Terms are governed by the laws of the State of {COMPANY.state}, without regard to its conflict-of-laws rules, except that
        the Federal Arbitration Act governs Section 15.
      </p>

      <h2>17. Electronic notices and signatures</h2>
      <p>
        You agree to receive notices from us electronically, by email to your account owner or in the Service. Signing in, clicking to
        accept or otherwise using the Service counts as your electronic signature under the Florida Electronic Signature Act (Fla. Stat.
        ch. 668) and the federal E-SIGN Act. Send legal notices to us at {COMPANY.email}.
      </p>

      <h2>18. General</h2>
      <ul>
        <li>These Terms, the Privacy Policy, the Text Message Terms and any order form are the entire agreement on this subject.</li>
        <li>You may not assign these Terms without our consent. We may assign them in connection with a merger, sale or reorganization.</li>
        <li>Neither party is liable for delays caused by events beyond its reasonable control, including carrier, internet, power or provider outages.</li>
        <li>If any part of these Terms is unenforceable, the rest stays in effect and that part is enforced to the fullest extent allowed.</li>
        <li>Not enforcing a right is not a waiver of it. The parties are independent contractors.</li>
      </ul>

      <h2>19. Contact</h2>
      <p>
        {COMPANY.legalName} · <a href={`mailto:${COMPANY.email}`}>{COMPANY.email}</a> · <a href={COMPANY.website}>{COMPANY.website.replace("https://", "")}</a>
      </p>
    </article>
  );
}
