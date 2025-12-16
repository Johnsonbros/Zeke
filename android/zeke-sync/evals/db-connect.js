/**
 * Database connectivity evaluation.
 * 
 * Connects to DATABASE_URL and runs a simple query.
 * Exits 0 on success, 1 on failure.
 * 
 * Usage: node evals/db-connect.js
 */

const DATABASE_URL = process.env.DATABASE_URL;

if (!DATABASE_URL) {
  console.error("FAIL: DATABASE_URL environment variable not set");
  process.exit(1);
}

async function testConnection() {
  let client;
  
  try {
    // Dynamic import for pg (PostgreSQL client)
    const { default: pg } = await import("pg");
    const { Client } = pg;
    
    client = new Client({
      connectionString: DATABASE_URL,
      connectionTimeoutMillis: 5000,
    });
    
    console.log("Connecting to database...");
    await client.connect();
    
    console.log("Running SELECT 1...");
    const result = await client.query("SELECT 1 AS check");
    
    if (result.rows[0]?.check === 1) {
      console.log("PASS: Database connection successful");
      await client.end();
      process.exit(0);
    } else {
      console.error("FAIL: Unexpected query result:", result.rows);
      await client.end();
      process.exit(1);
    }
  } catch (error) {
    console.error("FAIL: Database connection error:", error.message);
    if (client) {
      try {
        await client.end();
      } catch {
        // Ignore cleanup errors
      }
    }
    process.exit(1);
  }
}

testConnection();
