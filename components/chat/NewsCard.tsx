import type { NewsSource } from "@/types";

interface Props {
  source: NewsSource;
}

export default function NewsCard({ source }: Props) {
  return (
    <a
      href={source.url}
      target="_blank"
      rel="noopener noreferrer"
      className="block rounded-xl border border-gray-200 bg-white p-4 transition-shadow hover:shadow-md"
    >
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
    </a>
  );
}
