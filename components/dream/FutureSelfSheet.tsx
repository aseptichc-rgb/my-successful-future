"use client";

import { useState } from "react";
import { useAuth } from "@/lib/auth-context";
import { updateFutureSelf } from "@/lib/firebase";
import {
  FUTURE_SELF_DIMENSIONS,
  FUTURE_SELF_FIELD_MAX,
  hasAnyFutureSelfAnswer,
  type FutureSelfDimension,
} from "@/lib/futureSelf";
import { authedFetch } from "@/lib/authedFetch";
import { isPaymentRequired } from "@/lib/paymentRequired";
import { notifyAndroidWidgetRefresh } from "@/lib/widgetBridge";
import { refreshIosWidget } from "@/lib/iosWidget";
import { useT, type DictKey } from "@/lib/i18n";
import Sheet from "@/components/ui/Sheet";
import type { FutureSelfAnswers, User } from "@/types";

/* ─────────────────────────────────────────────────────────────────
 * FutureSelfSheet — "내가 이루고 싶은 꿈" 구조화 7문항 편집 + 초상 미리보기/재생성.
 *
 * 설정 페이지에서 내 꿈 탭으로 옮겨 왔다. 시트는 열릴 때만 마운트되므로 초안은
 * useState 초기화에서 user 로부터 한 번 만든다(렌더 중 재하이드레이션 불필요).
 * 온보딩에서 묻는 것은 dream 한 문항뿐 — 나머지 6개는 원하는 사람만 펼쳐서 채운다.
 * ───────────────────────────────────────────────────────────────── */

/** 미래 서술의 기본 질문 — 온보딩에서 유일하게 묻는 차원. 나머지는 "더 자세히" 뒤로. */
const PRIMARY_FUTURE_DIMENSION: FutureSelfDimension = "dream";

/** 차원 → i18n 질문/placeholder 키 (온보딩과 동일 키 재사용). */
const FUTURE_Q_KEY: Record<FutureSelfDimension, DictKey> = {
  dream: "onboarding.futureSelf.dream.q",
  daily: "onboarding.futureSelf.daily.q",
  work: "onboarding.futureSelf.work.q",
  wealth: "onboarding.futureSelf.wealth.q",
  family: "onboarding.futureSelf.family.q",
  achievements: "onboarding.futureSelf.achievements.q",
  respect: "onboarding.futureSelf.respect.q",
  growth: "onboarding.futureSelf.growth.q",
};
const FUTURE_PH_KEY: Record<FutureSelfDimension, DictKey> = {
  dream: "onboarding.futureSelf.dream.placeholder",
  daily: "onboarding.futureSelf.daily.placeholder",
  work: "onboarding.futureSelf.work.placeholder",
  wealth: "onboarding.futureSelf.wealth.placeholder",
  family: "onboarding.futureSelf.family.placeholder",
  achievements: "onboarding.futureSelf.achievements.placeholder",
  respect: "onboarding.futureSelf.respect.placeholder",
  growth: "onboarding.futureSelf.growth.placeholder",
};

/** 기본 문항 외에 하나라도 채워져 있는가 — 접혀 있으면 자기가 쓴 글이 사라진 것처럼 보인다. */
function hasDetailAnswers(answers: FutureSelfAnswers | undefined): boolean {
  if (!answers) return false;
  return FUTURE_SELF_DIMENSIONS.some(
    (dim) => dim !== PRIMARY_FUTURE_DIMENSION && (answers[dim] ?? "").trim().length > 0,
  );
}

