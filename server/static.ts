import express, { type Express } from "express";
import fs from "fs";
import path from "path";

export function serveStatic(app: Express) {
  const distPath = path.resolve(__dirname, "public");
  if (!fs.existsSync(distPath)) {
    throw new Error(
      `Could not find the build directory: ${distPath}, make sure to build the client first`,
    );
  }

  app.use(express.static(distPath));

  // Return JSON 404 for unmatched API routes (prevents HTML being served to mobile clients)
  app.use("/api/*", (_req, res) => {
    res.status(404).json({ 
      error: "Not Found", 
      message: "API endpoint not found",
      path: _req.originalUrl 
    });
  });

  // fall through to index.html if the file doesn't exist
  app.use("*", (_req, res) => {
    res.sendFile(path.resolve(distPath, "index.html"));
  });
}
