/**
 * Trading News Service
 * Connects the ZEKE news system to the trading module, providing
 * stock-relevant news context for trading decisions.
 */

import {
  getNewsTopics,
  createNewsTopic,
  getRecentNewsStories,
  getAllNewsTags,
  getStoryTags,
} from "../db";
import type { NewsStory, NewsTopic, NewsTag } from "@shared/schema";

const STOCK_WATCHLIST = ["NVDA", "SPY", "META", "GOOGL", "AVGO", "GOOG", "AMZN"];

interface TradingNewsContext {
  stories: Array<{
    headline: string;
    summary: string;
    source: string | null;
    relevance: string;
    sentiment: "positive" | "negative" | "neutral" | "unknown";
    publishedAt: string;
    tags: string[];
  }>;
  marketSentiment: "bullish" | "bearish" | "mixed" | "neutral";
  keyThemes: string[];
  lastUpdated: string;
}

const STOCK_TOPICS = [
  {
    topic: "Stock Market & Trading",
    description: "Market movements, trading signals, and stock performance",
    keywords: JSON.stringify(["stock market", "trading", "NYSE", "NASDAQ", "market rally", "market selloff", "earnings", "IPO"]),
    priority: 8,
    isActive: true,
    forceInclude: false,
    isChallengePerspective: false,
  },
  {
    topic: "NVDA Nvidia News",
    description: "News about Nvidia Corporation",
    keywords: JSON.stringify(["NVDA", "Nvidia", "GPU", "AI chips", "Jensen Huang"]),
    priority: 9,
    isActive: true,
    forceInclude: false,
    isChallengePerspective: false,
  },
  {
    topic: "Tech Giants (GOOGL, META, AMZN)",
    description: "News about major tech companies in watchlist",
    keywords: JSON.stringify(["Google", "Alphabet", "Meta", "Facebook", "Amazon", "AWS", "cloud computing"]),
    priority: 8,
    isActive: true,
    forceInclude: false,
    isChallengePerspective: false,
  },
  {
    topic: "S&P 500 & Market Indices",
    description: "Index movements and broad market trends",
    keywords: JSON.stringify(["SPY", "S&P 500", "Dow Jones", "market index", "index fund", "ETF"]),
    priority: 8,
    isActive: true,
    forceInclude: false,
    isChallengePerspective: false,
  },
  {
    topic: "AI & Semiconductor Industry",
    description: "AI developments and chip industry news",
    keywords: JSON.stringify(["AI", "artificial intelligence", "semiconductor", "AVGO", "Broadcom", "chip shortage", "data center"]),
    priority: 8,
    isActive: true,
    forceInclude: false,
    isChallengePerspective: false,
  },
  {
    topic: "Federal Reserve & Interest Rates",
    description: "Fed policy decisions affecting markets",
    keywords: JSON.stringify(["Federal Reserve", "interest rates", "Fed", "Jerome Powell", "monetary policy", "rate hike", "rate cut"]),
    priority: 7,
    isActive: true,
    forceInclude: true,
    isChallengePerspective: false,
  },
  {
    topic: "Market Bears & Risk Analysis",
    description: "Bearish perspectives and risk factors",
    keywords: JSON.stringify(["market crash", "recession", "bear market", "correction", "risk", "volatility", "VIX"]),
    priority: 6,
    isActive: true,
    forceInclude: true,
    isChallengePerspective: true,
  },
];

export async function ensureStockTopicsExist(): Promise<void> {
  try {
    const existingTopics = await getNewsTopics(false);
    const existingTopicNames = new Set(existingTopics.map(t => t.topic));

    for (const topicData of STOCK_TOPICS) {
      if (!existingTopicNames.has(topicData.topic)) {
        await createNewsTopic(topicData);
        console.log(`[TradingNews] Created stock topic: ${topicData.topic}`);
      }
    }
  } catch (error) {
    console.error("[TradingNews] Error ensuring stock topics:", error);
  }
}

function inferSentiment(headline: string, summary: string): "positive" | "negative" | "neutral" | "unknown" {
  const text = `${headline} ${summary}`.toLowerCase();
  
  const positiveWords = ["surge", "rally", "gains", "soar", "jump", "rise", "beat", "exceeds", "breakthrough", "bullish", "growth", "record high"];
  const negativeWords = ["crash", "plunge", "drop", "fall", "decline", "miss", "cuts", "bearish", "layoff", "warning", "concern", "risk", "slump"];
  
  let positiveCount = 0;
  let negativeCount = 0;
  
  for (const word of positiveWords) {
    if (text.includes(word)) positiveCount++;
  }
  for (const word of negativeWords) {
    if (text.includes(word)) negativeCount++;
  }
  
  if (positiveCount > negativeCount + 1) return "positive";
  if (negativeCount > positiveCount + 1) return "negative";
  if (positiveCount > 0 || negativeCount > 0) return "neutral";
  return "unknown";
}

