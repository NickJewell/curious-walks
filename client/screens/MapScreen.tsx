import React, { useState, useEffect, useRef, useCallback, useMemo } from "react";
import {
  View,
  StyleSheet,
  Pressable,
  Text,
  TextInput,
  ActivityIndicator,
  Platform,
  SectionList,
  Keyboard,
} from "react-native";
import type { Region } from "react-native-maps";
import SafeMapView, { Marker, Callout, PROVIDER_GOOGLE, isMapAvailable } from "@/components/SafeMapView";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { useBottomTabBarHeight } from "@react-navigation/bottom-tabs";
import { Feather } from "@expo/vector-icons";
import { BlurView } from "expo-blur";
import * as Location from "expo-location";
import { Colors, Spacing, BorderRadius, Typography } from "@/constants/theme";
import { getNearestCurios, searchCurios, Curio } from "@/lib/supabase";

interface GeoResult {
  id: string;
  name: string;
  latitude: number;
  longitude: number;
}

type SearchResult = 
  | { type: 'place'; data: Curio }
  | { type: 'location'; data: GeoResult };

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

function useDebounce<T>(value: T, delay: number): T {
  const [debouncedValue, setDebouncedValue] = useState<T>(value);
  
  useEffect(() => {
    const timer = setTimeout(() => setDebouncedValue(value), delay);
    return () => clearTimeout(timer);
  }, [value, delay]);
  
  return debouncedValue;
}

