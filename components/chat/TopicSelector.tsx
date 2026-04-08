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
    <div className="flex gap-2 overflow-x-auto px-4 py-2 scrollbar-hide">
      {TOPICS.map(({ label, value }) => (
        <button
          key={value}
          onClick={() => onChange(value)}
          className={`shrink-0 rounded-full px-4 py-1.5 text-sm font-medium transition-colors ${
            selected === value
              ? "bg-blue-600 text-white"
              : "bg-gray-100 text-gray-600 hover:bg-gray-200"
          }`}
        >
          {label}
        </button>
      ))}
    </div>
  );
}
