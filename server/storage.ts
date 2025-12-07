import {
  categories,
  locations,
  regions,
  routes,
  routeStops,
  type Category,
  type InsertCategory,
  type Location,
  type InsertLocation,
  type Region,
  type InsertRegion,
  type Route,
  type InsertRoute,
  type RouteStop,
  type InsertRouteStop,
} from "@shared/schema";
import { db } from "./db";
import { eq, and, sql, asc, desc } from "drizzle-orm";

export interface IStorage {
  getCategories(): Promise<Category[]>;
  getCategoryBySlug(slug: string): Promise<Category | undefined>;
  createCategory(category: InsertCategory): Promise<Category>;

  getLocations(): Promise<Location[]>;
  getAllLocations(): Promise<Location[]>;
  getLocationById(id: string): Promise<Location | undefined>;
  getLocationBySlug(slug: string): Promise<Location | undefined>;
  getLocationsByCategory(categoryId: string): Promise<Location[]>;
  getLocationsByRegion(regionId: string): Promise<Location[]>;
  getNearbyLocations(lat: number, lng: number, radiusKm: number): Promise<Location[]>;
  createLocation(location: InsertLocation): Promise<Location>;
  updateLocation(id: string, location: Partial<InsertLocation>): Promise<Location | undefined>;
  deleteLocation(id: string): Promise<boolean>;

  getRegions(): Promise<Region[]>;
  getRegionBySlug(slug: string): Promise<Region | undefined>;
  createRegion(region: InsertRegion): Promise<Region>;

  getRoutes(): Promise<Route[]>;
  getRoutesByOwner(ownerId: string): Promise<Route[]>;
  getRouteById(id: string): Promise<Route | undefined>;
  getRouteBySlug(slug: string): Promise<Route | undefined>;
  getRoutesByRegion(regionId: string): Promise<Route[]>;
  createRoute(route: InsertRoute): Promise<Route>;
  updateRoute(id: string, route: Partial<InsertRoute>): Promise<Route | undefined>;
  deleteRoute(id: string): Promise<boolean>;
  copyRoute(routeId: string, ownerId: string, newName: string): Promise<Route>;

  getRouteStops(routeId: string): Promise<RouteStop[]>;
  createRouteStop(stop: InsertRouteStop): Promise<RouteStop>;
  deleteRouteStop(stopId: string): Promise<boolean>;
  deleteRouteStopsByRoute(routeId: string): Promise<void>;
}

export class DatabaseStorage implements IStorage {
  async getCategories(): Promise<Category[]> {
    return db.select().from(categories).orderBy(asc(categories.name));
  }

  async getCategoryBySlug(slug: string): Promise<Category | undefined> {
    const [category] = await db.select().from(categories).where(eq(categories.slug, slug));
    return category || undefined;
  }

  async createCategory(category: InsertCategory): Promise<Category> {
    const [newCategory] = await db.insert(categories).values(category).returning();
    return newCategory;
  }

  async getLocations(): Promise<Location[]> {
    return db.select().from(locations).where(eq(locations.isActive, true)).orderBy(asc(locations.name));
  }

  async getAllLocations(): Promise<Location[]> {
    return db.select().from(locations).orderBy(asc(locations.name));
  }

  async getLocationById(id: string): Promise<Location | undefined> {
    const [location] = await db.select().from(locations).where(eq(locations.id, id));
    return location || undefined;
  }

  async getLocationBySlug(slug: string): Promise<Location | undefined> {
    const [location] = await db.select().from(locations).where(eq(locations.slug, slug));
    return location || undefined;
  }

  async getLocationsByCategory(categoryId: string): Promise<Location[]> {
    return db
      .select()
      .from(locations)
      .where(and(eq(locations.categoryId, categoryId), eq(locations.isActive, true)))
      .orderBy(asc(locations.name));
  }

  async getLocationsByRegion(regionId: string): Promise<Location[]> {
    return db
      .select()
      .from(locations)
      .where(and(eq(locations.regionId, regionId), eq(locations.isActive, true)))
      .orderBy(asc(locations.name));
  }

  async getNearbyLocations(lat: number, lng: number, radiusKm: number): Promise<Location[]> {
    const earthRadiusKm = 6371;
    const result = await db.execute(sql`
      SELECT *, (
        ${earthRadiusKm} * acos(
          cos(radians(${lat})) * cos(radians(latitude)) *
          cos(radians(longitude) - radians(${lng})) +
          sin(radians(${lat})) * sin(radians(latitude))
        )
      ) AS distance
      FROM locations
      WHERE is_active = true
      HAVING distance <= ${radiusKm}
      ORDER BY distance
    `);
    return result.rows as Location[];
  }

