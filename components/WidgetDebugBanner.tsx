"use client";

/**
 * [임시 디버그] iOS 위젯 데이터 공급 경로 진단 배너.
 *
 * 목적: Mac/Safari Web Inspector 없이, 기기 화면에서 직접 "위젯이 왜 빈 상태인지"의
 * 실패 지점을 읽기 위한 도구. iOS 네이티브 앱에서만 렌더된다(웹/안드로이드는 null).
 *
 * 검사 순서(= refreshIosWidget 과 동일한 실제 경로):
 *   1) Capacitor 플랫폼 / WidgetBridge PluginHeaders 가시성
 *   2) /api/widget/today 인증 호출 상태 코드 (401/402/429 면 게이팅·쿼터)
 *   3) 응답에 오늘 카드(primarySlot)가 들어있는지
 *   4) 네이티브 WidgetBridge.setWidgetData 푸시 성공/실패(사유)
 *
 * 원인 확정 후 이 컴포넌트와 layout.tsx 의 마운트는 제거한다.
 */

import { useEffect, useState } from "react";
import { Capacitor } from "@capacitor/core";
import { authedFetch } from "@/lib/authedFetch";
import { pushWidgetDataDiagnostic } from "@/lib/iosWidget";

const WIDGET_TODAY_PATH = "/api/widget/today";

export default function WidgetDebugBanner() {
  const [lines, setLines] = useState<string[]>([]);
  const [hidden, setHidden] = useState(false);

  useEffect(() => {
    let cancelled = false;
    const log = (line: string) => {
      if (!cancelled) setLines((prev) => [...prev, line]);
    };

    async function run() {
      try {
        if (Capacitor.getPlatform() !== "ios") return;
        log("① iOS 네이티브 감지 ✅");

        try {
          const headerVisible = Capacitor.isPluginAvailable("WidgetBridge");
          log(`② WidgetBridge 헤더 가시성: ${headerVisible ? "true" : "false"}`);
        } catch (err) {
          log(`② 플러그인 확인 실패: ${msg(err)}`);
        }

        let res: Response;
        try {
          res = await authedFetch(`${WIDGET_TODAY_PATH}?_t=${Date.now()}`, {
            cache: "no-store",
            headers: { "Cache-Control": "no-cache" },
          });
        } catch (err) {
          log(`③ API 호출 자체 실패(네트워크/인증): ${msg(err)}`);
          return;
        }
        log(`③ ${WIDGET_TODAY_PATH} → HTTP ${res.status}`);
        if (!res.ok) {
          const body = await res.text().catch(() => "");
          log(`   응답: ${body.slice(0, 120)}`);
          return;
        }

        const data = await res.json().catch(() => null);
        const slot = data?.slots?.[0];
        log(`④ 오늘 카드: ${slot?.text ? `있음("${String(slot.text).slice(0, 16)}…")` : "없음(slots 비어있음)"}`);

        const pushed = await pushWidgetDataDiagnostic(data);
        if (pushed.ok) {
          log("⑤ 위젯 푸시 성공 ✅ — 잠시 후 위젯 갱신됨");
        } else {
          log(`⑤ 위젯 푸시 실패: ${pushed.error ?? "알 수 없음"}`);
        }
      } catch (err) {
        log(`예외: ${msg(err)}`);
      }
    }

    void run();
    return () => {
      cancelled = true;
    };
  }, []);

  // iOS 가 아니면 아무것도 그리지 않는다(웹/안드로이드 무영향).
  if (lines.length === 0 || hidden) return null;

  return (
    <div
      onClick={() => setHidden(true)}
      style={{
        position: "fixed",
        top: "env(safe-area-inset-top, 0px)",
        left: 0,
        right: 0,
        zIndex: 99999,
        background: "rgba(20,16,40,0.92)",
        color: "#fff",
        font: "12px/1.5 ui-monospace, Menlo, monospace",
        padding: "10px 12px",
        whiteSpace: "pre-wrap",
        wordBreak: "break-word",
      }}
    >
      {"[위젯 진단 — 탭하면 닫힘]\n" + lines.join("\n")}
    </div>
  );
}

function msg(err: unknown): string {
  return err instanceof Error ? err.message : String(err);
}
