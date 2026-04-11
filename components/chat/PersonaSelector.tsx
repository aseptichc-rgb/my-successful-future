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
          onClick={() => setIsOpen(!isOpen)}
          className="inline-flex items-center gap-1 rounded-full border border-dashed border-gray-300 px-2.5 py-1 text-xs text-gray-500 hover:border-blue-400 hover:text-blue-600 transition-colors"
        >
          <svg className="h-3 w-3" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4" />
          </svg>
          <span>참여자 추가</span>
        </button>

        {isOpen && (
          <>
            <div className="fixed inset-0 z-10" onClick={() => setIsOpen(false)} />

            <div className="absolute left-0 top-full z-20 mt-1 w-72 rounded-xl border border-gray-200 bg-white py-1 shadow-lg">
              {inactiveList.length === 0 ? (
                <div className="px-4 py-3 text-center text-sm text-gray-400">
                  모든 페르소나가 참여 중입니다
                </div>
              ) : (
                inactiveList.map((persona) => (
                  <button
                    key={persona.id}
                    onClick={() => {
                      onToggle(persona.id);
                      setIsOpen(false);
                    }}
                    className="flex w-full items-start gap-3 px-4 py-3 text-left transition-colors hover:bg-gray-50"
                  >
                    <span className="mt-0.5 text-lg">{persona.icon}</span>
                    <div className="min-w-0 flex-1">
                      <div className="text-sm font-medium text-gray-900">
                        {persona.name}
                      </div>
                      <div className="text-xs text-gray-500">
                        {persona.description}
                      </div>
                    </div>
                  </button>
                ))
              )}
            </div>
          </>
        )}
      </div>
    </div>
  );
}
