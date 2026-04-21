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

function normalizeResultUrl(value) {
  if (typeof value !== "string") return "";

  try {
    const url = new URL(value);
    if (!["http:", "https:"].includes(url.protocol)) return "";
    return url.toString();
  } catch {
    return "";
  }
}

function addResult(results, result) {
  const url = normalizeResultUrl(result.url);
  const title = typeof result.title === "string" ? result.title.trim() : "";
  const snippet = typeof result.snippet === "string" ? result.snippet.trim() : "";

  if (!url || !title) return;
  if (results.some((item) => item.url === url || item.title === title)) return;

  results.push({
    title,
    snippet: snippet || "Open this result for the full page.",
    url,
    source: result.source || "Search",
  });
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
      for (const nestedTopic of flattenRelatedTopics(topic.Topics)) {
        addResult(results, nestedTopic);
      }
      continue;
    }

    if (!topic.FirstURL || !topic.Text) continue;

    const [title, ...rest] = String(topic.Text).split(" - ");
    addResult(results, {
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
      title: url,
      summary:
        "This looks like a website address. Vanta can keep the card here, but the full page has to open normally if the site blocks embedding.",
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
      addResult(results, {
        title: data.Heading || query,
        snippet: data.AbstractText,
        url: data.AbstractURL,
        source: data.AbstractSource || "DuckDuckGo",
      });
    }

    if (data.Answer) {
      addResult(results, {
        title: data.Heading || "Instant answer",
        snippet: data.Answer,
        url: externalSearchUrl,
        source: "DuckDuckGo",
      });
    }

    for (const result of flattenRelatedTopics(data.RelatedTopics)) {
      addResult(results, result);
    }

    if (results.length === 0) {
      addResult(results, {
        title: `Search the web for "${query}"`,
        snippet:
          "No instant-answer cards were found, but you can open a normal search page for full results.",
        url: externalSearchUrl,
        source: "Search fallback",
      });
    }

    return jsonNoStore({
      query,
      kind: "search",
      title: data.Heading || `Search: ${query}`,
      summary:
        data.AbstractText ||
        "Vanta can show lightweight search context here. Open a result only when you need the full page.",
      externalSearchUrl,
      results: results.slice(0, 8),
    });
  } catch {
    const fallbackResult = {
      title: `Open search results for "${query}"`,
      snippet:
        "The internal search provider did not respond, but this link can open the full search page.",
      url: externalSearchUrl,
      source: "Search fallback",
    };

    return jsonNoStore({
      query,
      kind: "search",
      title: `Search: ${query}`,
      summary:
        "Vanta could not load live search cards right now, so it kept a fallback search link ready.",
      externalSearchUrl,
      results: [fallbackResult],
    });
  }
}
