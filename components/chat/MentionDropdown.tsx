"use client";

import { memo, useEffect, useMemo, useRef } from "react";
import { PERSONA_LIST } from "@/lib/personas";
import { mergePersona } from "@/lib/persona-resolver";
import PersonaIcon from "@/components/ui/PersonaIcon";
import type { CustomPersona, Persona, PersonaId, PersonaOverride } from "@/types";

interface MentionDropdownProps {
  query: string;
  onSelect: (personaId: PersonaId, personaName: string) => void;
  onClose: () => void;
  selectedIndex: number;
  customPersonas?: Record<string, CustomPersona>;
  overrideMap?: Record<string, PersonaOverride>;
}

function buildPersonaList(
  customPersonas?: Record<string, CustomPersona>,
  overrideMap?: Record<string, PersonaOverride>,
): Persona[] {
  const builtinAsPersonas: Persona[] = PERSONA_LIST.map((p) =>
    mergePersona(p, overrideMap?.[p.id as string]),
  );
  const customAsPersonas: Persona[] = Object.values(customPersonas || {}).map((c) => ({
    id: c.id,
    name: c.name,
    icon: c.icon,
    photoUrl: c.photoUrl,
    description: c.description || "내가 만든 멘토",
    systemPromptAddition: c.systemPromptAddition,
  }));
  return [...builtinAsPersonas, ...customAsPersonas];
}

function MentionDropdown({
  query,
  onSelect,
  onClose,
  selectedIndex,
  customPersonas,
  overrideMap,
}: MentionDropdownProps) {
  void onClose;
  const listRef = useRef<HTMLUListElement>(null);

  const allPersonas = useMemo(
    () => buildPersonaList(customPersonas, overrideMap),
    [customPersonas, overrideMap],
  );
  const filtered = useMemo(() => {
    const q = query.toLowerCase();
    return allPersonas.filter((p) => p.name.toLowerCase().includes(q));
  }, [allPersonas, query]);

  // 선택된 항목이 보이도록 스크롤
  useEffect(() => {
    if (listRef.current) {
      const item = listRef.current.children[selectedIndex] as HTMLElement;
      item?.scrollIntoView({ block: "nearest" });
    }
  }, [selectedIndex]);

  if (filtered.length === 0) return null;

  return (
    <div className="absolute bottom-full left-0 mb-2 w-72 rounded-xl border border-gray-200 bg-white shadow-lg z-50">
      <div className="px-3 py-2 text-xs font-medium text-gray-400 border-b border-gray-100">
        멘션할 페르소나 선택
      </div>
      <ul ref={listRef} className="max-h-48 overflow-y-auto py-1">
        {filtered.map((persona, i) => (
          <li
            key={persona.id}
            onMouseDown={(e) => {
              // textarea가 blur되어 드롭다운이 닫히기 전에 선택을 확정
              e.preventDefault();
              onSelect(persona.id, persona.name);
            }}
            onClick={(e) => e.preventDefault()}
            className={`flex cursor-pointer items-center gap-3 px-3 py-2 text-sm transition-colors ${
              i === selectedIndex
                ? "bg-blue-50 text-blue-700"
                : "text-gray-700 hover:bg-gray-50"
            }`}
          >
            <span className="flex h-8 w-8 shrink-0 items-center justify-center overflow-hidden rounded-full bg-[#F0EDE6] text-lg text-[#1E1B4B]">
              <PersonaIcon
                personaId={persona.id}
                fallbackEmoji={persona.icon}
                photoUrl={persona.photoUrl}
                className={persona.photoUrl ? "h-8 w-8" : "h-5 w-5"}
              />
            </span>
            <div className="min-w-0">
              <div className="font-medium">{persona.name}</div>
              <div className="truncate text-xs text-gray-400">{persona.description}</div>
            </div>
          </li>
        ))}
      </ul>
    </div>
  );
}

export default memo(MentionDropdown);

export function getFilteredPersonas(
  query: string,
  customPersonas?: Record<string, CustomPersona>,
  overrideMap?: Record<string, PersonaOverride>,
): Persona[] {
  return buildPersonaList(customPersonas, overrideMap).filter((p) =>
    p.name.toLowerCase().includes(query.toLowerCase())
  );
}
