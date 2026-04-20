import {
  jsonNoStore,
  validateRequestOrigin,
} from "@/app/lib/security";

const SEARCH_LINKS = {
  google: (query) => `https://www.google.com/search?q=${encodeURIComponent(query)}`,
  duckduckgo: (query) => `https://duckduckgo.com/?q=${encodeURIComponent(query)}`,
};

function getExternalSearchUrl(query, engine = "duckduckgo") {
  return (SEARCH_LINKS[engine] || SEARCH_LINKS.duckduckgo)(query);
}

function isWebUrl(value) {
  if (/^https?:\/\//i.test(value)) return true;
  if (/^[a-z][a-z0-9+.-]*:/i.test(value)) return false;

  const hasWhitespace = /\s/.test(value);
  return (
    !hasWhitespace &&
    (/^(localhost|\d{1,3}(?:\.\d{1,3}){3})(:\d+)?(\/|$)/i.test(value) ||
      /^[a-z0-9-]+(\.[a-z0-9-]+)+(:\d+)?(\/.*)?$/i.test(value))
  );
}

function normalizeWebUrl(value) {
  return /^https?:\/\//i.test(value) ? value : `https://${value}`;
}

function flattenRelatedTopics(topics = []) {
  const results = [];

  for (const topic of topics) {
    if (Array.isArray(topic.Topics)) {
      results.push(...flattenRelatedTopics(topic.Topics));
      continue;
    }

    if (!topic.FirstURL || !topic.Text) continue;

    const [title, ...rest] = String(topic.Text).split(" - ");
    results.push({
      title: title || topic.Text,
      snippet: rest.join(" - ") || topic.Text,
      url: topic.FirstURL,
      source: "DuckDuckGo",
    });
  }

  return results;
}

export async function GET(req) {
  const originError = validateRequestOrigin(req);
  if (originError) return originError;

  const { searchParams } = new URL(req.url);
  const query = (searchParams.get("q") || "").trim().slice(0, 180);
  const engine = (searchParams.get("engine") || "duckduckgo").trim();

  if (!query) {
    return jsonNoStore({ error: "Search query is required." }, { status: 400 });
  }

  if (isWebUrl(query)) {
    const url = normalizeWebUrl(query);
    return jsonNoStore({
      query,
      kind: "url",
      title: "Ready to open",
      summary: "This looks like a website address. Vanta keeps it as an internal tab card.",
      externalSearchUrl: url,
      results: [
        {
          title: url,
          snippet:
            "Browser security prevents Vanta from embedding every website directly, but you can open the address normally from here.",
          url,
          source: "Direct URL",
        },
      ],
    });
  }

  const externalSearchUrl = getExternalSearchUrl(query, engine);

  try {
    const response = await fetch(
      `https://api.duckduckgo.com/?q=${encodeURIComponent(
        query
      )}&format=json&no_html=1&skip_disambig=1`,
      {
        cache: "no-store",
        headers: {
          Accept: "application/json",
        },
      }
    );

    if (!response.ok) {
      throw new Error("Search provider did not respond.");
    }

    const data = await response.json();
    const results = [];

    if (data.AbstractText && data.AbstractURL) {
      results.push({
        title: data.Heading || query,
        snippet: data.AbstractText,
        url: data.AbstractURL,
        source: data.AbstractSource || "DuckDuckGo",
      });
    }

    if (data.Answer) {
      results.push({
        title: data.Heading || "Instant answer",
        snippet: data.Answer,
        url: externalSearchUrl,
        source: "DuckDuckGo",
      });
    }

    results.push(...flattenRelatedTopics(data.RelatedTopics));

    return jsonNoStore({
      query,
      kind: "search",
      title: data.Heading || `Search: ${query}`,
      summary:
        data.AbstractText ||
        "Vanta can show lightweight search context here. Open a result for the full page.",
      externalSearchUrl,
      results: results.slice(0, 8),
    });
  } catch {
    return jsonNoStore({
      query,
      kind: "search",
      title: `Search: ${query}`,
      summary:
        "Vanta could not load live search cards right now. You can still open the search normally.",
      externalSearchUrl,
      results: [],
    });
  }
}
