/**
 * /delete-account — 계정·데이터 삭제 안내 (한국어/English).
 *
 * Google Play Console "데이터 안전 → 계정 삭제 URL" 필드에 그대로 넣는 공개 페이지.
 * 심사관은 로그아웃 상태로 검증하므로 반드시 비로그인 접근이 가능해야 하며,
 * Google 이 요구하는 3가지를 모두 명시한다:
 *   1) 스토어에 표시되는 앱/개발자 이름
 *   2) 계정 삭제를 요청하기 위해 취해야 할 단계
 *   3) 삭제/보관되는 데이터 유형과 보관 기간
 *
 * 언어 선택: `?lang=en` 쿼리 > Accept-Language 헤더 > 기본 한국어.
 * 서버 렌더링이라 JS 없이도 두 언어가 모두 동작한다(심사 환경 안정성).
 *
 * 삭제 범위·보관 항목은 app/api/account/delete/route.ts 의 실제 구현과 1:1 일치해야 한다.
 * 정책이 바뀌면 이 페이지와 /privacy(섹션 5·6) 를 함께 갱신할 것.
 */
import type { Metadata } from "next";
import Link from "next/link";
import { headers } from "next/headers";

const LAST_UPDATED = "2026-06-21";
const CONTACT_EMAIL =
  process.env.NEXT_PUBLIC_PRIVACY_CONTACT_EMAIL || "aseptichc@gmail.com";
const WEB_ORIGIN = "https://my-successful-future.vercel.app";

type Lang = "ko" | "en";

export const metadata: Metadata = {
  title: "계정·데이터 삭제 · Account Deletion · Anima",
  description:
    "Anima 계정과 관련 데이터를 삭제하는 방법 안내. How to delete your Anima account and the data that is removed or retained.",
  robots: { index: true, follow: true },
};

/**
 * 언어 결정: 명시적 `?lang=` 가 최우선, 없으면 Accept-Language 첫 항목으로 추정.
 * ko 로 시작하지 않는 모든 로케일은 영어로 처리해 심사관(영어권) 기본 노출을 보장.
 */
async function resolveLang(
  searchParams: Promise<{ lang?: string }> | undefined,
): Promise<Lang> {
  const sp = searchParams ? await searchParams : {};
  const explicit = sp.lang?.toLowerCase();
  if (explicit === "en") return "en";
  if (explicit === "ko") return "ko";
  const accept = (await headers()).get("accept-language")?.toLowerCase() ?? "";
  return accept.startsWith("ko") ? "ko" : "en";
}

export default async function DeleteAccountPage({
  searchParams,
}: {
  searchParams?: Promise<{ lang?: string }>;
}) {
  const lang = await resolveLang(searchParams);
  const isKo = lang === "ko";

  return (
    <div className="min-h-screen bg-[#F0EDE6]">
      <header className="mx-auto flex max-w-3xl items-center justify-between px-5 py-6 sm:px-8">
        <Link
          href="/"
          className="text-[14px] font-semibold tracking-[-0.015em] text-[#1E1B4B]"
        >
          Anima
        </Link>
        <div className="flex items-center gap-3">
          <LangSwitch active={lang} />
          <Link
            href="/privacy"
            className="text-[12px] tracking-[-0.01em] text-black/56 hover:text-[#1E1B4B]"
          >
            {isKo ? "개인정보 처리방침" : "Privacy"}
          </Link>
        </div>
      </header>

      <main className="mx-auto max-w-3xl px-5 pb-20 pt-4 sm:px-8">
        {isKo ? <KoContent /> : <EnContent />}

        <footer className="mt-12 text-center text-[11px] tracking-[-0.01em] text-black/40">
          © Anima · made for the dream you’re chasing
        </footer>
      </main>
    </div>
  );
}

/* ── 언어 토글 ─────────────────────────────────────────────── */
function LangSwitch({ active }: { active: Lang }) {
  const base =
    "text-[12px] tracking-[-0.01em] px-1.5 py-0.5 rounded-[6px] transition-colors";
  const on = "bg-[#1E1B4B] text-white";
  const off = "text-black/48 hover:text-[#1E1B4B]";
  return (
    <span className="inline-flex items-center gap-1">
      <Link href="?lang=ko" className={`${base} ${active === "ko" ? on : off}`}>
        한국어
      </Link>
      <Link href="?lang=en" className={`${base} ${active === "en" ? on : off}`}>
        EN
      </Link>
    </span>
  );
}

