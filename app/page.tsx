/**
 * 마케팅 랜딩 페이지.
 *
 * 본 제품(매일 동기부여 카드 + 잠금화면 위젯)은 안드로이드 유료 앱이며, iOS 앱은 같은 웹 URL 을
 * Capacitor WKWebView 로 로드하는 래퍼다([capacitor.config.ts]). 웹은 가치 제안 미리보기와
 * 회원 로그인 진입점 역할을 한다.
 *
 * iOS 심사 대응 (Apple Guideline 2.3.10 — Accurate Metadata):
 *   같은 URL 을 iOS 앱이 그대로 띄우므로, "Google Play 에서 받기" 버튼과 "안드로이드 앱에서
 *   동작"·"잠금화면" 같은 타 플랫폼 문구가 앱 안에 보이면 심사에서 거절된다(실제 거절 사유).
 *   그래서 해당 요소는 [components/landing/PlatformGate] 의 WebOnly/PlatformText 로 감싸
 *   웹에서만 노출하고, iOS 앱에는 iOS 안전 문구만 그린다(SSR 기본값이 iOS 안전이라 깜빡임 없이 차단).
 *
 * 이미 로그인된 사용자는 /home 으로, 비로그인은 그대로 보이게.
 * (로그인 후 /home 은 web preview 배너와 함께 동작 — 본격 사용은 앱 권장.)
 */
import type { ReactNode } from "react";
import Link from "next/link";
import Image from "next/image";
import { PlatformText, WebOnly } from "@/components/landing/PlatformGate";
import { PLAY_STORE_URL } from "@/lib/constants/storeLinks";

