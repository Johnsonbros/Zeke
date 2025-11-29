import { backfillEmbeddings, getMemoryStats } from "../server/semanticMemory";

async function main() {
  console.log("=== Memory Embedding Backfill ===\n");
  
  const statsBefore = await getMemoryStats();
  console.log("Current memory stats:");
  console.log(`  Total memories: ${statsBefore.total}`);
  console.log(`  With embeddings: ${statsBefore.withEmbeddings}`);
  console.log(`  By type:`, statsBefore.byType);
  console.log("");
  
  if (statsBefore.total === statsBefore.withEmbeddings) {
    console.log("All memories already have embeddings. Nothing to do.");
    return;
  }
  
  console.log(`Backfilling ${statsBefore.total - statsBefore.withEmbeddings} memories...\n`);
  
  const result = await backfillEmbeddings();
  
  console.log("\n=== Backfill Complete ===");
  console.log(`  Processed: ${result.processed}`);
  console.log(`  Failed: ${result.failed}`);
  
  const statsAfter = await getMemoryStats();
  console.log("\nUpdated memory stats:");
  console.log(`  Total memories: ${statsAfter.total}`);
  console.log(`  With embeddings: ${statsAfter.withEmbeddings}`);
}

main().catch(console.error);
