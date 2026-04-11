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
              브라우저가 열려 있을 때 설정된 시각에 메시지가 도착합니다
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
            <input
              type="time"
              value={morningTime}
              onChange={(e) => setMorningTime(e.target.value)}
              disabled={!morningEnabled}
              className="mt-2 rounded-md border border-gray-300 px-2 py-1 text-sm text-gray-900 disabled:opacity-50"
            />
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
            <input
              type="time"
              value={eveningTime}
              onChange={(e) => setEveningTime(e.target.value)}
              disabled={!eveningEnabled}
              className="mt-2 rounded-md border border-gray-300 px-2 py-1 text-sm text-gray-900 disabled:opacity-50"
            />
          </div>
        </div>

        <div className="mt-5 rounded-md bg-gray-50 p-2 text-xs text-gray-500">
          💡 이 기능은 브라우저가 켜져 있을 때만 동작합니다. 백그라운드 푸시는 추후 지원 예정입니다.
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
