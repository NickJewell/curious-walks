import React from "react";
import { View, StyleSheet, Text, Pressable } from "react-native";
import { Feather } from "@expo/vector-icons";
import { Colors, Spacing, BorderRadius, Typography, CategoryColors } from "@/constants/theme";
import type { Location, Category } from "@shared/schema";

interface LocationCardProps {
  location: Location;
  category?: Category;
  onPress: () => void;
  userLocation?: { latitude: number; longitude: number } | null;
}

function calculateDistance(
  lat1: number,
  lon1: number,
  lat2: number,
  lon2: number
): number {
  const R = 6371;
  const dLat = ((lat2 - lat1) * Math.PI) / 180;
  const dLon = ((lon2 - lon1) * Math.PI) / 180;
  const a =
    Math.sin(dLat / 2) * Math.sin(dLat / 2) +
    Math.cos((lat1 * Math.PI) / 180) *
      Math.cos((lat2 * Math.PI) / 180) *
      Math.sin(dLon / 2) *
      Math.sin(dLon / 2);
  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
  return R * c;
}

function formatDistance(km: number): string {
  if (km < 1) {
    return `${Math.round(km * 1000)}m`;
  }
  return `${km.toFixed(1)}km`;
}

export default function LocationCard({
  location,
  category,
  onPress,
  userLocation,
}: LocationCardProps) {
  const categoryColor = category ? CategoryColors[category.slug] || Colors.dark.accent : Colors.dark.accent;
  
  const distance = userLocation
    ? calculateDistance(
        userLocation.latitude,
        userLocation.longitude,
        location.latitude,
        location.longitude
      )
    : null;

  return (
    <Pressable
      style={({ pressed }) => [styles.container, pressed && styles.containerPressed]}
      onPress={onPress}
    >
      <View style={styles.iconContainer}>
        <View style={[styles.iconCircle, { backgroundColor: categoryColor }]}>
          <Feather name={(category?.iconName as any) || "map-pin"} size={20} color="#FFFFFF" />
        </View>
      </View>

      <View style={styles.content}>
        <View style={styles.header}>
          <Text style={styles.title} numberOfLines={1}>{location.name}</Text>
          {distance !== null ? (
            <View style={styles.distanceContainer}>
              <Feather name="navigation" size={12} color={Colors.dark.textSecondary} />
              <Text style={styles.distanceText}>{formatDistance(distance)}</Text>
            </View>
          ) : null}
        </View>

        <View style={[styles.categoryBadge, { backgroundColor: `${categoryColor}20` }]}>
          <Text style={[styles.categoryText, { color: categoryColor }]}>{category?.name || "Unknown"}</Text>
        </View>

        <Text style={styles.description} numberOfLines={2}>{location.description}</Text>
      </View>

      <View style={styles.arrowContainer}>
        <Feather name="chevron-right" size={20} color={Colors.dark.inactive} />
      </View>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  container: {
    flexDirection: "row",
    backgroundColor: Colors.dark.backgroundDefault,
    borderRadius: BorderRadius.sm,
    padding: Spacing.md,
    borderWidth: 1,
    borderColor: Colors.dark.border,
  },
  containerPressed: {
    opacity: 0.6,
  },
  iconContainer: {
    marginRight: Spacing.md,
  },
  iconCircle: {
    width: 44,
    height: 44,
    borderRadius: 22,
    justifyContent: "center",
    alignItems: "center",
  },
  content: {
    flex: 1,
  },
  header: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    marginBottom: Spacing.xs,
  },
  title: {
    ...Typography.headline,
    color: Colors.dark.text,
    flex: 1,
    marginRight: Spacing.sm,
  },
  distanceContainer: {
    flexDirection: "row",
    alignItems: "center",
    gap: Spacing.xs,
  },
  distanceText: {
    ...Typography.caption,
    color: Colors.dark.textSecondary,
  },
  categoryBadge: {
    alignSelf: "flex-start",
    paddingHorizontal: Spacing.sm,
    paddingVertical: 2,
    borderRadius: BorderRadius.xs,
    marginBottom: Spacing.xs,
  },
  categoryText: {
    ...Typography.caption,
    fontWeight: "600",
  },
  description: {
    ...Typography.small,
    color: Colors.dark.textSecondary,
  },
  arrowContainer: {
    justifyContent: "center",
    marginLeft: Spacing.sm,
  },
});
