import React, { useState, useEffect, useRef, useCallback } from "react";
import {
  View,
  StyleSheet,
  Pressable,
  Text,
  ActivityIndicator,
} from "react-native";
import type { Region } from "react-native-maps";
import SafeMapView, { Marker, PROVIDER_GOOGLE, isMapAvailable } from "@/components/SafeMapView";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { useBottomTabBarHeight } from "@react-navigation/bottom-tabs";
import { useNavigation } from "@react-navigation/native";
import { NativeStackNavigationProp } from "@react-navigation/native-stack";
import { Feather } from "@expo/vector-icons";
import { BlurView } from "expo-blur";
import * as Location from "expo-location";
import { useQuery } from "@tanstack/react-query";
import { Colors, Spacing, BorderRadius, Typography, CategoryColors } from "@/constants/theme";
import type { RootStackParamList } from "@/navigation/RootStackNavigator";
import type { Location as LocationType, Category } from "@shared/schema";
import LocationPreviewCard from "@/components/LocationPreviewCard";

const LONDON_CENTER = {
  latitude: 51.5074,
  longitude: -0.1278,
  latitudeDelta: 0.1,
  longitudeDelta: 0.1,
};

export default function MapScreen() {
  const insets = useSafeAreaInsets();
  const tabBarHeight = useBottomTabBarHeight();
  const navigation = useNavigation<NativeStackNavigationProp<RootStackParamList>>();
  const mapRef = useRef<any>(null);
  const hasCenteredOnUser = useRef(false);
  
  const [selectedLocation, setSelectedLocation] = useState<LocationType | null>(null);
  const [userLocation, setUserLocation] = useState<{ latitude: number; longitude: number } | null>(null);

  const { data: locations = [], isLoading: locationsLoading } = useQuery<LocationType[]>({
    queryKey: ["/api/locations"],
  });

  const { data: categories = [] } = useQuery<Category[]>({
    queryKey: ["/api/categories"],
  });

  useEffect(() => {
    (async () => {
      const { status } = await Location.requestForegroundPermissionsAsync();
      if (status === "granted") {
        const location = await Location.getCurrentPositionAsync({});
        setUserLocation({
          latitude: location.coords.latitude,
          longitude: location.coords.longitude,
        });
      }
    })();
  }, []);

  useEffect(() => {
    if (userLocation && !hasCenteredOnUser.current && mapRef.current) {
      hasCenteredOnUser.current = true;
      mapRef.current.animateToRegion({
        ...userLocation,
        latitudeDelta: 0.05,
        longitudeDelta: 0.05,
      }, 500);
    }
  }, [userLocation]);

  const getCategoryColor = useCallback((categoryId: string) => {
    const category = categories.find(c => c.id === categoryId);
    if (category) {
      return CategoryColors[category.slug] || Colors.dark.accent;
    }
    return Colors.dark.accent;
  }, [categories]);

  const getCategory = useCallback((categoryId: string) => {
    return categories.find(c => c.id === categoryId);
  }, [categories]);

  const handleMarkerPress = (location: LocationType) => {
    setSelectedLocation(location);
    mapRef.current?.animateToRegion({
      latitude: location.latitude,
      longitude: location.longitude,
      latitudeDelta: 0.01,
      longitudeDelta: 0.01,
    }, 300);
  };

  const handleLocationPress = () => {
    if (selectedLocation) {
      navigation.navigate("LocationDetail", { 
        location: selectedLocation,
        category: getCategory(selectedLocation.categoryId),
      });
    }
  };

  const centerOnUser = () => {
    if (userLocation) {
      mapRef.current?.animateToRegion({
        ...userLocation,
        latitudeDelta: 0.02,
        longitudeDelta: 0.02,
      }, 300);
    }
  };

  const closePreview = () => {
    setSelectedLocation(null);
  };

  if (locationsLoading) {
    return (
      <View style={[styles.loadingContainer, { backgroundColor: Colors.dark.backgroundRoot }]}>
        <ActivityIndicator size="large" color={Colors.dark.accent} />
        <Text style={[styles.loadingText, { color: Colors.dark.textSecondary }]}>
          Loading mysterious locations...
        </Text>
      </View>
    );
  }

  return (
    <View style={styles.container}>
      <SafeMapView
        ref={mapRef}
        style={styles.map}
        provider={PROVIDER_GOOGLE}
        initialRegion={LONDON_CENTER}
        showsUserLocation
        showsMyLocationButton={false}
        userInterfaceStyle="dark"
        onPress={closePreview}
      >
        {isMapAvailable && Marker ? locations.map((location) => (
          <Marker
            key={location.id}
            coordinate={{
              latitude: location.latitude,
              longitude: location.longitude,
            }}
            onPress={(e) => {
              e.stopPropagation();
              handleMarkerPress(location);
            }}
            tracksViewChanges={false}
            stopPropagation
          >
            <View style={[styles.marker, { backgroundColor: getCategoryColor(location.categoryId) }]}>
              <Feather 
                name={getCategory(location.categoryId)?.iconName as any || "map-pin"} 
                size={16} 
                color="#FFFFFF" 
              />
            </View>
          </Marker>
        )) : null}
      </SafeMapView>

      <View style={[styles.topControls, { top: insets.top + Spacing.md }]}>
        {userLocation ? (
          <Pressable
            style={({ pressed }) => [
              styles.controlButton,
              pressed && styles.controlButtonPressed,
            ]}
            onPress={centerOnUser}
          >
            <BlurView intensity={80} tint="dark" style={StyleSheet.absoluteFill} />
            <Feather name="navigation" size={20} color={Colors.dark.text} />
          </Pressable>
        ) : null}
      </View>

      {selectedLocation ? (
        <View style={[styles.previewContainer, { bottom: tabBarHeight + Spacing.lg }]}>
          <LocationPreviewCard
            location={selectedLocation}
            category={getCategory(selectedLocation.categoryId)}
            onPress={handleLocationPress}
            onClose={closePreview}
            userLocation={userLocation}
          />
        </View>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: Colors.dark.backgroundRoot,
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
  map: {
    flex: 1,
  },
  topControls: {
    position: "absolute",
    right: Spacing.lg,
    flexDirection: "column",
    gap: Spacing.sm,
  },
  controlButton: {
    width: 44,
    height: 44,
    borderRadius: BorderRadius.sm,
    overflow: "hidden",
    justifyContent: "center",
    alignItems: "center",
    backgroundColor: "rgba(21, 26, 35, 0.8)",
  },
  controlButtonPressed: {
    opacity: 0.6,
  },
  marker: {
    width: 32,
    height: 32,
    borderRadius: 16,
    justifyContent: "center",
    alignItems: "center",
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.3,
    shadowRadius: 4,
    elevation: 4,
  },
  previewContainer: {
    position: "absolute",
    left: Spacing.lg,
    right: Spacing.lg,
  },
});
