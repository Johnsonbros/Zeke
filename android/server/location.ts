import type { Express } from "express";
import { z } from "zod";
import { db } from "./db";
import { locations, starredPlaces } from "@shared/schema";
import { eq, desc, and, sql } from "drizzle-orm";

const locationUpdateSchema = z.object({
  latitude: z.number(),
  longitude: z.number(),
  altitude: z.number().nullable().optional(),
  accuracy: z.number().nullable().optional(),
  heading: z.number().nullable().optional(),
  speed: z.number().nullable().optional(),
  city: z.string().nullable().optional(),
  region: z.string().nullable().optional(),
  country: z.string().nullable().optional(),
  street: z.string().nullable().optional(),
  postalCode: z.string().nullable().optional(),
  formattedAddress: z.string().nullable().optional(),
  recordedAt: z.string(),
  label: z.string().optional(),
});

const starredPlaceSchema = z.object({
  name: z.string(),
  latitude: z.number(),
  longitude: z.number(),
  city: z.string().nullable().optional(),
  region: z.string().nullable().optional(),
  country: z.string().nullable().optional(),
  formattedAddress: z.string().nullable().optional(),
  icon: z.string().optional(),
});

/**
 * User ID for location data storage.
 * 
 * ZEKE is designed as a single-user companion app running on a dedicated device.
 * Currently uses a default user ID for the single-device deployment model.
 * 
 * When authentication is implemented (Apple/Google Sign-In), this should be
 * replaced with the authenticated user's ID from the request context.
 * 
 * The ZEKE_USER_ID environment variable allows configuration for different
 * deployment scenarios or testing.
 */
function getUserId(): string {
  return process.env.ZEKE_USER_ID || "zeke-default-user";
}