function determineRelevance(headline: string, summary: string, tags: string[]): string {
  const text = `${headline} ${summary}`.toLowerCase();
  const relevanceFactors: string[] = [];
  
  for (const symbol of STOCK_WATCHLIST) {
    if (text.includes(symbol.toLowerCase()) || 
        (symbol === "NVDA" && text.includes("nvidia")) ||
        (symbol === "GOOGL" && (text.includes("google") || text.includes("alphabet"))) ||
        (symbol === "META" && (text.includes("meta") || text.includes("facebook"))) ||
        (symbol === "AMZN" && text.includes("amazon")) ||
        (symbol === "SPY" && (text.includes("s&p") || text.includes("s&p 500"))) ||
        (symbol === "AVGO" && text.includes("broadcom"))) {
      relevanceFactors.push(`Direct ${symbol} mention`);
    }
  }
  
  if (text.includes("fed") || text.includes("interest rate") || text.includes("federal reserve")) {
    relevanceFactors.push("Fed/Interest rates");
  }
  if (text.includes("earnings") || text.includes("revenue") || text.includes("guidance")) {
    relevanceFactors.push("Earnings impact");
  }
  if (text.includes("ai") || text.includes("artificial intelligence") || text.includes("chip") || text.includes("semiconductor")) {
    relevanceFactors.push("AI/Semiconductor sector");
  }
  
  return relevanceFactors.length > 0 ? relevanceFactors.join(", ") : "General market news";
}

export async function getTradingNewsContext(hoursBack: number = 24): Promise<TradingNewsContext> {
  try {
    const cutoffTime = new Date(Date.now() - hoursBack * 60 * 60 * 1000).toISOString();
    const allStories = await getRecentNewsStories(50);
    
    const recentStories = allStories.filter(s => s.createdAt >= cutoffTime);
    
    const stockKeywords = [
      ...STOCK_WATCHLIST.map(s => s.toLowerCase()),
      "nvidia", "google", "alphabet", "meta", "facebook", "amazon", "broadcom",
      "stock", "market", "trading", "earnings", "fed", "interest rate", "s&p",
      "ai", "semiconductor", "chip", "tech", "nasdaq"
    ];
    
    const relevantStories = recentStories.filter(story => {
      const text = `${story.headline} ${story.summary}`.toLowerCase();
      return stockKeywords.some(keyword => text.includes(keyword));
    });
    
    const processedStories = await Promise.all(
      relevantStories.slice(0, 10).map(async (story) => {
        const storyTagData = await getStoryTags(story.id);
        const tags = storyTagData.map(st => st.tag?.displayName || "").filter(Boolean);
        
        return {
          headline: story.headline,
          summary: story.summary,
          source: story.source,
          relevance: determineRelevance(story.headline, story.summary, tags),
          sentiment: inferSentiment(story.headline, story.summary),
          publishedAt: story.createdAt,
          tags,
        };
      })
    );
    
    let positiveCount = 0;
    let negativeCount = 0;
    for (const story of processedStories) {
      if (story.sentiment === "positive") positiveCount++;
      if (story.sentiment === "negative") negativeCount++;
    }
    
    let marketSentiment: TradingNewsContext["marketSentiment"] = "neutral";
    if (processedStories.length > 0) {
      const ratio = (positiveCount - negativeCount) / processedStories.length;
      if (ratio > 0.3) marketSentiment = "bullish";
      else if (ratio < -0.3) marketSentiment = "bearish";
      else if (positiveCount > 0 && negativeCount > 0) marketSentiment = "mixed";
    }
    
    const allTags = await getAllNewsTags();
    const highWeightTags = allTags
      .filter(t => t.weight > 60 && t.usageCount > 0)
      .sort((a, b) => b.weight - a.weight)
      .slice(0, 5)
      .map(t => t.displayName);
    
    return {
      stories: processedStories,
      marketSentiment,
      keyThemes: highWeightTags,
      lastUpdated: new Date().toISOString(),
    };
  } catch (error) {
    console.error("[TradingNews] Error getting trading news context:", error);
    return {
      stories: [],
      marketSentiment: "neutral",
      keyThemes: [],
      lastUpdated: new Date().toISOString(),
    };
  }
}

export function formatNewsForTrading(context: TradingNewsContext): string {
  if (context.stories.length === 0) {
    return "No recent market-relevant news available.";
  }
  
  const lines: string[] = [
    `MARKET NEWS CONTEXT (${context.stories.length} stories, sentiment: ${context.marketSentiment.toUpperCase()})`,
    "",
  ];
  
  if (context.keyThemes.length > 0) {
    lines.push(`Key Themes: ${context.keyThemes.join(", ")}`);
    lines.push("");
  }
  
  for (const story of context.stories.slice(0, 5)) {
    const sentimentEmoji = story.sentiment === "positive" ? "[+]" : 
                           story.sentiment === "negative" ? "[-]" : 
                           "[=]";
    lines.push(`${sentimentEmoji} ${story.headline}`);
    lines.push(`   Relevance: ${story.relevance}`);
    if (story.source) lines.push(`   Source: ${story.source}`);
    lines.push("");
  }
  
  return lines.join("\n");
}