export default function LandingPage() {
  return (
    <div className="min-h-screen bg-[#F0EDE6]">
      {/* 상단 여백에 safe-area inset 을 더한다. layout.tsx 가 viewportFit:"cover" 라
          WKWebView 가 상태바·다이내믹 아일랜드 밑까지 확장되는데, 여백이 없으면 로그인 버튼이
          그 밑에 깔려 탭이 시스템 상태바(스크롤 최상단 이동)로 먹혀 눌리지 않는다 — 실제 사고.
          웹은 inset 이 0 이라 기존 값(20/28px)이 그대로 유지된다. */}
      <header className="mx-auto flex max-w-5xl items-center justify-between px-5 pb-5 pt-[calc(env(safe-area-inset-top)+20px)] sm:px-8 sm:pb-7 sm:pt-[calc(env(safe-area-inset-top)+28px)]">
        <div className="flex items-center gap-2">
          <Image
            src="/icons/anima-mark-dark.svg"
            alt="Anima"
            width={28}
            height={28}
            priority
          />
          <span className="text-[18px] font-semibold tracking-[-0.02em] text-[#1E1B4B]">
            Anima
          </span>
        </div>
        <Link
          href="/login"
          className="rounded-pill border border-black/10 bg-white px-4 py-2 text-[13px] font-medium tracking-[-0.01em] text-black/70 transition-colors hover:border-[#1E1B4B] hover:text-[#1E1B4B]"
        >
          로그인
        </Link>
      </header>

      <main className="mx-auto max-w-5xl px-5 pb-20 pt-6 sm:px-8 sm:pt-12">
        <section className="grid items-center gap-10 sm:grid-cols-[1.1fr_1fr] sm:gap-14">
          <div>
            <p className="text-[12px] font-semibold uppercase tracking-[0.18em] text-[#1E1B4B]/60">
              <PlatformText web="매일, 잠금화면에서." ios="매일, 한 줄." />
            </p>
            <h1 className="mt-4 text-[40px] font-bold leading-[1.05] tracking-[-0.025em] text-[#1E1B4B] sm:text-[56px]">
              당신의 꿈을<br />
              이루게 해주는 앱.
            </h1>
            <p className="mt-5 max-w-xl text-[16px] leading-[1.55] tracking-[-0.01em] text-black/64 sm:text-[17px]">
              <PlatformText
                web="꿈을 한 줄 적으면 오늘 할 한 걸음이 정해지고, 그 걸음을 밀어줄 실존 멘토의 한 마디가 매일 잠금화면 위젯에 도착합니다. 알림 없이, 광고 없이."
                ios="꿈을 한 줄 적으면 오늘 할 한 걸음이 정해지고, 그 걸음을 밀어줄 실존 멘토의 한 마디가 매일 도착합니다. 알림 없이, 광고 없이."
              />
            </p>

            <div className="mt-8 flex flex-wrap items-center gap-3">
              {/* Google Play 버튼: iOS 앱 안에서는 타 스토어 참조라 심사 거절 사유(2.3.10) →
                  WebOnly 로 감싸 웹에서만 노출한다. */}
              <WebOnly>
                <a
                  href={PLAY_STORE_URL}
                  target="_blank"
                  rel="noopener"
                  className="inline-flex items-center gap-2 rounded-pill bg-[#1E1B4B] px-6 py-3 text-[14px] font-semibold tracking-[-0.01em] text-white transition-colors hover:bg-[#2A2766]"
                >
                  <svg className="h-5 w-5" viewBox="0 0 24 24" fill="currentColor" aria-hidden>
                    <path d="M3.609 1.814L13.792 12 3.61 22.186a.996.996 0 01-.61-.92V2.734a1 1 0 01.609-.92zm10.89 10.893l2.302 2.302-10.937 6.333 8.635-8.635zm3.183-3.183l2.413 1.396a1 1 0 010 1.732l-2.41 1.395-2.5-2.5 2.497-2.497-.001-.026zm-3.183-3.183l-8.635-8.635 10.937 6.334-2.302 2.301z"/>
                  </svg>
                  Google Play 에서 받기
                </a>
              </WebOnly>
              <span className="text-[12px] tracking-[-0.01em] text-black/48">
                1회 결제, 평생 사용. 광고 없음.
              </span>
            </div>

            {/* "웹은 미리보기 · 안드로이드 앱에서 동작": iOS 앱에서 보이면 타 플랫폼 참조라 웹 전용. */}
            <WebOnly>
              <p className="mt-6 text-[12px] leading-[1.6] tracking-[-0.01em] text-black/40">
                웹은 미리보기 용도입니다. 위젯·잠금화면 기능은 안드로이드 앱에서 동작합니다.
              </p>
            </WebOnly>
          </div>

          {/* 카드 미리보기 */}
          <div className="relative">
            <div
              className="mx-auto aspect-[9/16] w-full max-w-sm overflow-hidden rounded-[28px] p-7 shadow-[0_30px_80px_-30px_rgba(30,27,75,0.45)]"
              style={{
                background: "linear-gradient(135deg, #FDE68A 0%, #FCA5A5 100%)",
              }}
            >
              <p className="text-[11px] font-semibold uppercase tracking-[0.16em] text-black/50">
                오늘의 한 마디
              </p>
              <p className="mt-6 text-[24px] font-bold leading-[1.35] tracking-[-0.02em] text-[#1E1B4B]">
                완벽함을 기다리지 마라. 가장 큰 적은 출발하지 않은 것이다.
              </p>
              <p className="mt-4 text-[13px] font-medium tracking-[-0.005em] text-black/55">
                — 세네카
              </p>

              <div className="mt-12 space-y-2.5">
                <p className="text-[10px] font-semibold uppercase tracking-[0.18em] text-black/40">
                  꿈에 다가가는 오늘의 행동
                </p>
                <ul className="space-y-1.5 text-[13px] tracking-[-0.005em] text-black/72">
                  <li>• 매일 책 30쪽 읽고 한 줄 남기기</li>
                  <li>• 새벽 6시에 일어나 1시간 몰입</li>
                  <li>• 매일 안 해본 일 1가지 도전</li>
                </ul>
              </div>
            </div>
            <p className="mt-4 text-center text-[11px] tracking-[-0.005em] text-black/40">
              <PlatformText web="잠금화면 위젯 미리보기" ios="오늘의 카드 미리보기" />
            </p>
          </div>
        </section>

        {/* 가치 포인트 */}
        <section className="mt-20 grid gap-6 sm:grid-cols-3 sm:gap-5">
          <ValueCard
            title="네 꿈이 오늘을 정한다"
            body="네가 적은 꿈에서 오늘 할 한 걸음이 나오고, 매일의 인용도 그 걸음에 맞춰 골라집니다."
          />
          <ValueCard
            title="실존 멘토의 한 줄"
            body="자기계발 클리셰 대신, 큐레이션된 실존 인물의 발언만. 가짜 인용 없음."
          />
          <ValueCard
            title="알림 없음, 광고 없음"
            body={
              <PlatformText
                web="잠금화면을 한 번 켤 때마다 한 줄. 그것 하나로 충분합니다."
                ios="하루 한 번, 한 줄. 그것 하나로 충분합니다."
              />
            }
          />
        </section>

        <footer className="mt-20 flex flex-col items-center gap-2 text-[11px] tracking-[-0.01em] text-black/40">
          <div className="flex items-center gap-3">
            <Link href="/privacy" className="hover:text-[#1E1B4B]">
              개인정보 처리방침
            </Link>
            <span aria-hidden>·</span>
            <Link href="/terms" className="hover:text-[#1E1B4B]">
              이용약관
            </Link>
          </div>
          <p>© Anima · made for the dream you’re chasing</p>
        </footer>
      </main>
    </div>
  );
}

function ValueCard({ title, body }: { title: string; body: ReactNode }) {
  return (
    <div className="rounded-[18px] bg-white p-6 shadow-apple">
      <h3 className="text-[15px] font-semibold tracking-[-0.015em] text-[#1E1B4B]">
        {title}
      </h3>
      <p className="mt-2 text-[13px] leading-[1.55] tracking-[-0.005em] text-black/60">
        {body}
      </p>
    </div>
  );
}
