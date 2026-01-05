import React, { useState, useEffect, useRef, useCallback } from "react";
import {
  View,
  StyleSheet,
  Pressable,
  Text,
  ActivityIndicator,
  Platform,
} from "react-native";
import type { Region } from "react-native-maps";
import SafeMapView, { Marker, Callout, PROVIDER_GOOGLE, isMapAvailable } from "@/components/SafeMapView";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { useBottomTabBarHeight } from "@react-navigation/bottom-tabs";
import { Feather } from "@expo/vector-icons";
import { BlurView } from "expo-blur";
import * as Location from "expo-location";
import { Colors, Spacing, BorderRadius, Typography } from "@/constants/theme";
import { supabase, getNearestCurios, Curio } from "@/lib/supabase";

const LONDON_CENTER = {
  latitude: 51.5074,
  longitude: -0.1278,
  latitudeDelta: 0.1,
  longitudeDelta: 0.1,
};

function getDistanceFromLatLon(lat1: number, lon1: number, lat2: number, lon2: number): number {
  const R = 6371000;
  const dLat = (lat2 - lat1) * Math.PI / 180;
  const dLon = (lon2 - lon1) * Math.PI / 180;
  const a = 
    Math.sin(dLat/2) * Math.sin(dLat/2) +
    Math.cos(lat1 * Math.PI / 180) * Math.cos(lat2 * Math.PI / 180) * 
    Math.sin(dLon/2) * Math.sin(dLon/2);
  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1-a));
  return R * c;
}

