"use client";

import { useState, useCallback } from "react";
import type { NewsSource, NewsTopic } from "@/types";

export function useNews() {
  const [news, setNews] = useState<NewsSource[]>([]);
  const [isLoading, setIsLoading] = useState(false);

  const searchNews = useCallback(async (query: string, topic: NewsTopic = "전체") => {
    setIsLoading(true);
    try {
      const res = await fetch("/api/news", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ query, topic }),
      });

      if (!res.ok) throw new Error("뉴스 검색 실패");

      const data = await res.json();
      setNews(data.news || []);
      return data.news || [];
    } catch {
      setNews([]);
      return [];
    } finally {
      setIsLoading(false);
    }
  }, []);

  const clearNews = useCallback(() => setNews([]), []);

  return { news, isLoading, searchNews, clearNews };
}
