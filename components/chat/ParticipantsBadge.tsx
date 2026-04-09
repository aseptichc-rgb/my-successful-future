"use client";

import { useState } from "react";

interface Props {
  participantNames: Record<string, string>;
  ownerUid: string;
  currentUid: string;
}

export default function ParticipantsBadge({ participantNames, ownerUid, currentUid }: Props) {
  const [showList, setShowList] = useState(false);
  const count = Object.keys(participantNames).length;

  if (count <= 1) return null;

  const entries = Object.entries(participantNames);

  return (
    <div className="relative">
      <button
        onClick={() => setShowList(!showList)}
        className="flex items-center gap-1.5 rounded-full bg-green-50 px-3 py-1 text-xs font-medium text-green-700 hover:bg-green-100 transition-colors"
      >
        <svg className="h-3.5 w-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M17 20h5v-2a3 3 0 00-5.356-1.857M17 20H7m10 0v-2c0-.656-.126-1.283-.356-1.857M7 20H2v-2a3 3 0 015.356-1.857M7 20v-2c0-.656.126-1.283.356-1.857m0 0a5.002 5.002 0 019.288 0M15 7a3 3 0 11-6 0 3 3 0 016 0z" />
        </svg>
        {count}명 참여 중
      </button>

      {showList && (
        <>
          <div className="fixed inset-0 z-40" onClick={() => setShowList(false)} />
          <div className="absolute left-0 top-full z-50 mt-1 w-56 rounded-xl border border-gray-200 bg-white py-2 shadow-lg">
            <p className="px-3 pb-1 text-xs font-medium text-gray-400">참여자</p>
            {entries.map(([uid, name]) => (
              <div key={uid} className="flex items-center gap-2 px-3 py-1.5">
                <div className="flex h-6 w-6 items-center justify-center rounded-full bg-blue-100 text-xs font-bold text-blue-600">
                  {name.charAt(0)}
                </div>
                <span className="text-sm text-gray-700">
                  {name}
                  {uid === ownerUid && (
                    <span className="ml-1 text-xs text-gray-400">(방장)</span>
                  )}
                  {uid === currentUid && (
                    <span className="ml-1 text-xs text-blue-500">(나)</span>
                  )}
                </span>
              </div>
            ))}
          </div>
        </>
      )}
    </div>
  );
}
