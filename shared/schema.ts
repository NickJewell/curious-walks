import { sql, relations } from "drizzle-orm";
import { pgTable, text, varchar, doublePrecision, timestamp, integer, boolean } from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod";

export const categories = pgTable("categories", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  name: text("name").notNull().unique(),
  slug: text("slug").notNull().unique(),
  color: text("color").notNull(),
  iconName: text("icon_name").notNull(),
  description: text("description"),
  createdAt: timestamp("created_at").defaultNow().notNull(),
});

export const categoriesRelations = relations(categories, ({ many }) => ({
  locations: many(locations),
}));

export const locations = pgTable("locations", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  name: text("name").notNull(),
  slug: text("slug").notNull().unique(),
  description: text("description").notNull(),
  story: text("story").notNull(),
  latitude: doublePrecision("latitude").notNull(),
  longitude: doublePrecision("longitude").notNull(),
  address: text("address"),
  categoryId: varchar("category_id").notNull().references(() => categories.id),
  imageUrl: text("image_url"),
  sourceAttribution: text("source_attribution"),
  regionId: varchar("region_id").references(() => regions.id),
  isActive: boolean("is_active").default(true).notNull(),
  createdAt: timestamp("created_at").defaultNow().notNull(),
  updatedAt: timestamp("updated_at").defaultNow().notNull(),
});

export const locationsRelations = relations(locations, ({ one, many }) => ({
  category: one(categories, {
    fields: [locations.categoryId],
    references: [categories.id],
  }),
  region: one(regions, {
    fields: [locations.regionId],
    references: [regions.id],
  }),
  routeStops: many(routeStops),
}));

export const regions = pgTable("regions", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  name: text("name").notNull().unique(),
  slug: text("slug").notNull().unique(),
  description: text("description"),
  isFree: boolean("is_free").default(false).notNull(),
  createdAt: timestamp("created_at").defaultNow().notNull(),
});

export const regionsRelations = relations(regions, ({ many }) => ({
  locations: many(locations),
  routes: many(routes),
}));

export const routes = pgTable("routes", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  name: text("name").notNull(),
  slug: text("slug").notNull().unique(),
  description: text("description").notNull(),
  estimatedDurationMinutes: integer("estimated_duration_minutes").notNull(),
  distanceMeters: integer("distance_meters").notNull(),
  difficulty: text("difficulty").notNull().default("easy"),
  regionId: varchar("region_id").references(() => regions.id),
  ownerId: text("owner_id"),
  sourceRouteId: varchar("source_route_id"),
  isEditable: boolean("is_editable").default(false).notNull(),
  isActive: boolean("is_active").default(true).notNull(),
  createdAt: timestamp("created_at").defaultNow().notNull(),
});

export const routesRelations = relations(routes, ({ one, many }) => ({
  region: one(regions, {
    fields: [routes.regionId],
    references: [regions.id],
  }),
  stops: many(routeStops),
}));

export const routeStops = pgTable("route_stops", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  routeId: varchar("route_id").notNull().references(() => routes.id),
  locationId: varchar("location_id").notNull().references(() => locations.id),
  orderIndex: integer("order_index").notNull(),
  notes: text("notes"),
});

export const routeStopsRelations = relations(routeStops, ({ one }) => ({
  route: one(routes, {
    fields: [routeStops.routeId],
    references: [routes.id],
  }),
  location: one(locations, {
    fields: [routeStops.locationId],
    references: [locations.id],
  }),
}));

export const insertCategorySchema = createInsertSchema(categories).omit({ id: true, createdAt: true });
export const insertLocationSchema = createInsertSchema(locations).omit({ id: true, createdAt: true, updatedAt: true });
export const insertRegionSchema = createInsertSchema(regions).omit({ id: true, createdAt: true });
export const insertRouteSchema = createInsertSchema(routes).omit({ id: true, createdAt: true });
export const insertRouteStopSchema = createInsertSchema(routeStops).omit({ id: true });

export type Category = typeof categories.$inferSelect;
export type InsertCategory = z.infer<typeof insertCategorySchema>;
export type Location = typeof locations.$inferSelect;
export type InsertLocation = z.infer<typeof insertLocationSchema>;
export type Region = typeof regions.$inferSelect;
export type InsertRegion = z.infer<typeof insertRegionSchema>;
export type Route = typeof routes.$inferSelect;
export type InsertRoute = z.infer<typeof insertRouteSchema>;
export type RouteStop = typeof routeStops.$inferSelect;
export type InsertRouteStop = z.infer<typeof insertRouteStopSchema>;
