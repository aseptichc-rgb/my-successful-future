/**
 * /privacy — 개인정보 처리방침.
 *
 * Google Play Console 의 "개인정보처리방침 URL" 칸에 그대로 입력할 수 있는 공개 페이지.
 * 인증 없이 접근 가능해야 한다 (Play 심사자가 비로그인으로 확인).
 *
 * 변경 시 페이지 하단 "최종 업데이트" 날짜를 함께 갱신할 것.
 * Data Safety 폼 답변(scripts/play-data-safety.md) 과 내용이 일치해야 한다.
 */
import type { Metadata } from "next";
import Link from "next/link";

export const metadata: Metadata = {
  title: "개인정보 처리방침 · Anima",
  description: "Anima 가 수집·이용·보관하는 정보와 사용자 권리에 대한 안내.",
  robots: { index: true, follow: true },
};

const LAST_UPDATED = "2026-05-13";
const CONTACT_EMAIL =
  process.env.NEXT_PUBLIC_PRIVACY_CONTACT_EMAIL || "kjykjj04@gmail.com";

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
          이용약관
        </Link>
      </header>

      <main className="mx-auto max-w-3xl px-5 pb-20 pt-4 sm:px-8">
        <h1 className="text-[28px] font-bold leading-[1.15] tracking-[-0.02em] text-[#1E1B4B] sm:text-[36px]">
          개인정보 처리방침
        </h1>
        <p className="mt-3 text-[12px] tracking-[-0.01em] text-black/48">
          최종 업데이트: {LAST_UPDATED}
        </p>

        <Section title="1. 우리가 누구인지">
          Anima(이하 “서비스”)는 “10년 후의 나”의 시점에서 매일 한 마디의 동기부여
          카드와 큐레이션된 인용을 안드로이드 위젯/잠금화면에 제공하는 개인용
          애플리케이션입니다. 본 처리방침은 서비스가 사용자의 개인정보를 어떻게
          수집·이용·보관·삭제하는지 설명합니다.
        </Section>

        <Section title="2. 수집하는 정보와 목적">
          <p>다음의 정보를 수집·처리합니다.</p>
          <ul className="mt-2 list-disc space-y-2 pl-5">
            <li>
              <b>계정 정보(필수):</b> Google 계정의 이메일·표시 이름·고유 ID(uid).
              회원 식별과 데이터 동기화에만 사용합니다.
            </li>
            <li>
              <b>프로필·목표(필수):</b> 사용자가 직접 입력하는 “10년 후의 나” 서술문,
              하루 목표, 매일 새기는 다짐, 잘한 일 기록 등 텍스트.
              매일의 동기부여 카드를 생성하는 데에만 사용합니다.
            </li>
            <li>
              <b>위젯·알림 사용 기록:</b> 일별 동기부여 카드, 명언 노출/회전, 알림 탭
              이벤트 등 서비스 동작에 필요한 최소한의 기록.
            </li>
            <li>
              <b>결제 영수증(해당 시):</b> Google Play 인앱 결제 시 Play 가
              발급하는 영수증(purchaseToken, productId, purchaseTime). 결제 권한
              확인 외 다른 목적에 사용하지 않습니다. 카드 번호 등 결제수단 정보는
              저장하지 않습니다(Google Play 가 직접 처리).
            </li>
            <li>
              <b>이상 행위·무결성:</b> Google Play Integrity 응답값. 영수증 위조 차단
              목적이며 별도 보관하지 않습니다.
            </li>
            <li>
              <b>LLM 사용 기록:</b> 동기부여 카드 생성을 위한 모델 호출 시,
              비용·품질 관리 목적의 토큰 사용량 기록. 사용자가 입력한 자유 텍스트는
              모델 응답 생성을 위해 일시적으로 전송되며 별도 학습 목적으로 보관하지
              않습니다.
            </li>
          </ul>
          <p className="mt-3">
            위치 정보, 연락처, 사진, 통화 기록, 마이크/카메라, 신체·건강 데이터 등은{" "}
            <b>일체 수집하지 않습니다.</b>
          </p>
        </Section>

        <Section title="3. 보관과 처리 위치">
          사용자의 데이터는 Google 의 Firebase(Authentication, Cloud Firestore)에
          저장됩니다. 모델 호출은 Google Generative AI 서비스를 사용합니다. 데이터는
          전송 구간(TLS) 과 저장 구간 모두 암호화됩니다.
        </Section>

        <Section title="4. 제3자 공유">
          서비스는 사용자의 개인정보를 제3자에게 판매·임대하지 않습니다. 다음의 처리
          파트너에 한해 서비스 운영 목적의 위탁 처리가 이루어집니다.
          <ul className="mt-2 list-disc space-y-1 pl-5">
            <li>Google Firebase(인증·데이터 저장·서버리스 호스팅)</li>
            <li>Google Generative AI(모델 호출 — 카드 생성)</li>
            <li>Google Play Billing(인앱 결제)</li>
            <li>Vercel(웹 호스팅 및 서버리스 함수 실행)</li>
          </ul>
          법령에 따른 수사·재판·감독 기관의 적법한 요청이 있을 경우 최소 범위에서
          제공할 수 있습니다.
        </Section>

        <Section title="5. 보관 기간">
          서비스가 제공되는 동안 사용자의 데이터를 보관하며, 사용자가 계정을 삭제하면
          개인 식별 정보·프로필·일별 기록·결제 영수증 캐시를 모두 영구 삭제합니다.
          전자상거래법 등 관계 법령상 보관 의무가 있는 거래 회계 기록(개인을 식별할 수
          없도록 처리된 토큰 사용량 등)은 법정 보관 기간 동안 별도 보관됩니다.
        </Section>

        <Section title="6. 사용자 권리">
          <ul className="list-disc space-y-1 pl-5">
            <li>본인 정보 열람·정정(앱 내 설정 화면)</li>
            <li>
              <b>계정·데이터의 영구 삭제</b> — 앱 또는 웹의 <Code>설정 → 계정 → 계정
              삭제</Code> 메뉴에서 즉시 실행할 수 있습니다.
            </li>
            <li>처리 정지·동의 철회 요청은 본 페이지 하단의 이메일로 보낼 수 있습니다.</li>
          </ul>
        </Section>

        <Section title="7. 광고·추적">
          서비스는 광고를 게시하지 않으며, 광고용 식별자(AdID) 를 수집·전송하지
          않습니다. 제3자 분석 SDK 도 사용하지 않습니다.
        </Section>

        <Section title="8. 어린이 보호">
          서비스는 만 14세 미만 아동을 의도된 사용자로 하지 않습니다. 만 14세 미만이
          가입한 사실이 확인되면 즉시 해당 계정을 삭제합니다.
        </Section>

        <Section title="9. 본 방침의 변경">
          본 방침은 법령 또는 서비스 변경에 따라 갱신될 수 있으며, 변경 시 본 페이지
          상단의 “최종 업데이트” 날짜를 갱신하고 중요한 변경은 앱 내 공지로
          안내합니다.
        </Section>

        <Section title="10. 연락처">
          개인정보 처리와 관련된 문의는 다음 이메일로 보내주세요.
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

function Code({ children }: { children: React.ReactNode }) {
  return (
    <code className="rounded-[6px] bg-black/[0.04] px-1.5 py-0.5 text-[12px] tracking-[-0.005em] text-[#1E1B4B]">
      {children}
    </code>
  );
}
