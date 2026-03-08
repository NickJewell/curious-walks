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
  Modal,
  FlatList,
  Alert,
} from "react-native";
import type { Region } from "react-native-maps";
import SafeMapView, { Marker, PROVIDER_GOOGLE, isMapAvailable } from "@/components/SafeMapView";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { useBottomTabBarHeight } from "@react-navigation/bottom-tabs";
import { useNavigation } from "@react-navigation/native";
import type { NativeStackNavigationProp } from "@react-navigation/native-stack";
import { Feather } from "@expo/vector-icons";
import { BlurView } from "expo-blur";
import * as Location from "expo-location";
import Animated, {
  FadeIn,
  FadeOut,
  SlideInDown,
  SlideOutDown,
  useSharedValue,
  useAnimatedStyle,
  withRepeat,
  withTiming,
  withSequence,
  Easing,
} from "react-native-reanimated";
import { Colors, Spacing, BorderRadius, Typography, type ThemeColors } from "@/constants/theme";
import { darkMapStyle, lightMapStyle } from "@/constants/mapStyle";
import { useTheme } from "@/hooks/useTheme";
import { getNearest20, searchCurios, Curio } from "@/lib/supabase";
import { useHunt } from "@/contexts/HuntContext";
import { useAuth } from "@/contexts/AuthContext";
import { useCheckins } from "@/contexts/CheckinContext";
import { getUserLists, createList, addPlaceToList } from "@/lib/lists";
import PlaceDetailModal from "@/components/PlaceDetailModal";
import type { ListWithItemCount } from "../../shared/schema";
import type { RootStackParamList } from "@/navigation/RootStackNavigator";

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

type CurioTypeStyle = {
  color: string;
  icon: keyof typeof Feather.glyphMap;
  label: string;
  isLandmark?: boolean;
};

const getCurioTypeStyle = (curioType?: string): CurioTypeStyle => {
  switch (curioType) {
    case 'Green Space':
      return { color: '#4CAF50', icon: 'sun', label: 'Green Space' };
    case 'Public Transport':
      return { color: '#546E7A', icon: 'navigation', label: 'Transport' };
    case 'Memorial & Statue':
      return { color: '#C62828', icon: 'award', label: 'Memorial', isLandmark: true };
    case 'Public Art':
      return { color: '#AD1457', icon: 'edit-3', label: 'Public Art' };
    case 'Historic Building':
    case 'Historical':
      return { color: '#8B7355', icon: 'clock', label: 'Historic', isLandmark: true };
    case 'Church & Cathedral':
      return { color: '#6D4C8E', icon: 'home', label: 'Church', isLandmark: true };
    case 'Cemetery':
      return { color: '#37474F', icon: 'moon', label: 'Cemetery' };
    case 'Museum & Gallery':
      return { color: '#1565C0', icon: 'image', label: 'Museum', isLandmark: true };
    case 'River & Canal':
      return { color: '#0277BD', icon: 'droplet', label: 'Waterway' };
    case 'Market':
      return { color: '#E65100', icon: 'shopping-bag', label: 'Market' };
    case 'Theatre & Cinema':
      return { color: '#B71C1C', icon: 'film', label: 'Theatre' };
    case 'Pub & Bar':
      return { color: '#4E342E', icon: 'coffee', label: 'Pub' };
    default:
      return { color: '#8B7355', icon: 'map-pin', label: curioType || 'Place' };
  }
};

function calculateDisplayDistance(lat1: number, lon1: number, lat2: number, lon2: number): string {
  const R = 6371000;
  const dLat = (lat2 - lat1) * Math.PI / 180;
  const dLon = (lon2 - lon1) * Math.PI / 180;
  const a = Math.sin(dLat / 2) * Math.sin(dLat / 2) +
    Math.cos(lat1 * Math.PI / 180) * Math.cos(lat2 * Math.PI / 180) *
    Math.sin(dLon / 2) * Math.sin(dLon / 2);
  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
  const d = R * c;
  if (d < 1000) return `${Math.round(d)}m away`;
  return `${(d / 1000).toFixed(1)}km away`;
}

function HuntPulseMarker({ coordinate }: { coordinate: { latitude: number; longitude: number } }) {
  const pulseScale = useSharedValue(1);
  const pulseOpacity = useSharedValue(0.6);

  useEffect(() => {
    pulseScale.value = withRepeat(
      withTiming(2.2, { duration: 2000, easing: Easing.out(Easing.ease) }),
      -1,
      false
    );
    pulseOpacity.value = withRepeat(
      withTiming(0, { duration: 2000, easing: Easing.out(Easing.ease) }),
      -1,
      false
    );
  }, []);

  const pulseStyle = useAnimatedStyle(() => ({
    transform: [{ scale: pulseScale.value }],
    opacity: pulseOpacity.value,
  }));

  if (!isMapAvailable || !Marker) return null;

  return (
    <Marker
      coordinate={coordinate}
      tracksViewChanges={false}
      anchor={{ x: 0.5, y: 0.5 }}
      zIndex={99}
    >
      <View style={pulseStyles.container}>
        <Animated.View style={[pulseStyles.ring, pulseStyle]} />
      </View>
    </Marker>
  );
}

