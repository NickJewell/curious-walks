import React, { useState, useEffect, useCallback, useRef } from "react";
import {
  View,
  StyleSheet,
  ScrollView,
  Text,
  Pressable,
  ActivityIndicator,
  Animated,
  Modal,
  Dimensions,
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

interface LegInfo {
  startIndex: number;
  endIndex: number;
  distance: { text: string; value: number };
  duration: { text: string; value: number };
  steps: WalkingStep[];
}

interface WalkingStep {
  instruction: string;
  distance: { text: string; value: number };
  duration: { text: string; value: number };
}

interface DirectionsResponse {
  coordinates: WalkingRouteCoordinate[];
  legs: LegInfo[];
  totalDistance: { text: string; value: number };
  totalDuration: { text: string; value: number };
}

const WALKING_THRESHOLD_KEY = "walking_time_threshold";
const DEFAULT_WALKING_THRESHOLD = 15;
const CHECKED_IN_STOPS_KEY = "checked_in_stops";

const { width: SCREEN_WIDTH } = Dimensions.get("window");

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
  const mapRef = useRef<any>(null);

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
  const [walkingLegs, setWalkingLegs] = useState<LegInfo[]>([]);
  const [isLoadingRoute, setIsLoadingRoute] = useState(false);
  const [directionsVersion, setDirectionsVersion] = useState(0);
  
  // New state for enhanced features
  const [selectedStopIndex, setSelectedStopIndex] = useState<number | null>(null);
  const [checkedInStops, setCheckedInStops] = useState<Set<string>>(new Set());
  const [expandedWalkingLeg, setExpandedWalkingLeg] = useState<number | null>(null);
  const [showStopDetailModal, setShowStopDetailModal] = useState(false);
  
  // Animation for selected stop panel
  const panelAnimation = useRef(new Animated.Value(0)).current;

  useEffect(() => {
    if (routeDetails?.stops) {
      setLocalStops([...routeDetails.stops].sort((a, b) => a.orderIndex - b.orderIndex));
    }
  }, [routeDetails?.stops]);

  // Load checked-in stops from storage
  useEffect(() => {
    AsyncStorage.getItem(`${CHECKED_IN_STOPS_KEY}_${routeData.id}`).then((value) => {
      if (value) {
        setCheckedInStops(new Set(JSON.parse(value)));
      }
    });
  }, [routeData.id]);

  // Animate panel when stop is selected
  useEffect(() => {
    Animated.spring(panelAnimation, {
      toValue: selectedStopIndex !== null ? 1 : 0,
      useNativeDriver: true,
      friction: 8,
    }).start();
  }, [selectedStopIndex]);

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
        setWalkingLegs([]);
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
          const data: DirectionsResponse = await response.json();
          setWalkingRouteCoordinates(data.coordinates || []);
          setWalkingLegs(data.legs || []);
        } else {
          console.log('Failed to fetch walking directions, falling back to straight lines');
          setWalkingRouteCoordinates([]);
          setWalkingLegs([]);
        }
      } catch (error) {
        console.log('Error fetching walking directions:', error);
        setWalkingRouteCoordinates([]);
        setWalkingLegs([]);
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
    
    // Use leg info from API if available
    if (walkingLegs[index - 1]) {
      const leg = walkingLegs[index - 1];
      return {
        distance: leg.distance.value,
        time: Math.round(leg.duration.value / 60),
        distanceText: leg.distance.text,
        durationText: leg.duration.text,
        steps: leg.steps,
      };
    }
    
    // Fallback to calculated distance
    const distance = haversineDistance(
      prevItem.location.latitude,
      prevItem.location.longitude,
      item.location.latitude,
      item.location.longitude
    );
    const time = calculateWalkingTime(distance);
    return { distance, time, distanceText: null, durationText: null, steps: [] };
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

  // Handle marker press - zoom to street level
  const handleMarkerPress = (index: number) => {
    setSelectedStopIndex(index);
    const location = locationsForMap[index];
    if (location && mapRef.current) {
      // Animate to street level zoom
      mapRef.current.animateToRegion({
        latitude: location.latitude,
        longitude: location.longitude,
        latitudeDelta: 0.003, // Street level zoom
        longitudeDelta: 0.003,
      }, 500);
    }
  };

  // Handle stop selection from list - same as marker press
  const handleStopListPress = (index: number) => {
    handleMarkerPress(index);
  };

  // Handle check-in for a stop
  const handleCheckIn = async (stopId: string) => {
    const newCheckedIn = new Set(checkedInStops);
    if (newCheckedIn.has(stopId)) {
      newCheckedIn.delete(stopId);
    } else {
      newCheckedIn.add(stopId);
    }
    setCheckedInStops(newCheckedIn);
    await AsyncStorage.setItem(
      `${CHECKED_IN_STOPS_KEY}_${routeData.id}`,
      JSON.stringify([...newCheckedIn])
    );
  };

  // Handle view stop details - show modal overlay instead of navigating
  const handleViewStopDetails = () => {
    if (selectedStopIndex !== null) {
      setShowStopDetailModal(true);
    }
  };

  // Reset map to show all stops
  const resetMapView = () => {
    setSelectedStopIndex(null);
    if (mapRef.current && locationsForMap.length > 0) {
      mapRef.current.animateToRegion(getMapRegion(), 500);
    }
  };

  // Toggle expanded walking instructions
  const toggleWalkingInstructions = (index: number) => {
    setExpandedWalkingLeg(expandedWalkingLeg === index ? null : index);
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

  // Get selected stop info
  const selectedStop = selectedStopIndex !== null ? stopsWithLocations[selectedStopIndex] : null;
  const selectedCategory = selectedStop?.location ? getCategory(selectedStop.location.categoryId) : null;
  const selectedColor = selectedCategory ? CategoryColors[selectedCategory.slug] || Colors.dark.accent : Colors.dark.accent;

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
            ref={mapRef}
            style={styles.map}
            provider={PROVIDER_GOOGLE}
            initialRegion={getMapRegion()}
            scrollEnabled={true}
            zoomEnabled={true}
            pitchEnabled={false}
            rotateEnabled={false}
            userInterfaceStyle="dark"
          >
            {isMapAvailable && Polyline && locationsForMap.length > 1 ? (
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
              const isSelected = selectedStopIndex === index;
              const isCheckedIn = checkedInStops.has(localStops[index]?.id);
              return (
                <Marker
                  key={location.id}
                  coordinate={{
                    latitude: location.latitude,
                    longitude: location.longitude,
                  }}
                  onPress={() => handleMarkerPress(index)}
                >
                  <View style={[
                    styles.marker, 
                    { backgroundColor: color },
                    isSelected && styles.markerSelected,
                    isCheckedIn && styles.markerCheckedIn,
                  ]}>
                    {isCheckedIn ? (
                      <Feather name="check" size={14} color="#FFFFFF" />
                    ) : (
                      <Text style={styles.markerText}>{index + 1}</Text>
                    )}
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

          {/* Reset view button when zoomed in */}
          {selectedStopIndex !== null ? (
            <Pressable style={styles.resetViewButton} onPress={resetMapView}>
              <Feather name="minimize-2" size={18} color={Colors.dark.text} />
            </Pressable>
          ) : null}

          {/* Selected Stop Panel */}
          {selectedStop?.location ? (
            <Animated.View
              style={[
                styles.selectedStopPanel,
                {
                  transform: [{
                    translateY: panelAnimation.interpolate({
                      inputRange: [0, 1],
                      outputRange: [150, 0],
                    }),
                  }],
                  opacity: panelAnimation,
                },
              ]}
            >
              <View style={styles.selectedStopHeader}>
                <View style={[styles.selectedStopNumber, { backgroundColor: selectedColor }]}>
                  {checkedInStops.has(localStops[selectedStopIndex!]?.id) ? (
                    <Feather name="check" size={14} color="#FFFFFF" />
                  ) : (
                    <Text style={styles.selectedStopNumberText}>{selectedStopIndex! + 1}</Text>
                  )}
                </View>
                <View style={styles.selectedStopInfo}>
                  <Text style={styles.selectedStopName} numberOfLines={1}>
                    {selectedStop.location.name}
                  </Text>
                  <Text style={styles.selectedStopCategory}>
                    {selectedCategory?.name || "Unknown"}
                  </Text>
                </View>
                <Pressable
                  style={styles.closeSelectedButton}
                  onPress={() => setSelectedStopIndex(null)}
                >
                  <Feather name="x" size={20} color={Colors.dark.textSecondary} />
                </Pressable>
              </View>
              
              <View style={styles.selectedStopActions}>
                <Pressable
                  style={[
                    styles.checkInButton,
                    checkedInStops.has(localStops[selectedStopIndex!]?.id) && styles.checkInButtonActive,
                  ]}
                  onPress={() => handleCheckIn(localStops[selectedStopIndex!]?.id)}
                >
                  <Feather
                    name={checkedInStops.has(localStops[selectedStopIndex!]?.id) ? "check-circle" : "circle"}
                    size={18}
                    color={checkedInStops.has(localStops[selectedStopIndex!]?.id) ? "#4CAF50" : Colors.dark.textSecondary}
                  />
                  <Text style={[
                    styles.checkInText,
                    checkedInStops.has(localStops[selectedStopIndex!]?.id) && styles.checkInTextActive,
                  ]}>
                    {checkedInStops.has(localStops[selectedStopIndex!]?.id) ? "Checked In" : "Check In"}
                  </Text>
                </Pressable>
                
                <Pressable
                  style={styles.viewDetailsButton}
                  onPress={handleViewStopDetails}
                >
                  <Feather name="info" size={18} color={Colors.dark.accent} />
                  <Text style={styles.viewDetailsText}>View Details</Text>
                </Pressable>
              </View>
            </Animated.View>
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
            <View style={styles.metaItem}>
              <Feather name="check-square" size={16} color={Colors.dark.textSecondary} />
              <Text style={styles.metaText}>
                {checkedInStops.size}/{stopsWithLocations.length}
              </Text>
            </View>
          </View>

          <Text style={styles.description}>{routeData.description}</Text>

          <View style={styles.divider} />

          <Text style={styles.stopsTitle}>Stops ({stopsWithLocations.length})</Text>

          {stopsWithLocations.map((item, index) => {
            const { stop, location } = item;
            const walkingInfo = walkingInfos[index];
            const isCheckedIn = checkedInStops.has(stop.id);
            const isSelected = selectedStopIndex === index;
            
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
            const hasSteps = walkingInfo?.steps && walkingInfo.steps.length > 0;
            const isExpanded = expandedWalkingLeg === index;
            
            return (
              <View key={stop.id}>
                {walkingInfo ? (
                  <View>
                    <Pressable 
                      style={styles.walkingInfoRow} 
                      testID={`walking-info-${index}`}
                      onPress={() => hasSteps ? toggleWalkingInstructions(index) : null}
                      disabled={!hasSteps}
                    >
                      <View style={styles.walkingConnector} />
                      <View style={[
                        styles.walkingInfoBadge,
                        exceedsThreshold ? styles.walkingInfoWarning : null,
                        hasSteps ? styles.walkingInfoClickable : null,
                      ]}>
                        {exceedsThreshold ? (
                          <Feather name="alert-triangle" size={12} color="#FFAA00" style={{ marginRight: 4 }} />
                        ) : null}
                        <Feather name="navigation" size={12} color={exceedsThreshold ? "#FFAA00" : Colors.dark.textSecondary} />
                        <Text style={[
                          styles.walkingInfoText,
                          exceedsThreshold ? styles.walkingInfoTextWarning : null
                        ]}>
                          {walkingInfo.distanceText || (walkingInfo.distance < 1000 
                            ? `${Math.round(walkingInfo.distance)}m` 
                            : `${(walkingInfo.distance / 1000).toFixed(1)}km`)}
                          {" "}{walkingInfo.durationText || `${walkingInfo.time} min walk`}
                        </Text>
                        {hasSteps ? (
                          <Feather 
                            name={isExpanded ? "chevron-up" : "chevron-down"} 
                            size={14} 
                            color={Colors.dark.textSecondary} 
                            style={{ marginLeft: 4 }}
                          />
                        ) : null}
                      </View>
                    </Pressable>
                    
                    {/* Expanded walking instructions */}
                    {isExpanded && walkingInfo.steps ? (
                      <View style={styles.walkingStepsContainer}>
                        {walkingInfo.steps.map((step, stepIndex) => {
                          const instruction = step.instruction.replace(/<[^>]*>/g, '');
                          const isDestination = instruction.toLowerCase().includes('destination');
                          return (
                            <View 
                              key={stepIndex} 
                              style={[
                                styles.walkingStep,
                                isDestination && styles.walkingStepDestination,
                              ]}
                            >
                              <View style={isDestination ? styles.walkingStepDestinationDot : styles.walkingStepDot} />
                              <View style={styles.walkingStepContent}>
                                <Text style={styles.walkingStepInstruction}>
                                  {instruction}
                                </Text>
                                <Text style={styles.walkingStepMeta}>
                                  {step.distance.text} - {step.duration.text}
                                </Text>
                              </View>
                            </View>
                          );
                        })}
                      </View>
                    ) : null}
                  </View>
                ) : null}
                <View style={styles.stopRow}>
                  <Pressable
                    style={({ pressed }) => [
                      styles.stopItem, 
                      pressed && styles.stopItemPressed,
                      isSelected && styles.stopItemSelected,
                    ]}
                    onPress={() => handleStopListPress(index)}
                  >
                    <View style={[
                      styles.stopNumber, 
                      { backgroundColor: color },
                      isCheckedIn && styles.stopNumberCheckedIn,
                    ]}>
                      {isCheckedIn ? (
                        <Feather name="check" size={14} color="#FFFFFF" />
                      ) : (
                        <Text style={styles.stopNumberText}>{index + 1}</Text>
                      )}
                    </View>
                    <View style={styles.stopContent}>
                      <Text style={[styles.stopName, isCheckedIn && styles.stopNameCheckedIn]}>
                        {location.name}
                      </Text>
                      <Text style={styles.stopCategory}>{category?.name || "Unknown"}</Text>
                    </View>
                    <Pressable
                      style={styles.checkInIconButton}
                      onPress={(e) => {
                        e.stopPropagation();
                        handleCheckIn(stop.id);
                      }}
                      hitSlop={8}
                    >
                      <Feather
                        name={isCheckedIn ? "check-circle" : "circle"}
                        size={20}
                        color={isCheckedIn ? "#4CAF50" : Colors.dark.inactive}
                      />
                    </Pressable>
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

      {/* Stop Detail Modal */}
      <Modal
        visible={showStopDetailModal}
        transparent={true}
        animationType="slide"
        onRequestClose={() => setShowStopDetailModal(false)}
      >
        <Pressable 
          style={styles.modalOverlay} 
          onPress={() => setShowStopDetailModal(false)}
        >
          <Pressable style={styles.modalContent} onPress={(e) => e.stopPropagation()}>
            {selectedStop?.location ? (
              <>
                <View style={styles.modalHeader}>
                  <View style={[styles.modalStopNumber, { backgroundColor: selectedColor }]}>
                    {checkedInStops.has(localStops[selectedStopIndex!]?.id) ? (
                      <Feather name="check" size={16} color="#FFFFFF" />
                    ) : (
                      <Text style={styles.modalStopNumberText}>{selectedStopIndex! + 1}</Text>
                    )}
                  </View>
                  <View style={styles.modalStopInfo}>
                    <Text style={styles.modalStopName}>{selectedStop.location.name}</Text>
                    <Text style={styles.modalStopCategory}>{selectedCategory?.name || "Unknown"}</Text>
                  </View>
                  <Pressable
                    style={styles.modalCloseButton}
                    onPress={() => setShowStopDetailModal(false)}
                  >
                    <Feather name="x" size={24} color={Colors.dark.textSecondary} />
                  </Pressable>
                </View>
                
                {selectedStop.location.description ? (
                  <Text style={styles.modalDescription}>{selectedStop.location.description}</Text>
                ) : null}
                
                {selectedStop.location.story ? (
                  <ScrollView style={styles.modalStoryScroll}>
                    <Text style={styles.modalStory}>{selectedStop.location.story}</Text>
                  </ScrollView>
                ) : null}
                
                {selectedStop.location.address ? (
                  <View style={styles.modalAddressRow}>
                    <Feather name="map-pin" size={14} color={Colors.dark.textSecondary} />
                    <Text style={styles.modalAddress}>{selectedStop.location.address}</Text>
                  </View>
                ) : null}
                
                <View style={styles.modalActions}>
                  <Pressable
                    style={[
                      styles.modalCheckInButton,
                      checkedInStops.has(localStops[selectedStopIndex!]?.id) && styles.modalCheckInButtonActive,
                    ]}
                    onPress={() => handleCheckIn(localStops[selectedStopIndex!]?.id)}
                  >
                    <Feather
                      name={checkedInStops.has(localStops[selectedStopIndex!]?.id) ? "check-circle" : "circle"}
                      size={20}
                      color={checkedInStops.has(localStops[selectedStopIndex!]?.id) ? "#4CAF50" : Colors.dark.textSecondary}
                    />
                    <Text style={[
                      styles.modalCheckInText,
                      checkedInStops.has(localStops[selectedStopIndex!]?.id) && styles.modalCheckInTextActive,
                    ]}>
                      {checkedInStops.has(localStops[selectedStopIndex!]?.id) ? "Checked In" : "Check In"}
                    </Text>
                  </Pressable>
                </View>
              </>
            ) : null}
          </Pressable>
        </Pressable>
      </Modal>
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
    height: 350,
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
  resetViewButton: {
    position: "absolute",
    top: Spacing.sm,
    left: Spacing.sm,
    backgroundColor: "rgba(0, 0, 0, 0.7)",
    borderRadius: BorderRadius.sm,
    padding: Spacing.sm,
  },
  marker: {
    width: 28,
    height: 28,
    borderRadius: 14,
    justifyContent: "center",
    alignItems: "center",
    borderWidth: 2,
    borderColor: "transparent",
  },
  markerSelected: {
    width: 36,
    height: 36,
    borderRadius: 18,
    borderWidth: 3,
    borderColor: "#FFFFFF",
  },
  markerCheckedIn: {
    borderColor: "#4CAF50",
    borderWidth: 2,
  },
  markerText: {
    ...Typography.caption,
    color: "#FFFFFF",
    fontWeight: "700",
  },
  selectedStopPanel: {
    position: "absolute",
    bottom: 0,
    left: 0,
    right: 0,
    backgroundColor: Colors.dark.backgroundDefault,
    borderTopLeftRadius: BorderRadius.lg,
    borderTopRightRadius: BorderRadius.lg,
    padding: Spacing.md,
    paddingBottom: Spacing.lg,
  },
  selectedStopHeader: {
    flexDirection: "row",
    alignItems: "center",
    marginBottom: Spacing.md,
  },
  selectedStopNumber: {
    width: 32,
    height: 32,
    borderRadius: 16,
    justifyContent: "center",
    alignItems: "center",
    marginRight: Spacing.md,
  },
  selectedStopNumberText: {
    ...Typography.caption,
    color: "#FFFFFF",
    fontWeight: "700",
  },
  selectedStopInfo: {
    flex: 1,
  },
  selectedStopName: {
    ...Typography.headline,
    color: Colors.dark.text,
  },
  selectedStopCategory: {
    ...Typography.caption,
    color: Colors.dark.textSecondary,
    marginTop: 2,
  },
  closeSelectedButton: {
    padding: Spacing.xs,
  },
  selectedStopActions: {
    flexDirection: "row",
    gap: Spacing.md,
  },
  checkInButton: {
    flex: 1,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: Colors.dark.backgroundSecondary,
    borderRadius: BorderRadius.sm,
    paddingVertical: Spacing.sm,
    gap: Spacing.xs,
  },
  checkInButtonActive: {
    backgroundColor: "rgba(76, 175, 80, 0.15)",
  },
  checkInText: {
    ...Typography.body,
    color: Colors.dark.textSecondary,
  },
  checkInTextActive: {
    color: "#4CAF50",
  },
  viewDetailsButton: {
    flex: 1,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: Colors.dark.backgroundSecondary,
    borderRadius: BorderRadius.sm,
    paddingVertical: Spacing.sm,
    gap: Spacing.xs,
  },
  viewDetailsText: {
    ...Typography.body,
    color: Colors.dark.accent,
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
    flexWrap: "wrap",
    gap: Spacing.lg,
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
    borderWidth: 2,
    borderColor: "transparent",
  },
  stopItemPressed: {
    opacity: 0.6,
  },
  stopItemSelected: {
    borderColor: Colors.dark.accent,
  },
  stopNumber: {
    width: 32,
    height: 32,
    borderRadius: 16,
    justifyContent: "center",
    alignItems: "center",
    marginRight: Spacing.md,
  },
  stopNumberCheckedIn: {
    backgroundColor: "#4CAF50",
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
  stopNameCheckedIn: {
    textDecorationLine: "line-through",
    opacity: 0.7,
  },
  stopCategory: {
    ...Typography.caption,
    color: Colors.dark.textSecondary,
    marginTop: 2,
  },
  checkInIconButton: {
    padding: Spacing.xs,
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
  walkingInfoClickable: {
    borderWidth: 1,
    borderColor: Colors.dark.border,
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
  walkingStepsContainer: {
    marginLeft: 32,
    marginBottom: Spacing.sm,
    paddingLeft: Spacing.md,
    borderLeftWidth: 2,
    borderLeftColor: Colors.dark.border,
  },
  walkingStep: {
    flexDirection: "row",
    paddingVertical: Spacing.xs,
  },
  walkingStepDot: {
    width: 6,
    height: 6,
    borderRadius: 3,
    backgroundColor: Colors.dark.accent,
    marginTop: 6,
    marginRight: Spacing.sm,
  },
  walkingStepContent: {
    flex: 1,
  },
  walkingStepInstruction: {
    ...Typography.small,
    color: Colors.dark.text,
  },
  walkingStepMeta: {
    ...Typography.caption,
    color: Colors.dark.textSecondary,
    marginTop: 2,
  },
  walkingStepDestination: {
    marginTop: Spacing.sm,
    paddingTop: Spacing.sm,
    borderTopWidth: 1,
    borderTopColor: Colors.dark.border,
  },
  walkingStepDestinationDot: {
    width: 8,
    height: 8,
    borderRadius: 4,
    backgroundColor: "#4CAF50",
    marginTop: 5,
    marginRight: Spacing.sm,
  },
  modalOverlay: {
    flex: 1,
    backgroundColor: "rgba(0, 0, 0, 0.7)",
    justifyContent: "flex-end",
  },
  modalContent: {
    backgroundColor: Colors.dark.backgroundDefault,
    borderTopLeftRadius: BorderRadius.xl,
    borderTopRightRadius: BorderRadius.xl,
    padding: Spacing.lg,
    maxHeight: "80%",
  },
  modalHeader: {
    flexDirection: "row",
    alignItems: "center",
    marginBottom: Spacing.lg,
  },
  modalStopNumber: {
    width: 40,
    height: 40,
    borderRadius: 20,
    justifyContent: "center",
    alignItems: "center",
    marginRight: Spacing.md,
  },
  modalStopNumberText: {
    ...Typography.body,
    color: "#FFFFFF",
    fontWeight: "700",
  },
  modalStopInfo: {
    flex: 1,
  },
  modalStopName: {
    ...Typography.title2,
    color: Colors.dark.text,
  },
  modalStopCategory: {
    ...Typography.body,
    color: Colors.dark.textSecondary,
    marginTop: 2,
  },
  modalCloseButton: {
    padding: Spacing.xs,
  },
  modalDescription: {
    ...Typography.body,
    color: Colors.dark.text,
    marginBottom: Spacing.md,
  },
  modalStoryScroll: {
    maxHeight: 200,
    marginBottom: Spacing.md,
  },
  modalStory: {
    ...Typography.body,
    color: Colors.dark.textSecondary,
    lineHeight: 22,
  },
  modalAddressRow: {
    flexDirection: "row",
    alignItems: "center",
    marginBottom: Spacing.lg,
    gap: Spacing.xs,
  },
  modalAddress: {
    ...Typography.small,
    color: Colors.dark.textSecondary,
    flex: 1,
  },
  modalActions: {
    flexDirection: "row",
    gap: Spacing.md,
  },
  modalCheckInButton: {
    flex: 1,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: Colors.dark.backgroundSecondary,
    borderRadius: BorderRadius.sm,
    paddingVertical: Spacing.md,
    gap: Spacing.sm,
  },
  modalCheckInButtonActive: {
    backgroundColor: "rgba(76, 175, 80, 0.15)",
  },
  modalCheckInText: {
    ...Typography.body,
    color: Colors.dark.textSecondary,
  },
  modalCheckInTextActive: {
    color: "#4CAF50",
  },
});
