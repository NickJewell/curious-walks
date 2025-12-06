import React from "react";
import { View, StyleSheet, Text } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { useBottomTabBarHeight } from "@react-navigation/bottom-tabs";
import { Feather } from "@expo/vector-icons";
import { useQuery } from "@tanstack/react-query";
import { Colors, Spacing, Typography } from "@/constants/theme";
import type { Location as LocationType } from "@shared/schema";

export default function MapScreen() {
  const insets = useSafeAreaInsets();
  const tabBarHeight = useBottomTabBarHeight();

  const { data: locations = [] } = useQuery<LocationType[]>({
    queryKey: ["/api/locations"],
  });

  return (
    <View style={[styles.webFallback, { paddingTop: insets.top + Spacing.xl, paddingBottom: tabBarHeight + Spacing.xl }]}>
      <Feather name="map" size={64} color={Colors.dark.inactive} />
      <Text style={styles.webFallbackTitle}>Map View</Text>
      <Text style={styles.webFallbackText}>
        Open this app in Expo Go on your phone to explore the interactive map with all mysterious locations.
      </Text>
      <Text style={styles.webFallbackHint}>
        {locations.length} locations available to discover
      </Text>
    </View>
  );
}

const styles = StyleSheet.create({
  webFallback: {
    flex: 1,
    backgroundColor: Colors.dark.backgroundRoot,
    justifyContent: "center",
    alignItems: "center",
    paddingHorizontal: Spacing.xl,
  },
  webFallbackTitle: {
    ...Typography.title1,
    color: Colors.dark.text,
    marginTop: Spacing.lg,
    marginBottom: Spacing.md,
  },
  webFallbackText: {
    ...Typography.body,
    color: Colors.dark.textSecondary,
    textAlign: "center",
    marginBottom: Spacing.lg,
  },
  webFallbackHint: {
    ...Typography.caption,
    color: Colors.dark.accent,
  },
});