export default function FutureSelfSheet({
  uid,
  user,
  initialDetailOpen = false,
  onClose,
}: {
  uid: string;
  user: User;
  /**
   * 나머지 문항을 처음부터 펼친다 — 미완 과업 넛지 알림(?sheet=futureSelf)으로 들어온 경우.
   * 그 알림이 요청한 게 정확히 이 칸들을 채우는 일인데 접혀 있으면 넛지가 목적지에 닿지 못한다.
   */
  initialDetailOpen?: boolean;
  onClose: () => void;
}) {
  const t = useT();
  const { refreshUser } = useAuth();

  /* 레거시 사용자(구조화 답변 없이 futurePersona 만 있는 경우)는 필드를 공란으로 두고
   * 기존 원문은 시트 하단에 읽기전용으로 보여준다 — 저장 전까지 원문을 건드리지 않는다. */
  const [draft, setDraft] = useState<FutureSelfAnswers>(() =>
    user.futureSelfAnswers ? { ...user.futureSelfAnswers } : {},
  );
  const [detailOpen, setDetailOpen] = useState(
    () => initialDetailOpen || hasDetailAnswers(user.futureSelfAnswers),
  );
  const [saving, setSaving] = useState(false);
  const [regenLoading, setRegenLoading] = useState(false);

  const handleSave = async () => {
    // Android intent 는 현재 탭 user-activation 이 살아 있는 첫 await 전에만 신호.
    notifyAndroidWidgetRefresh();
    setSaving(true);
    try {
      // 전부 공란이면 아무것도 쓰지 않는다 — 레거시 futurePersona 원문을 실수로 지우는 것 방지.
      if (hasAnyFutureSelfAnswer(draft)) {
        await updateFutureSelf(uid, draft);
        await refreshUser().catch(() => {});
        void refreshIosWidget();
      }
      onClose();
    } catch (err) {
      console.error("[dream] 미래의 나 저장 실패:", err);
      window.alert(t("common.saveFailed"));
    } finally {
      setSaving(false);
    }
  };

  /** "초상 다시 그리기" — force=true 는 일별 한도에 카운트된다. */
  const handleRegeneratePortrait = async () => {
    setRegenLoading(true);
    try {
      const res = await authedFetch("/api/future-self/portrait", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ force: true }),
      });
      // Pro 전용 — /dream 은 ProUpsellSheet 의 침묵 경로가 아니라 전역 업그레이드 시트가
      // 이미 떴다. 여기서 한 번 더 안내하면 같은 말이 겹친다 — 조용히 종료.
      if (isPaymentRequired(res)) return;
      const data = (await res.json().catch(() => ({}))) as { error?: string };
      if (!res.ok) {
        throw new Error(data.error || `${t("common.error")} (${res.status})`);
      }
      await refreshUser().catch(() => {});
    } catch (err) {
      console.error("[dream] 초상 재생성 실패:", err);
      window.alert(
        err instanceof Error && err.message ? err.message : t("futureSelf.portrait.error"),
      );
    } finally {
      setRegenLoading(false);
    }
  };

  return (
    <Sheet onClose={onClose} title={t("home.future.title")}>
      <p className="mt-1 text-[13px] leading-[1.5] tracking-[-0.08px] text-[var(--label-2)]">
        {t("settings.future.subtitle")}
      </p>

      <div className="mt-3 space-y-4">
        {(detailOpen ? FUTURE_SELF_DIMENSIONS : [PRIMARY_FUTURE_DIMENSION]).map((dim) => (
          <div key={dim}>
            <p className="text-[13px] font-semibold tracking-[-0.08px] text-[var(--label)]">
              {t(FUTURE_Q_KEY[dim])}
            </p>
            <textarea
              value={draft[dim] ?? ""}
              onChange={(e) =>
                setDraft((prev) => ({
                  ...prev,
                  [dim]: e.target.value.slice(0, FUTURE_SELF_FIELD_MAX),
                }))
              }
              rows={3}
              maxLength={FUTURE_SELF_FIELD_MAX}
              placeholder={t(FUTURE_PH_KEY[dim])}
              className="mt-1.5 w-full resize-none rounded-[12px] border border-[var(--sep)] bg-[var(--bg-grouped-2)] px-4 py-3 text-[15px] leading-[22px] tracking-[-0.24px] text-[var(--label)] placeholder:text-[var(--label-3)] focus:outline-none focus:border-[var(--soul)]"
            />
          </div>
        ))}
      </div>

      {!detailOpen && (
        <button
          type="button"
          onClick={() => setDetailOpen(true)}
          className="mt-3 text-[15px] font-medium text-[var(--soul)]"
        >
          ⌄ {t("settings.futureSelf.moreDetail")}
        </button>
      )}

      {/* 레거시 사용자: 구조화 답변 없이 futurePersona 원문만 있으면 읽기전용으로 노출 */}
      {!hasAnyFutureSelfAnswer(user.futureSelfAnswers ?? {}) && user.futurePersona && (
        <div className="mt-4 rounded-[12px] bg-[var(--bg-grouped-2)] px-4 py-3">
          <p className="text-[11px] font-medium tracking-[0.06em] text-[var(--label-3)]">
            {t("settings.futureSelf.legacyNote")}
          </p>
          <p className="mt-1.5 whitespace-pre-wrap text-[13px] leading-[1.55] tracking-[-0.08px] text-[var(--label-2)]">
            {user.futurePersona}
          </p>
        </div>
      )}

      {/* 저장된 초상 미리보기 + 다시 그리기 */}
      {user.futureSelfPortrait && (
        <div className="mt-4 rounded-[12px] bg-[#1E1B4B] px-4 py-4">
          <p className="text-[10px] font-semibold uppercase tracking-[0.14em] text-white/50">
            {t("futureSelf.portrait.headerLabel")}
          </p>
          <p className="mt-2 text-[15px] font-bold leading-[1.4] tracking-[-0.24px] text-white">
            {user.futureSelfPortrait.title}
          </p>
          <p className="mt-2 whitespace-pre-wrap text-[13px] leading-[1.6] tracking-[-0.08px] text-white/85">
            {user.futureSelfPortrait.portrait}
          </p>
          <button
            type="button"
            onClick={handleRegeneratePortrait}
            disabled={regenLoading || saving}
            className="mt-3 rounded-full bg-white/12 px-4 py-1.5 text-[12px] font-semibold tracking-[-0.05px] text-white/90 transition-colors hover:bg-white/20 disabled:opacity-40"
          >
            {regenLoading
              ? t("futureSelf.portrait.regenerating")
              : t("futureSelf.portrait.regenerate")}
          </button>
        </div>
      )}

      <div className="mt-4 flex justify-end">
        <button
          type="button"
          onClick={handleSave}
          disabled={saving}
          className="text-[17px] font-semibold text-[var(--soul)] disabled:opacity-40"
        >
          {saving ? t("common.saving") : t("common.save")}
        </button>
      </div>
    </Sheet>
  );
}
