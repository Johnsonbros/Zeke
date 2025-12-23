/**
 * Demo script: Call ingestTriples endpoint to test the full Knowledge Graph pipeline
 * 
 * Run with: npx tsx scripts/demo-ingest-triples.ts
 * 
 * This creates:
 * - Nate -> OWNS -> Johnson Bros Plumbing
 * - Johnson Bros -> LOCATED_IN -> Quincy, MA
 * - Aurora -> LIKES -> Moon
 */

const API_URL = process.env.API_URL || "http://localhost:5000";

interface TriplePayload {
  evidence: {
    sourceType: string;
    sourceId: string;
    sourceExcerpt?: string;
    sourceUrl?: string;
  };
  triples: Array<{
    from: { type: string; name: string; attributes?: Record<string, any> };
    rel_type: string;
    to: { type: string; name: string; attributes?: Record<string, any> };
    confidence?: number;
    status?: "ACTIVE" | "CONTESTED" | "RETRACTED";
    properties?: Record<string, any>;
  }>;
}

async function ingestTriples(payload: TriplePayload) {
  console.log(`\n[Demo] Calling POST ${API_URL}/api/kg/ingestTriples`);
  console.log("[Demo] Payload:", JSON.stringify(payload, null, 2));

  try {
    const response = await fetch(`${API_URL}/api/kg/ingestTriples`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify(payload),
    });

    if (!response.ok) {
      const error = await response.text();
      throw new Error(`HTTP ${response.status}: ${error}`);
    }

    const result = await response.json();
    console.log("[Demo] Response:", JSON.stringify(result, null, 2));
    return result;
  } catch (error: any) {
    console.error("[Demo] Error:", error.message);
    throw error;
  }
}

async function main() {
  console.log("=".repeat(60));
  console.log("Knowledge Graph ingestTriples Demo");
  console.log("=".repeat(60));
  console.log(`API URL: ${API_URL}\n`);

  try {
    // Batch 1: Business ownership and location
    console.log("\n[Demo] === BATCH 1: Business Ownership ===");
    await ingestTriples({
      evidence: {
        sourceType: "CHAT_MESSAGE",
        sourceId: "msg_20250101_001",
        sourceExcerpt: "Nate owns Johnson Bros Plumbing, they're located in Quincy",
        sourceUrl: "https://example.com/messages/msg_001",
      },
      triples: [
        {
          from: { type: "PERSON", name: "Nate Johnson", attributes: { role: "owner" } },
          rel_type: "OWNS",
          to: {
            type: "ORG",
            name: "Johnson Bros. Plumbing & Drain Cleaning",
            attributes: { industry: "plumbing", status: "active" },
          },
          confidence: 0.95,
          status: "ACTIVE",
          properties: { ownershipType: "founder" },
        },
        {
          from: {
            type: "ORG",
            name: "Johnson Bros. Plumbing & Drain Cleaning",
            attributes: { industry: "plumbing" },
          },
          rel_type: "LOCATED_IN",
          to: { type: "PLACE", name: "Quincy, MA", attributes: { state: "MA", country: "USA" } },
          confidence: 0.92,
          status: "ACTIVE",
        },
      ],
    });

    // Batch 2: Personal preferences (different evidence)
    console.log("\n[Demo] === BATCH 2: Personal Preferences ===");
    await ingestTriples({
      evidence: {
        sourceType: "MEMORY_NOTE",
        sourceId: "mem_aurora_moon",
        sourceExcerpt: "Aurora loves stargazing and appreciates the moon",
      },
      triples: [
        {
          from: { type: "PERSON", name: "Aurora", attributes: { role: "friend" } },
          rel_type: "LIKES",
          to: {
            type: "CONCEPT",
            name: "Moon",
            attributes: { category: "astronomy", celestial_body: true },
          },
          confidence: 0.85,
          status: "ACTIVE",
          properties: { reason: "stargazing_hobby" },
        },
      ],
    });

    console.log("\n" + "=".repeat(60));
    console.log("Demo complete! Check the Knowledge Graph Admin UI to view:");
    console.log("- Navigate to Knowledge Graph page");
    console.log("- Search for 'Nate', 'Johnson Bros', 'Quincy', or 'Aurora'");
    console.log("- View relationships and evidence in the detail panel");
    console.log("=".repeat(60) + "\n");
  } catch (error) {
    console.error("\n[Demo] Fatal error:", error);
    process.exit(1);
  }
}

main();
