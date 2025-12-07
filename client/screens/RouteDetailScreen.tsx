import React, { useState, useEffect, useCallback } from "react";
import {
  View,
  StyleSheet,
  ScrollView,
  Text,
  Pressable,
  ActivityIndicator,
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { useRoute, RouteProp, useNavigation, useFocusEffect } from "@react-navigation/native";
import { NativeStackNavigationProp } from "@react-navigation/native-stack";
import { Feather } from "@expo/vector-icons";
import AsyncStorage from "@react-native-async-storage/async-storage";
import SafeMapView, { Marker, Polyline, PROVIDER_GOOGLE, isMapAvailable } from "@/components/SafeMapView";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { apiRequest, getApiUrl } from "@/lib/query-client";
import { Colors, Spacing, BorderRadius, Typography, CategoryColors } from "@/constants/theme";
import type { RootStackParamList } from "@/navigation/RootStackNavigator";
import type { Location, Category, RouteStop } from "@shared/schema";

interface WalkingRouteCoordinate {
  latitude: number;
  longitude: number;
}

const WALKING_THRESHOLD_KEY = "walking_time_threshold";
const DEFAULT_WALKING_THRESHOLD = 15;

function haversineDistance(
  lat1: number,
  lon1: number,
  lat2: number,
  lon2: number
): number {
  const R = 6371000;
  const toRad = (deg: number) => (deg * Math.PI) / 180;
  
  const dLat = toRad(lat2 - lat1);
  const dLon = toRad(lon2 - lon1);
  const a =
    Math.sin(dLat / 2) * Math.sin(dLat / 2) +
    Math.cos(toRad(lat1)) * Math.cos(toRad(lat2)) *
    Math.sin(dLon / 2) * Math.sin(dLon / 2);
  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
  
  return R * c;
}

function calculateWalkingTime(distanceMeters: number): number {
  const walkingSpeedKmH = 5;
  const walkingSpeedMPerMin = (walkingSpeedKmH * 1000) / 60;
  return Math.round(distanceMeters / walkingSpeedMPerMin);
}

interface RouteWithStops {
  id: string;
  name: string;
  slug: string;
  description: string;
  estimatedDurationMinutes: number;
  distanceMeters: number;
  difficulty: string;
  isEditable?: boolean;
  ownerId?: string;
  stops: RouteStop[];
}

export default function RouteDetailScreen() {
  const insets = useSafeAreaInsets();
  const navigation = useNavigation<NativeStackNavigationProp<RootStackParamList>>();
  const route = useRoute<RouteProp<RootStackParamList, "RouteDetail">>();
  const { route: routeData } = route.params;
  const queryClient = useQueryClient();

  const { data: routeDetails, isLoading } = useQuery<RouteWithStops>({
    queryKey: ["/api/routes", routeData.id],
  });

  const { data: locations = [] } = useQuery<Location[]>({
    queryKey: ["/api/locations"],
  });

  const { data: categories = [] } = useQuery<Category[]>({
    queryKey: ["/api/categories"],
  });

  const [localStops, setLocalStops] = useState<RouteStop[]>([]);
  const [walkingThreshold, setWalkingThreshold] = useState(DEFAULT_WALKING_THRESHOLD);
  const [walkingRouteCoordinates, setWalkingRouteCoordinates] = useState<WalkingRouteCoordinate[]>([]);
  const [isLoadingRoute, setIsLoadingRoute] = useState(false);
  const [directionsVersion, setDirectionsVersion] = useState(0);

  useEffect(() => {
    if (routeDetails?.stops) {
      setLocalStops([...routeDetails.stops].sort((a, b) => a.orderIndex - b.orderIndex));
    }
  }, [routeDetails?.stops]);

  // Create a stable key for the current stop order to trigger direction fetching
  const stopOrderKey = localStops.map(s => s.locationId).join(',');

  // Fetch walking directions from Google Maps when locations or stop order changes
  useEffect(() => {
    const fetchWalkingDirections = async () => {
      // Get locations for the sorted stops
      const sortedLocations = localStops
        .map(stop => locations.find(l => l.id === stop.locationId))
        .filter((l): l is Location => l !== undefined);

      if (sortedLocations.length < 2) {
        setWalkingRouteCoordinates([]);
        return;
      }

      setIsLoadingRoute(true);
      try {
        const waypoints = sortedLocations.map(loc => ({
          latitude: loc.latitude,
          longitude: loc.longitude,
        }));

        const response = await fetch(new URL('/api/directions/walking', getApiUrl()).toString(), {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({ waypoints }),
        });

        if (response.ok) {
          const data = await response.json();
          setWalkingRouteCoordinates(data.coordinates || []);
        } else {
          console.log('Failed to fetch walking directions, falling back to straight lines');
          setWalkingRouteCoordinates([]);
        }
      } catch (error) {
        console.log('Error fetching walking directions:', error);
        setWalkingRouteCoordinates([]);
      } finally {
        setIsLoadingRoute(false);
      }
    };

    if (locations.length > 0 && localStops.length >= 2) {
      fetchWalkingDirections();
    }
  }, [stopOrderKey, locations.length, directionsVersion]);

  useFocusEffect(
    useCallback(() => {
      AsyncStorage.getItem(WALKING_THRESHOLD_KEY).then((value) => {
        if (value) {
          setWalkingThreshold(parseInt(value, 10));
        }
      });
    }, [])
  );

  const reorderMutation = useMutation({
    mutationFn: async (stopOrders: { stopId: string; orderIndex: number }[]) => {
      const response = await apiRequest(
        "PUT",
        `/api/user-routes/${routeData.id}/stops/reorder`,
        { ownerId: routeDetails?.ownerId, stopOrders }
      );
      return response.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/routes", routeData.id] });
      setDirectionsVersion(v => v + 1);
    },
  });

  const getLocation = (locationId: string) => locations.find(l => l.id === locationId);
  const getCategory = (categoryId: string) => categories.find(c => c.id === categoryId);

  // Map stops to {stop, location} pairs, keeping all stops even if location not yet loaded
  const stopsWithLocations = localStops.map(stop => ({
    stop,
    location: getLocation(stop.locationId),
  }));

  // Calculate walking infos for rendering (moved outside of render loop for clarity)
  const walkingInfos = stopsWithLocations.map((item, index) => {
    if (index === 0 || !item.location) return null;
    const prevItem = stopsWithLocations[index - 1];
    if (!prevItem?.location) return null;
    
    const distance = haversineDistance(
      prevItem.location.latitude,
      prevItem.location.longitude,
      item.location.latitude,
      item.location.longitude
    );
    const time = calculateWalkingTime(distance);
    return { distance, time };
  });

  // For map rendering, filter to only stops with loaded locations
  const locationsForMap = stopsWithLocations
    .filter((item): item is { stop: RouteStop; location: Location } => item.location !== undefined)
    .map(item => item.location);

  const handleMoveStop = (index: number, direction: "up" | "down") => {
    const newIndex = direction === "up" ? index - 1 : index + 1;
    if (newIndex < 0 || newIndex >= localStops.length) return;

    const newStops = [...localStops];
    [newStops[index], newStops[newIndex]] = [newStops[newIndex], newStops[index]];
    
    const updatedStops = newStops.map((stop, idx) => ({
      ...stop,
      orderIndex: idx,
    }));
    
    setLocalStops(updatedStops);

    const stopOrders = updatedStops.map(stop => ({
      stopId: stop.id,
      orderIndex: stop.orderIndex,
    }));
    reorderMutation.mutate(stopOrders);
  };

  const isEditable = routeDetails?.isEditable === true;

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
    if (locationsForMap.length === 0) {
      return {
        latitude: 51.5074,
        longitude: -0.1278,
        latitudeDelta: 0.05,
        longitudeDelta: 0.05,
      };
    }

    const lats = locationsForMap.map(l => l.latitude);
    const lngs = locationsForMap.map(l => l.longitude);
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
            {isMapAvailable && locationsForMap.length > 1 ? (
              walkingRouteCoordinates.length > 0 ? (
                <Polyline
                  coordinates={walkingRouteCoordinates}
                  strokeColor={Colors.dark.accent}
                  strokeWidth={4}
                />
              ) : (
                <Polyline
                  coordinates={locationsForMap.map(l => ({
                    latitude: l.latitude,
                    longitude: l.longitude,
                  }))}
                  strokeColor={Colors.dark.accent}
                  strokeWidth={3}
                  lineDashPattern={[10, 5]}
                />
              )
            ) : null}
            {isMapAvailable && Marker ? locationsForMap.map((location, index) => {
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
          {isLoadingRoute ? (
            <View style={styles.mapLoadingOverlay}>
              <ActivityIndicator size="small" color={Colors.dark.accent} />
            </View>
          ) : null}
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

          <Text style={styles.stopsTitle}>Stops ({stopsWithLocations.length})</Text>

          {stopsWithLocations.map((item, index) => {
            const { stop, location } = item;
            const walkingInfo = walkingInfos[index];
            
            if (!location) {
              return (
                <View key={stop.id} style={styles.stopRow}>
                  <View style={styles.stopItem}>
                    <View style={[styles.stopNumber, { backgroundColor: Colors.dark.inactive }]}>
                      <Text style={styles.stopNumberText}>{index + 1}</Text>
                    </View>
                    <View style={styles.stopContent}>
                      <Text style={styles.stopName}>Loading...</Text>
                    </View>
                  </View>
                </View>
              );
            }

            const category = getCategory(location.categoryId);
            const color = category ? CategoryColors[category.slug] || Colors.dark.accent : Colors.dark.accent;
            const exceedsThreshold = walkingInfo && walkingInfo.time > walkingThreshold;
            
            return (
              <View key={stop.id}>
                {walkingInfo ? (
                  <View style={styles.walkingInfoRow} testID={`walking-info-${index}`}>
                    <View style={styles.walkingConnector} />
                    <View style={[
                      styles.walkingInfoBadge,
                      exceedsThreshold ? styles.walkingInfoWarning : null
                    ]}>
                      {exceedsThreshold ? (
                        <Feather name="alert-triangle" size={12} color="#FFAA00" style={{ marginRight: 4 }} />
                      ) : null}
                      <Feather name="navigation" size={12} color={exceedsThreshold ? "#FFAA00" : Colors.dark.textSecondary} />
                      <Text style={[
                        styles.walkingInfoText,
                        exceedsThreshold ? styles.walkingInfoTextWarning : null
                      ]}>
                        {walkingInfo.distance < 1000 
                          ? `${Math.round(walkingInfo.distance)}m` 
                          : `${(walkingInfo.distance / 1000).toFixed(1)}km`}
                        {" "}{walkingInfo.time} min walk
                      </Text>
                    </View>
                  </View>
                ) : null}
                <View style={styles.stopRow}>
                  <Pressable
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
                  {isEditable ? (
                    <View style={styles.reorderButtons}>
                      <Pressable
                        style={[
                          styles.reorderButton,
                          index === 0 && styles.reorderButtonDisabled,
                        ]}
                        onPress={() => handleMoveStop(index, "up")}
                        disabled={index === 0 || reorderMutation.isPending}
                      >
                        <Feather
                          name="chevron-up"
                          size={18}
                          color={index === 0 ? Colors.dark.inactive : Colors.dark.accent}
                        />
                      </Pressable>
                      <Pressable
                        style={[
                          styles.reorderButton,
                          index === stopsWithLocations.length - 1 && styles.reorderButtonDisabled,
                        ]}
                        onPress={() => handleMoveStop(index, "down")}
                        disabled={index === stopsWithLocations.length - 1 || reorderMutation.isPending}
                      >
                        <Feather
                          name="chevron-down"
                          size={18}
                          color={index === stopsWithLocations.length - 1 ? Colors.dark.inactive : Colors.dark.accent}
                        />
                      </Pressable>
                    </View>
                  ) : null}
                </View>
              </View>
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
    height: 300,
    position: "relative",
  },
  map: {
    flex: 1,
  },
  mapLoadingOverlay: {
    position: "absolute",
    top: Spacing.sm,
    right: Spacing.sm,
    backgroundColor: "rgba(0, 0, 0, 0.6)",
    borderRadius: BorderRadius.sm,
    padding: Spacing.xs,
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
  stopRow: {
    flexDirection: "row",
    alignItems: "center",
    marginBottom: Spacing.sm,
  },
  stopItem: {
    flex: 1,
    flexDirection: "row",
    alignItems: "center",
    backgroundColor: Colors.dark.backgroundDefault,
    borderRadius: BorderRadius.sm,
    padding: Spacing.md,
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
  reorderButtons: {
    flexDirection: "column",
    marginLeft: Spacing.xs,
  },
  reorderButton: {
    width: 32,
    height: 28,
    justifyContent: "center",
    alignItems: "center",
    backgroundColor: Colors.dark.backgroundDefault,
    borderRadius: BorderRadius.xs,
    marginVertical: 1,
  },
  reorderButtonDisabled: {
    opacity: 0.5,
  },
  walkingInfoRow: {
    flexDirection: "row",
    alignItems: "center",
    paddingLeft: 16,
    marginVertical: Spacing.xs,
  },
  walkingConnector: {
    width: 2,
    height: 24,
    backgroundColor: Colors.dark.border,
    marginRight: Spacing.md,
  },
  walkingInfoBadge: {
    flexDirection: "row",
    alignItems: "center",
    backgroundColor: Colors.dark.backgroundSecondary,
    paddingHorizontal: Spacing.sm,
    paddingVertical: Spacing.xs,
    borderRadius: BorderRadius.xs,
  },
  walkingInfoWarning: {
    backgroundColor: "rgba(255, 170, 0, 0.15)",
    borderWidth: 1,
    borderColor: "rgba(255, 170, 0, 0.3)",
  },
  walkingInfoText: {
    ...Typography.small,
    color: Colors.dark.textSecondary,
    marginLeft: Spacing.xs,
  },
  walkingInfoTextWarning: {
    color: "#FFAA00",
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
