import type { Request, Response, NextFunction } from "express";
import { z, ZodSchema } from "zod";

/**
 * Middleware to validate request body against a Zod schema
 */
export function validateBody<T extends ZodSchema>(schema: T) {
  return (req: Request, res: Response, next: NextFunction): void => {
    try {
      const validated = schema.parse(req.body);
      req.body = validated;
      next();
    } catch (error) {
      if (error instanceof z.ZodError) {
        res.status(400).json({
          error: "Validation failed",
          details: error.errors.map((err) => ({
            path: err.path.join("."),
            message: err.message,
          })),
        });
        return; // Don't call next() after sending response
      } else {
        res.status(400).json({
          error: "Invalid request body",
        });
        return; // Don't call next() after sending response
      }
    }
  };
}

/**
 * Middleware to validate query parameters against a Zod schema
 */
export function validateQuery<T extends ZodSchema>(schema: T) {
  return (req: Request, res: Response, next: NextFunction): void => {
    try {
      const validated = schema.parse(req.query);
      req.query = validated as any;
      next();
    } catch (error) {
      if (error instanceof z.ZodError) {
        res.status(400).json({
          error: "Invalid query parameters",
          details: error.errors.map((err) => ({
            path: err.path.join("."),
            message: err.message,
          })),
        });
        return; // Don't call next() after sending response
      } else {
        res.status(400).json({
          error: "Invalid query parameters",
        });
        return; // Don't call next() after sending response
      }
    }
  };
}

/**
 * Middleware to ensure response is properly formatted as JSON
 * Catches common mistakes like returning undefined or non-serializable objects
 */
export function ensureJsonResponse(
  req: Request,
  res: Response,
  next: NextFunction
): void {
  const originalJson = res.json.bind(res);

  res.json = function (body: any) {
    // Ensure content-type is set
    if (!res.getHeader("Content-Type")) {
      res.setHeader("Content-Type", "application/json");
    }

    // Check for common mistakes
    if (body === undefined) {
      console.error(
        `[API Error] Route ${req.method} ${req.path} returned undefined`
      );
      return originalJson({
        error: "Internal server error",
        message: "Response body is undefined",
      });
    }

    try {
      // Test serialization
      JSON.stringify(body);
      return originalJson(body);
    } catch (error) {
      console.error(
        `[API Error] Route ${req.method} ${req.path} returned non-serializable object:`,
        error
      );
      return originalJson({
        error: "Internal server error",
        message: "Response body is not serializable",
      });
    }
  };

  next();
}

/**
 * Standard error response format
 */
export interface ApiError {
  error: string;
  message?: string;
  details?: any;
  requestId?: string;
  timestamp?: string;
}

/**
 * Standardized error handler
 */
export function apiErrorHandler(
  err: any,
  req: Request,
  res: Response,
  next: NextFunction
): void {
  // Don't handle if response already sent
  if (res.headersSent) {
    return next(err);
  }

  const requestId = (req.headers["x-zeke-request-id"] as string) || undefined;

  // Log the error
  console.error(`[API Error] ${req.method} ${req.path}:`, err);

  // Determine status code
  const status = err.status || err.statusCode || 500;

  // Format error response
  const errorResponse: ApiError = {
    error: err.name || "Error",
    message: err.message || "An error occurred",
    requestId,
    timestamp: new Date().toISOString(),
  };

  // Add details for development
  if (process.env.NODE_ENV === "development") {
    errorResponse.details = {
      stack: err.stack,
      ...err,
    };
  }

  res.status(status).json(errorResponse);
}
