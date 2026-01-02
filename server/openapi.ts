import { existsSync, readFileSync } from "fs";
import { join } from "path";
import type { Express, Request, Response } from "express";

const OPENAPI_PATH = join(process.cwd(), "docs", "openapi.yaml");

export function registerOpenApiRoute(app: Express): void {
  app.get("/api/openapi.yaml", (_req: Request, res: Response) => {
    if (!existsSync(OPENAPI_PATH)) {
      return res.status(404).json({ message: "OpenAPI spec not found" });
    }

    try {
      const spec = readFileSync(OPENAPI_PATH, "utf-8");
      res.setHeader("Content-Type", "application/yaml");
      res.send(spec);
    } catch (error) {
      console.error("[OpenAPI] Failed to read spec", error);
      res.status(500).json({ message: "Unable to load OpenAPI spec" });
    }
  });
}
