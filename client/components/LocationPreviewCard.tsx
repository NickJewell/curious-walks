import React from "react";
import { View, StyleSheet, Text, Pressable } from "react-native";
import { Feather } from "@expo/vector-icons";
import { BlurView } from "expo-blur";
import { Colors, Spacing, BorderRadius, Typography, CategoryColors } from "@/constants/theme";
import type { Location, Category } from "@shared/schema";

interface LocationPreviewCardProps {
  location: Location;
  category?: Category;
  onPress: () => void;
  onClose: () => void;
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

export default function LocationPreviewCard({
  location,
  category,
  onPress,
  onClose,
  userLocation,
}: LocationPreviewCardProps) {
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
      <BlurView intensity={80} tint="dark" style={StyleSheet.absoluteFill} />
      
      <View style={styles.content}>
        <View style={styles.header}>
          <View style={[styles.categoryBadge, { backgroundColor: categoryColor }]}>
            <Feather name={(category?.iconName as any) || "map-pin"} size={12} color="#FFFFFF" />
            <Text style={styles.categoryText}>{category?.name || "Unknown"}</Text>
          </View>
          <Pressable
            style={({ pressed }) => [styles.closeButton, pressed && styles.closeButtonPressed]}
            onPress={onClose}
            hitSlop={10}
          >
            <Feather name="x" size={18} color={Colors.dark.textSecondary} />
          </Pressable>
        </View>

        <Text style={styles.title} numberOfLines={1}>{location.name}</Text>
        <Text style={styles.description} numberOfLines={2}>{location.description}</Text>

        <View style={styles.footer}>
          {distance !== null ? (
            <View style={styles.distanceContainer}>
              <Feather name="navigation" size={12} color={Colors.dark.textSecondary} />
              <Text style={styles.distanceText}>{formatDistance(distance)}</Text>
            </View>
          ) : null}
          <View style={styles.viewMore}>
            <Text style={styles.viewMoreText}>View details</Text>
            <Feather name="chevron-right" size={14} color={Colors.dark.accent} />
          </View>
        </View>
      </View>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  container: {
    borderRadius: BorderRadius.sm,
    overflow: "hidden",
    backgroundColor: "rgba(21, 26, 35, 0.9)",
    borderWidth: 1,
    borderColor: Colors.dark.border,
  },
  containerPressed: {
    opacity: 0.8,
  },
  content: {
    padding: Spacing.md,
  },
  header: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    marginBottom: Spacing.sm,
  },
  categoryBadge: {
    flexDirection: "row",
    alignItems: "center",
    paddingHorizontal: Spacing.sm,
    paddingVertical: Spacing.xs,
    borderRadius: BorderRadius.full,
    gap: Spacing.xs,
  },
  categoryText: {
    ...Typography.caption,
    color: "#FFFFFF",
    fontWeight: "600",
  },
  closeButton: {
    padding: Spacing.xs,
  },
  closeButtonPressed: {
    opacity: 0.6,
  },
  title: {
    ...Typography.headline,
    color: Colors.dark.text,
    marginBottom: Spacing.xs,
  },
  description: {
    ...Typography.small,
    color: Colors.dark.textSecondary,
    marginBottom: Spacing.md,
  },
  footer: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
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
  viewMore: {
    flexDirection: "row",
    alignItems: "center",
    gap: Spacing.xs,
  },
  viewMoreText: {
    ...Typography.small,
    color: Colors.dark.accent,
    fontWeight: "600",
  },
});
