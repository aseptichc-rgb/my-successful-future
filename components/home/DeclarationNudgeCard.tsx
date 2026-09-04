"use client";

import { useSyncExternalStore } from "react";
import { createAckStore } from "@/lib/ackStore";
import { isDerivedDeclaration } from "@/lib/declarationNudge";
import { useT } from "@/lib/i18n";

/* ─────────────────────────────────────────────────────────────────
 * DeclarationNudgeCard — 파생 시절 계정에게 한 번만 뜨는 안내.
 *
 * 성공 선언과 오늘의 목표가 분리되기 전에는 선언을 목표에서 파생했다. 그 계정은 홈에서
 * 사실상 같은 문장을 두 번 보게 되므로("나는 매일 30분 책을 읽는다" / "매일 30분 책을
 * 읽는다") 버그처럼 읽힌다. 한 번 안내하고, 닫으면 다시 뜨지 않는다.
 *
 * 닫힘은 **날짜별이 아니라 영구 키**다 — 매일 같은 안내를 다시 띄우면 그게 곧 잔소리다.
 * 저장소는 lib/ackStore(다른 1회성 카드와 같은 규칙) — 알림 슬롯이 자격 판정에 같은 값을 읽는다.
 * 판정은 lib/declarationNudge 순수 함수가 담당한다. 이 컴포넌트는 표시와 닫기만 한다.
 * ───────────────────────────────────────────────────────────────── */

/** 영구 닫힘 — 키·값 형식은 예전 구현("1")과 같아 이미 닫은 계정은 그대로 닫혀 있다. */
export const declarationNudgeDismissStore = createAckStore<boolean>(
  "anima.declarationNudge.dismissed",
  {
    parse: (raw) => raw === "1",
    serialize: (value) => (value ? "1" : "0"),
    serverSnapshot: true,
  },
);

export default function DeclarationNudgeCard({
  declaration,
  goal,
  onEdit,
}: {
  /** 현재 성공 선언 1줄 (successAffirmations[0]). */
  declaration: string;
  /** 오늘의 목표 1줄 (goals[0]). */
  goal: string;
  /** "선언 바꾸기" — 오늘 탭이 내 꿈 탭의 다짐 시트 딥링크로 보낸다. */
  onEdit: () => void;
}) {
  const t = useT();
  const dismissed = useSyncExternalStore(
    declarationNudgeDismissStore.subscribe,
    declarationNudgeDismissStore.getSnapshot,
    declarationNudgeDismissStore.getServerSnapshot,
  );

  if (dismissed) return null;
  if (!isDerivedDeclaration(declaration, goal)) return null;

  return (
    <div className="mx-4 mt-4 rounded-[12px] bg-[var(--bg-grouped-2)] px-5 py-4" role="status">
      <p className="text-[17px] font-semibold leading-[22px] tracking-[-0.43px] text-[var(--label)]">
        {t("declarationNudge.title")}
      </p>
      <p className="mt-1 text-[15px] leading-[21px] tracking-[-0.24px] text-[var(--label-2)]">
        {t("declarationNudge.body")}
      </p>
      <div className="mt-3 flex items-center gap-4">
        <button
          type="button"
          onClick={onEdit}
          className="inline-flex items-center rounded-full px-4 py-2 text-[15px] font-semibold text-white"
          style={{ background: "#D85A30" }}
        >
          {t("declarationNudge.cta")}
        </button>
        <button
          type="button"
          onClick={() => declarationNudgeDismissStore.acknowledge(true)}
          className="text-[15px] font-medium text-[var(--label-2)] hover:opacity-70 transition-opacity"
        >
          {t("declarationNudge.dismiss")}
        </button>
      </div>
    </div>
  );
}
