/**
 * /privacy — Privacy Policy.
 *
 * Public page that can be pasted directly into the "Privacy Policy URL" field
 * of Google Play Console and App Store Connect. Must be accessible without
 * authentication (reviewers verify while signed out).
 *
 * When updating, bump the LAST_UPDATED date at the bottom of the page.
 * Contents must stay consistent with the Data Safety form answers in
 * scripts/play-data-safety.md.
 */
import type { Metadata } from "next";
import Link from "next/link";

export const metadata: Metadata = {
  title: "Privacy Policy · Anima",
  description:
    "How Anima collects, uses, stores, and deletes your information, and the rights you have over it.",
  robots: { index: true, follow: true },
};

const LAST_UPDATED = "2026-08-10";
const CONTACT_EMAIL =
  process.env.NEXT_PUBLIC_PRIVACY_CONTACT_EMAIL || "aseptichc@gmail.com";

export default function PrivacyPolicyPage() {
  return (
    <div className="min-h-screen bg-[#F0EDE6]">
      <header className="mx-auto flex max-w-3xl items-center justify-between px-5 py-6 sm:px-8">
        <Link
          href="/"
          className="text-[14px] font-semibold tracking-[-0.015em] text-[#1E1B4B]"
        >
          Anima
        </Link>
        <Link
          href="/terms"
          className="text-[12px] tracking-[-0.01em] text-black/56 hover:text-[#1E1B4B]"
        >
          Terms of Service
        </Link>
      </header>

      <main className="mx-auto max-w-3xl px-5 pb-20 pt-4 sm:px-8">
        <h1 className="text-[28px] font-bold leading-[1.15] tracking-[-0.02em] text-[#1E1B4B] sm:text-[36px]">
          Privacy Policy
        </h1>
        <p className="mt-3 text-[12px] tracking-[-0.01em] text-black/48">
          Last updated: {LAST_UPDATED}
        </p>

        <Section title="1. Who we are">
          Anima (the &ldquo;Service&rdquo;) is a personal application that
          delivers a daily one-line motivation card and a curated quote — written
          from the perspective of &ldquo;the you of ten years from now&rdquo; —
          to your Android widget and lock screen. This policy explains how the
          Service collects, uses, stores, and deletes your personal information.
        </Section>

        <Section title="2. Information we collect and why">
          <p>We collect and process the following information.</p>
          <ul className="mt-2 list-disc space-y-2 pl-5">
            <li>
              <b>Account information (required):</b> the email address, display
              name, and unique ID (uid) associated with your Google or Apple
              account. Used solely to identify your account and synchronize your
              data across devices.
            </li>
            <li>
              <b>Profile and goals (required):</b> text you enter yourself —
              your &ldquo;ten-years-from-now&rdquo; description, daily goals,
              affirmations you want to internalize, and records of things you
              did well. Used only to generate your daily motivation card.
            </li>
            <li>
              <b>Widget and notification activity:</b> the minimum operational
              records needed to run the Service, such as which daily card and
              quote were shown, rotation history, and notification tap events.
            </li>
            <li>
              <b>Purchase receipts (when applicable):</b> receipts issued by
              Google Play or the Apple App Store when you make an in-app
              purchase (purchaseToken / transactionId, productId, purchase
              time). Used only to verify your entitlement. We do not store
              payment instrument details such as card numbers — those are
              handled directly by Google Play or Apple.
            </li>
            <li>
              <b>Integrity and anti-abuse:</b> Google Play Integrity responses
              and Apple App Store Server API verifications, used solely to
              prevent receipt forgery. Not retained separately.
            </li>
            <li>
              <b>LLM usage records:</b> token usage metrics for cost and quality
              management when we call language models to generate motivation
              cards. The free-text you enter is transmitted transiently only to
              produce the model&rsquo;s response and is not retained for model
              training.
            </li>
            <li>
              <b>Crash &amp; diagnostics:</b> when the app crashes or hits an
              unexpected error, technical diagnostics (stack trace, device model,
              OS and app version) are sent to Firebase Crashlytics so we can fix
              bugs. These reports are not linked to your identity and never
              include your profile, goals, affirmations, or other content you
              entered.
            </li>
          </ul>
          <p className="mt-3">
            We do <b>not</b> collect location data, contacts, photos, call logs,
            microphone or camera input, or health and fitness data of any kind.
          </p>
        </Section>

        <Section title="3. Where your data is stored and processed">
          Your data is stored in Google Firebase (Firebase Authentication and
          Cloud Firestore). Language model calls are made through Google
          Generative AI. Data is encrypted in transit (TLS) and at rest.
        </Section>

        <Section title="4. Third-party sharing">
          We do not sell or rent your personal information to any third party.
          We only entrust your data to the following processing partners for
          the purpose of operating the Service:
          <ul className="mt-2 list-disc space-y-1 pl-5">
            <li>Google Firebase (authentication, data storage, serverless hosting)</li>
            <li>Firebase Crashlytics (crash &amp; error diagnostics)</li>
            <li>Google Generative AI (model inference for card generation)</li>
            <li>Google Play Billing (in-app purchases on Android)</li>
            <li>Apple App Store / StoreKit (in-app purchases on iOS)</li>
            <li>Vercel (web hosting and serverless function execution)</li>
          </ul>
          We may disclose information to the minimum extent required when
          compelled by a lawful request from a competent investigative,
          judicial, or regulatory authority.
        </Section>

        <Section title="5. Retention">
          <p>
            We retain your data for as long as you use the Service. When you
            delete your account, we permanently delete your identifying
            information, profile, daily records, and cached purchase receipts.
          </p>
          <p className="mt-2">
            Two records outlive your account, and neither can be used to
            identify you:
          </p>
          <ul className="mt-2 list-disc space-y-2 pl-5">
            <li>
              <b>Token usage metrics:</b> the model, token count, and cost of
              each AI call, which we are required to keep as transaction
              accounting records under applicable e-commerce laws. The account
              identifier attached to these rows is erased at the moment you
              delete your account, leaving anonymous cost totals.
            </li>
            <li>
              <b>Free-trial issuance record:</b> a one-way hash of your email
              address and the date a free trial was issued to it. We keep this
              so the 14-day trial cannot be reset indefinitely by deleting and
              re-creating an account. The hash cannot be reversed into your
              email address, and the account identifier stored alongside it is
              erased when you delete your account.
            </li>
          </ul>
        </Section>

        <Section title="6. Your rights">
          <ul className="list-disc space-y-1 pl-5">
            <li>Access and correct your own information from within the app&rsquo;s settings screen.</li>
            <li>
              <b>Permanently delete your account and data</b> — you can do this
              immediately from <Code>Settings → Account → Delete account</Code>{" "}
              in the app or on the web.
            </li>
            <li>
              Requests to stop processing or withdraw consent can be sent to the
              email address listed at the bottom of this page.
            </li>
          </ul>
        </Section>

        <Section title="7. Advertising and tracking">
          The Service does not display ads, does not collect or transmit
          advertising identifiers (AdID / IDFA), and does not use any
          third-party analytics SDKs.
        </Section>

        <Section title="8. Children">
          The Service is not intended for children under the age of 14. If we
          learn that a user under 14 has signed up, we will delete that account
          promptly.
        </Section>

        <Section title="9. Changes to this policy">
          We may update this policy to reflect changes in law or in the
          Service. When we do, we will update the &ldquo;Last updated&rdquo;
          date at the top of this page, and we will notify you in-app of any
          material changes.
        </Section>

        <Section title="10. Contact">
          For any questions about how your personal information is handled,
          please email us:
          <p className="mt-2">
            <a
              href={`mailto:${CONTACT_EMAIL}`}
              className="font-semibold text-[#1E1B4B] underline"
            >
              {CONTACT_EMAIL}
            </a>
          </p>
        </Section>

        <footer className="mt-12 text-center text-[11px] tracking-[-0.01em] text-black/40">
          © Anima · made for the dream you’re chasing
        </footer>
      </main>
    </div>
  );
}

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <section className="mt-8">
      <h2 className="text-[18px] font-semibold tracking-[-0.015em] text-[#1E1B4B]">
        {title}
      </h2>
      <div className="mt-2 text-[14px] leading-[1.7] tracking-[-0.01em] text-black/68">
        {children}
      </div>
    </section>
  );
}

function Code({ children }: { children: React.ReactNode }) {
  return (
    <code className="rounded-[6px] bg-black/[0.04] px-1.5 py-0.5 text-[12px] tracking-[-0.005em] text-[#1E1B4B]">
      {children}
    </code>
  );
}