export default function MapScreen() {
  const insets = useSafeAreaInsets();
  const tabBarHeight = useBottomTabBarHeight();
  const mapRef = useRef<any>(null);
  const markerRefs = useRef<{ [key: string]: any }>({});
  
  const [curios, setCurios] = useState<Curio[]>([]);
  const [loading, setLoading] = useState(true);
  const [userLocation, setUserLocation] = useState<{ latitude: number; longitude: number } | null>(null);
  const [mapCenter, setMapCenter] = useState<{ latitude: number; longitude: number }>(LONDON_CENTER);
  const [lastSearchCenter, setLastSearchCenter] = useState<{ latitude: number; longitude: number }>(LONDON_CENTER);
  const [showSearchButton, setShowSearchButton] = useState(false);
  
  const [searchQuery, setSearchQuery] = useState("");
  const [searchResults, setSearchResults] = useState<SearchResult[]>([]);
  const [isSearching, setIsSearching] = useState(false);
  const debouncedQuery = useDebounce(searchQuery, 300);

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

  useEffect(() => {
    const performSearch = async () => {
      if (debouncedQuery.length < 3) {
        setSearchResults([]);
        return;
      }
      
      setIsSearching(true);
      const results: SearchResult[] = [];
      
      try {
        const dbResults = await searchCurios(debouncedQuery, 5);
        dbResults.forEach(curio => {
          results.push({ type: 'place', data: curio });
        });
        
        if (dbResults.length < 3) {
          const geoResults = await Location.geocodeAsync(`${debouncedQuery}, London, UK`);
          geoResults.slice(0, 3).forEach((geo, index) => {
            results.push({
              type: 'location',
              data: {
                id: `geo-${index}`,
                name: debouncedQuery,
                latitude: geo.latitude,
                longitude: geo.longitude,
              }
            });
          });
        }
      } catch (error) {
        console.error('Search error:', error);
      }
      
      setSearchResults(results);
      setIsSearching(false);
    };
    
    performSearch();
  }, [debouncedQuery]);

  const handleSelectPlace = (curio: Curio) => {
    Keyboard.dismiss();
    setSearchQuery("");
    setSearchResults([]);
    
    mapRef.current?.animateToRegion({
      latitude: curio.latitude,
      longitude: curio.longitude,
      latitudeDelta: 0.005,
      longitudeDelta: 0.005,
    }, 500);
    
    setTimeout(() => {
      const markerRef = markerRefs.current[curio.id];
      if (markerRef) {
        markerRef.showCallout();
      }
    }, 600);
  };

  const handleSelectLocation = async (geo: GeoResult) => {
    Keyboard.dismiss();
    setSearchQuery("");
    setSearchResults([]);
    
    mapRef.current?.animateToRegion({
      latitude: geo.latitude,
      longitude: geo.longitude,
      latitudeDelta: 0.02,
      longitudeDelta: 0.02,
    }, 500);
    
    await loadCurios(geo.latitude, geo.longitude);
  };

  const clearSearch = () => {
    setSearchQuery("");
    setSearchResults([]);
    Keyboard.dismiss();
  };

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
            ref={(ref: any) => { if (ref) markerRefs.current[curio.id] = ref; }}
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

      <View style={[styles.searchContainer, { top: insets.top + Spacing.md }]}>
        <View style={styles.searchBar}>
          <Feather name="search" size={18} color="#888" style={styles.searchIconLeft} />
          <TextInput
            style={styles.searchInput}
            placeholder="Search places or areas..."
            placeholderTextColor="#888"
            value={searchQuery}
            onChangeText={setSearchQuery}
            returnKeyType="search"
            autoCorrect={false}
          />
          {searchQuery.length > 0 ? (
            <Pressable onPress={clearSearch} style={styles.clearButton}>
              <Feather name="x" size={18} color="#888" />
            </Pressable>
          ) : null}
          {isSearching ? (
            <ActivityIndicator size="small" color={Colors.dark.accent} style={styles.searchSpinner} />
          ) : null}
        </View>
        
        {searchResults.length > 0 ? (
          <View style={styles.searchResults}>
            <SectionList<SearchResult, { title: string; data: SearchResult[] }>
              sections={[
                {
                  title: 'Places',
                  data: searchResults.filter(r => r.type === 'place'),
                },
                {
                  title: 'Locations',
                  data: searchResults.filter(r => r.type === 'location'),
                },
              ].filter(section => section.data.length > 0)}
              keyExtractor={(item) => item.type === 'place' ? item.data.id : item.data.id}
              keyboardShouldPersistTaps="handled"
              renderSectionHeader={({ section }) => (
                <View style={styles.sectionHeader}>
                  <Feather
                    name={section.title === 'Places' ? 'map-pin' : 'map'}
                    size={14}
                    color="#888"
                    style={styles.sectionIcon}
                  />
                  <Text style={styles.sectionTitle}>{section.title}</Text>
                </View>
              )}
              renderItem={({ item }) => (
                <Pressable
                  style={({ pressed }) => [
                    styles.searchResultItem,
                    pressed && styles.searchResultPressed,
                  ]}
                  onPress={() => {
                    if (item.type === 'place') {
                      handleSelectPlace(item.data);
                    } else {
                      handleSelectLocation(item.data);
                    }
                  }}
                >
                  <View style={styles.resultTextContainer}>
                    <Text style={styles.resultTitle}>
                      {item.type === 'place' ? item.data.name : `${item.data.name}, London`}
                    </Text>
                    {item.type === 'place' ? (
                      <Text style={styles.resultDescription} numberOfLines={1}>
                        {item.data.description}
                      </Text>
                    ) : (
                      <Text style={styles.resultDescription}>Area in London</Text>
                    )}
                  </View>
                </Pressable>
              )}
            />
          </View>
        ) : null}
      </View>

      <View style={[styles.topControls, { top: insets.top + Spacing.md + 60 }]}>
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

      {showSearchButton && searchResults.length === 0 ? (
        <View style={[styles.searchAreaButtonContainer, { top: insets.top + Spacing.md + 70 }]}>
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
  searchContainer: {
    position: "absolute",
    left: Spacing.md,
    right: Spacing.md,
    zIndex: 100,
  },
  searchBar: {
    flexDirection: "row",
    alignItems: "center",
    backgroundColor: "#FFFFFF",
    borderRadius: BorderRadius.lg,
    paddingHorizontal: Spacing.md,
    height: 48,
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.15,
    shadowRadius: 8,
    elevation: 5,
  },
  searchIconLeft: {
    marginRight: Spacing.sm,
  },
  searchInput: {
    flex: 1,
    fontSize: 16,
    color: "#1A1A1A",
    height: "100%",
  },
  clearButton: {
    padding: Spacing.xs,
  },
  searchSpinner: {
    marginLeft: Spacing.xs,
  },
  searchResults: {
    backgroundColor: "#FFFFFF",
    borderRadius: BorderRadius.md,
    marginTop: Spacing.xs,
    maxHeight: 300,
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.15,
    shadowRadius: 8,
    elevation: 5,
    overflow: "hidden",
  },
  searchResultItem: {
    flexDirection: "row",
    alignItems: "center",
    paddingVertical: Spacing.md,
    paddingHorizontal: Spacing.md,
    borderBottomWidth: 1,
    borderBottomColor: "#F0F0F0",
  },
  searchResultPressed: {
    backgroundColor: "#F5F5F5",
  },
  resultIcon: {
    marginRight: Spacing.md,
  },
  resultTextContainer: {
    flex: 1,
  },
  resultTitle: {
    fontSize: 15,
    fontWeight: "600",
    color: "#1A1A1A",
    marginBottom: 2,
  },
  resultDescription: {
    fontSize: 13,
    color: "#666",
  },
  sectionHeader: {
    flexDirection: "row",
    alignItems: "center",
    paddingVertical: Spacing.sm,
    paddingHorizontal: Spacing.md,
    backgroundColor: "#F8F8F8",
    borderBottomWidth: 1,
    borderBottomColor: "#E8E8E8",
  },
  sectionIcon: {
    marginRight: Spacing.xs,
  },
  sectionTitle: {
    fontSize: 12,
    fontWeight: "600",
    color: "#888",
    textTransform: "uppercase",
    letterSpacing: 0.5,
  },
  searchAreaButtonContainer: {
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
