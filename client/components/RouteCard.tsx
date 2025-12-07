import React from "react";
import { View, StyleSheet, Text, Pressable } from "react-native";
import { Feather } from "@expo/vector-icons";
import { Colors, Spacing, BorderRadius, Typography } from "@/constants/theme";
import type { Route } from "@shared/schema";

interface RouteCardProps {
  route: Route;
  onPress: () => void;
  showBadge?: boolean;
}

function formatDuration(minutes: number): string {
  if (minutes < 60) return `${minutes} min`;
  const hours = Math.floor(minutes / 60);
  const mins = minutes % 60;
  return mins > 0 ? `${hours}h ${mins}m` : `${hours}h`;
}

function formatDistance(meters: number): string {
  if (meters < 1000) return `${meters}m`;
  return `${(meters / 1000).toFixed(1)}km`;
}

export default function RouteCard({ route, onPress, showBadge = true }: RouteCardProps) {
  const isUserRoute = route.ownerId !== null;
  
  return (
    <Pressable
      style={({ pressed }) => [styles.container, pressed && styles.containerPressed]}
      onPress={onPress}
    >
      <View style={styles.iconContainer}>
        <Feather name="map" size={24} color={Colors.dark.accent} />
      </View>

      <View style={styles.content}>
        <View style={styles.titleRow}>
          <Text style={styles.title} numberOfLines={1}>{route.name}</Text>
          {showBadge ? (
            <View style={[styles.badge, isUserRoute && styles.userBadge]}>
              <Text style={[styles.badgeText, isUserRoute && styles.userBadgeText]}>
                {isUserRoute ? "My Route" : "System"}
              </Text>
            </View>
          ) : null}
        </View>
        <Text style={styles.description} numberOfLines={2}>{route.description}</Text>

        <View style={styles.metaContainer}>
          <View style={styles.metaItem}>
            <Feather name="clock" size={14} color={Colors.dark.textSecondary} />
            <Text style={styles.metaText}>{formatDuration(route.estimatedDurationMinutes)}</Text>
          </View>
          <View style={styles.metaItem}>
            <Feather name="navigation" size={14} color={Colors.dark.textSecondary} />
            <Text style={styles.metaText}>{formatDistance(route.distanceMeters)}</Text>
          </View>
          <View style={styles.metaItem}>
            <Feather name="activity" size={14} color={Colors.dark.textSecondary} />
            <Text style={styles.metaText}>{route.difficulty}</Text>
          </View>
        </View>
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
    width: 48,
    height: 48,
    borderRadius: BorderRadius.xs,
    backgroundColor: Colors.dark.backgroundSecondary,
    justifyContent: "center",
    alignItems: "center",
    marginRight: Spacing.md,
  },
  content: {
    flex: 1,
  },
  titleRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: Spacing.sm,
    marginBottom: Spacing.xs,
  },
  title: {
    ...Typography.headline,
    color: Colors.dark.text,
    flex: 1,
  },
  badge: {
    paddingHorizontal: Spacing.sm,
    paddingVertical: 2,
    borderRadius: BorderRadius.xs,
    backgroundColor: Colors.dark.backgroundSecondary,
  },
  userBadge: {
    backgroundColor: Colors.dark.accent,
  },
  badgeText: {
    ...Typography.caption,
    color: Colors.dark.textSecondary,
    fontSize: 10,
  },
  userBadgeText: {
    color: "#FFFFFF",
  },
  description: {
    ...Typography.small,
    color: Colors.dark.textSecondary,
    marginBottom: Spacing.sm,
  },
  metaContainer: {
    flexDirection: "row",
    gap: Spacing.lg,
  },
  metaItem: {
    flexDirection: "row",
    alignItems: "center",
    gap: Spacing.xs,
  },
  metaText: {
    ...Typography.caption,
    color: Colors.dark.textSecondary,
    textTransform: "capitalize",
  },
  arrowContainer: {
    justifyContent: "center",
    marginLeft: Spacing.sm,
  },
});
