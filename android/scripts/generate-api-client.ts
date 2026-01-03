import { generate } from "openapi-typescript-codegen";
import fs from "fs";
import path from "path";
import crypto from "crypto";

const repoRoot = path.join(__dirname, "..");
const defaultSchemaPath = path.join(repoRoot, "client/openapi/zeke-backend.yaml");
const generatedSchemaPath = path.join(
  repoRoot,
  "client/generated/zeke-backend.schema.yaml",
);
const outputPath = path.join(repoRoot, "client/generated/zeke-backend");

async function readSchema(): Promise<{ content: string; description: string }> {
  const schemaSource = process.env.ZEKE_BACKEND_SCHEMA_URL || defaultSchemaPath;

  if (schemaSource.startsWith("http")) {
    const response = await fetch(schemaSource);
    if (!response.ok) {
      throw new Error(`Failed to fetch schema from ${schemaSource}: ${response.status}`);
    }
    const contentType = response.headers.get("content-type") || "";
    const body = await response.text();

    if (!contentType.includes("json") && !contentType.includes("yaml")) {
      console.warn(
        `[codegen] Schema response from ${schemaSource} is '${contentType}'. Proceeding because a schema URL was provided.`,
      );
    }

    return { content: body, description: `remote schema at ${schemaSource}` };
  }

  const absolutePath = path.isAbsolute(schemaSource)
    ? schemaSource
    : path.join(repoRoot, schemaSource);
  const content = await fs.promises.readFile(absolutePath, "utf-8");
  return { content, description: absolutePath };
}

function contentHash(content: string): string {
  return crypto.createHash("sha256").update(content).digest("hex");
}

async function ensureGeneratedSchema(content: string): Promise<boolean> {
  try {
    const existing = await fs.promises.readFile(generatedSchemaPath, "utf-8");
    if (contentHash(existing) === contentHash(content)) {
      console.log("[codegen] Schema unchanged. Skipping regeneration.");
      return false;
    }
  } catch {
    // Missing file, will write below
  }

  await fs.promises.mkdir(path.dirname(generatedSchemaPath), { recursive: true });
  await fs.promises.writeFile(generatedSchemaPath, content, "utf-8");
  return true;
}

async function run() {
  const { content, description } = await readSchema();
  const shouldGenerate = await ensureGeneratedSchema(content);

  if (!shouldGenerate) return;

  console.log(`[codegen] Regenerating client from ${description}`);

  await generate({
    input: generatedSchemaPath,
    output: outputPath,
    httpClient: "fetch",
    useUnionTypes: true,
    exportSchemas: true,
    exportCore: true,
    exportServices: true,
  });

  console.log(`[codegen] Client generated at ${path.relative(repoRoot, outputPath)}`);
}

run().catch((error) => {
  console.error("[codegen] Failed to generate client", error);
  process.exitCode = 1;
});
