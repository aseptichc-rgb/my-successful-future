/**
 * 마케팅 랜딩 페이지.
 *
 * 본 제품(매일 동기부여 카드 + 잠금화면 위젯)은 안드로이드 유료 앱이며,
 * 웹은 가치 제안 미리보기와 회원 로그인 진입점 역할만 한다.
 *
 * 이미 로그인된 사용자는 /home 으로, 비로그인은 그대로 보이게.
 * (로그인 후 /home 은 web preview 배너와 함께 동작 — 본격 사용은 앱 권장.)
 */
import Link from "next/link";
import Image from "next/image";

const PLAY_STORE_URL =
  process.env.NEXT_PUBLIC_PLAY_STORE_URL ||
  "https://play.google.com/store/apps/details?id=com.michaelkim.anima";

export default function LandingPage() {
  return (
    <div className="min-h-screen bg-[#F0EDE6]">
      <header className="mx-auto flex max-w-5xl items-center justify-between px-5 py-5 sm:px-8 sm:py-7">
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
              매일, 잠금화면에서.
            </p>
            <h1 className="mt-4 text-[40px] font-bold leading-[1.05] tracking-[-0.025em] text-[#1E1B4B] sm:text-[56px]">
              10년 후의 너에게서<br />
              매일 한 마디.
            </h1>
            <p className="mt-5 max-w-xl text-[16px] leading-[1.55] tracking-[-0.01em] text-black/64 sm:text-[17px]">
              네가 적은 미래의 모습과 오늘의 목표를 바탕으로,
              실존 멘토의 명언 한 줄이 매일 잠금화면 위젯에 도착합니다.
              알림 없이, 광고 없이.
            </p>

            <div className="mt-8 flex flex-wrap items-center gap-3">
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
              <span className="text-[12px] tracking-[-0.01em] text-black/48">
                1회 결제, 평생 사용. 광고 없음.
              </span>
            </div>

            <p className="mt-6 text-[12px] leading-[1.6] tracking-[-0.01em] text-black/40">
              웹은 미리보기 용도입니다. 위젯·잠금화면 기능은 안드로이드 앱에서 동작합니다.
            </p>
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
                  너의 오늘 목표
                </p>
                <ul className="space-y-1.5 text-[13px] tracking-[-0.005em] text-black/72">
                  <li>• 매일 30분 책 읽기</li>
                  <li>• 새 사업 아이디어 1개 정리</li>
                  <li>• 운동 30분</li>
                </ul>
              </div>
            </div>
            <p className="mt-4 text-center text-[11px] tracking-[-0.005em] text-black/40">
              잠금화면 위젯 미리보기
            </p>
          </div>
        </section>

        {/* 가치 포인트 */}
        <section className="mt-20 grid gap-6 sm:grid-cols-3 sm:gap-5">
          <ValueCard
            title="10년 후의 너가 골라준다"
            body="네가 적은 미래상과 오늘의 목표가 매일의 인용 선택에 그대로 반영됩니다."
          />
          <ValueCard
            title="실존 멘토의 한 줄"
            body="자기계발 클리셰 대신, 큐레이션된 실존 인물의 발언만. 가짜 인용 없음."
          />
          <ValueCard
            title="알림 없음, 광고 없음"
            body="잠금화면을 한 번 켤 때마다 한 줄. 그것 하나로 충분합니다."
          />
        </section>

        <footer className="mt-20 text-center text-[11px] tracking-[-0.01em] text-black/40">
          © Anima · made for the future you
        </footer>
      </main>
    </div>
  );
}

function ValueCard({ title, body }: { title: string; body: string }) {
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
