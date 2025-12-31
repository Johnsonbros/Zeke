import type OpenAI from "openai";
import type { ToolPermissions } from "../tools";
import { logPerplexity } from "../apiUsageLogger";

function decodeHtmlEntities(text: string): string {
  return text
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"')
    .replace(/&#x27;/g, "'")
    .replace(/&#39;/g, "'")
    .replace(/&nbsp;/g, " ")
    .replace(/&#(\d+);/g, (_, num) => String.fromCharCode(parseInt(num, 10)))
    .replace(/&#x([0-9a-fA-F]+);/g, (_, hex) => String.fromCharCode(parseInt(hex, 16)));
}

interface WebSearchResult {
  title: string;
  snippet: string;
  url: string;
}

export const searchToolDefinitions: OpenAI.Chat.ChatCompletionTool[] = [
  {
    type: "function",
    function: {
      name: "web_search",
      description: "Basic web search using DuckDuckGo. Use perplexity_search instead for complex questions that need comprehensive answers with sources.",
      parameters: {
        type: "object",
        properties: {
          query: {
            type: "string",
            description: "The search query - be specific, include location if relevant (e.g., 'Atrius Health Braintree MA phone number')",
          },
        },
        required: ["query"],
      },
    },
  },
  {
    type: "function",
    function: {
      name: "perplexity_search",
      description: "AI-powered web search using Perplexity. PREFERRED for complex questions, research, current events, detailed explanations, and any query that benefits from synthesized answers with citations. Returns a comprehensive answer with source URLs.",
      parameters: {
        type: "object",
        properties: {
          query: {
            type: "string",
            description: "The question or search query - can be conversational (e.g., 'What are the best restaurants in Boston for Italian food?' or 'How do I set up a 529 college savings plan?')",
          },
          recency: {
            type: "string",
            enum: ["day", "week", "month", "year"],
            description: "Optional: Filter results by recency. Use 'day' for breaking news, 'week' for recent events, 'month' for general queries. Default is no filter.",
          },
        },
        required: ["query"],
      },
    },
  },
];

export const searchToolPermissions: Record<string, (permissions: ToolPermissions) => boolean> = {
  web_search: () => true,
  perplexity_search: () => true,
};

interface ExecuteOptions {
  conversationId?: string;
}

export async function executeSearchTool(
  toolName: string,
  args: Record<string, unknown>,
  options: ExecuteOptions
): Promise<string | null> {
  const { conversationId } = options;

  switch (toolName) {
    case "web_search": {
      const { query } = args as { query: string };
      
      try {
        const results: WebSearchResult[] = [];
        
        try {
          const instantResponse = await fetch(
            `https://api.duckduckgo.com/?q=${encodeURIComponent(query)}&format=json&no_html=1`
          );
          const instantData = await instantResponse.json();
          
          if (instantData.AbstractText) {
            results.push({
              title: instantData.Heading || "Summary",
              snippet: instantData.AbstractText,
              url: instantData.AbstractURL || "",
            });
          }
          
          if (instantData.Infobox?.content) {
            const infoItems = instantData.Infobox.content
              .filter((item: any) => item.value)
              .map((item: any) => `${item.label}: ${item.value}`)
              .join(", ");
            if (infoItems) {
              results.push({
                title: "Contact Information",
                snippet: infoItems,
                url: instantData.AbstractURL || "",
              });
            }
          }
          
          if (instantData.Answer) {
            results.push({
              title: "Answer",
              snippet: instantData.Answer,
              url: "",
            });
          }
          
          if (instantData.RelatedTopics) {
            for (const topic of instantData.RelatedTopics.slice(0, 5)) {
              if (topic.Text) {
                results.push({
                  title: topic.Text.split(" - ")[0] || "Related",
                  snippet: topic.Text,
                  url: topic.FirstURL || "",
                });
              }
              if (topic.Topics) {
                for (const subTopic of topic.Topics.slice(0, 2)) {
                  if (subTopic.Text) {
                    results.push({
                      title: subTopic.Text.split(" - ")[0] || "Related",
                      snippet: subTopic.Text,
                      url: subTopic.FirstURL || "",
                    });
                  }
                }
              }
            }
          }
        } catch (e) {
          console.log("Instant Answer API failed, continuing with HTML search");
        }
        
        if (results.length < 3) {
          try {
            const htmlResponse = await fetch(
              `https://html.duckduckgo.com/html/?q=${encodeURIComponent(query)}`,
              {
                headers: {
                  "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36",
                  "Accept": "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8",
                  "Accept-Language": "en-US,en;q=0.5",
                },
              }
            );
            
            if (!htmlResponse.ok) {
              console.log(`HTML search returned status ${htmlResponse.status}`);
            } else {
              const html = await htmlResponse.text();
              
              const resultRegex = /<a[^>]*class="[^"]*result__a[^"]*"[^>]*href="([^"]*)"[^>]*>([^<]*)/gi;
              const snippetRegex = /<a[^>]*class="[^"]*result__snippet[^"]*"[^>]*>([^<]*)/gi;
              
              const resultArray = Array.from(html.matchAll(resultRegex));
              const snippetArray = Array.from(html.matchAll(snippetRegex));
              
              for (let i = 0; i < Math.min(resultArray.length, 5); i++) {
                try {
                  const titleMatch = resultArray[i];
                  const snippetMatch = snippetArray[i];
                  
                  if (titleMatch && titleMatch[1] && titleMatch[2]) {
                    let url = titleMatch[1];
                    
                    const uddgMatch = url.match(/uddg=([^&]+)/);
                    if (uddgMatch && uddgMatch[1]) {
                      try {
                        url = decodeURIComponent(uddgMatch[1]);
                      } catch {
                      }
                    }
                    
                    if (!url.startsWith("http")) {
                      continue;
                    }
                    
                    let snippet = "";
                    if (snippetMatch && snippetMatch[1]) {
                      snippet = snippetMatch[1].replace(/<[^>]*>/g, "").trim();
                      snippet = decodeHtmlEntities(snippet);
                    }
                    
                    const title = decodeHtmlEntities(titleMatch[2].trim());
                    
                    if (title && !results.some(r => r.title === title)) {
                      results.push({
                        title,
                        snippet: snippet || "No description available",
                        url,
                      });
                    }
                  }
                } catch (parseErr) {
                  console.log("Error parsing individual result:", parseErr);
                }
              }
            }
          } catch (e) {
            console.log("HTML search fallback failed:", e);
          }
        }
        
        if (results.length === 0) {
          return JSON.stringify({
            query,
            results: [],
            message: "No results found for this search. The query may be too specific or the information may not be publicly indexed.",
          });
        }
        
        return JSON.stringify({ 
          query, 
          results: results.slice(0, 8),
          note: "Search completed. If these results don't contain the exact information needed, try reformulating the query."
        });
      } catch (error) {
        console.error("Web search error:", error);
        return JSON.stringify({ 
          query, 
          error: "Search failed. Please try again.",
          results: [] 
        });
      }
    }
    
    case "perplexity_search": {
      const { query, recency } = args as { query: string; recency?: "day" | "week" | "month" | "year" };
      
      const PERPLEXITY_API_KEY = process.env.PERPLEXITY_API_KEY;
      
      if (!PERPLEXITY_API_KEY) {
        console.log("Perplexity API key not configured, falling back to web_search");
        return executeSearchTool("web_search", { query }, options);
      }
      
      try {
        const requestBody: any = {
          model: "llama-3.1-sonar-small-128k-online",
          messages: [
            {
              role: "system",
              content: "You are a helpful research assistant. Provide accurate, well-sourced answers. Be concise but thorough. Include specific details like phone numbers, addresses, prices, and dates when relevant."
            },
            {
              role: "user",
              content: query
            }
          ],
          temperature: 0.2,
          top_p: 0.9,
          return_images: false,
          return_related_questions: false,
          stream: false,
          frequency_penalty: 1
        };
        
        if (recency) {
          requestBody.search_recency_filter = recency;
        }
        
        const response = await fetch("https://api.perplexity.ai/chat/completions", {
          method: "POST",
          headers: {
            "Authorization": `Bearer ${PERPLEXITY_API_KEY}`,
            "Content-Type": "application/json"
          },
          body: JSON.stringify(requestBody)
        });
        
        if (!response.ok) {
          const errorText = await response.text();
          console.error("Perplexity API error:", response.status, errorText);
          console.log("Falling back to web_search due to Perplexity API error");
          return executeSearchTool("web_search", { query }, options);
        }
        
        const data = await response.json();
        
        const answer = data.choices?.[0]?.message?.content || "No answer generated";
        const citations = data.citations || [];
        
        // Track Perplexity API usage
        logPerplexity({
          operation: "search",
          query: query.substring(0, 100),
          conversationId,
        }).catch(err => console.error("[Perplexity] Usage tracking failed:", err));
        
        return JSON.stringify({
          query,
          answer,
          sources: citations.slice(0, 6),
          model: data.model,
          note: citations.length > 0 
            ? `Answer synthesized from ${citations.length} source(s)` 
            : "Answer generated based on web search results"
        });
        
      } catch (error) {
        console.error("Perplexity search error:", error);
        console.log("Falling back to web_search due to Perplexity error");
        return executeSearchTool("web_search", { query }, options);
      }
    }
    
    default:
      return null;
  }
}

export const searchToolNames = [
  "web_search",
  "perplexity_search",
];
