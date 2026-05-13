/**
 * /terms — 이용약관.
 * Play Console 의 앱 상세 페이지에서 함께 노출하는 약관 페이지.
 * 비로그인 접근이 가능해야 한다.
 */
import type { Metadata } from "next";
import Link from "next/link";

export const metadata: Metadata = {
  title: "이용약관 · Anima",
  description: "Anima 서비스 이용 조건과 결제·환불 정책.",
  robots: { index: true, follow: true },
};

const LAST_UPDATED = "2026-05-13";
const CONTACT_EMAIL =
  process.env.NEXT_PUBLIC_PRIVACY_CONTACT_EMAIL || "kjykjj04@gmail.com";

export default function TermsPage() {
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
          href="/privacy"
          className="text-[12px] tracking-[-0.01em] text-black/56 hover:text-[#1E1B4B]"
        >
          개인정보 처리방침
        </Link>
      </header>

      <main className="mx-auto max-w-3xl px-5 pb-20 pt-4 sm:px-8">
        <h1 className="text-[28px] font-bold leading-[1.15] tracking-[-0.02em] text-[#1E1B4B] sm:text-[36px]">
          이용약관
        </h1>
        <p className="mt-3 text-[12px] tracking-[-0.01em] text-black/48">
          최종 업데이트: {LAST_UPDATED}
        </p>

        <Section title="1. 서비스의 정의">
          Anima(이하 “서비스”)는 사용자가 작성한 미래 자아 서술과 일일 목표를 바탕으로
          매일 한 마디의 동기부여 카드와 큐레이션된 인용을 안드로이드 위젯/잠금화면에
          제공하는 개인용 애플리케이션입니다.
        </Section>

        <Section title="2. 이용 자격">
          만 14세 이상이면 누구나 가입·이용할 수 있습니다. 회원 가입 시 본인의 정확한
          정보를 제공해야 하며, 타인의 정보를 도용한 가입은 금지됩니다.
        </Section>

        <Section title="3. 계정과 보안">
          서비스 이용을 위해 Google 계정 로그인이 필요합니다. 계정에서 발생하는 모든
          활동에 대한 책임은 사용자에게 있으며, 비정상적인 사용이 감지될 경우 서비스
          이용이 제한될 수 있습니다.
        </Section>

        <Section title="4. 결제와 환불">
          <ul className="list-disc space-y-2 pl-5">
            <li>
              유료 기능 결제는 <b>Google Play 인앱 결제</b> 를 통해서만 이루어집니다.
              결제수단 정보는 Google Play 가 처리하며 서비스는 보관하지 않습니다.
            </li>
            <li>
              환불은 Google Play 의 환불 정책에 따릅니다. Play 콘솔 또는{" "}
              <a
                href="https://support.google.com/googleplay/answer/2479637"
                className="font-semibold text-[#1E1B4B] underline"
                target="_blank"
                rel="noopener noreferrer"
              >
                Google 환불 도움말
              </a>{" "}
              을 통해 직접 요청할 수 있습니다. 한국 사용자의 경우 결제 후 7일 이내,
              콘텐츠가 실질적으로 제공되지 않은 경우 청약철회가 가능합니다.
            </li>
            <li>
              구매한 권한은 동일 Google 계정으로 로그인한 모든 기기에서 자동 복원됩니다.
            </li>
          </ul>
        </Section>

        <Section title="5. 사용자의 의무">
          <ul className="list-disc space-y-1 pl-5">
            <li>서비스를 합법적이고 정상적인 방법으로 이용해야 합니다.</li>
            <li>
              서비스의 정상 운영을 방해하는 행위(자동화, 리버스 엔지니어링, 영수증
              위조 등) 를 해서는 안 됩니다.
            </li>
            <li>
              타인의 권리를 침해하거나 모욕·차별·혐오를 조장하는 콘텐츠를 입력해서는 안
              됩니다.
            </li>
          </ul>
        </Section>

        <Section title="6. 콘텐츠의 소유권">
          서비스가 제공하는 인용·문구·디자인의 저작권은 서비스 또는 정당한 권리자에
          있으며, 사용자가 입력한 텍스트의 저작권은 사용자에게 있습니다. 사용자는
          서비스가 해당 텍스트를 동기부여 카드 생성·표시 목적으로 처리하는 데
          동의합니다.
        </Section>

        <Section title="7. 면책">
          서비스는 동기부여를 목적으로 한 일반적 콘텐츠만을 제공합니다. 의료·법률·재정
          등 전문적 조언이 아니며, 서비스의 콘텐츠에 근거한 의사결정의 결과에 대해
          책임을 지지 않습니다. 천재지변, 통신·전력 장애 등 불가항력으로 인한 서비스
          중단에 대해서도 책임이 제한됩니다.
        </Section>

        <Section title="8. 약관의 변경">
          본 약관은 관련 법령 또는 서비스 변경에 따라 갱신될 수 있으며, 중요한 변경은
          앱 내 공지로 안내합니다. 변경 후에도 서비스를 계속 이용하는 경우 변경된 약관에
          동의한 것으로 간주합니다.
        </Section>

        <Section title="9. 준거법과 분쟁">
          본 약관은 대한민국 법률에 따라 해석되며, 서비스 이용과 관련한 분쟁은 서울
          중앙지방법원을 1심 관할 법원으로 합니다.
        </Section>

        <Section title="10. 연락처">
          <p>
            <a
              href={`mailto:${CONTACT_EMAIL}`}
              className="font-semibold text-[#1E1B4B] underline"
            >
              {CONTACT_EMAIL}
            </a>
          </p>
        </Section>

        <footer className="mt-12 text-center text-[11px] tracking-[-0.01em] text-black/40">
          © Anima · made for the future you
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
