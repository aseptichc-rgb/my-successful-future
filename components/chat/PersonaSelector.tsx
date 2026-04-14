"use client";

import { useState } from "react";
import { PERSONA_LIST } from "@/lib/personas";
import type { CustomPersona, Persona, PersonaId } from "@/types";

interface PersonaSelectorProps {
  activePersonas: PersonaId[];
  onToggle: (personaId: PersonaId) => void;
  customPersonas?: Record<string, CustomPersona>;
}

export default function PersonaSelector({ activePersonas, onToggle, customPersonas }: PersonaSelectorProps) {
  const [isOpen, setIsOpen] = useState(false);
  const [selected, setSelected] = useState<PersonaId[]>([]);

  // 빌트인 + 커스텀을 한 리스트로 합침 (커스텀은 Persona 형태로 어댑트)
  const customAsPersonas: Persona[] = Object.values(customPersonas || {}).map((c) => ({
    id: c.id,
    name: c.name,
    icon: c.icon,
    description: c.description || "내가 만든 멘토",
    systemPromptAddition: c.systemPromptAddition,
  }));
  const allPersonas: Persona[] = [...PERSONA_LIST, ...customAsPersonas];

  const activeList = allPersonas.filter((p) => activePersonas.includes(p.id));
  const inactiveList = allPersonas.filter((p) => !activePersonas.includes(p.id));

  const handleOpen = () => {
    setSelected([]);
    setIsOpen(true);
  };

  const handleClose = () => {
    setSelected([]);
    setIsOpen(false);
  };

  const toggleSelect = (personaId: PersonaId) => {
    setSelected((prev) =>
      prev.includes(personaId)
        ? prev.filter((id) => id !== personaId)
        : [...prev, personaId]
    );
  };

  const handleSelectAll = () => {
    if (selected.length === inactiveList.length) {
      setSelected([]);
    } else {
      setSelected(inactiveList.map((p) => p.id));
    }
  };

  const handleAdd = () => {
    selected.forEach((id) => onToggle(id));
    setSelected([]);
    setIsOpen(false);
  };

  return (
    <div className="flex items-center gap-1.5 flex-wrap">
      {/* 활성 페르소나 칩들 */}
      {activeList.map((persona) => (
        <span
          key={persona.id}
          className="inline-flex items-center gap-1 rounded-full bg-blue-50 px-2.5 py-1 text-xs font-medium text-blue-700"
        >
          <span>{persona.icon}</span>
          <span>{persona.name}</span>
          {activePersonas.length > 1 && (
            <button
              onClick={() => onToggle(persona.id)}
              className="ml-0.5 rounded-full p-0.5 hover:bg-blue-100 transition-colors"
              title={`${persona.name} 제거`}
            >
              <svg className="h-3 w-3" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
              </svg>
            </button>
          )}
        </span>
      ))}

      {/* 추가 버튼 */}
      <div className="relative">
        <button
          onClick={handleOpen}
          className="inline-flex items-center gap-1 rounded-full border border-dashed border-gray-300 px-2.5 py-1 text-xs text-gray-500 hover:border-blue-400 hover:text-blue-600 transition-colors"
        >
          <svg className="h-3 w-3" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4" />
          </svg>
          <span>참여자 추가</span>
        </button>

        {isOpen && (
          <>
            <div className="fixed inset-0 z-10" onClick={handleClose} />

            <div className="absolute left-0 top-full z-20 mt-1 w-80 rounded-xl border border-gray-200 bg-white shadow-lg">
              {inactiveList.length === 0 ? (
                <div className="px-4 py-3 text-center text-sm text-gray-400">
                  모든 페르소나가 참여 중입니다
                </div>
              ) : (
                <>
                  {/* 헤더: 전체 선택 */}
                  <div className="flex items-center justify-between border-b border-gray-100 px-4 py-2.5">
                    <span className="text-xs font-medium text-gray-500">
                      참여자 선택 ({selected.length}/{inactiveList.length})
                    </span>
                    <button
                      onClick={handleSelectAll}
                      className="text-xs font-medium text-blue-600 hover:text-blue-700 transition-colors"
                    >
                      {selected.length === inactiveList.length ? "전체 해제" : "전체 선택"}
                    </button>
                  </div>

                  {/* 페르소나 목록 (체크박스) */}
                  <div className="max-h-64 overflow-y-auto py-1">
                    {inactiveList.map((persona) => {
                      const isChecked = selected.includes(persona.id);
                      return (
                        <button
                          key={persona.id}
                          onClick={() => toggleSelect(persona.id)}
                          className={`flex w-full items-center gap-3 px-4 py-2.5 text-left transition-colors ${
                            isChecked ? "bg-blue-50" : "hover:bg-gray-50"
                          }`}
                        >
                          {/* 체크박스 */}
                          <div
                            className={`flex h-4.5 w-4.5 shrink-0 items-center justify-center rounded border transition-colors ${
                              isChecked
                                ? "border-blue-600 bg-blue-600"
                                : "border-gray-300"
                            }`}
                          >
                            {isChecked && (
                              <svg className="h-3 w-3 text-white" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={3}>
                                <path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" />
                              </svg>
                            )}
                          </div>

                          <span className="text-lg">{persona.icon}</span>
                          <div className="min-w-0 flex-1">
                            <div className="text-sm font-medium text-gray-900">
                              {persona.name}
                            </div>
                            <div className="text-xs text-gray-500 truncate">
                              {persona.description}
                            </div>
                          </div>
                        </button>
                      );
                    })}
                  </div>

                  {/* 하단: 추가 버튼 */}
                  <div className="border-t border-gray-100 px-4 py-2.5">
                    <button
                      onClick={handleAdd}
                      disabled={selected.length === 0}
                      className="w-full rounded-lg bg-blue-600 py-2 text-sm font-medium text-white transition-colors hover:bg-blue-700 disabled:bg-gray-200 disabled:text-gray-400"
                    >
                      {selected.length === 0
                        ? "참여자를 선택하세요"
                        : `${selected.length}명 추가하기`}
                    </button>
                  </div>
                </>
              )}
            </div>
          </>
        )}
      </div>
    </div>
  );
}