/* ── 한국어 본문 ───────────────────────────────────────────── */
function KoContent() {
  return (
    <>
      <h1 className="text-[28px] font-bold leading-[1.15] tracking-[-0.02em] text-[#1E1B4B] sm:text-[36px]">
        계정 및 데이터 삭제
      </h1>
      <p className="mt-3 text-[12px] tracking-[-0.01em] text-black/48">
        최종 업데이트: {LAST_UPDATED}
      </p>

      <Section title="앱·개발자 정보">
        본 안내는 <b>Anima</b>(이하 “서비스”) 앱의 계정 및 데이터 삭제에 관한
        것입니다. 서비스는 사용자가 작성한 꿈 서술과 일일 목표를 바탕으로
        매일 동기부여 카드를 제공하는 개인용 애플리케이션입니다. 삭제와 관련한
        문의는 아래 연락처로 보내실 수 있습니다.
      </Section>

      <Section title="계정을 삭제하는 방법">
        <p>
          계정과 관련 데이터는 본인이 직접, 추가 비용 없이 언제든 영구 삭제할 수
          있습니다.
        </p>

        <p className="mt-3 font-semibold text-[#1E1B4B]">방법 1 — 앱에서 삭제</p>
        <ol className="mt-1 list-decimal space-y-1 pl-5">
          <li>Anima 앱을 실행하고 로그인합니다.</li>
          <li>
            하단 <Code>설정</Code> 화면으로 이동합니다.
          </li>
          <li>
            <Code>계정 → 계정 삭제</Code> 를 선택합니다.
          </li>
          <li>안내에 따라 삭제를 확인하면 계정과 데이터가 즉시 영구 삭제됩니다.</li>
        </ol>

        <p className="mt-4 font-semibold text-[#1E1B4B]">방법 2 — 웹에서 삭제</p>
        <ol className="mt-1 list-decimal space-y-1 pl-5">
          <li>
            <ExtLink href={`${WEB_ORIGIN}/login`}>
              my-successful-future.vercel.app
            </ExtLink>{" "}
            에 동일한 계정으로 로그인합니다.
          </li>
          <li>
            <Code>설정 → 계정 → 계정 삭제</Code> 를 선택해 삭제를 확인합니다.
          </li>
        </ol>

        <p className="mt-4 font-semibold text-[#1E1B4B]">방법 3 — 이메일로 요청</p>
        <p className="mt-1">
          위 방법을 사용할 수 없는 경우, 가입에 사용한 이메일 주소로{" "}
          <MailLink subject="계정 삭제 요청" />에 삭제를 요청해 주세요. 본인 확인
          후 영업일 기준 30일 이내에 처리합니다.
        </p>
      </Section>

      <Section title="삭제되는 데이터">
        삭제를 확정하면 다음 데이터가 영구적으로 삭제되며 복구할 수 없습니다.
        <ul className="mt-2 list-disc space-y-1 pl-5">
          <li>계정 식별 정보 — 이메일 주소, 표시 이름, 사용자 ID(uid)</li>
          <li>
            사용자가 입력한 콘텐츠 — “내가 이루고 싶은 꿈” 서술, 일일 목표, 다짐,
            오늘 잘한 일 기록
          </li>
          <li>일일 동기부여 카드·인용 기록 및 위젯 표시 내역</li>
          <li>인앱 결제 권한(entitlement) 캐시</li>
          <li>로그인 세션</li>
        </ul>
      </Section>

      <Section title="보관되는 데이터와 보관 기간">
        <p>
          아래 항목은 법령상 의무(전자상거래·세무 기록 보관) 이행을 위해 제한적으로
          보관됩니다.
        </p>
        <ul className="mt-2 list-disc space-y-1 pl-5">
          <li>
            <b>토큰 사용량·비용 회계 기록</b> — 개인을 식별하지 않는 집계 형태로만
            보관되며, 관계 법령이 정한 보관 기간 경과 후 파기됩니다. 개인정보가
            아닌 비용 정산 목적이며, 별도 마스킹을 원하시면 위 연락처로 요청하실 수
            있습니다.
          </li>
        </ul>
        <p className="mt-3">
          결제수단 정보(카드번호 등)는 Google Play 가 직접 처리하며 서비스가
          보관하지 않으므로 삭제 대상에 포함되지 않습니다.
        </p>
      </Section>

      <Section title="문의">
        계정·데이터 삭제에 관한 문의:
        <p className="mt-2">
          <MailLink />
        </p>
      </Section>
    </>
  );
}