export default function MapScreen() {
  const insets = useSafeAreaInsets();
  const tabBarHeight = useBottomTabBarHeight();
  const mapRef = useRef<any>(null);
  
  const [curios, setCurios] = useState<Curio[]>([]);
  const [loading, setLoading] = useState(true);
  const [userLocation, setUserLocation] = useState<{ latitude: number; longitude: number } | null>(null);
  const [mapCenter, setMapCenter] = useState<{ latitude: number; longitude: number }>(LONDON_CENTER);
  const [lastSearchCenter, setLastSearchCenter] = useState<{ latitude: number; longitude: number }>(LONDON_CENTER);
  const [showSearchButton, setShowSearchButton] = useState(false);

  useEffect(() => {
    (async () => {
      const { status } = await Location.requestForegroundPermissionsAsync();
      if (status === "granted") {
        const location = await Location.getCurrentPositionAsync({});
        const coords = {
          latitude: location.coords.latitude,
          longitude: location.coords.longitude,
        };
        setUserLocation(coords);
        setMapCenter(coords);
        setLastSearchCenter(coords);
        loadCurios(coords.latitude, coords.longitude);
      } else {
        loadCurios(LONDON_CENTER.latitude, LONDON_CENTER.longitude);
      }
    })();
  }, []);

  const loadCurios = async (lat: number, lng: number) => {
    setLoading(true);
    try {
      const data = await getNearestCurios(lat, lng, 20);
      setCurios(data);
      setLastSearchCenter({ latitude: lat, longitude: lng });
      setShowSearchButton(false);
    } catch (error) {
      console.error("Error loading curios:", error);
    } finally {
      setLoading(false);
    }
  };

  const onRegionChangeComplete = useCallback((region: Region) => {
    const newCenter = { latitude: region.latitude, longitude: region.longitude };
    setMapCenter(newCenter);
    
    const distance = getDistanceFromLatLon(
      lastSearchCenter.latitude,
      lastSearchCenter.longitude,
      newCenter.latitude,
      newCenter.longitude
    );
    
    setShowSearchButton(distance > 500);
  }, [lastSearchCenter]);

  const handleSearchThisArea = () => {
    loadCurios(mapCenter.latitude, mapCenter.longitude);
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

  if (loading && curios.length === 0) {
    return (
      <View style={[styles.loadingContainer, { backgroundColor: Colors.dark.backgroundRoot }]}>
        <ActivityIndicator size="large" color={Colors.dark.accent} />
        <Text style={[styles.loadingText, { color: Colors.dark.textSecondary }]}>
          Finding nearby curiosities...
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
        initialRegion={userLocation ? { ...userLocation, latitudeDelta: 0.05, longitudeDelta: 0.05 } : LONDON_CENTER}
        showsUserLocation
        showsMyLocationButton={false}
        userInterfaceStyle="dark"
        onRegionChangeComplete={onRegionChangeComplete}
      >
        {isMapAvailable && Marker ? curios.map((curio) => (
          <Marker
            key={curio.id}
            coordinate={{
              latitude: curio.latitude,
              longitude: curio.longitude,
            }}
            tracksViewChanges={false}
          >
            <View style={styles.marker}>
              <Feather name="map-pin" size={16} color="#FFFFFF" />
            </View>
            {Callout ? (
              <Callout tooltip style={styles.calloutContainer}>
                <View style={styles.callout}>
                  <Text style={styles.calloutTitle}>{curio.name}</Text>
                  <Text style={styles.calloutDescription} numberOfLines={3}>
                    {curio.description}
                  </Text>
                </View>
              </Callout>
            ) : null}
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

      {showSearchButton ? (
        <View style={[styles.searchButtonContainer, { top: insets.top + Spacing.md }]}>
          <Pressable
            style={({ pressed }) => [
              styles.searchButton,
              pressed && styles.searchButtonPressed,
            ]}
            onPress={handleSearchThisArea}
          >
            <BlurView intensity={80} tint="dark" style={StyleSheet.absoluteFill} />
            <Feather name="search" size={16} color={Colors.dark.text} style={styles.searchIcon} />
            <Text style={styles.searchButtonText}>Search This Area</Text>
          </Pressable>
        </View>
      ) : null}

      {loading ? (
        <View style={[styles.loadingOverlay, { bottom: tabBarHeight + Spacing.lg }]}>
          <BlurView intensity={60} tint="dark" style={StyleSheet.absoluteFill} />
          <ActivityIndicator size="small" color={Colors.dark.accent} />
          <Text style={styles.loadingOverlayText}>Searching...</Text>
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
    backgroundColor: Colors.dark.accent,
    justifyContent: "center",
    alignItems: "center",
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.3,
    shadowRadius: 4,
    elevation: 4,
  },
  calloutContainer: {
    width: 280,
  },
  callout: {
    backgroundColor: "#FFFFFF",
    borderRadius: BorderRadius.md,
    padding: Spacing.md,
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.3,
    shadowRadius: 8,
    elevation: 8,
  },
  calloutTitle: {
    color: "#1A1A1A",
    fontSize: 16,
    fontWeight: "700",
    marginBottom: Spacing.xs,
  },
  calloutDescription: {
    color: "#4A4A4A",
    fontSize: 14,
    lineHeight: 20,
  },
  searchButtonContainer: {
    position: "absolute",
    left: 0,
    right: 0,
    alignItems: "center",
  },
  searchButton: {
    flexDirection: "row",
    alignItems: "center",
    paddingVertical: Spacing.sm,
    paddingHorizontal: Spacing.lg,
    borderRadius: BorderRadius.lg,
    overflow: "hidden",
    backgroundColor: "rgba(21, 26, 35, 0.9)",
  },
  searchButtonPressed: {
    opacity: 0.8,
  },
  searchIcon: {
    marginRight: Spacing.xs,
  },
  searchButtonText: {
    color: Colors.dark.text,
    ...Typography.body,
    fontWeight: "600",
  },
  loadingOverlay: {
    position: "absolute",
    left: Spacing.lg,
    right: Spacing.lg,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    paddingVertical: Spacing.sm,
    paddingHorizontal: Spacing.md,
    borderRadius: BorderRadius.md,
    overflow: "hidden",
    backgroundColor: "rgba(21, 26, 35, 0.9)",
  },
  loadingOverlayText: {
    color: Colors.dark.textSecondary,
    ...Typography.caption,
    marginLeft: Spacing.sm,
  },
});
