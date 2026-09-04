"use client";

import { useState } from "react";
import { useAuth } from "@/lib/auth-context";
import { useTodayData } from "@/lib/today-context";
import { readSheetDeepLink, stripSheetDeepLink, type DeepLinkSheet } from "@/lib/sheetDeepLink";
import { useT } from "@/lib/i18n";
import TabHeader from "@/components/nav/TabHeader";
import SettingsButton from "@/components/nav/SettingsButton";
import GroupedSection from "@/components/ui/GroupedSection";
import FutureSelfLine from "@/components/home/FutureSelfLine";
import LockedTeaserRow from "@/components/home/LockedTeaserRow";
import ExecutionPlansSection from "@/components/woop/ExecutionPlansSection";
import FutureSelfSheet from "@/components/dream/FutureSelfSheet";
import GoalsSheet from "@/components/dream/GoalsSheet";
import AffirmationsSheet from "@/components/dream/AffirmationsSheet";

/* ─────────────────────────────────────────────────────────────────
 * 내 꿈 탭 — 매일 다시 읽을 문장들의 집. 순서는 고정이다:
 *   ① 내가 이루고 싶은 꿈(미래의 나) → ② 꿈을 이룬 나 다짐 → ③ 오늘의 행동(목표) →
 *   ④ 실행 설계(if-then) — 해금 전엔 익명 잠금 행, 설계할 목표가 없으면 생략
 *
 * 화면은 읽기 전용이고 편집은 시트에서 한다 — "내 꿈을 고치려면 설정으로"라는 잘못된
 * 멘탈 모델을 없애려 설정에서 통째로 옮겨 왔다. 여기서 목표에 체크 토글은 두지 않는다
 * (오늘의 체크는 오늘 탭 몫 — 같은 버튼이 두 곳에 있으면 위치 단서가 흐려진다).
 *
 * 딥링크(?sheet=goals[&refine=1] | affirmations | futureSelf)는 초기 state 에서 한 번 읽고,
 * 그 자리에서 쿼리를 지운다 — 시트(useSheetHistory)가 히스토리 엔트리를 쌓기 전에 URL 이
 * 정리돼야 뒤로가기·새로고침에 시트가 다시 열리지 않는다. 이 페이지는 (tabs)/layout 의
 * 인증 게이트 뒤에서만 클라이언트로 마운트되므로 초기화 함수에서 window 를 읽어도 된다.
 * ───────────────────────────────────────────────────────────────── */

/** 읽기 전용 번호 행 — 다짐·목표 목록이 같은 모양을 쓴다. */
function NumberedRow({ index, text, isLast }: { index: number; text: string; isLast: boolean }) {
  return (
    <div className="relative flex items-start gap-3 px-4 py-3">
      <span className="mt-[2px] w-7 flex-shrink-0 text-center text-[15px] font-bold tracking-[-0.3px] text-[#1E1B4B]">
        {String(index + 1).padStart(2, "0")}
      </span>
      <p className="min-w-0 flex-1 text-[17px] leading-[24px] tracking-[-0.43px] text-[var(--label)] whitespace-pre-wrap">
        {text}
      </p>
      {!isLast && (
        <div className="absolute bottom-0 left-[50px] right-0 h-[0.5px] bg-[var(--sep)]" />
      )}
    </div>
  );
}

/** 비어 있을 때의 안내 + CTA 행 (다짐·목표 공용). */
function EmptyRow({ body, cta, onClick }: { body: string; cta: string; onClick: () => void }) {
  return (
    <button type="button" onClick={onClick} className="w-full px-5 py-4 text-left">
      <span className="block text-[15px] leading-[20px] tracking-[-0.24px] text-[var(--label-2)]">
        {body}
      </span>
      <span className="mt-1 block text-[15px] font-medium text-[var(--soul)]">{cta} ›</span>
    </button>
  );
}

/** 섹션 헤더 우측의 "수정" — 편집은 항상 시트에서. */
function EditButton({ label, onClick }: { label: string; onClick: () => void }) {
  return (
    <button
      type="button"
      onClick={onClick}
      className="text-[13px] font-semibold tracking-[-0.08px] text-[var(--soul)]"
    >
      {label}
    </button>
  );
}

