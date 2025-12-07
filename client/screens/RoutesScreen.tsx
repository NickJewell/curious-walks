import React, { useState, useMemo } from "react";
import {
  View,
  StyleSheet,
  FlatList,
  Text,
  ActivityIndicator,
  RefreshControl,
  Pressable,
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { useBottomTabBarHeight } from "@react-navigation/bottom-tabs";
import { useNavigation } from "@react-navigation/native";
import { NativeStackNavigationProp } from "@react-navigation/native-stack";
import { Feather } from "@expo/vector-icons";
import { useQuery } from "@tanstack/react-query";
import { Colors, Spacing, Typography, BorderRadius } from "@/constants/theme";
import type { RootStackParamList } from "@/navigation/RootStackNavigator";
import type { Route } from "@shared/schema";
import RouteCard from "@/components/RouteCard";
import { useDeviceId } from "@/hooks/useDeviceId";

type FilterType = "all" | "system" | "my";

export default function RoutesScreen() {
  const insets = useSafeAreaInsets();
  const tabBarHeight = useBottomTabBarHeight();
  const navigation = useNavigation<NativeStackNavigationProp<RootStackParamList>>();
  const deviceId = useDeviceId();
  const [filter, setFilter] = useState<FilterType>("all");

  const { data: routes = [], isLoading, refetch, isRefetching } = useQuery<Route[]>({
    queryKey: ["/api/routes"],
  });

  const { data: userRoutes = [] } = useQuery<Route[]>({
    queryKey: ["/api/user-routes", deviceId],
    queryFn: async () => {
      if (!deviceId) return [];
      const res = await fetch(`/api/user-routes?ownerId=${deviceId}`);
      if (!res.ok) throw new Error("Failed to fetch user routes");
      return res.json();
    },
    enabled: !!deviceId,
  });

  const allRoutes = useMemo(() => {
    const systemRoutes = routes.filter(r => r.ownerId === null);
    const combined = [...systemRoutes, ...userRoutes];
    const uniqueMap = new Map(combined.map(r => [r.id, r]));
    return Array.from(uniqueMap.values());
  }, [routes, userRoutes]);

  const filteredRoutes = useMemo(() => {
    switch (filter) {
      case "system":
        return allRoutes.filter(r => r.ownerId === null);
      case "my":
        return allRoutes.filter(r => r.ownerId !== null);
      default:
        return allRoutes;
    }
  }, [allRoutes, filter]);

  const handleRoutePress = (route: Route) => {
    navigation.navigate("RouteDetail", { route });
  };

  const renderRoute = ({ item }: { item: Route }) => (
    <RouteCard route={item} onPress={() => handleRoutePress(item)} />
  );

  if (isLoading) {
    return (
      <View style={[styles.loadingContainer, { backgroundColor: Colors.dark.backgroundRoot }]}>
        <ActivityIndicator size="large" color={Colors.dark.accent} />
      </View>
    );
  }

  const filterOptions: { key: FilterType; label: string }[] = [
    { key: "all", label: "All" },
    { key: "system", label: "System" },
    { key: "my", label: "My Routes" },
  ];

  return (
    <View style={[styles.container, { backgroundColor: Colors.dark.backgroundRoot }]}>
      <View style={[styles.header, { paddingTop: insets.top + Spacing.lg }]}>
        <Text style={styles.title}>Routes</Text>
        <Text style={styles.subtitle}>Curated walking tours through London's mysteries</Text>
        
        <View style={styles.filterTabs}>
          {filterOptions.map((option) => (
            <Pressable
              key={option.key}
              style={[styles.filterTab, filter === option.key && styles.filterTabActive]}
              onPress={() => setFilter(option.key)}
            >
              <Text style={[styles.filterTabText, filter === option.key && styles.filterTabTextActive]}>
                {option.label}
              </Text>
            </Pressable>
          ))}
        </View>
      </View>

      <FlatList
        data={filteredRoutes}
        keyExtractor={(item) => item.id}
        renderItem={renderRoute}
        contentContainerStyle={[
          styles.listContent,
          { paddingBottom: tabBarHeight + Spacing.xl },
        ]}
        showsVerticalScrollIndicator={false}
        refreshControl={
          <RefreshControl
            refreshing={isRefetching}
            onRefresh={refetch}
            tintColor={Colors.dark.accent}
          />
        }
        ListEmptyComponent={
          <View style={styles.emptyContainer}>
            <Feather name="navigation" size={48} color={Colors.dark.inactive} />
            <Text style={styles.emptyText}>
              {filter === "my" ? "No custom routes yet" : "No routes available"}
            </Text>
            <Text style={styles.emptySubtext}>
              {filter === "my" 
                ? "Select locations on the Explore or Map screens to create your own route"
                : "Check back soon for curated walking tours"}
            </Text>
          </View>
        }
      />
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
  header: {
    paddingHorizontal: Spacing.lg,
    marginBottom: Spacing.lg,
  },
  title: {
    ...Typography.largeTitle,
    color: Colors.dark.text,
    marginBottom: Spacing.xs,
  },
  subtitle: {
    ...Typography.body,
    color: Colors.dark.textSecondary,
  },
  filterTabs: {
    flexDirection: "row",
    marginTop: Spacing.lg,
    gap: Spacing.sm,
  },
  filterTab: {
    paddingHorizontal: Spacing.md,
    paddingVertical: Spacing.sm,
    borderRadius: BorderRadius.sm,
    backgroundColor: Colors.dark.backgroundDefault,
  },
  filterTabActive: {
    backgroundColor: Colors.dark.accent,
  },
  filterTabText: {
    ...Typography.small,
    color: Colors.dark.textSecondary,
  },
  filterTabTextActive: {
    color: "#FFFFFF",
    fontWeight: "600",
  },
  listContent: {
    paddingHorizontal: Spacing.lg,
    gap: Spacing.md,
  },
  emptyContainer: {
    alignItems: "center",
    paddingTop: Spacing["5xl"],
    paddingHorizontal: Spacing.xl,
  },
  emptyText: {
    ...Typography.headline,
    color: Colors.dark.textSecondary,
    marginTop: Spacing.lg,
  },
  emptySubtext: {
    ...Typography.body,
    color: Colors.dark.inactive,
    marginTop: Spacing.sm,
    textAlign: "center",
  },
});
