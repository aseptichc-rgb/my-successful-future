"use client";

import { useState } from "react";
import type { NewsSource } from "@/types";

interface Props {
  source: NewsSource;
}

export default function NewsCard({ source }: Props) {
  const [imgError, setImgError] = useState(false);

  return (
    <a
      href={source.url}
      target="_blank"
      rel="noopener noreferrer"
      className="block overflow-hidden rounded-xl border border-gray-200 bg-white transition-shadow hover:shadow-md"
    >
      {/* 썸네일 이미지 */}
      {source.imageUrl && !imgError ? (
        <div className="relative h-40 w-full bg-gray-100">
          <img
            src={source.imageUrl}
            alt=""
            className="h-full w-full object-cover"
            onError={() => setImgError(true)}
            loading="lazy"
          />
        </div>
      ) : (
        <div className="flex h-24 w-full items-center justify-center bg-gradient-to-br from-gray-50 to-gray-100">
          <svg
            className="h-8 w-8 text-gray-300"
            fill="none"
            stroke="currentColor"
            viewBox="0 0 24 24"
          >
            <path
              strokeLinecap="round"
              strokeLinejoin="round"
              strokeWidth={1.5}
              d="M19 20H5a2 2 0 01-2-2V6a2 2 0 012-2h10a2 2 0 012 2v1m2 13a2 2 0 01-2-2V7m2 13a2 2 0 002-2V9a2 2 0 00-2-2h-2m-4-3H9M7 16h6M7 8h6v4H7V8z"
            />
          </svg>
        </div>
      )}

      {/* 텍스트 영역 */}
      <div className="p-4">
        <div className="flex items-start justify-between gap-3">
          <div className="min-w-0 flex-1">
            <h3 className="line-clamp-2 text-sm font-semibold text-gray-900">
              {source.title}
            </h3>
            {source.summary && (
              <p className="mt-1.5 line-clamp-2 text-xs leading-relaxed text-gray-500">
                {source.summary}
              </p>
            )}
            <div className="mt-2 flex items-center gap-2 text-xs text-gray-400">
              <span className="font-medium text-gray-600">{source.publisher}</span>
              <span>·</span>
              <span>{source.publishedAt}</span>
            </div>
          </div>
          <svg
            className="mt-0.5 h-4 w-4 shrink-0 text-gray-300"
            fill="none"
            stroke="currentColor"
            viewBox="0 0 24 24"
          >
            <path
              strokeLinecap="round"
              strokeLinejoin="round"
              strokeWidth={2}
              d="M10 6H6a2 2 0 00-2 2v10a2 2 0 002 2h10a2 2 0 002-2v-4M14 4h6m0 0v6m0-6L10 14"
            />
          </svg>
        </div>
      </div>
    </a>
  );
}
