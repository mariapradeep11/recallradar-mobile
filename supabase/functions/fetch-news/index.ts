// @ts-nocheck
// RecallRadar — fetch-news Edge Function
//
// Called by the mobile app when a user expands the "News Intel" section on a recall card.
// Flow:
//   1. Authenticate user from JWT, check premium status
//   2. Check news_snapshots for a fresh (< 24h) entry for this recall_number
//   3. If stale / missing: fetch Google News RSS → parse articles → call Claude for summary → store
//   4. Return gated response: premium gets articles + summary, free gets article_count only

import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const CORS = {
  "Access-Control-Allow-Origin":  "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

// ── Types ─────────────────────────────────────────────────────────────────────

interface Article {
  title:   string;
  source:  string;
  link:    string;
  pubDate: string;
  snippet: string;
}

// ── Google News RSS ───────────────────────────────────────────────────────────

function decodeXml(str: string): string {
  return str
    .replace(/&amp;/g, "&").replace(/&lt;/g, "<").replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"').replace(/&#39;/g, "'").replace(/&nbsp;/g, " ");
}

function extractTag(item: string, tag: string): string {
  const cdataMatch = item.match(new RegExp(`<${tag}[^>]*><!\\[CDATA\\[([\\s\\S]*?)\\]\\]><\\/${tag}>`));
  if (cdataMatch) return decodeXml(cdataMatch[1].trim());
  const plainMatch = item.match(new RegExp(`<${tag}[^>]*>([\\s\\S]*?)<\\/${tag}>`));
  return plainMatch ? decodeXml(plainMatch[1].trim()) : "";
}

async function fetchGoogleNews(query: string): Promise<Article[]> {
  const q = encodeURIComponent(`${query} recall`);
  const url = `https://news.google.com/rss/search?q=${q}&hl=en-US&gl=US&ceid=US:en`;
  const res = await fetch(url, { headers: { "User-Agent": "RecallRadar/1.0" } });
  if (!res.ok) return [];

  const xml = await res.text();
  const items = xml.match(/<item>([\s\S]*?)<\/item>/g) ?? [];

  return items.slice(0, 5).map((item): Article => {
    const title   = extractTag(item, "title");
    const link    = extractTag(item, "link") || item.match(/<link\/>(.*?)<title/s)?.[1]?.trim() || "";
    const pubDate = extractTag(item, "pubDate");
    const source  = extractTag(item, "source");
    const rawDesc = extractTag(item, "description");
    // Strip any HTML tags from the description snippet
    const snippet = rawDesc.replace(/<[^>]+>/g, "").slice(0, 240);
    return { title, source, link, pubDate, snippet };
  }).filter(a => a.title);
}

// ── Claude summarisation ──────────────────────────────────────────────────────

async function summariseWithClaude(query: string, articles: Article[]): Promise<string | null> {
  const apiKey = Deno.env.get("ANTHROPIC_API_KEY");
  if (!apiKey || articles.length === 0) return null;

  const articleList = articles
    .map((a, i) => `${i + 1}. "${a.title}" — ${a.source || "News"}\n   ${a.snippet}`)
    .join("\n");

  const prompt = `You are RecallRadar's intelligence engine. A product safety recall has generated news coverage. Write a 2-sentence intelligence summary that:
1. States the specific safety concern and the product involved
2. Conveys the scale or impact (how serious, how widespread, or how many affected if known)

Be factual and direct. No alarmism, no hedging. Write for someone deciding whether to discard a product they own right now.

Product: ${query}
News coverage:
${articleList}

Summary:`;

  try {
    const res = await fetch("https://api.anthropic.com/v1/messages", {
      method: "POST",
      headers: {
        "x-api-key":         apiKey,
        "anthropic-version": "2023-06-01",
        "content-type":      "application/json",
      },
      body: JSON.stringify({
        model:      "claude-haiku-4-5-20251001",
        max_tokens: 200,
        messages:   [{ role: "user", content: prompt }],
      }),
    });
    if (!res.ok) return null;
    const data = await res.json();
    return data.content?.[0]?.text?.trim() ?? null;
  } catch {
    return null;
  }
}

// ── Handler ───────────────────────────────────────────────────────────────────

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: CORS });
  }

  try {
    const supabaseService = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
    );

    // ── Authenticate user ─────────────────────────────────────────────────────
    const jwt = req.headers.get("Authorization")?.replace("Bearer ", "");
    if (!jwt) {
      return new Response(JSON.stringify({ error: "Unauthorized" }), {
        status: 401, headers: { ...CORS, "Content-Type": "application/json" },
      });
    }

    // Verify JWT and get user
    const supabaseUser = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_ANON_KEY")!,
      { global: { headers: { Authorization: `Bearer ${jwt}` } } },
    );
    const { data: { user }, error: authError } = await supabaseUser.auth.getUser();
    if (authError || !user) {
      return new Response(JSON.stringify({ error: "Unauthorized" }), {
        status: 401, headers: { ...CORS, "Content-Type": "application/json" },
      });
    }

    // ── Check premium status ──────────────────────────────────────────────────
    const { data: profile } = await supabaseService
      .from("users")
      .select("is_premium")
      .eq("id", user.id)
      .single();

    const isPremium: boolean = profile?.is_premium ?? false;

    // ── Parse request ─────────────────────────────────────────────────────────
    const { recall_number, query } = await req.json();
    if (!recall_number || !query) {
      return new Response(JSON.stringify({ error: "recall_number and query required" }), {
        status: 400, headers: { ...CORS, "Content-Type": "application/json" },
      });
    }

    // ── Check snapshot cache ──────────────────────────────────────────────────
    const { data: existing } = await supabaseService
      .from("news_snapshots")
      .select("articles, summary, article_count, computed_at, expires_at")
      .eq("recall_number", recall_number)
      .single();

    const now = Date.now();
    const isFresh = existing && new Date(existing.expires_at).getTime() > now;

    if (isFresh) {
      // Return cached snapshot, gated by premium status
      return new Response(
        JSON.stringify({
          article_count: existing.article_count,
          computed_at:   existing.computed_at,
          teaser:        !isPremium,
          articles:      isPremium ? existing.articles : [],
          summary:       isPremium ? existing.summary  : null,
        }),
        { headers: { ...CORS, "Content-Type": "application/json" } },
      );
    }

    // ── Fetch fresh news ──────────────────────────────────────────────────────
    const articles  = await fetchGoogleNews(query);
    const summary   = await summariseWithClaude(query, articles);

    // Persist snapshot (upsert by recall_number)
    const { data: recall } = await supabaseService
      .from("recalls")
      .select("id")
      .eq("recall_number", recall_number)
      .single();

    await supabaseService.from("news_snapshots").upsert({
      recall_number,
      recall_id:     recall?.id ?? null,
      query,
      articles,
      summary,
      article_count: articles.length,
      computed_at:   new Date().toISOString(),
      expires_at:    new Date(now + 24 * 60 * 60 * 1000).toISOString(),
    }, { onConflict: "recall_number" });

    return new Response(
      JSON.stringify({
        article_count: articles.length,
        computed_at:   new Date().toISOString(),
        teaser:        !isPremium,
        articles:      isPremium ? articles : [],
        summary:       isPremium ? summary  : null,
      }),
      { headers: { ...CORS, "Content-Type": "application/json" } },
    );

  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    return new Response(JSON.stringify({ error: message }), {
      status: 500, headers: { ...CORS, "Content-Type": "application/json" },
    });
  }
});
