import type { useRouter } from "next/navigation";

type AppRouter = ReturnType<typeof useRouter>;

/**
 * 하위 페이지(설정 · 기록 히스토리)의 뒤로가기.
 *
 * 앱 안에서 push 로 들어왔으면 back() 으로 왔던 탭에 돌아가고, 딥링크·콜드 스타트로
 * 곧장 열렸으면(히스토리가 이 페이지뿐) fallback 탭으로 replace 한다 — back() 이 앱 밖으로
 * 나가거나 빈 화면에 떨어지지 않게. 탭 이동은 전부 replace 라 히스토리 길이는 "앱 밖 → 탭 →
 * 하위 페이지" 순으로만 자란다.
 */
export function backOrReplace(router: AppRouter, fallback: string): void {
  try {
    if (typeof window !== "undefined" && window.history.length > 1) {
      router.back();
      return;
    }
  } catch {
    /* history 접근 불가 환경 — 폴백으로 간다 */
  }
  router.replace(fallback);
}
