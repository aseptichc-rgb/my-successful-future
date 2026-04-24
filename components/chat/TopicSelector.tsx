"use client";

import type { NewsTopic } from "@/types";

const TOPICS: { label: string; value: NewsTopic }[] = [
  { label: "전체", value: "전체" },
  { label: "국내", value: "국내" },
  { label: "글로벌", value: "글로벌" },
  { label: "헬스케어", value: "헬스케어" },
  { label: "IT", value: "IT" },
];

interface Props {
  selected: NewsTopic;
  onChange: (topic: NewsTopic) => void;
}

export default function TopicSelector({ selected, onChange }: Props) {
  return (
    <div className="flex gap-2 overflow-x-auto border-b border-black/[0.06] bg-white px-4 py-2.5 hide-scrollbar">
      {TOPICS.map(({ label, value }) => {
        const isActive = selected === value;
        return (
          <button
            key={value}
            onClick={() => onChange(value)}
            className={`shrink-0 rounded-pill px-4 py-1.5 text-[13px] font-medium tracking-[-0.01em] transition-colors ${
              isActive
                ? "bg-[#1d1d1f] text-white"
                : "bg-[#f5f5f7] text-black/70 hover:bg-black/[0.06]"
            }`}
          >
            {label}
          </button>
        );
      })}
    </div>
  );
}
