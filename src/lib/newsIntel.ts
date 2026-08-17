import { supabase } from "./supabase";

export type Article = {
  title:   string;
  source:  string;
  link:    string;
  pubDate: string;
  snippet: string;
};

export type NewsSnapshot = {
  articleCount: number;
  teaser:       boolean;   // true = free user — articles/summary are empty
  articles:     Article[];
  summary:      string | null;
  computedAt:   string | null;
};

export async function fetchNewsIntel(
  recallNumber: string,
  query: string,
): Promise<NewsSnapshot | null> {
  const { data: { session } } = await supabase.auth.getSession();
  if (!session) return null;

  const { data, error } = await supabase.functions.invoke("fetch-news", {
    body: { recall_number: recallNumber, query },
  });

  if (error || !data) return null;

  return {
    articleCount: data.article_count ?? 0,
    teaser:       data.teaser        ?? true,
    articles:     data.articles      ?? [],
    summary:      data.summary       ?? null,
    computedAt:   data.computed_at   ?? null,
  };
}
