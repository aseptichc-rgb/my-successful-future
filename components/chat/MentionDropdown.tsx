"use client";

import { useEffect, useRef } from "react";
import { PERSONA_LIST } from "@/lib/personas";
import type { PersonaId } from "@/types";

interface MentionDropdownProps {
  query: string;
  onSelect: (personaId: PersonaId, personaName: string) => void;
  onClose: () => void;
  selectedIndex: number;
}

export default function MentionDropdown({
  query,
  onSelect,
  onClose,
  selectedIndex,
}: MentionDropdownProps) {
  const listRef = useRef<HTMLUListElement>(null);

  const filtered = PERSONA_LIST.filter((p) =>
    p.name.toLowerCase().includes(query.toLowerCase())
  );

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
            onClick={() => onSelect(persona.id, persona.name)}
            className={`flex cursor-pointer items-center gap-3 px-3 py-2 text-sm transition-colors ${
              i === selectedIndex
                ? "bg-blue-50 text-blue-700"
                : "text-gray-700 hover:bg-gray-50"
            }`}
          >
            <span className="text-lg">{persona.icon}</span>
            <div>
              <div className="font-medium">{persona.name}</div>
              <div className="text-xs text-gray-400">{persona.description}</div>
            </div>
          </li>
        ))}
      </ul>
    </div>
  );
}

export function getFilteredPersonas(query: string) {
  return PERSONA_LIST.filter((p) =>
    p.name.toLowerCase().includes(query.toLowerCase())
  );
}
