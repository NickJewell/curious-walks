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
import SafeMapView, { Marker, Callout, PROVIDER_GOOGLE, isMapAvailable } from "@/components/SafeMapView";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { useBottomTabBarHeight } from "@react-navigation/bottom-tabs";
import { useNavigation, useFocusEffect } from "@react-navigation/native";
import type { NativeStackNavigationProp } from "@react-navigation/native-stack";
import { Feather } from "@expo/vector-icons";
import { BlurView } from "expo-blur";
import * as Location from "expo-location";
import Animated, { FadeIn, FadeOut } from "react-native-reanimated";
import { Colors, Spacing, BorderRadius, Typography } from "@/constants/theme";
import { getNearestCurios, searchCurios, Curio } from "@/lib/supabase";
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
};

const getCurioTypeStyle = (curioType?: string): CurioTypeStyle => {
  switch (curioType) {
    case 'Green Space':
      return { color: '#4CAF50', icon: 'sun' };
    case 'Public Transport':
      return { color: '#424242', icon: 'navigation' };
    case 'Memorial & Statue':
      return { color: '#E53935', icon: 'award' };
    case 'Public Art':
      return { color: '#E91E63', icon: 'edit-3' };
    default:
      return { color: Colors.dark.accent, icon: 'map-pin' };
  }
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

type NavigationProp = NativeStackNavigationProp<RootStackParamList>;

export default function MapScreen() {
  const insets = useSafeAreaInsets();
  const tabBarHeight = useBottomTabBarHeight();
  const navigation = useNavigation<NavigationProp>();
  const { activeTarget, setActiveTarget, isHunting } = useHunt();
  const { user, isGuest, signOut } = useAuth();
  const { checkedInPlaceIds } = useCheckins();
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
  const [selectedCurio, setSelectedCurio] = useState<Curio | null>(null);
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
    navigation.navigate("Compass");
  };

  const handleMarkerPress = (curio: Curio) => {
    setSelectedCurio(curio);
  };

  const handleClosePanel = () => {
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
        
        // Animate map to user's location once we have it
        mapRef.current?.animateToRegion({
          ...coords,
          latitudeDelta: 0.01,
          longitudeDelta: 0.01,
        }, 500);
        
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

  const loadCurios = async (lat: number, lng: number, fitToBounds: boolean = true) => {
    setLoading(true);
    try {
      const data = await getNearestCurios(lat, lng, 20);
      setCurios(data);
      setLastSearchCenter({ latitude: lat, longitude: lng });
      setShowSearchButton(false);
      
      // Fit map to extent of loaded places
      if (fitToBounds && data.length > 0 && mapRef.current) {
        const coordinates = data.map(c => ({
          latitude: c.latitude,
          longitude: c.longitude,
        }));
        
        // Add small delay to ensure map is ready
        setTimeout(() => {
          mapRef.current?.fitToCoordinates(coordinates, {
            edgePadding: { top: 150, right: 50, bottom: 150, left: 50 },
            animated: true,
          });
        }, 100);
      }
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

  const centerOnUser = async () => {
    try {
      // Fetch fresh location instead of using cached userLocation
      const location = await Location.getCurrentPositionAsync({
        accuracy: Location.Accuracy.High,
      });
      const freshCoords = {
        latitude: location.coords.latitude,
        longitude: location.coords.longitude,
      };
      
      // Update the stored user location
      setUserLocation(freshCoords);
      
      // Animate to the fresh location with a close zoom
      mapRef.current?.animateToRegion({
        ...freshCoords,
        latitudeDelta: 0.008,
        longitudeDelta: 0.008,
      }, 300);
    } catch (error) {
      // Fall back to cached location if fresh fetch fails
      if (userLocation) {
        mapRef.current?.animateToRegion({
          ...userLocation,
          latitudeDelta: 0.008,
          longitudeDelta: 0.008,
        }, 300);
      }
    }
  };

  const isInitialLoading = loading && curios.length === 0;

  return (
    <View style={styles.container}>
      <SafeMapView
        ref={mapRef}
        style={styles.map}
        provider={PROVIDER_GOOGLE}
        initialRegion={userLocation ? { ...userLocation, latitudeDelta: 0.01, longitudeDelta: 0.01 } : LONDON_CENTER}
        showsUserLocation
        showsMyLocationButton={false}
        userInterfaceStyle="dark"
        onRegionChangeComplete={onRegionChangeComplete}
      >
        {isMapAvailable && Marker ? curios.map((curio, index) => {
          const isTarget = isHunting && activeTarget?.id === curio.id;
          const isGreyed = isHunting && activeTarget?.id !== curio.id;
          const isCheckedIn = checkedInPlaceIds.has(curio.id);
          const typeStyle = getCurioTypeStyle(curio.curioType);
          
          if (index === 0) {
            console.log('DEBUG: First curio ID:', curio.id, 'checkedInPlaceIds size:', checkedInPlaceIds.size, 'isCheckedIn:', isCheckedIn);
            console.log('DEBUG: checkedInPlaceIds contents:', Array.from(checkedInPlaceIds));
          }
          
          return (
            <Marker
              key={curio.id}
              ref={(ref: any) => { if (ref) markerRefs.current[curio.id] = ref; }}
              coordinate={{
                latitude: curio.latitude,
                longitude: curio.longitude,
              }}
              tracksViewChanges={false}
              zIndex={isTarget ? 100 : 1}
              onPress={() => handleMarkerPress(curio)}
            >
              <View style={[
                styles.marker,
                !isCheckedIn && { backgroundColor: typeStyle.color },
                isTarget && styles.markerTarget,
                isGreyed && styles.markerGreyed,
                isCheckedIn && styles.markerCheckedIn,
              ]}>
                <Feather 
                  name={isCheckedIn ? "check" : typeStyle.icon}
                  size={isTarget ? 20 : 16} 
                  color={isGreyed ? "#888" : "#FFFFFF"} 
                />
              </View>
            </Marker>
          );
        }) : null}
      </SafeMapView>

      {/* Loading overlay - shown on top of map while loading */}
      {isInitialLoading ? (
        <Animated.View 
          entering={FadeIn.duration(200)} 
          exiting={FadeOut.duration(200)} 
          style={styles.loadingOverlay}
        >
          <View style={styles.loadingPill}>
            <ActivityIndicator size="small" color={Colors.dark.accent} />
            <Text style={styles.loadingPillText}>Finding nearby curiosities...</Text>
          </View>
        </Animated.View>
      ) : null}

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

      {isHunting ? (
        <Pressable
          style={({ pressed }) => [
            styles.resumeCompassButton,
            { bottom: tabBarHeight + Spacing.lg },
            pressed && styles.resumeCompassButtonPressed,
          ]}
          onPress={handleResumeCompass}
        >
          <BlurView intensity={80} tint="dark" style={StyleSheet.absoluteFill} />
          <Feather name="navigation" size={20} color="#D4AF7A" />
          <Text style={styles.resumeCompassText}>Resume Compass</Text>
        </Pressable>
      ) : null}

      {selectedCurio && !isHunting ? (
        <View style={[styles.selectedPanel, { bottom: tabBarHeight + Spacing.lg }]}>
          <BlurView intensity={80} tint="dark" style={StyleSheet.absoluteFill} />
          <View style={styles.selectedPanelContent}>
            <Pressable style={styles.closePanelButton} onPress={handleClosePanel}>
              <Feather name="x" size={20} color="#888" />
            </Pressable>
            <Text style={styles.selectedTitle} numberOfLines={2}>{selectedCurio.name}</Text>
            <Pressable onPress={() => handleReadMore(selectedCurio)}>
              <Text style={styles.selectedDescription} numberOfLines={3}>
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
                <Feather name="bookmark" size={16} color={Colors.dark.text} />
                <Text style={styles.saveListButtonText}>Save</Text>
              </Pressable>
              <Pressable
                style={({ pressed }) => [
                  styles.readMoreButton,
                  pressed && styles.readMoreButtonPressed,
                ]}
                onPress={() => handleReadMore(selectedCurio)}
              >
                <Feather name="book-open" size={16} color={Colors.dark.text} />
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
        </View>
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
            <BlurView intensity={80} tint="dark" style={StyleSheet.absoluteFill} />
            <View style={styles.modalInner}>
              <Text style={styles.modalTitle}>Save to List</Text>
              
              {loadingLists ? (
                <ActivityIndicator size="large" color={Colors.dark.accent} style={styles.modalLoader} />
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
                          <Feather name="list" size={18} color={Colors.dark.accent} />
                          <View style={styles.listOptionInfo}>
                            <Text style={styles.listOptionName}>{item.name}</Text>
                            <Text style={styles.listOptionCount}>
                              {item.item_count} {item.item_count === 1 ? 'place' : 'places'}
                            </Text>
                          </View>
                          <Feather name="plus" size={18} color={Colors.dark.textSecondary} />
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
                        placeholderTextColor={Colors.dark.textSecondary}
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
                      <Feather name="plus-circle" size={20} color={Colors.dark.accent} />
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

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: Colors.dark.backgroundRoot,
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
    backgroundColor: "rgba(0, 0, 0, 0.8)",
    paddingVertical: Spacing.md,
    paddingHorizontal: Spacing.xl,
    borderRadius: BorderRadius.full,
    gap: Spacing.sm,
  },
  loadingPillText: {
    color: Colors.dark.text,
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
  markerTarget: {
    width: 44,
    height: 44,
    borderRadius: 22,
    backgroundColor: "#D4AF7A",
    borderWidth: 3,
    borderColor: "#FFFFFF",
    shadowOpacity: 0.5,
  },
  markerGreyed: {
    backgroundColor: "#4A4E57",
    opacity: 0.6,
  },
  markerCheckedIn: {
    backgroundColor: "#D4AF37",
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
  huntButton: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: "#8B7355",
    paddingVertical: Spacing.sm,
    paddingHorizontal: Spacing.md,
    borderRadius: BorderRadius.sm,
    marginTop: Spacing.md,
    gap: Spacing.xs,
  },
  huntButtonText: {
    color: "#FFFFFF",
    fontSize: 14,
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
    backgroundColor: "rgba(21, 26, 35, 0.9)",
    gap: Spacing.sm,
  },
  resumeCompassButtonPressed: {
    opacity: 0.7,
  },
  resumeCompassText: {
    color: "#D4AF7A",
    ...Typography.body,
    fontWeight: "600",
  },
  selectedPanel: {
    position: "absolute",
    left: Spacing.lg,
    right: Spacing.lg,
    borderRadius: BorderRadius.lg,
    overflow: "hidden",
    backgroundColor: "rgba(21, 26, 35, 0.95)",
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
  selectedTitle: {
    ...Typography.headline,
    color: Colors.dark.text,
    marginBottom: Spacing.sm,
    paddingRight: Spacing['2xl'],
  },
  selectedDescription: {
    ...Typography.body,
    color: Colors.dark.textSecondary,
    lineHeight: 22,
    marginBottom: Spacing.lg,
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
    backgroundColor: Colors.dark.backgroundTertiary,
    paddingVertical: Spacing.md,
    borderRadius: BorderRadius.sm,
    gap: Spacing.xs,
  },
  saveListButtonPressed: {
    opacity: 0.7,
  },
  saveListButtonText: {
    color: Colors.dark.text,
    ...Typography.headline,
    fontSize: 14,
  },
  huntPanelButton: {
    flex: 1,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: Colors.dark.accent,
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
  readMoreLink: {
    color: Colors.dark.accent,
    fontSize: 14,
    fontWeight: "500",
    marginTop: -Spacing.sm,
    marginBottom: Spacing.lg,
  },
  readMoreButton: {
    flex: 1,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: Colors.dark.backgroundSecondary,
    paddingVertical: Spacing.md,
    borderRadius: BorderRadius.sm,
    gap: Spacing.xs,
    borderWidth: 1,
    borderColor: Colors.dark.border,
  },
  readMoreButtonPressed: {
    opacity: 0.7,
  },
  readMoreButtonText: {
    color: Colors.dark.text,
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
    color: Colors.dark.text,
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
    backgroundColor: Colors.dark.backgroundSecondary,
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
    color: Colors.dark.text,
  },
  listOptionCount: {
    ...Typography.caption,
    color: Colors.dark.textSecondary,
  },
  noListsText: {
    ...Typography.body,
    color: Colors.dark.textSecondary,
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
    color: Colors.dark.accent,
  },
  createListContainer: {
    marginTop: Spacing.md,
  },
  createListInput: {
    backgroundColor: Colors.dark.backgroundTertiary,
    borderRadius: BorderRadius.sm,
    paddingHorizontal: Spacing.lg,
    paddingVertical: Spacing.md,
    ...Typography.body,
    color: Colors.dark.text,
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
    backgroundColor: Colors.dark.backgroundTertiary,
  },
  createListBtnCancelText: {
    ...Typography.headline,
    color: Colors.dark.text,
    fontSize: 14,
  },
  createListBtnCreate: {
    backgroundColor: Colors.dark.accent,
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
