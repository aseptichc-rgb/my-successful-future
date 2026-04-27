"use client";

import { getPersona } from "@/lib/personas";
import type { ActiveCouncilState, CustomPersona, PersonaOverride } from "@/types";

interface Props {
  council: ActiveCouncilState;
  isLoading: boolean;
  onAdvance: () => void;
  onEnd: () => void;
  customPersonaMap?: Record<string, CustomPersona>;
  overrideMap?: Record<string, PersonaOverride>;
}

/**
 * 라이브 토론이 진행 중일 때 입력창 위에 떠 있는 배너.
 * - 다음 발언자 미리보기
 * - "다음 의견 듣기" 버튼 (사용자가 끼어들지 않고 그냥 진행)
 * - "토론 종료" 버튼
 * 사용자가 입력창에 메시지를 치면 자동으로 다음 페르소나가 그 말을 받는다 (배너에서 별도 액션 불필요).
 */
export default function ActiveDebateBanner({
  council,
  isLoading,
  onAdvance,
  onEnd,
  customPersonaMap,
  overrideMap,
}: Props) {
  const next = council.remainingPersonas[0];
  const nextPersona = next ? getPersona(next, customPersonaMap, overrideMap) : null;
  const remaining = council.remainingPersonas.length;

  return (
    <div className="mx-auto mb-2 flex max-w-3xl items-center gap-3 rounded-xl border border-emerald-200 bg-emerald-50 px-4 py-2.5 text-sm">
      <span className="text-base">🗣️</span>
      <div className="flex-1 min-w-0">
        <div className="font-semibold text-emerald-900">토론 진행 중</div>
        {remaining > 0 ? (
          <div className="truncate text-xs text-emerald-700">
            다음 발언:{" "}
            <span className="font-medium">
              {nextPersona?.icon} {nextPersona?.name}
            </span>
            <span className="ml-1 opacity-70">· 메시지 입력 시 받아줍니다</span>
          </div>
        ) : (
          <div className="text-xs text-emerald-700">모든 발언이 끝났습니다</div>
        )}
      </div>
      {remaining > 0 && (
        <button
          type="button"
          onClick={onAdvance}
          disabled={isLoading}
          className="shrink-0 rounded-md bg-emerald-600 px-3 py-1.5 text-xs font-medium text-white hover:bg-emerald-700 disabled:opacity-50"
        >
          {isLoading ? "응답 중..." : "다음 의견"}
        </button>
      )}
      <button
        type="button"
        onClick={onEnd}
        disabled={isLoading}
        className="shrink-0 rounded-md border border-emerald-300 bg-white px-3 py-1.5 text-xs text-emerald-800 hover:bg-emerald-100 disabled:opacity-50"
      >
        종료
      </button>
    </div>
  );
}