/* ── English content ───────────────────────────────────────── */
function EnContent() {
  return (
    <>
      <h1 className="text-[28px] font-bold leading-[1.15] tracking-[-0.02em] text-[#1E1B4B] sm:text-[36px]">
        Account &amp; Data Deletion
      </h1>
      <p className="mt-3 text-[12px] tracking-[-0.01em] text-black/48">
        Last updated: {LAST_UPDATED}
      </p>

      <Section title="App & developer">
        This page explains how to delete your account and data for the{" "}
        <b>Anima</b> app (the &ldquo;Service&rdquo;). Anima is a personal app
        that delivers a daily motivation card based on the dream you write down
        and the daily goals you set. For any deletion
        question, contact us at the address below.
      </Section>

      <Section title="How to delete your account">
        <p>
          You can permanently delete your account and associated data yourself,
          at any time, at no cost.
        </p>

        <p className="mt-3 font-semibold text-[#1E1B4B]">
          Option 1 — Delete in the app
        </p>
        <ol className="mt-1 list-decimal space-y-1 pl-5">
          <li>Open the Anima app and sign in.</li>
          <li>
            Go to the <Code>Settings</Code> screen.
          </li>
          <li>
            Tap <Code>Account → Delete account</Code>.
          </li>
          <li>
            Confirm, and your account and data are permanently deleted
            immediately.
          </li>
        </ol>

        <p className="mt-4 font-semibold text-[#1E1B4B]">
          Option 2 — Delete on the web
        </p>
        <ol className="mt-1 list-decimal space-y-1 pl-5">
          <li>
            Sign in with the same account at{" "}
            <ExtLink href={`${WEB_ORIGIN}/login`}>
              my-successful-future.vercel.app
            </ExtLink>
            .
          </li>
          <li>
            Choose <Code>Settings → Account → Delete account</Code> and confirm.
          </li>
        </ol>

        <p className="mt-4 font-semibold text-[#1E1B4B]">
          Option 3 — Request by email
        </p>
        <p className="mt-1">
          If you cannot use the options above, email{" "}
          <MailLink subject="Account deletion request" /> from the address you
          signed up with. After verifying your identity, we process the request
          within 30 business days.
        </p>
      </Section>

      <Section title="Data that is deleted">
        Once you confirm deletion, the following data is permanently removed and
        cannot be recovered.
        <ul className="mt-2 list-disc space-y-1 pl-5">
          <li>
            Account identifiers — email address, display name, user ID (uid)
          </li>
          <li>
            Content you entered — your &ldquo;ten-years-from-now&rdquo;
            description, daily goals, affirmations, and records of things you did
            well
          </li>
          <li>Daily motivation cards, quote history, and widget display logs</li>
          <li>In-app purchase entitlement cache</li>
          <li>Login session</li>
        </ul>
      </Section>

      <Section title="Data that is retained, and for how long">
        <p>
          The item below is retained on a limited basis to meet legal
          obligations (e-commerce and tax record keeping).
        </p>
        <ul className="mt-2 list-disc space-y-1 pl-5">
          <li>
            <b>Token-usage and cost accounting records</b> — kept only in an
            aggregated, non-identifying form and discarded after the retention
            period required by applicable law. This serves cost accounting, not
            identification; to request separate masking, contact us at the
            address above.
          </li>
        </ul>
        <p className="mt-3">
          Payment instrument details (such as card numbers) are handled directly
          by Google Play and are never stored by the Service, so they are not
          part of this deletion.
        </p>
      </Section>

      <Section title="Contact">
        Questions about account and data deletion:
        <p className="mt-2">
          <MailLink />
        </p>
      </Section>
    </>
  );
}

/* ── 공용 UI ───────────────────────────────────────────────── */
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

function ExtLink({ href, children }: { href: string; children: React.ReactNode }) {
  return (
    <a
      href={href}
      className="font-semibold text-[#1E1B4B] underline"
      target="_blank"
      rel="noopener noreferrer"
    >
      {children}
    </a>
  );
}

function MailLink({ subject }: { subject?: string }) {
  const href = subject
    ? `mailto:${CONTACT_EMAIL}?subject=${encodeURIComponent(subject)}`
    : `mailto:${CONTACT_EMAIL}`;
  return (
    <a href={href} className="font-semibold text-[#1E1B4B] underline">
      {CONTACT_EMAIL}
    </a>
  );
}
