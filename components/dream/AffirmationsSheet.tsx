"use client";

import { useState } from "react";
import { useAuth } from "@/lib/auth-context";
import { updateSuccessAffirmations, MAX_SUCCESS_AFFIRMATIONS } from "@/lib/firebase";
import { notifyAndroidWidgetRefresh } from "@/lib/widgetBridge";
import { refreshIosWidget } from "@/lib/iosWidget";
import { useT } from "@/lib/i18n";
import Sheet from "@/components/ui/Sheet";
import AffirmationsEditor from "@/components/affirmations/AffirmationsEditor";
import type { User } from "@/types";

/* ─────────────────────────────────────────────────────────────────
 * AffirmationsSheet — "꿈을 이룬 나 다짐" 편집 (AffirmationsEditor 재사용).
 * 설정 페이지에서 내 꿈 탭으로 옮겨 왔다.
 * ───────────────────────────────────────────────────────────────── */

export default function AffirmationsSheet({
  uid,
  user,
  onClose,
}: {
  uid: string;
  user: User;
  onClose: () => void;
}) {
  const t = useT();
  const { refreshUser } = useAuth();
  const [affirmations, setAffirmations] = useState<string[]>(() =>
    user.successAffirmations && user.successAffirmations.length > 0
      ? [...user.successAffirmations]
      : [],
  );
  const [saving, setSaving] = useState(false);

  const handleSave = async () => {
    notifyAndroidWidgetRefresh();
    setSaving(true);
    try {
      await updateSuccessAffirmations(uid, affirmations);
      await refreshUser().catch(() => {});
      void refreshIosWidget();
      onClose();
    } catch (err) {
      console.error("[dream] 다짐 저장 실패:", err);
      window.alert(t("common.saveFailed"));
    } finally {
      setSaving(false);
    }
  };

  return (
    <Sheet onClose={onClose} title={t("settings.affirmations.header")}>
      <div className="mt-2">
        <AffirmationsEditor
          value={affirmations}
          onChange={setAffirmations}
          max={MAX_SUCCESS_AFFIRMATIONS}
        />
      </div>
      <div className="mt-3 flex justify-end">
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