const pulseStyles = StyleSheet.create({
  container: {
    width: 80,
    height: 80,
    justifyContent: "center",
    alignItems: "center",
  },
  ring: {
    width: 36,
    height: 36,
    borderRadius: 18,
    borderWidth: 2.5,
    borderColor: "#D4AF7A",
    backgroundColor: "transparent",
  },
});

function useDebounce<T>(value: T, delay: number): T {
  const [debouncedValue, setDebouncedValue] = useState<T>(value);
  
  useEffect(() => {
    const timer = setTimeout(() => setDebouncedValue(value), delay);
    return () => clearTimeout(timer);
  }, [value, delay]);
  
  return debouncedValue;
}

type NavigationProp = NativeStackNavigationProp<RootStackParamList>;

export default function MapScreen() {
  const insets = useSafeAreaInsets();
  const tabBarHeight = useBottomTabBarHeight();
  const navigation = useNavigation<NavigationProp>();
  const { activeTarget, setActiveTarget, isHunting } = useHunt();
  const { user, isGuest, signOut } = useAuth();
  const { checkedInPlaceIds } = useCheckins();
  const { theme, isDark } = useTheme();
  const styles = useMemo(() => createStyles(theme), [theme]);
  const mapStyle = isDark ? darkMapStyle : lightMapStyle;
  const mapRef = useRef<any>(null);
  const markerRefs = useRef<{ [key: string]: any }>({});
  
  const [curios, setCurios] = useState<Curio[]>([]);
  const [loading, setLoading] = useState(true);
  const [locationReady, setLocationReady] = useState(false);
  const [userLocation, setUserLocation] = useState<{ latitude: number; longitude: number } | null>(null);
  const [mapCenter, setMapCenter] = useState<{ latitude: number; longitude: number }>(LONDON_CENTER);
  const [lastSearchCenter, setLastSearchCenter] = useState<{ latitude: number; longitude: number }>(LONDON_CENTER);
  const initialLoadDone = useRef(false);
  const initialRegionRef = useRef<{ latitude: number; longitude: number }>(LONDON_CENTER);
  const locationResolved = useRef(false);
  
  const [searchQuery, setSearchQuery] = useState("");
  const [searchResults, setSearchResults] = useState<SearchResult[]>([]);
  const [isSearching, setIsSearching] = useState(false);
  const [selectedCurio, setSelectedCurio] = useState<Curio | null>(null);
  const selectedCurioRef = useRef<Curio | null>(null);
  const debouncedQuery = useDebounce(searchQuery, 300);

  const [showListModal, setShowListModal] = useState(false);
  
  const [userLists, setUserLists] = useState<ListWithItemCount[]>([]);
  const [loadingLists, setLoadingLists] = useState(false);
  const [showCreateListInput, setShowCreateListInput] = useState(false);
  const [newListName, setNewListName] = useState("");
  const [savingToList, setSavingToList] = useState(false);
  const [showDetailModal, setShowDetailModal] = useState(false);
  const [detailPlace, setDetailPlace] = useState<Curio | null>(null);

  const handleReadMore = (curio: Curio) => {
    setDetailPlace(curio);
    setShowDetailModal(true);
  };

  const handleCloseDetailModal = () => {
    setShowDetailModal(false);
  };

  const handleHuntPlace = (curio: Curio) => {
    setSelectedCurio(null);
    setActiveTarget(curio);
    if (userLocation) {
      mapRef.current?.fitToCoordinates(
        [
          { latitude: userLocation.latitude, longitude: userLocation.longitude },
          { latitude: curio.latitude, longitude: curio.longitude },
        ],
        {
          edgePadding: { top: 120, right: 60, bottom: 200, left: 60 },
          animated: true,
        }
      );
    }
    setTimeout(() => navigation.navigate("Compass"), 600);
  };

  const handleMarkerPress = (curio: Curio) => {
    if (regionChangeTimer.current) {
      clearTimeout(regionChangeTimer.current);
      regionChangeTimer.current = null;
    }
    selectedCurioRef.current = curio;
    setSelectedCurio(curio);
    mapRef.current?.animateToRegion({
      latitude: curio.latitude - 0.002,
      longitude: curio.longitude,
      latitudeDelta: 0.008,
      longitudeDelta: 0.008,
    }, 400);
  };

  const handleClosePanel = () => {
    selectedCurioRef.current = null;
    setSelectedCurio(null);
  };

  const handleResumeCompass = () => {
    navigation.navigate("Compass");
  };

  const handleSaveToList = async () => {
    if (isGuest || !user?.id) {
      Alert.alert(
        "Sign In Required",
        "Create an account to save places to your lists.",
        [
          { text: "Cancel", style: "cancel" },
          { text: "Sign In", onPress: () => signOut() },
        ]
      );
      return;
    }

    setShowListModal(true);
    setLoadingLists(true);
    try {
      const lists = await getUserLists(user.id);
      setUserLists(lists);
    } catch (error) {
      console.error("Error loading lists:", error);
    } finally {
      setLoadingLists(false);
    }
  };

  const handleSelectList = async (listId: string) => {
    if (!selectedCurio) return;

    setSavingToList(true);
    try {
      const result = await addPlaceToList(listId, selectedCurio);
      if (result.success) {
        Alert.alert("Saved", `Added to your list!`);
        setShowListModal(false);
      } else {
        Alert.alert("Already Saved", result.error || "This place is already in the list.");
      }
    } catch (error) {
      Alert.alert("Error", "Failed to save place.");
    } finally {
      setSavingToList(false);
    }
  };

  const handleCreateAndAddToList = async () => {
    if (!newListName.trim() || !user?.id || !selectedCurio) return;

    setSavingToList(true);
    try {
      const newList = await createList(user.id, newListName);
      if (newList) {
        const result = await addPlaceToList(newList.id, selectedCurio);
        if (result.success) {
          Alert.alert("Saved", `Created "${newListName}" and added the place!`);
          setShowListModal(false);
          setNewListName("");
          setShowCreateListInput(false);
        } else {
          Alert.alert("Error", result.error || "Failed to add place to new list.");
        }
      }
    } catch (error) {
      Alert.alert("Error", "Failed to create list.");
    } finally {
      setSavingToList(false);
    }
  };

  useEffect(() => {
    let cancelled = false;

    const resolveLocation = async (): Promise<{ latitude: number; longitude: number }> => {
      try {
        const { status } = await Location.requestForegroundPermissionsAsync();
        if (status !== "granted" || cancelled) return LONDON_CENTER;

        const lastKnown = await Location.getLastKnownPositionAsync();
        if (lastKnown && !cancelled) {
          const coords = {
            latitude: lastKnown.coords.latitude,
            longitude: lastKnown.coords.longitude,
          };
          setUserLocation(coords);
          return coords;
        }

        const location = await Location.getCurrentPositionAsync({
          accuracy: Location.Accuracy.Balanced,
        });
        if (!cancelled) {
          const coords = {
            latitude: location.coords.latitude,
            longitude: location.coords.longitude,
          };
          setUserLocation(coords);
          return coords;
        }
      } catch {}
      return LONDON_CENTER;
    };

    const init = async () => {
      const timeoutPromise = new Promise<{ latitude: number; longitude: number }>((resolve) => {
        setTimeout(() => resolve(LONDON_CENTER), 5000);
      });

      const coords = await Promise.race([resolveLocation(), timeoutPromise]);
      if (cancelled) return;

      locationResolved.current = true;
      initialRegionRef.current = coords;
      setMapCenter(coords);
      setLastSearchCenter(coords);
      setLocationReady(true);
      loadCurios(coords.latitude, coords.longitude);

      if (coords === LONDON_CENTER) {
        resolveLocation().then((realCoords) => {
          if (cancelled || realCoords === LONDON_CENTER) return;
          setUserLocation(realCoords);
          setMapCenter(realCoords);
          setLastSearchCenter(realCoords);
          loadCurios(realCoords.latitude, realCoords.longitude);
          mapRef.current?.animateToRegion({
            ...realCoords,
            latitudeDelta: 0.01,
            longitudeDelta: 0.01,
          }, 500);
        });
      }
    };

    init();

    return () => {
      cancelled = true;
      if (regionChangeTimer.current) {
        clearTimeout(regionChangeTimer.current);
      }
    };
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
      const data = await getNearest20(lat, lng);
      const selected = selectedCurioRef.current;
      if (selected && !data.some((c: Curio) => c.id === selected.id)) {
        setCurios([...data, selected]);
      } else {
        setCurios(data);
      }
      setLastSearchCenter({ latitude: lat, longitude: lng });
      initialLoadDone.current = true;
    } catch (error) {
      console.error("Error loading curios:", error);
      initialLoadDone.current = true;
    } finally {
      setLoading(false);
    }
  };

  const regionChangeTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  const onRegionChangeComplete = useCallback((region: Region) => {
    const newCenter = { latitude: region.latitude, longitude: region.longitude };
    setMapCenter(newCenter);
    
    if (!initialLoadDone.current) return;
    if (selectedCurioRef.current) return;

    const dist = Math.sqrt(
      Math.pow(newCenter.latitude - lastSearchCenter.latitude, 2) +
      Math.pow(newCenter.longitude - lastSearchCenter.longitude, 2)
    );
    if (dist > 0.003) {
      if (regionChangeTimer.current) {
        clearTimeout(regionChangeTimer.current);
      }
      regionChangeTimer.current = setTimeout(() => {
        loadCurios(newCenter.latitude, newCenter.longitude);
      }, 400);
    }
  }, [lastSearchCenter]);

  const centerOnUser = async () => {
    if (userLocation) {
      mapRef.current?.animateToRegion({
        ...userLocation,
        latitudeDelta: 0.008,
        longitudeDelta: 0.008,
      }, 300);
    }

    try {
      const location = await Location.getCurrentPositionAsync({
        accuracy: Location.Accuracy.Balanced,
      });
      const freshCoords = {
        latitude: location.coords.latitude,
        longitude: location.coords.longitude,
      };
      setUserLocation(freshCoords);

      mapRef.current?.animateToRegion({
        ...freshCoords,
        latitudeDelta: 0.008,
        longitudeDelta: 0.008,
      }, 300);
    } catch (_) {
    }
  };

  const isInitialLoading = !locationReady || (loading && curios.length === 0);

  if (!locationReady) {
    return (
      <View style={[styles.container, styles.initLoadingContainer]}>
        <ActivityIndicator size="large" color={theme.accent} />
        <Text style={styles.initLoadingText}>Finding your location...</Text>
      </View>
    );
  }

  return (
    <View style={styles.container}>
      <SafeMapView
        ref={mapRef}
        style={styles.map}
        provider={PROVIDER_GOOGLE}
        initialRegion={{ ...initialRegionRef.current, latitudeDelta: 0.01, longitudeDelta: 0.01 }}
        showsUserLocation
        showsMyLocationButton={false}
        customMapStyle={mapStyle}
        onRegionChangeComplete={onRegionChangeComplete}
      >
        {isMapAvailable && Marker ? curios.filter(c => 
          c && c.id && typeof c.latitude === 'number' && typeof c.longitude === 'number' && 
          !isNaN(c.latitude) && !isNaN(c.longitude)
        ).map((curio) => {
          const isTarget = isHunting && activeTarget?.id === curio.id;
          const isGreyed = isHunting && activeTarget?.id !== curio.id;
          const isSelected = selectedCurio?.id === curio.id;
          const isCheckedIn = checkedInPlaceIds.has(curio.id);
          const typeStyle = getCurioTypeStyle(curio.curioType);

          const markerState = isTarget ? 'target' : isSelected ? 'selected' : isCheckedIn ? 'completed' : isGreyed ? 'greyed' : 'ambient';
          const markerSize = markerState === 'target' ? 44 : markerState === 'selected' ? 38 : markerState === 'completed' ? 30 : 26;
          const iconSize = markerState === 'target' ? 20 : markerState === 'selected' ? 18 : 14;
          const borderRadiusVal = typeStyle.isLandmark && markerState !== 'completed' ? markerSize * 0.3 : markerSize / 2;

          return (
            <Marker
              key={curio.id}
              ref={(ref: any) => { if (ref) markerRefs.current[curio.id] = ref; }}
              coordinate={{
                latitude: curio.latitude,
                longitude: curio.longitude,
              }}
              tracksViewChanges={isSelected || isTarget}
              zIndex={isTarget ? 100 : isSelected ? 90 : 1}
              onPress={() => handleMarkerPress(curio)}
            >
              <View style={[
                {
                  width: markerSize,
                  height: markerSize,
                  borderRadius: borderRadiusVal,
                  justifyContent: "center" as const,
                  alignItems: "center" as const,
                },
                markerState === 'ambient' && {
                  backgroundColor: typeStyle.color,
                  shadowColor: "#000",
                  shadowOffset: { width: 0, height: 1 },
                  shadowOpacity: 0.2,
                  shadowRadius: 2,
                  elevation: 2,
                },
                markerState === 'selected' && {
                  backgroundColor: typeStyle.color,
                  shadowColor: typeStyle.color,
                  shadowOffset: { width: 0, height: 0 },
                  shadowOpacity: 0.7,
                  shadowRadius: 10,
                  elevation: 10,
                  borderWidth: 2,
                  borderColor: "rgba(255,255,255,0.8)",
                },
                markerState === 'target' && {
                  backgroundColor: "#D4AF7A",
                  borderWidth: 3,
                  borderColor: "#FFFFFF",
                  shadowColor: "#D4AF7A",
                  shadowOffset: { width: 0, height: 0 },
                  shadowOpacity: 0.8,
                  shadowRadius: 12,
                  elevation: 12,
                },
                markerState === 'greyed' && {
                  backgroundColor: "#3A3D44",
                  opacity: 0.5,
                  shadowColor: "#000",
                  shadowOffset: { width: 0, height: 1 },
                  shadowOpacity: 0.15,
                  shadowRadius: 1,
                  elevation: 1,
                },
                markerState === 'completed' && {
                  backgroundColor: "#2A2520",
                  borderWidth: 2,
                  borderColor: "#D4AF37",
                  shadowColor: "#D4AF37",
                  shadowOffset: { width: 0, height: 0 },
                  shadowOpacity: 0.4,
                  shadowRadius: 6,
                  elevation: 4,
                },
              ]}>
                <Feather 
                  name={markerState === 'completed' ? "check" : typeStyle.icon}
                  size={iconSize} 
                  color={markerState === 'greyed' ? "#777" : markerState === 'completed' ? "#D4AF37" : "#FFFFFF"} 
                />
              </View>
            </Marker>
          );
        }) : null}
        {isHunting && activeTarget ? (
          <HuntPulseMarker
            coordinate={{
              latitude: activeTarget.latitude,
              longitude: activeTarget.longitude,
            }}
          />
        ) : null}
      </SafeMapView>

      {/* Loading overlay - shown on top of map while loading */}
      {isInitialLoading ? (
        <Animated.View 
          entering={FadeIn.duration(200)} 
          exiting={FadeOut.duration(200)} 
          style={styles.loadingOverlay}
        >
          <View style={styles.loadingPill}>
            <ActivityIndicator size="small" color={theme.accent} />
            <Text style={styles.loadingPillText}>Finding nearby curiosities...</Text>
          </View>
        </Animated.View>
      ) : null}

      <View style={[styles.searchContainer, { top: insets.top + Spacing.md }]}>
        <View style={styles.searchBar}>
          <Feather name="search" size={18} color={theme.inactive} style={styles.searchIconLeft} />
          <TextInput
            style={styles.searchInput}
            placeholder="Search places or areas..."
            placeholderTextColor={theme.inactive}
            value={searchQuery}
            onChangeText={setSearchQuery}
            returnKeyType="search"
            autoCorrect={false}
          />
          {searchQuery.length > 0 ? (
            <Pressable onPress={clearSearch} style={styles.clearButton}>
              <Feather name="x" size={18} color={theme.inactive} />
            </Pressable>
          ) : null}
          {isSearching ? (
            <ActivityIndicator size="small" color={theme.accent} style={styles.searchSpinner} />
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
                    color={theme.textSecondary}
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

      {loading && initialLoadDone.current ? (
        <View style={[styles.searchHereContainer, { top: insets.top + Spacing.md + 60 }]}>
          <View style={styles.searchHereBtn}>
            <ActivityIndicator size="small" color="#fff" />
            <Text style={styles.searchHereBtnText}>Updating...</Text>
          </View>
        </View>
      ) : null}

      <View style={[styles.topControls, { top: insets.top + Spacing.md + 60 }]}>
        <Pressable
          style={({ pressed }) => [
            styles.controlButton,
            pressed && styles.controlButtonPressed,
          ]}
          onPress={centerOnUser}
        >
          <BlurView intensity={80} tint={isDark ? "dark" : "light"} style={StyleSheet.absoluteFill} />
          <Feather name="crosshair" size={20} color={theme.text} />
        </Pressable>
      </View>


      {isHunting ? (
        <Pressable
          style={({ pressed }) => [
            styles.resumeCompassButton,
            { bottom: tabBarHeight + Spacing.lg },
            pressed && styles.resumeCompassButtonPressed,
          ]}
          onPress={handleResumeCompass}
        >
          <BlurView intensity={80} tint={isDark ? "dark" : "light"} style={StyleSheet.absoluteFill} />
          <Feather name="navigation" size={20} color={theme.textAccent} />
          <Text style={styles.resumeCompassText}>Resume Compass</Text>
        </Pressable>
      ) : null}

      {selectedCurio && !isHunting ? (
        <Animated.View
          entering={FadeIn.duration(200)}
          exiting={FadeOut.duration(150)}
          style={[styles.selectedPanel, { bottom: tabBarHeight + Spacing.lg }]}
          key={selectedCurio.id}
        >
          <BlurView intensity={90} tint={isDark ? "dark" : "light"} style={StyleSheet.absoluteFill} />
          <View style={styles.selectedPanelContent}>
            <Pressable style={styles.closePanelButton} onPress={handleClosePanel}>
              <Feather name="x" size={20} color={theme.textSecondary} />
            </Pressable>

            <View style={styles.panelMeta}>
              {(() => {
                const ts = getCurioTypeStyle(selectedCurio.curioType);
                return (
                  <View style={[styles.categoryBadge, { backgroundColor: ts.color + '22', borderColor: ts.color + '66' }]}>
                    <Feather name={ts.icon} size={12} color={ts.color} />
                    <Text style={[styles.categoryBadgeText, { color: ts.color }]}>{ts.label}</Text>
                  </View>
                );
              })()}
              {userLocation ? (
                <View style={styles.distanceBadge}>
                  <Feather name="navigation" size={11} color={theme.textSecondary} />
                  <Text style={styles.distanceBadgeText}>
                    {calculateDisplayDistance(userLocation.latitude, userLocation.longitude, selectedCurio.latitude, selectedCurio.longitude)}
                  </Text>
                </View>
              ) : null}
              {selectedCurio.detailAudioPath ? (
                <View style={styles.audioBadge}>
                  <Feather name="headphones" size={11} color={theme.accent} />
                  <Text style={styles.audioBadgeText}>Audio</Text>
                </View>
              ) : null}
            </View>

            <Text style={styles.selectedTitle} numberOfLines={2}>{selectedCurio.name}</Text>
            <Pressable onPress={() => handleReadMore(selectedCurio)}>
              <Text style={styles.selectedDescription} numberOfLines={2}>
                {selectedCurio.description}
              </Text>
              <Text style={styles.readMoreLink}>Read more...</Text>
            </Pressable>
            <View style={styles.panelButtons}>
              <Pressable
                style={({ pressed }) => [
                  styles.saveListButton,
                  pressed && styles.saveListButtonPressed,
                ]}
                onPress={handleSaveToList}
              >
                <Feather name="bookmark" size={16} color={theme.text} />
                <Text style={styles.saveListButtonText}>Save</Text>
              </Pressable>
              <Pressable
                style={({ pressed }) => [
                  styles.readMoreButton,
                  pressed && styles.readMoreButtonPressed,
                ]}
                onPress={() => handleReadMore(selectedCurio)}
              >
                <Feather name="book-open" size={16} color={theme.text} />
                <Text style={styles.readMoreButtonText}>Read</Text>
              </Pressable>
              <Pressable
                style={({ pressed }) => [
                  styles.huntPanelButton,
                  pressed && styles.huntPanelButtonPressed,
                ]}
                onPress={() => handleHuntPlace(selectedCurio)}
              >
                <Feather name="navigation" size={16} color="#FFFFFF" />
                <Text style={styles.huntPanelButtonText}>Hunt</Text>
              </Pressable>
            </View>
          </View>
        </Animated.View>
      ) : null}

      <Modal
        visible={showListModal}
        animationType="fade"
        transparent
        onRequestClose={() => {
          setShowListModal(false);
          setShowCreateListInput(false);
          setNewListName("");
        }}
      >
        <View style={styles.modalOverlay}>
          <Pressable
            style={StyleSheet.absoluteFill}
            onPress={() => {
              setShowListModal(false);
              setShowCreateListInput(false);
              setNewListName("");
            }}
          />
          <Animated.View
            entering={FadeIn.duration(200)}
            exiting={FadeOut.duration(150)}
            style={styles.modalContent}
          >
            <BlurView intensity={80} tint={isDark ? "dark" : "light"} style={StyleSheet.absoluteFill} />
            <View style={styles.modalInner}>
              <Text style={styles.modalTitle}>Save to List</Text>
              
              {loadingLists ? (
                <ActivityIndicator size="large" color={theme.accent} style={styles.modalLoader} />
              ) : (
                <>
                  {userLists.length > 0 ? (
                    <FlatList
                      data={userLists}
                      keyExtractor={(item) => item.id}
                      style={styles.listSelector}
                      renderItem={({ item }) => (
                        <Pressable
                          style={({ pressed }) => [
                            styles.listOption,
                            pressed && styles.listOptionPressed,
                          ]}
                          onPress={() => handleSelectList(item.id)}
                          disabled={savingToList}
                        >
                          <Feather name="list" size={18} color={theme.accent} />
                          <View style={styles.listOptionInfo}>
                            <Text style={styles.listOptionName}>{item.name}</Text>
                            <Text style={styles.listOptionCount}>
                              {item.item_count} {item.item_count === 1 ? 'place' : 'places'}
                            </Text>
                          </View>
                          <Feather name="plus" size={18} color={theme.textSecondary} />
                        </Pressable>
                      )}
                    />
                  ) : (
                    <Text style={styles.noListsText}>No lists yet. Create your first one!</Text>
                  )}

                  {showCreateListInput ? (
                    <View style={styles.createListContainer}>
                      <TextInput
                        style={styles.createListInput}
                        placeholder="New list name"
                        placeholderTextColor={theme.textSecondary}
                        value={newListName}
                        onChangeText={setNewListName}
                        autoFocus
                        returnKeyType="done"
                        onSubmitEditing={handleCreateAndAddToList}
                      />
                      <View style={styles.createListButtons}>
                        <Pressable
                          style={[styles.createListBtn, styles.createListBtnCancel]}
                          onPress={() => {
                            setShowCreateListInput(false);
                            setNewListName("");
                          }}
                        >
                          <Text style={styles.createListBtnCancelText}>Cancel</Text>
                        </Pressable>
                        <Pressable
                          style={[
                            styles.createListBtn,
                            styles.createListBtnCreate,
                            (!newListName.trim() || savingToList) && styles.createListBtnDisabled,
                          ]}
                          onPress={handleCreateAndAddToList}
                          disabled={!newListName.trim() || savingToList}
                        >
                          {savingToList ? (
                            <ActivityIndicator size="small" color="#FFFFFF" />
                          ) : (
                            <Text style={styles.createListBtnCreateText}>Create & Add</Text>
                          )}
                        </Pressable>
                      </View>
                    </View>
                  ) : (
                    <Pressable
                      style={({ pressed }) => [
                        styles.createNewListButton,
                        pressed && styles.createNewListButtonPressed,
                      ]}
                      onPress={() => setShowCreateListInput(true)}
                    >
                      <Feather name="plus-circle" size={20} color={theme.accent} />
                      <Text style={styles.createNewListText}>Create New List</Text>
                    </Pressable>
                  )}
                </>
              )}
            </View>
          </Animated.View>
        </View>
      </Modal>

      <PlaceDetailModal
        visible={showDetailModal}
        place={detailPlace}
        onClose={handleCloseDetailModal}
      />
    </View>
  );
}

const createStyles = (theme: ThemeColors) => StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: theme.backgroundRoot,
  },
  initLoadingContainer: {
    justifyContent: "center",
    alignItems: "center",
  },
  initLoadingText: {
    color: theme.textSecondary,
    fontSize: Typography.body.fontSize,
    marginTop: Spacing.md,
  },
  loadingOverlay: {
    position: "absolute",
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    justifyContent: "center",
    alignItems: "center",
    pointerEvents: "none",
  },
  loadingPill: {
    flexDirection: "row",
    alignItems: "center",
    backgroundColor: theme.backgroundSecondary,
    paddingVertical: Spacing.md,
    paddingHorizontal: Spacing.xl,
    borderRadius: BorderRadius.full,
    gap: Spacing.sm,
  },
  loadingPillText: {
    color: theme.text,
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
    backgroundColor: theme.backgroundSecondary,
  },
  controlButtonPressed: {
    opacity: 0.6,
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
    backgroundColor: theme.backgroundCard,
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
    color: theme.text,
    height: "100%",
  },
  clearButton: {
    padding: Spacing.xs,
  },
  searchSpinner: {
    marginLeft: Spacing.xs,
  },
  searchResults: {
    backgroundColor: theme.backgroundCard,
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
    borderBottomColor: theme.border,
  },
  searchResultPressed: {
    backgroundColor: theme.backgroundSecondary,
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
    color: theme.text,
    marginBottom: 2,
  },
  resultDescription: {
    fontSize: 13,
    color: theme.textSecondary,
  },
  sectionHeader: {
    flexDirection: "row",
    alignItems: "center",
    paddingVertical: Spacing.sm,
    paddingHorizontal: Spacing.md,
    backgroundColor: theme.backgroundSecondary,
    borderBottomWidth: 1,
    borderBottomColor: theme.border,
  },
  sectionIcon: {
    marginRight: Spacing.xs,
  },
  sectionTitle: {
    fontSize: 12,
    fontWeight: "600",
    color: theme.textSecondary,
    textTransform: "uppercase",
    letterSpacing: 0.5,
  },
  searchHereContainer: {
    position: "absolute",
    alignSelf: "center",
    zIndex: 50,
  },
  searchHereBtn: {
    flexDirection: "row",
    alignItems: "center",
    backgroundColor: theme.backgroundSecondary,
    paddingHorizontal: Spacing.md,
    paddingVertical: Spacing.sm,
    borderRadius: BorderRadius.full,
    gap: Spacing.xs,
  },
  searchHereBtnText: {
    color: theme.text,
    ...Typography.caption,
    fontWeight: "600",
  },
  resumeCompassButton: {
    position: "absolute",
    right: Spacing.lg,
    flexDirection: "row",
    alignItems: "center",
    paddingVertical: Spacing.md,
    paddingHorizontal: Spacing.lg,
    borderRadius: BorderRadius.lg,
    overflow: "hidden",
    backgroundColor: theme.backgroundSecondary,
    gap: Spacing.sm,
  },
  resumeCompassButtonPressed: {
    opacity: 0.7,
  },
  resumeCompassText: {
    color: theme.textAccent,
    ...Typography.body,
    fontWeight: "600",
  },
  selectedPanel: {
    position: "absolute",
    left: Spacing.lg,
    right: Spacing.lg,
    borderRadius: BorderRadius.lg,
    overflow: "hidden",
    backgroundColor: theme.backgroundCard,
  },
  selectedPanelContent: {
    padding: Spacing.lg,
  },
  closePanelButton: {
    position: "absolute",
    top: Spacing.md,
    right: Spacing.md,
    width: 32,
    height: 32,
    justifyContent: "center",
    alignItems: "center",
    zIndex: 10,
  },
  panelMeta: {
    flexDirection: "row",
    alignItems: "center",
    gap: Spacing.sm,
    marginBottom: Spacing.sm,
    flexWrap: "wrap",
  },
  categoryBadge: {
    flexDirection: "row",
    alignItems: "center",
    gap: 4,
    paddingHorizontal: Spacing.sm,
    paddingVertical: 3,
    borderRadius: BorderRadius.full,
    borderWidth: 1,
  },
  categoryBadgeText: {
    fontSize: 11,
    fontWeight: "600",
  },
  distanceBadge: {
    flexDirection: "row",
    alignItems: "center",
    gap: 3,
  },
  distanceBadgeText: {
    fontSize: 11,
    color: theme.textSecondary,
  },
  audioBadge: {
    flexDirection: "row",
    alignItems: "center",
    gap: 3,
  },
  audioBadgeText: {
    fontSize: 11,
    color: theme.accent,
    fontWeight: "500",
  },
  selectedTitle: {
    ...Typography.headline,
    color: theme.text,
    marginBottom: Spacing.xs,
    paddingRight: Spacing['2xl'],
  },
  selectedDescription: {
    ...Typography.callout,
    color: theme.textSecondary,
    lineHeight: 20,
    marginBottom: Spacing.xs,
  },
  readMoreLink: {
    color: theme.accent,
    fontSize: 13,
    fontWeight: "500",
    marginBottom: Spacing.md,
  },
  panelButtons: {
    flexDirection: "row",
    gap: Spacing.md,
  },
  saveListButton: {
    flex: 1,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: theme.backgroundTertiary,
    paddingVertical: Spacing.md,
    borderRadius: BorderRadius.sm,
    gap: Spacing.xs,
  },
  saveListButtonPressed: {
    opacity: 0.7,
  },
  saveListButtonText: {
    color: theme.text,
    ...Typography.headline,
    fontSize: 14,
  },
  huntPanelButton: {
    flex: 1,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: theme.accent,
    paddingVertical: Spacing.md,
    borderRadius: BorderRadius.sm,
    gap: Spacing.xs,
  },
  huntPanelButtonPressed: {
    opacity: 0.7,
  },
  huntPanelButtonText: {
    color: "#FFFFFF",
    ...Typography.headline,
    fontSize: 14,
  },
  readMoreButton: {
    flex: 1,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: theme.backgroundSecondary,
    paddingVertical: Spacing.md,
    borderRadius: BorderRadius.sm,
    gap: Spacing.xs,
    borderWidth: 1,
    borderColor: theme.border,
  },
  readMoreButtonPressed: {
    opacity: 0.7,
  },
  readMoreButtonText: {
    color: theme.text,
    ...Typography.headline,
    fontSize: 14,
  },
  modalOverlay: {
    flex: 1,
    justifyContent: "center",
    alignItems: "center",
    backgroundColor: "rgba(0, 0, 0, 0.6)",
  },
  modalContent: {
    width: "85%",
    maxHeight: "70%",
    borderRadius: BorderRadius.lg,
    overflow: "hidden",
  },
  modalInner: {
    padding: Spacing.xl,
  },
  modalTitle: {
    ...Typography.title,
    color: theme.text,
    marginBottom: Spacing.lg,
    textAlign: "center",
  },
  modalLoader: {
    marginVertical: Spacing['2xl'],
  },
  listSelector: {
    maxHeight: 250,
  },
  listOption: {
    flexDirection: "row",
    alignItems: "center",
    paddingVertical: Spacing.md,
    paddingHorizontal: Spacing.md,
    backgroundColor: theme.backgroundSecondary,
    borderRadius: BorderRadius.sm,
    marginBottom: Spacing.sm,
    gap: Spacing.md,
  },
  listOptionPressed: {
    opacity: 0.7,
  },
  listOptionInfo: {
    flex: 1,
  },
  listOptionName: {
    ...Typography.headline,
    color: theme.text,
  },
  listOptionCount: {
    ...Typography.caption,
    color: theme.textSecondary,
  },
  noListsText: {
    ...Typography.body,
    color: theme.textSecondary,
    textAlign: "center",
    marginVertical: Spacing.xl,
  },
  createNewListButton: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    paddingVertical: Spacing.lg,
    marginTop: Spacing.md,
    gap: Spacing.sm,
  },
  createNewListButtonPressed: {
    opacity: 0.7,
  },
  createNewListText: {
    ...Typography.headline,
    color: theme.accent,
  },
  createListContainer: {
    marginTop: Spacing.md,
  },
  createListInput: {
    backgroundColor: theme.backgroundTertiary,
    borderRadius: BorderRadius.sm,
    paddingHorizontal: Spacing.lg,
    paddingVertical: Spacing.md,
    ...Typography.body,
    color: theme.text,
    marginBottom: Spacing.md,
  },
  createListButtons: {
    flexDirection: "row",
    gap: Spacing.md,
  },
  createListBtn: {
    flex: 1,
    paddingVertical: Spacing.md,
    borderRadius: BorderRadius.sm,
    alignItems: "center",
    justifyContent: "center",
    height: 44,
  },
  createListBtnCancel: {
    backgroundColor: theme.backgroundTertiary,
  },
  createListBtnCancelText: {
    ...Typography.headline,
    color: theme.text,
    fontSize: 14,
  },
  createListBtnCreate: {
    backgroundColor: theme.accent,
  },
  createListBtnCreateText: {
    ...Typography.headline,
    color: "#FFFFFF",
    fontSize: 14,
  },
  createListBtnDisabled: {
    opacity: 0.5,
  },
});
