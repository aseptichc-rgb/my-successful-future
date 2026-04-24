"use client";

import { useState } from "react";
import type { DailyRitualConfig } from "@/types";

interface DailyRitualSettingsProps {
  config: DailyRitualConfig | null;
  onUpdate: (updates: Partial<DailyRitualConfig>) => Promise<void>;
  onClose: () => void;
}

const DEFAULTS = {
  enabled: false,
  morningEnabled: true,
  morningTime: "07:00",
  eveningEnabled: true,
  eveningTime: "22:00",
};

// "YYYY-MM-DD" (KST) → "오늘 ✓" | "어제" | "N일 전" | "(발사 기록 없음)"
function formatLastFired(ymd: string | undefined): { label: string; tone: "ok" | "stale" | "none" } {
  if (!ymd) return { label: "(아직 발사 기록 없음)", tone: "none" };
  const now = new Date();
  const kstNow = new Date(now.getTime() + 9 * 60 * 60 * 1000);
  const todayYmd = `${kstNow.getUTCFullYear()}-${String(kstNow.getUTCMonth() + 1).padStart(2, "0")}-${String(kstNow.getUTCDate()).padStart(2, "0")}`;
  if (ymd === todayYmd) return { label: "오늘 발사됨 ✓", tone: "ok" };
  // 일수 차이 계산 (KST 기준 자정)
  const [y, m, d] = ymd.split("-").map((v) => parseInt(v, 10));
  const fired = Date.UTC(y, (m || 1) - 1, d || 1);
  const today = Date.UTC(kstNow.getUTCFullYear(), kstNow.getUTCMonth(), kstNow.getUTCDate());
  const diffDays = Math.round((today - fired) / (24 * 60 * 60 * 1000));
  if (diffDays === 1) return { label: "어제 발사됨", tone: "ok" };
  if (diffDays > 1 && diffDays <= 7) return { label: `${diffDays}일 전 발사됨`, tone: "stale" };
  if (diffDays > 7) return { label: `${diffDays}일 전 발사됨 (오래됨)`, tone: "stale" };
  return { label: ymd, tone: "ok" };
}

function LastFiredBadge({ ymd }: { ymd: string | undefined }) {
  const { label, tone } = formatLastFired(ymd);
  const cls =
    tone === "ok"
      ? "bg-emerald-50 text-emerald-700 ring-emerald-200"
      : tone === "stale"
        ? "bg-amber-50 text-amber-700 ring-amber-200"
        : "bg-gray-50 text-gray-500 ring-gray-200";
  return (
    <span className={`inline-flex items-center rounded-full px-2 py-0.5 text-[10px] font-medium ring-1 ring-inset ${cls}`}>
      {label}
    </span>
  );
}

export default function DailyRitualSettings({ config, onUpdate, onClose }: DailyRitualSettingsProps) {
  const current = { ...DEFAULTS, ...(config || {}) };
  const [enabled, setEnabled] = useState(current.enabled);
  const [morningEnabled, setMorningEnabled] = useState(current.morningEnabled);
  const [morningTime, setMorningTime] = useState(current.morningTime);
  const [eveningEnabled, setEveningEnabled] = useState(current.eveningEnabled);
  const [eveningTime, setEveningTime] = useState(current.eveningTime);
  const [saving, setSaving] = useState(false);

  const handleSave = async () => {
    setSaving(true);
    try {
      await onUpdate({
        enabled,
        morningEnabled,
        morningTime,
        eveningEnabled,
        eveningTime,
      });
      onClose();
    } finally {
      setSaving(false);
    }
  };

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4"
      onClick={onClose}
    >
      <div
        className="w-full max-w-md rounded-2xl bg-white p-6 shadow-xl"
        onClick={(e) => e.stopPropagation()}
      >
        <h2 className="mb-1 text-lg font-bold text-gray-900">☀️ 데일리 리추얼</h2>
        <p className="mb-5 text-xs text-gray-500">
          미래의 나가 매일 아침과 저녁에 자발적으로 메시지를 보내줍니다.
        </p>

        <label className="mb-4 flex items-center justify-between rounded-lg border border-orange-200 bg-orange-50 p-3">
          <div>
            <p className="text-sm font-medium text-gray-900">리추얼 활성화</p>
            <p className="mt-0.5 text-xs text-gray-600">
              설정된 시각에 서버가 자동으로 메시지를 보내드립니다 (앱이 꺼져 있어도 동작)
            </p>
          </div>
          <input
            type="checkbox"
            checked={enabled}
            onChange={(e) => setEnabled(e.target.checked)}
            className="h-5 w-5 accent-orange-500"
          />
        </label>

        <div className={`space-y-4 ${enabled ? "" : "opacity-50 pointer-events-none"}`}>
          <div className="rounded-lg border border-gray-200 p-3">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                <span className="text-base">☀️</span>
                <span className="text-sm font-medium text-gray-900">아침 브리프</span>
              </div>
              <input
                type="checkbox"
                checked={morningEnabled}
                onChange={(e) => setMorningEnabled(e.target.checked)}
                className="h-4 w-4 accent-amber-500"
              />
            </div>
            <p className="mt-1 text-xs text-gray-500">오늘 하루의 초점을 1개 정해줍니다</p>
            <div className="mt-2 flex items-center gap-2">
              <input
                type="time"
                value={morningTime}
                onChange={(e) => setMorningTime(e.target.value)}
                disabled={!morningEnabled}
                className="rounded-md border border-gray-300 px-2 py-1 text-sm text-gray-900 disabled:opacity-50"
              />
              {morningEnabled && <LastFiredBadge ymd={config?.lastMorningDate} />}
            </div>
          </div>

          <div className="rounded-lg border border-gray-200 p-3">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                <span className="text-base">🌙</span>
                <span className="text-sm font-medium text-gray-900">저녁 회고</span>
              </div>
              <input
                type="checkbox"
                checked={eveningEnabled}
                onChange={(e) => setEveningEnabled(e.target.checked)}
                className="h-4 w-4 accent-indigo-500"
              />
            </div>
            <p className="mt-1 text-xs text-gray-500">하루를 돌아보는 따뜻한 메시지를 보냅니다</p>
            <div className="mt-2 flex items-center gap-2">
              <input
                type="time"
                value={eveningTime}
                onChange={(e) => setEveningTime(e.target.value)}
                disabled={!eveningEnabled}
                className="rounded-md border border-gray-300 px-2 py-1 text-sm text-gray-900 disabled:opacity-50"
              />
              {eveningEnabled && <LastFiredBadge ymd={config?.lastEveningDate} />}
            </div>
          </div>
        </div>

        <div className="mt-5 rounded-md bg-gray-50 p-2 text-xs text-gray-500">
          💡 매시간 정각마다 서버가 발사 여부를 확인합니다. 설정 시각 ±15분 이내에 메시지가 도착할 수 있어요.
        </div>

        <div className="mt-5 flex justify-end gap-2">
          <button
            type="button"
            onClick={onClose}
            disabled={saving}
            className="rounded-lg border border-gray-300 px-4 py-2 text-sm text-gray-700 hover:bg-gray-50 disabled:opacity-50"
          >
            취소
          </button>
          <button
            type="button"
            onClick={handleSave}
            disabled={saving}
            className="rounded-lg bg-orange-500 px-4 py-2 text-sm font-medium text-white hover:bg-orange-600 disabled:opacity-50"
          >
            {saving ? "저장 중..." : "저장"}
          </button>
        </div>
      </div>
    </div>
  );
}
