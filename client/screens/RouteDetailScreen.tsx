import React from "react";
import {
  View,
  StyleSheet,
  ScrollView,
  Text,
  Pressable,
  ActivityIndicator,
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { useRoute, RouteProp, useNavigation } from "@react-navigation/native";
import { NativeStackNavigationProp } from "@react-navigation/native-stack";
import { Feather } from "@expo/vector-icons";
import SafeMapView, { Marker, Polyline, PROVIDER_GOOGLE, isMapAvailable } from "@/components/SafeMapView";
import { useQuery } from "@tanstack/react-query";
import { Colors, Spacing, BorderRadius, Typography, CategoryColors } from "@/constants/theme";
import type { RootStackParamList } from "@/navigation/RootStackNavigator";
import type { Location, Category, RouteStop } from "@shared/schema";

interface RouteWithStops {
  id: string;
  name: string;
  slug: string;
  description: string;
  estimatedDurationMinutes: number;
  distanceMeters: number;
  difficulty: string;
  stops: RouteStop[];
}

export default function RouteDetailScreen() {
  const insets = useSafeAreaInsets();
  const navigation = useNavigation<NativeStackNavigationProp<RootStackParamList>>();
  const route = useRoute<RouteProp<RootStackParamList, "RouteDetail">>();
  const { route: routeData } = route.params;

  const { data: routeDetails, isLoading } = useQuery<RouteWithStops>({
    queryKey: ["/api/routes", routeData.id],
  });

  const { data: locations = [] } = useQuery<Location[]>({
    queryKey: ["/api/locations"],
  });

  const { data: categories = [] } = useQuery<Category[]>({
    queryKey: ["/api/categories"],
  });

  const getLocation = (locationId: string) => locations.find(l => l.id === locationId);
  const getCategory = (categoryId: string) => categories.find(c => c.id === categoryId);

  const routeLocations = (routeDetails?.stops || [])
    .sort((a, b) => a.orderIndex - b.orderIndex)
    .map(stop => getLocation(stop.locationId))
    .filter(Boolean) as Location[];

  const formatDuration = (minutes: number) => {
    if (minutes < 60) return `${minutes} min`;
    const hours = Math.floor(minutes / 60);
    const mins = minutes % 60;
    return mins > 0 ? `${hours}h ${mins}m` : `${hours}h`;
  };

  const formatDistance = (meters: number) => {
    if (meters < 1000) return `${meters}m`;
    return `${(meters / 1000).toFixed(1)}km`;
  };

  const handleLocationPress = (location: Location) => {
    navigation.navigate("LocationDetail", {
      location,
      category: getCategory(location.categoryId),
    });
  };

  const getMapRegion = () => {
    if (routeLocations.length === 0) {
      return {
        latitude: 51.5074,
        longitude: -0.1278,
        latitudeDelta: 0.05,
        longitudeDelta: 0.05,
      };
    }

    const lats = routeLocations.map(l => l.latitude);
    const lngs = routeLocations.map(l => l.longitude);
    const minLat = Math.min(...lats);
    const maxLat = Math.max(...lats);
    const minLng = Math.min(...lngs);
    const maxLng = Math.max(...lngs);

    return {
      latitude: (minLat + maxLat) / 2,
      longitude: (minLng + maxLng) / 2,
      latitudeDelta: (maxLat - minLat) * 1.5 + 0.01,
      longitudeDelta: (maxLng - minLng) * 1.5 + 0.01,
    };
  };

  if (isLoading) {
    return (
      <View style={[styles.loadingContainer, { backgroundColor: Colors.dark.backgroundRoot }]}>
        <ActivityIndicator size="large" color={Colors.dark.accent} />
      </View>
    );
  }

  return (
    <View style={[styles.container, { backgroundColor: Colors.dark.backgroundRoot }]}>
      <ScrollView
        style={styles.scrollView}
        contentContainerStyle={[styles.scrollContent, { paddingBottom: insets.bottom + 100 }]}
        showsVerticalScrollIndicator={false}
      >
        <View style={styles.mapContainer}>
          <SafeMapView
            style={styles.map}
            provider={PROVIDER_GOOGLE}
            initialRegion={getMapRegion()}
            scrollEnabled={false}
            zoomEnabled={false}
            pitchEnabled={false}
            rotateEnabled={false}
            userInterfaceStyle="dark"
          >
            {isMapAvailable && routeLocations.length > 1 ? (
              <Polyline
                coordinates={routeLocations.map(l => ({
                  latitude: l.latitude,
                  longitude: l.longitude,
                }))}
                strokeColor={Colors.dark.accent}
                strokeWidth={3}
              />
            ) : null}
            {isMapAvailable && Marker ? routeLocations.map((location, index) => {
              const category = getCategory(location.categoryId);
              const color = category ? CategoryColors[category.slug] || Colors.dark.accent : Colors.dark.accent;
              return (
                <Marker
                  key={location.id}
                  coordinate={{
                    latitude: location.latitude,
                    longitude: location.longitude,
                  }}
                >
                  <View style={[styles.marker, { backgroundColor: color }]}>
                    <Text style={styles.markerText}>{index + 1}</Text>
                  </View>
                </Marker>
              );
            }) : null}
          </SafeMapView>
        </View>

        <View style={styles.content}>
          <Text style={styles.title}>{routeData.name}</Text>
          
          <View style={styles.metaContainer}>
            <View style={styles.metaItem}>
              <Feather name="clock" size={16} color={Colors.dark.textSecondary} />
              <Text style={styles.metaText}>{formatDuration(routeData.estimatedDurationMinutes)}</Text>
            </View>
            <View style={styles.metaItem}>
              <Feather name="map" size={16} color={Colors.dark.textSecondary} />
              <Text style={styles.metaText}>{formatDistance(routeData.distanceMeters)}</Text>
            </View>
            <View style={styles.metaItem}>
              <Feather name="activity" size={16} color={Colors.dark.textSecondary} />
              <Text style={styles.metaText}>{routeData.difficulty}</Text>
            </View>
          </View>

          <Text style={styles.description}>{routeData.description}</Text>

          <View style={styles.divider} />

          <Text style={styles.stopsTitle}>Stops ({routeLocations.length})</Text>

          {routeLocations.map((location, index) => {
            const category = getCategory(location.categoryId);
            const color = category ? CategoryColors[category.slug] || Colors.dark.accent : Colors.dark.accent;
            return (
              <Pressable
                key={location.id}
                style={({ pressed }) => [styles.stopItem, pressed && styles.stopItemPressed]}
                onPress={() => handleLocationPress(location)}
              >
                <View style={[styles.stopNumber, { backgroundColor: color }]}>
                  <Text style={styles.stopNumberText}>{index + 1}</Text>
                </View>
                <View style={styles.stopContent}>
                  <Text style={styles.stopName}>{location.name}</Text>
                  <Text style={styles.stopCategory}>{category?.name || "Unknown"}</Text>
                </View>
                <Feather name="chevron-right" size={20} color={Colors.dark.inactive} />
              </Pressable>
            );
          })}
        </View>
      </ScrollView>

      <View style={[styles.footer, { paddingBottom: insets.bottom + Spacing.lg }]}>
        <Pressable
          style={({ pressed }) => [styles.startButton, pressed && styles.startButtonPressed]}
        >
          <Feather name="navigation" size={20} color="#FFFFFF" />
          <Text style={styles.startText}>Start Route</Text>
        </Pressable>
      </View>
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
  scrollView: {
    flex: 1,
  },
  scrollContent: {
    flexGrow: 1,
  },
  mapContainer: {
    height: 200,
  },
  map: {
    flex: 1,
  },
  marker: {
    width: 28,
    height: 28,
    borderRadius: 14,
    justifyContent: "center",
    alignItems: "center",
  },
  markerText: {
    ...Typography.caption,
    color: "#FFFFFF",
    fontWeight: "700",
  },
  content: {
    paddingHorizontal: Spacing.lg,
    paddingTop: Spacing.lg,
  },
  title: {
    ...Typography.h2,
    color: Colors.dark.text,
    marginBottom: Spacing.md,
  },
  metaContainer: {
    flexDirection: "row",
    gap: Spacing.xl,
    marginBottom: Spacing.lg,
  },
  metaItem: {
    flexDirection: "row",
    alignItems: "center",
    gap: Spacing.xs,
  },
  metaText: {
    ...Typography.small,
    color: Colors.dark.textSecondary,
    textTransform: "capitalize",
  },
  description: {
    ...Typography.body,
    color: Colors.dark.textSecondary,
    marginBottom: Spacing.xl,
  },
  divider: {
    height: 1,
    backgroundColor: Colors.dark.border,
    marginBottom: Spacing.xl,
  },
  stopsTitle: {
    ...Typography.headline,
    color: Colors.dark.textAccent,
    marginBottom: Spacing.lg,
  },
  stopItem: {
    flexDirection: "row",
    alignItems: "center",
    backgroundColor: Colors.dark.backgroundDefault,
    borderRadius: BorderRadius.sm,
    padding: Spacing.md,
    marginBottom: Spacing.sm,
  },
  stopItemPressed: {
    opacity: 0.6,
  },
  stopNumber: {
    width: 32,
    height: 32,
    borderRadius: 16,
    justifyContent: "center",
    alignItems: "center",
    marginRight: Spacing.md,
  },
  stopNumberText: {
    ...Typography.caption,
    color: "#FFFFFF",
    fontWeight: "700",
  },
  stopContent: {
    flex: 1,
  },
  stopName: {
    ...Typography.body,
    color: Colors.dark.text,
  },
  stopCategory: {
    ...Typography.caption,
    color: Colors.dark.textSecondary,
    marginTop: 2,
  },
  footer: {
    position: "absolute",
    bottom: 0,
    left: 0,
    right: 0,
    paddingHorizontal: Spacing.lg,
    paddingTop: Spacing.lg,
    backgroundColor: Colors.dark.backgroundRoot,
  },
  startButton: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: Colors.dark.accent,
    height: Spacing.buttonHeight,
    borderRadius: BorderRadius.sm,
    gap: Spacing.sm,
  },
  startButtonPressed: {
    opacity: 0.6,
  },
  startText: {
    ...Typography.headline,
    color: "#FFFFFF",
  },
});