export function registerLocationRoutes(app: Express): void {
  app.get("/api/location/current", async (_req, res) => {
    try {
      const [location] = await db
        .select()
        .from(locations)
        .where(eq(locations.userId, getUserId()))
        .orderBy(desc(locations.createdAt))
        .limit(1);

      if (!location) {
        return res.status(404).json({ error: "No location data available" });
      }

      res.json({
        id: location.id,
        latitude: parseFloat(location.latitude),
        longitude: parseFloat(location.longitude),
        altitude: location.altitude ? parseFloat(location.altitude) : null,
        accuracy: location.accuracy ? parseFloat(location.accuracy) : null,
        heading: location.heading ? parseFloat(location.heading) : null,
        speed: location.speed ? parseFloat(location.speed) : null,
        city: location.city,
        region: location.region,
        country: location.country,
        street: location.street,
        postalCode: location.postalCode,
        formattedAddress: location.formattedAddress,
        isStarred: location.isStarred,
        label: location.label,
        recordedAt: location.recordedAt?.toISOString(),
        createdAt: location.createdAt.toISOString(),
      });
    } catch (error) {
      console.error("Error fetching current location:", error);
      res.status(500).json({ error: "Failed to fetch current location" });
    }
  });

  app.post("/api/location/update", async (req, res) => {
    try {
      const parsed = locationUpdateSchema.safeParse(req.body);
      if (!parsed.success) {
        return res.status(400).json({ error: "Invalid location data", details: parsed.error.errors });
      }

      const data = parsed.data;
      const [location] = await db
        .insert(locations)
        .values({
          userId: getUserId(),
          latitude: data.latitude.toString(),
          longitude: data.longitude.toString(),
          altitude: data.altitude?.toString() ?? null,
          accuracy: data.accuracy?.toString() ?? null,
          heading: data.heading?.toString() ?? null,
          speed: data.speed?.toString() ?? null,
          city: data.city ?? null,
          region: data.region ?? null,
          country: data.country ?? null,
          street: data.street ?? null,
          postalCode: data.postalCode ?? null,
          formattedAddress: data.formattedAddress ?? null,
          isStarred: false,
          label: data.label ?? null,
          recordedAt: new Date(data.recordedAt),
        })
        .returning();

      res.status(201).json({
        id: location.id,
        latitude: parseFloat(location.latitude),
        longitude: parseFloat(location.longitude),
        altitude: location.altitude ? parseFloat(location.altitude) : null,
        accuracy: location.accuracy ? parseFloat(location.accuracy) : null,
        heading: location.heading ? parseFloat(location.heading) : null,
        speed: location.speed ? parseFloat(location.speed) : null,
        city: location.city,
        region: location.region,
        country: location.country,
        street: location.street,
        postalCode: location.postalCode,
        formattedAddress: location.formattedAddress,
        isStarred: location.isStarred,
        label: location.label,
        recordedAt: location.recordedAt?.toISOString(),
        createdAt: location.createdAt.toISOString(),
      });
    } catch (error) {
      console.error("Error updating location:", error);
      res.status(500).json({ error: "Failed to update location" });
    }
  });

  app.get("/api/location/history", async (req, res) => {
    try {
      const limit = Math.min(parseInt(req.query.limit as string) || 50, 100);
      const offset = parseInt(req.query.offset as string) || 0;

      const results = await db
        .select()
        .from(locations)
        .where(eq(locations.userId, getUserId()))
        .orderBy(desc(locations.createdAt))
        .limit(limit)
        .offset(offset);

      const [countResult] = await db
        .select({ count: sql<number>`count(*)::int` })
        .from(locations)
        .where(eq(locations.userId, getUserId()));

      const formattedResults = results.map((loc) => ({
        id: loc.id,
        latitude: parseFloat(loc.latitude),
        longitude: parseFloat(loc.longitude),
        altitude: loc.altitude ? parseFloat(loc.altitude) : null,
        accuracy: loc.accuracy ? parseFloat(loc.accuracy) : null,
        heading: loc.heading ? parseFloat(loc.heading) : null,
        speed: loc.speed ? parseFloat(loc.speed) : null,
        city: loc.city,
        region: loc.region,
        country: loc.country,
        street: loc.street,
        postalCode: loc.postalCode,
        formattedAddress: loc.formattedAddress,
        isStarred: loc.isStarred,
        label: loc.label,
        recordedAt: loc.recordedAt?.toISOString(),
        createdAt: loc.createdAt.toISOString(),
      }));

      res.json({
        locations: formattedResults,
        total: countResult?.count ?? 0,
        limit,
        offset,
      });
    } catch (error) {
      console.error("Error fetching location history:", error);
      res.status(500).json({ error: "Failed to fetch location history" });
    }
  });

  app.delete("/api/location/history", async (_req, res) => {
    try {
      await db
        .delete(locations)
        .where(eq(locations.userId, getUserId()));

      res.status(204).send();
    } catch (error) {
      console.error("Error clearing location history:", error);
      res.status(500).json({ error: "Failed to clear location history" });
    }
  });

  app.get("/api/location/starred", async (_req, res) => {
    try {
      const results = await db
        .select()
        .from(starredPlaces)
        .where(eq(starredPlaces.userId, getUserId()))
        .orderBy(desc(starredPlaces.createdAt));

      const formattedResults = results.map((place) => ({
        id: place.id,
        name: place.name,
        latitude: parseFloat(place.latitude),
        longitude: parseFloat(place.longitude),
        city: place.city,
        region: place.region,
        country: place.country,
        formattedAddress: place.formattedAddress,
        icon: place.icon,
        createdAt: place.createdAt.toISOString(),
      }));

      res.json(formattedResults);
    } catch (error) {
      console.error("Error fetching starred places:", error);
      res.status(500).json({ error: "Failed to fetch starred places" });
    }
  });

  app.post("/api/location/starred", async (req, res) => {
    try {
      const parsed = starredPlaceSchema.safeParse(req.body);
      if (!parsed.success) {
        return res.status(400).json({ error: "Invalid starred place data", details: parsed.error.errors });
      }

      const data = parsed.data;
      const [place] = await db
        .insert(starredPlaces)
        .values({
          userId: getUserId(),
          name: data.name,
          latitude: data.latitude.toString(),
          longitude: data.longitude.toString(),
          city: data.city ?? null,
          region: data.region ?? null,
          country: data.country ?? null,
          formattedAddress: data.formattedAddress ?? null,
          icon: data.icon ?? null,
        })
        .returning();

      res.status(201).json({
        id: place.id,
        name: place.name,
        latitude: parseFloat(place.latitude),
        longitude: parseFloat(place.longitude),
        city: place.city,
        region: place.region,
        country: place.country,
        formattedAddress: place.formattedAddress,
        icon: place.icon,
        createdAt: place.createdAt.toISOString(),
      });
    } catch (error) {
      console.error("Error creating starred place:", error);
      res.status(500).json({ error: "Failed to create starred place" });
    }
  });

  app.patch("/api/location/starred/:id", async (req, res) => {
    try {
      const [existing] = await db
        .select()
        .from(starredPlaces)
        .where(and(
          eq(starredPlaces.id, req.params.id),
          eq(starredPlaces.userId, getUserId())
        ));

      if (!existing) {
        return res.status(404).json({ error: "Starred place not found" });
      }

      const updates: Partial<{ name: string; icon: string | null }> = {};

      if (req.body.name !== undefined) {
        updates.name = req.body.name;
      }
      if (req.body.icon !== undefined) {
        updates.icon = req.body.icon;
      }

      if (Object.keys(updates).length === 0) {
        return res.json({
          id: existing.id,
          name: existing.name,
          latitude: parseFloat(existing.latitude),
          longitude: parseFloat(existing.longitude),
          city: existing.city,
          region: existing.region,
          country: existing.country,
          formattedAddress: existing.formattedAddress,
          icon: existing.icon,
          createdAt: existing.createdAt.toISOString(),
        });
      }

      const [updated] = await db
        .update(starredPlaces)
        .set(updates)
        .where(and(
          eq(starredPlaces.id, req.params.id),
          eq(starredPlaces.userId, getUserId())
        ))
        .returning();

      res.json({
        id: updated.id,
        name: updated.name,
        latitude: parseFloat(updated.latitude),
        longitude: parseFloat(updated.longitude),
        city: updated.city,
        region: updated.region,
        country: updated.country,
        formattedAddress: updated.formattedAddress,
        icon: updated.icon,
        createdAt: updated.createdAt.toISOString(),
      });
    } catch (error) {
      console.error("Error updating starred place:", error);
      res.status(500).json({ error: "Failed to update starred place" });
    }
  });

  app.delete("/api/location/starred/:id", async (req, res) => {
    try {
      const result = await db
        .delete(starredPlaces)
        .where(and(
          eq(starredPlaces.id, req.params.id),
          eq(starredPlaces.userId, getUserId())
        ))
        .returning();

      if (result.length === 0) {
        return res.status(404).json({ error: "Starred place not found" });
      }

      res.status(204).send();
    } catch (error) {
      console.error("Error deleting starred place:", error);
      res.status(500).json({ error: "Failed to delete starred place" });
    }
  });

  app.post("/api/location/starred/current", async (req, res) => {
    try {
      const [currentLocation] = await db
        .select()
        .from(locations)
        .where(eq(locations.userId, getUserId()))
        .orderBy(desc(locations.createdAt))
        .limit(1);

      if (!currentLocation) {
        return res.status(400).json({ error: "No current location available" });
      }

      const parsed = z.object({ name: z.string() }).safeParse(req.body);
      if (!parsed.success) {
        return res.status(400).json({ error: "Name is required" });
      }

      const [place] = await db
        .insert(starredPlaces)
        .values({
          userId: getUserId(),
          name: parsed.data.name,
          latitude: currentLocation.latitude,
          longitude: currentLocation.longitude,
          city: currentLocation.city,
          region: currentLocation.region,
          country: currentLocation.country,
          formattedAddress: currentLocation.formattedAddress,
          icon: null,
        })
        .returning();

      res.status(201).json({
        id: place.id,
        name: place.name,
        latitude: parseFloat(place.latitude),
        longitude: parseFloat(place.longitude),
        city: place.city,
        region: place.region,
        country: place.country,
        formattedAddress: place.formattedAddress,
        icon: place.icon,
        createdAt: place.createdAt.toISOString(),
      });
    } catch (error) {
      console.error("Error starring current location:", error);
      res.status(500).json({ error: "Failed to star current location" });
    }
  });

  app.get("/api/location/nearby", async (req, res) => {
    try {
      const lat = parseFloat(req.query.lat as string);
      const lon = parseFloat(req.query.lon as string);
      const radiusMeters = parseFloat(req.query.radius as string) || 1000;

      if (isNaN(lat) || isNaN(lon)) {
        return res.status(400).json({ error: "Valid lat and lon query parameters are required" });
      }

      const allPlaces = await db
        .select()
        .from(starredPlaces)
        .where(eq(starredPlaces.userId, getUserId()));

      const nearbyPlaces = allPlaces.filter((place) => {
        const placeLat = parseFloat(place.latitude);
        const placeLon = parseFloat(place.longitude);
        const distance = calculateDistance(lat, lon, placeLat, placeLon);
        return distance <= radiusMeters;
      });

      const formattedResults = nearbyPlaces.map((place) => ({
        id: place.id,
        name: place.name,
        latitude: parseFloat(place.latitude),
        longitude: parseFloat(place.longitude),
        city: place.city,
        region: place.region,
        country: place.country,
        formattedAddress: place.formattedAddress,
        icon: place.icon,
        createdAt: place.createdAt.toISOString(),
      }));

      res.json(formattedResults);
    } catch (error) {
      console.error("Error fetching nearby places:", error);
      res.status(500).json({ error: "Failed to fetch nearby places" });
    }
  });
}

function calculateDistance(lat1: number, lon1: number, lat2: number, lon2: number): number {
  const R = 6371e3;
  const phi1 = (lat1 * Math.PI) / 180;
  const phi2 = (lat2 * Math.PI) / 180;
  const deltaPhi = ((lat2 - lat1) * Math.PI) / 180;
  const deltaLambda = ((lon2 - lon1) * Math.PI) / 180;

  const a =
    Math.sin(deltaPhi / 2) * Math.sin(deltaPhi / 2) +
    Math.cos(phi1) * Math.cos(phi2) * Math.sin(deltaLambda / 2) * Math.sin(deltaLambda / 2);
  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));

  return R * c;
}
