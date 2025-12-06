import React, { useState } from "react";
import {
  View,
  StyleSheet,
  ScrollView,
  Text,
  Pressable,
  Alert,
  ActivityIndicator,
  RefreshControl,
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { useNavigation } from "@react-navigation/native";
import { NativeStackNavigationProp } from "@react-navigation/native-stack";
import { useHeaderHeight } from "@react-navigation/elements";
import { Feather } from "@expo/vector-icons";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { Colors, Spacing, BorderRadius, Typography, CategoryColors } from "@/constants/theme";
import { apiRequest } from "@/lib/query-client";
import type { RootStackParamList } from "@/navigation/RootStackNavigator";
import type { Location as LocationType, Category } from "@shared/schema";

export default function AdminScreen() {
  const insets = useSafeAreaInsets();
  const headerHeight = useHeaderHeight();
  const navigation = useNavigation<NativeStackNavigationProp<RootStackParamList>>();
  const queryClient = useQueryClient();
  const [refreshing, setRefreshing] = useState(false);

  const { data: locations = [], isLoading: locationsLoading, refetch } = useQuery<LocationType[]>({
    queryKey: ["/api/admin/locations"],
  });

  const { data: categories = [] } = useQuery<Category[]>({
    queryKey: ["/api/categories"],
  });

  const deleteMutation = useMutation({
    mutationFn: async (id: string) => {
      return apiRequest("DELETE", `/api/locations/${id}`);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/admin/locations"] });
      queryClient.invalidateQueries({ queryKey: ["/api/locations"] });
      queryClient.invalidateQueries({ queryKey: ["/api/routes"] });
    },
  });

  const onRefresh = async () => {
    setRefreshing(true);
    await refetch();
    setRefreshing(false);
  };

  const getCategoryName = (categoryId: string) => {
    const category = categories.find(c => c.id === categoryId);
    return category?.name || "Unknown";
  };

  const getCategoryColor = (categoryId: string) => {
    const category = categories.find(c => c.id === categoryId);
    if (category) {
      return CategoryColors[category.slug] || Colors.dark.accent;
    }
    return Colors.dark.accent;
  };

  const handleDelete = (location: LocationType) => {
    Alert.alert(
      "Delete Location",
      `Are you sure you want to delete "${location.name}"? This will also remove it from any routes.`,
      [
        { text: "Cancel", style: "cancel" },
        {
          text: "Delete",
          style: "destructive",
          onPress: () => deleteMutation.mutate(location.id),
        },
      ]
    );
  };

  const handleAddLocation = () => {
    navigation.navigate("AdminAddLocation", {});
  };

  if (locationsLoading) {
    return (
      <View style={[styles.loadingContainer, { backgroundColor: Colors.dark.backgroundRoot }]}>
        <ActivityIndicator size="large" color={Colors.dark.accent} />
        <Text style={[styles.loadingText, { color: Colors.dark.textSecondary }]}>
          Loading locations...
        </Text>
      </View>
    );
  }

  return (
    <View style={[styles.container, { backgroundColor: Colors.dark.backgroundRoot }]}>
      <ScrollView
        style={styles.scrollView}
        contentContainerStyle={[
          styles.scrollContent,
          { 
            paddingTop: Spacing.lg,
            paddingBottom: insets.bottom + Spacing.xl + 80,
          },
        ]}
        refreshControl={
          <RefreshControl
            refreshing={refreshing}
            onRefresh={onRefresh}
            tintColor={Colors.dark.accent}
          />
        }
      >
        <View style={styles.statsRow}>
          <View style={styles.statCard}>
            <Text style={styles.statNumber}>{locations.length}</Text>
            <Text style={styles.statLabel}>Total Locations</Text>
          </View>
          <View style={styles.statCard}>
            <Text style={styles.statNumber}>
              {locations.filter(l => l.isActive).length}
            </Text>
            <Text style={styles.statLabel}>Active</Text>
          </View>
        </View>

        <Text style={styles.sectionTitle}>All Locations</Text>

        {locations.map((location) => (
          <View key={location.id} style={styles.locationCard}>
            <View style={styles.locationInfo}>
              <View style={styles.locationHeader}>
                <Text style={styles.locationName} numberOfLines={1}>
                  {location.name}
                </Text>
                {!location.isActive ? (
                  <View style={styles.inactiveBadge}>
                    <Text style={styles.inactiveBadgeText}>Inactive</Text>
                  </View>
                ) : null}
              </View>
              <View style={styles.locationMeta}>
                <View 
                  style={[
                    styles.categoryBadge, 
                    { backgroundColor: getCategoryColor(location.categoryId) + "30" }
                  ]}
                >
                  <Text 
                    style={[
                      styles.categoryBadgeText,
                      { color: getCategoryColor(location.categoryId) }
                    ]}
                  >
                    {getCategoryName(location.categoryId)}
                  </Text>
                </View>
                <Text style={styles.locationCoords}>
                  {location.latitude.toFixed(4)}, {location.longitude.toFixed(4)}
                </Text>
              </View>
              <Text style={styles.locationDescription} numberOfLines={2}>
                {location.description}
              </Text>
            </View>
            <Pressable
              style={({ pressed }) => [
                styles.deleteButton,
                pressed && styles.deleteButtonPressed,
              ]}
              onPress={() => handleDelete(location)}
            >
              <Feather name="trash-2" size={20} color="#E57373" />
            </Pressable>
          </View>
        ))}
      </ScrollView>

      <Pressable
        style={({ pressed }) => [
          styles.addButton,
          { bottom: insets.bottom + Spacing.xl },
          pressed && styles.addButtonPressed,
        ]}
        onPress={handleAddLocation}
      >
        <Feather name="plus" size={24} color="#FFFFFF" />
        <Text style={styles.addButtonText}>Add Location</Text>
      </Pressable>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
  },
  loadingContainer: {
    flex: 1,
    justifyContent: "center",
    alignItems: "center",
  },
  loadingText: {
    marginTop: Spacing.lg,
    ...Typography.body,
  },
  scrollView: {
    flex: 1,
  },
  scrollContent: {
    paddingHorizontal: Spacing.lg,
  },
  statsRow: {
    flexDirection: "row",
    gap: Spacing.md,
    marginBottom: Spacing.xl,
  },
  statCard: {
    flex: 1,
    backgroundColor: Colors.dark.backgroundDefault,
    borderRadius: BorderRadius.sm,
    padding: Spacing.lg,
    alignItems: "center",
  },
  statNumber: {
    ...Typography.largeTitle,
    color: Colors.dark.accent,
  },
  statLabel: {
    ...Typography.caption,
    color: Colors.dark.textSecondary,
    marginTop: Spacing.xs,
  },
  sectionTitle: {
    ...Typography.headline,
    color: Colors.dark.text,
    marginBottom: Spacing.md,
  },
  locationCard: {
    flexDirection: "row",
    backgroundColor: Colors.dark.backgroundDefault,
    borderRadius: BorderRadius.sm,
    padding: Spacing.md,
    marginBottom: Spacing.sm,
    alignItems: "center",
  },
  locationInfo: {
    flex: 1,
  },
  locationHeader: {
    flexDirection: "row",
    alignItems: "center",
    gap: Spacing.sm,
  },
  locationName: {
    ...Typography.body,
    color: Colors.dark.text,
    fontWeight: "600",
    flex: 1,
  },
  inactiveBadge: {
    backgroundColor: Colors.dark.inactive + "40",
    paddingHorizontal: Spacing.sm,
    paddingVertical: 2,
    borderRadius: BorderRadius.xs,
  },
  inactiveBadgeText: {
    ...Typography.small,
    color: Colors.dark.inactive,
  },
  locationMeta: {
    flexDirection: "row",
    alignItems: "center",
    gap: Spacing.sm,
    marginTop: Spacing.xs,
  },
  categoryBadge: {
    paddingHorizontal: Spacing.sm,
    paddingVertical: 2,
    borderRadius: BorderRadius.xs,
  },
  categoryBadgeText: {
    ...Typography.small,
    fontWeight: "500",
  },
  locationCoords: {
    ...Typography.small,
    color: Colors.dark.textSecondary,
  },
  locationDescription: {
    ...Typography.small,
    color: Colors.dark.textSecondary,
    marginTop: Spacing.xs,
  },
  deleteButton: {
    width: 44,
    height: 44,
    justifyContent: "center",
    alignItems: "center",
    marginLeft: Spacing.sm,
  },
  deleteButtonPressed: {
    opacity: 0.6,
  },
  addButton: {
    position: "absolute",
    left: Spacing.lg,
    right: Spacing.lg,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: Spacing.sm,
    backgroundColor: Colors.dark.accent,
    paddingVertical: Spacing.md,
    borderRadius: BorderRadius.sm,
  },
  addButtonPressed: {
    opacity: 0.8,
  },
  addButtonText: {
    ...Typography.body,
    color: "#FFFFFF",
    fontWeight: "600",
  },
});