export default function DreamPage() {
  const { user } = useAuth();
  const t = useT();
  const { uid, plans, planUnlock, goalSlots } = useTodayData();

  const [deepLink] = useState(() => {
    const link = readSheetDeepLink(typeof window === "undefined" ? "" : window.location.search);
    if (link.sheet) stripSheetDeepLink(); // 멱등 — StrictMode 의 초기화 2회 실행에도 안전
    return link;
  });
  const [openSheet, setOpenSheet] = useState<DeepLinkSheet | null>(deepLink.sheet);
  /** 홈 배너의 "더 구체적으로" → 첫 줄 힌트 펼침·포커스. 시트를 닫으면 초기화. */
  const [refineIdx, setRefineIdx] = useState<number | null>(deepLink.refine ? 0 : null);
  /** 넛지 알림으로 열린 미래의 나 시트는 나머지 문항까지 펼친다. 손으로 연 시트는 기본 접힘. */
  const [futureDetail, setFutureDetail] = useState(deepLink.sheet === "futureSelf");

  const closeSheet = () => {
    setOpenSheet(null);
    setRefineIdx(null);
    setFutureDetail(false);
  };

  const goals = user?.goals ?? [];
  const affirmations = user?.successAffirmations ?? [];
  const futureText = user?.futurePersona ?? "";
  const editLabel = t("common.edit");

  return (
    <div className="flex h-full flex-col overflow-y-auto bg-[var(--bg-grouped)] pb-tabbar">
      <TabHeader
        title={t("dream.title")}
        subtitle={t("dream.subtitle")}
        trailing={<SettingsButton />}
      />

      <main className="mx-auto w-full max-w-3xl">
        {/* ① 내가 이루고 싶은 꿈 — 한 줄, 탭하면 펼침 */}
        <GroupedSection
          header={t("home.future.title")}
          trailing={<EditButton label={editLabel} onClick={() => setOpenSheet("futureSelf")} />}
        >
          <FutureSelfLine text={futureText} onWrite={() => setOpenSheet("futureSelf")} />
        </GroupedSection>

        {/* ② 꿈을 이룬 나 다짐 — 매일 한 줄씩 돌아가며 새기는 문장들 */}
        <GroupedSection
          header={t("settings.affirmations.header")}
          trailing={<EditButton label={editLabel} onClick={() => setOpenSheet("affirmations")} />}
        >
          {affirmations.length === 0 ? (
            <EmptyRow
              body={t("dream.affirmations.empty")}
              cta={t("dream.affirmations.addCta")}
              onClick={() => setOpenSheet("affirmations")}
            />
          ) : (
            affirmations.map((line, i) => (
              <NumberedRow
                key={`${i}-${line}`}
                index={i}
                text={line}
                isLast={i === affirmations.length - 1}
              />
            ))
          )}
        </GroupedSection>

        {/* ③ 꿈에 다가가는 오늘의 행동 — 체크는 오늘 탭에서, 여기선 문장만 */}
        <GroupedSection
          header={t("home.goals.title")}
          trailing={<EditButton label={editLabel} onClick={() => setOpenSheet("goals")} />}
        >
          {goals.length === 0 ? (
            <EmptyRow
              body={t("home.todayGoal.empty")}
              cta={t("home.todayGoal.setCta")}
              onClick={() => setOpenSheet("goals")}
            />
          ) : (
            goals.map((goal, i) => (
              <NumberedRow
                key={`${i}-${goal}`}
                index={i}
                text={goal.trim() || t("home.goals.placeholder")}
                isLast={i === goals.length - 1}
              />
            ))
          )}
        </GroupedSection>

        {/* ④ 실행 설계(if-then) — 열렸으면 목록·설계 시트, 잠겼으면 정체를 감춘 잠금 행,
            설계할 목표가 없거나(hidden) 플랜 첫 스냅샷 전(null)이면 생략 */}
        {planUnlock?.kind === "open" && (
          <ExecutionPlansSection
            uid={uid}
            goals={goals}
            identityLabels={user?.identities?.labels ?? []}
            plans={plans}
          />
        )}
        {planUnlock?.kind === "locked" && (
          <GroupedSection>
            <LockedTeaserRow progress={planUnlock.progress} threshold={planUnlock.threshold} />
          </GroupedSection>
        )}
      </main>

      {user && openSheet === "futureSelf" && (
        <FutureSelfSheet
          uid={uid}
          user={user}
          initialDetailOpen={futureDetail}
          onClose={closeSheet}
        />
      )}
      {user && openSheet === "goals" && (
        <GoalsSheet
          uid={uid}
          user={user}
          goalSlots={goalSlots}
          refineIdx={refineIdx}
          onClose={closeSheet}
        />
      )}
      {user && openSheet === "affirmations" && (
        <AffirmationsSheet uid={uid} user={user} onClose={closeSheet} />
      )}
    </div>
  );
}