  async createLocation(location: InsertLocation): Promise<Location> {
    const [newLocation] = await db.insert(locations).values(location).returning();
    return newLocation;
  }

  async updateLocation(id: string, location: Partial<InsertLocation>): Promise<Location | undefined> {
    const [updated] = await db
      .update(locations)
      .set({ ...location, updatedAt: new Date() })
      .where(eq(locations.id, id))
      .returning();
    return updated || undefined;
  }

  async deleteLocation(id: string): Promise<boolean> {
    await db.delete(routeStops).where(eq(routeStops.locationId, id));
    const result = await db.delete(locations).where(eq(locations.id, id)).returning();
    return result.length > 0;
  }

  async getRegions(): Promise<Region[]> {
    return db.select().from(regions).orderBy(asc(regions.name));
  }

  async getRegionBySlug(slug: string): Promise<Region | undefined> {
    const [region] = await db.select().from(regions).where(eq(regions.slug, slug));
    return region || undefined;
  }

  async createRegion(region: InsertRegion): Promise<Region> {
    const [newRegion] = await db.insert(regions).values(region).returning();
    return newRegion;
  }

  async getRoutes(): Promise<Route[]> {
    return db.select().from(routes).where(eq(routes.isActive, true)).orderBy(asc(routes.name));
  }

  async getRouteById(id: string): Promise<Route | undefined> {
    const [route] = await db.select().from(routes).where(eq(routes.id, id));
    return route || undefined;
  }

  async getRouteBySlug(slug: string): Promise<Route | undefined> {
    const [route] = await db.select().from(routes).where(eq(routes.slug, slug));
    return route || undefined;
  }

  async getRoutesByRegion(regionId: string): Promise<Route[]> {
    return db
      .select()
      .from(routes)
      .where(and(eq(routes.regionId, regionId), eq(routes.isActive, true)))
      .orderBy(asc(routes.name));
  }

  async createRoute(route: InsertRoute): Promise<Route> {
    const [newRoute] = await db.insert(routes).values(route).returning();
    return newRoute;
  }

  async getRouteStops(routeId: string): Promise<RouteStop[]> {
    return db
      .select()
      .from(routeStops)
      .where(eq(routeStops.routeId, routeId))
      .orderBy(asc(routeStops.orderIndex));
  }

  async createRouteStop(stop: InsertRouteStop): Promise<RouteStop> {
    const [newStop] = await db.insert(routeStops).values(stop).returning();
    return newStop;
  }

  async getRoutesByOwner(ownerId: string): Promise<Route[]> {
    return db
      .select()
      .from(routes)
      .where(and(eq(routes.ownerId, ownerId), eq(routes.isActive, true)))
      .orderBy(asc(routes.name));
  }

  async updateRoute(id: string, route: Partial<InsertRoute>): Promise<Route | undefined> {
    const [updated] = await db
      .update(routes)
      .set(route)
      .where(eq(routes.id, id))
      .returning();
    return updated || undefined;
  }

  async deleteRoute(id: string): Promise<boolean> {
    await db.delete(routeStops).where(eq(routeStops.routeId, id));
    const result = await db.delete(routes).where(eq(routes.id, id)).returning();
    return result.length > 0;
  }

  async copyRoute(routeId: string, ownerId: string, newName: string): Promise<Route> {
    const originalRoute = await this.getRouteById(routeId);
    if (!originalRoute) {
      throw new Error("Route not found");
    }

    const timestamp = Date.now();
    const slug = `${originalRoute.slug}-copy-${timestamp}`;

    const [newRoute] = await db.insert(routes).values({
      name: newName,
      slug,
      description: originalRoute.description,
      estimatedDurationMinutes: originalRoute.estimatedDurationMinutes,
      distanceMeters: originalRoute.distanceMeters,
      difficulty: originalRoute.difficulty,
      regionId: originalRoute.regionId,
      ownerId,
      sourceRouteId: originalRoute.id,
      isEditable: true,
      isActive: true,
    }).returning();

    const originalStops = await this.getRouteStops(routeId);
    for (const stop of originalStops) {
      await this.createRouteStop({
        routeId: newRoute.id,
        locationId: stop.locationId,
        orderIndex: stop.orderIndex,
        notes: stop.notes,
      });
    }

    return newRoute;
  }

  async deleteRouteStop(stopId: string): Promise<boolean> {
    const result = await db.delete(routeStops).where(eq(routeStops.id, stopId)).returning();
    return result.length > 0;
  }

  async deleteRouteStopsByRoute(routeId: string): Promise<void> {
    await db.delete(routeStops).where(eq(routeStops.routeId, routeId));
  }
}

export const storage = new DatabaseStorage();
