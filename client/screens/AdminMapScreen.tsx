import React, { useState, useEffect, useRef, useCallback } from "react";
import {
  View,
  StyleSheet,
  Pressable,
  Text,
  ActivityIndicator,
  Platform,
  Alert,
} from "react-native";
import type { Region } from "react-native-maps";
import SafeMapView, { Marker, PROVIDER_GOOGLE, isMapAvailable } from "@/components/SafeMapView";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { useBottomTabBarHeight } from "@react-navigation/bottom-tabs";
import { useNavigation } from "@react-navigation/native";
import type { NativeStackNavigationProp } from "@react-navigation/native-stack";
import { Feather } from "@expo/vector-icons";
import * as Location from "expo-location";
import { Colors, Spacing, BorderRadius, Typography } from "@/constants/theme";
import { getCuriosNearPoint, Curio } from "@/lib/supabase";
import { apiRequest } from "@/lib/query-client";
import type { RootStackParamList } from "@/navigation/RootStackNavigator";

const LONDON_CENTER = {
  latitude: 51.5074,
  longitude: -0.1278,
  latitudeDelta: 0.05,
  longitudeDelta: 0.05,
};

type NavigationProp = NativeStackNavigationProp<RootStackParamList>;

export default function AdminMapScreen() {
  const insets = useSafeAreaInsets();
  const tabBarHeight = useBottomTabBarHeight();
  const navigation = useNavigation<NavigationProp>();
  const mapRef = useRef<any>(null);

  const [curios, setCurios] = useState<Curio[]>([]);
  const [loading, setLoading] = useState(true);
  const [deleting, setDeleting] = useState(false);
  const [userLocation, setUserLocation] = useState<{ latitude: number; longitude: number } | null>(null);
  const [mapCenter, setMapCenter] = useState<{ latitude: number; longitude: number }>(LONDON_CENTER);
  const [selectedCurio, setSelectedCurio] = useState<Curio | null>(null);
  const initialLoadDone = useRef(false);

  useEffect(() => {
    (async () => {
      try {
        const { status } = await Location.requestForegroundPermissionsAsync();
        if (status === "granted") {
          const loc = await Location.getCurrentPositionAsync({ accuracy: Location.Accuracy.Balanced });
          const coords = { latitude: loc.coords.latitude, longitude: loc.coords.longitude };
          setUserLocation(coords);
          setMapCenter(coords);
        }
      } catch (e) {
        console.log("Location error:", e);
      }
    })();
  }, []);

  useEffect(() => {
    loadCurios(mapCenter.latitude, mapCenter.longitude);
  }, []);

  useEffect(() => {
    if (userLocation && !initialLoadDone.current) {
      initialLoadDone.current = true;
      loadCurios(userLocation.latitude, userLocation.longitude);
    }
  }, [userLocation]);

  const loadCurios = async (lat: number, lng: number) => {
    setLoading(true);
    try {
      const data = await getCuriosNearPoint(lat, lng, 1000);
      setCurios(data);
    } catch (e) {
      console.error("Error loading curios:", e);
    } finally {
      setLoading(false);
    }
  };

  const handleRegionChangeComplete = (region: Region) => {
    setMapCenter({ latitude: region.latitude, longitude: region.longitude });
  };

  const handleSearchHere = () => {
    setSelectedCurio(null);
    loadCurios(mapCenter.latitude, mapCenter.longitude);
  };

  const handleMarkerPress = (curio: Curio) => {
    setSelectedCurio(curio);
  };

  const handleDelete = () => {
    if (!selectedCurio) return;

    Alert.alert(
      "Delete Place",
      `Delete "${selectedCurio.name}" and all its facts? This cannot be undone.`,
      [
        { text: "Cancel", style: "cancel" },
        {
          text: "Delete",
          style: "destructive",
          onPress: async () => {
            setDeleting(true);
            try {
              await apiRequest("DELETE", `/api/admin/place/${selectedCurio.id}`);
              setCurios(prev => prev.filter(c => c.id !== selectedCurio.id));
              setSelectedCurio(null);
              Alert.alert("Deleted", "Place and facts removed.");
            } catch (e: any) {
              Alert.alert("Error", e.message || "Failed to delete.");
            } finally {
              setDeleting(false);
            }
          },
        },
      ]
    );
  };

  if (!isMapAvailable) {
    return (
      <View style={[styles.container, { paddingTop: insets.top }]}>
        <Text style={styles.fallbackText}>Map not available on this platform.</Text>
      </View>
    );
  }

  return (
    <View style={styles.container}>
      <SafeMapView
        ref={mapRef}
        style={StyleSheet.absoluteFillObject}
        provider={Platform.OS === "android" ? PROVIDER_GOOGLE : undefined}
        initialRegion={LONDON_CENTER}
        showsUserLocation
        showsMyLocationButton={false}
        onRegionChangeComplete={handleRegionChangeComplete}
      >
        {curios.map(curio => (
          <Marker
            key={curio.id}
            coordinate={{ latitude: curio.latitude, longitude: curio.longitude }}
            pinColor="#E53935"
            onPress={() => handleMarkerPress(curio)}
          />
        ))}
      </SafeMapView>

      <View style={[styles.topBar, { top: insets.top + Spacing.sm }]}>
        <Pressable style={styles.searchHereBtn} onPress={handleSearchHere}>
          <Feather name="refresh-cw" size={16} color="#fff" />
          <Text style={styles.searchHereBtnText}>
            {loading ? "Loading..." : `Search here (${curios.length})`}
          </Text>
        </Pressable>
      </View>

      <View style={[styles.adminBadge, { top: insets.top + Spacing.sm }]}>
        <Feather name="shield" size={14} color="#E53935" />
        <Text style={styles.adminBadgeText}>Admin</Text>
      </View>

      {selectedCurio ? (
        <View style={[styles.panel, { bottom: tabBarHeight + Spacing.md }]}>
          <Pressable style={styles.closeBtn} onPress={() => setSelectedCurio(null)}>
            <Feather name="x" size={20} color="#999" />
          </Pressable>
          <Text style={styles.panelName} numberOfLines={2}>{selectedCurio.name}</Text>
          <Text style={styles.panelType}>{selectedCurio.curioType || "Unknown type"}</Text>
          <Text style={styles.panelId}>ID: {selectedCurio.id}</Text>
          <Text style={styles.panelDesc} numberOfLines={3}>{selectedCurio.description}</Text>
          <View style={styles.panelButtons}>
            <Pressable
              style={styles.editBtn}
              onPress={() => navigation.navigate("AdminEdit", { curioId: selectedCurio.id, curioName: selectedCurio.name })}
            >
              <Feather name="edit-2" size={18} color="#fff" />
              <Text style={styles.editBtnText}>Edit</Text>
            </Pressable>
            <Pressable
              style={[styles.deleteBtn, deleting && styles.deleteBtnDisabled]}
              onPress={handleDelete}
              disabled={deleting}
            >
              {deleting ? (
                <ActivityIndicator size="small" color="#fff" />
              ) : (
                <>
                  <Feather name="trash-2" size={18} color="#fff" />
                  <Text style={styles.deleteBtnText}>Delete</Text>
                </>
              )}
            </Pressable>
          </View>
        </View>
      ) : null}

      {loading ? (
        <View style={styles.loadingOverlay}>
          <ActivityIndicator size="small" color={Colors.dark.accent} />
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
  fallbackText: {
    color: "#fff",
    ...Typography.body,
    textAlign: "center",
    marginTop: 100,
  },
  topBar: {
    position: "absolute",
    alignSelf: "center",
    zIndex: 10,
  },
  searchHereBtn: {
    flexDirection: "row",
    alignItems: "center",
    backgroundColor: "rgba(30,30,30,0.9)",
    paddingHorizontal: Spacing.md,
    paddingVertical: Spacing.sm,
    borderRadius: BorderRadius.full,
    gap: Spacing.xs,
  },
  searchHereBtnText: {
    color: "#fff",
    ...Typography.caption,
    fontWeight: "600",
  },
  adminBadge: {
    position: "absolute",
    right: Spacing.md,
    flexDirection: "row",
    alignItems: "center",
    backgroundColor: "rgba(30,30,30,0.9)",
    paddingHorizontal: Spacing.sm,
    paddingVertical: 4,
    borderRadius: BorderRadius.full,
    gap: 4,
    zIndex: 10,
  },
  adminBadgeText: {
    color: "#E53935",
    ...Typography.caption,
    fontWeight: "700",
  },
  panel: {
    position: "absolute",
    left: Spacing.md,
    right: Spacing.md,
    backgroundColor: "rgba(20,20,20,0.95)",
    borderRadius: BorderRadius.lg,
    padding: Spacing.lg,
    zIndex: 20,
  },
  closeBtn: {
    position: "absolute",
    top: Spacing.sm,
    right: Spacing.sm,
    padding: 4,
    zIndex: 1,
  },
  panelName: {
    color: "#fff",
    ...Typography.title,
    fontWeight: "700",
    marginBottom: 4,
    paddingRight: 30,
  },
  panelType: {
    color: Colors.dark.textSecondary,
    ...Typography.caption,
    marginBottom: 2,
  },
  panelId: {
    color: Colors.dark.textSecondary,
    fontSize: 11,
    fontFamily: Platform.OS === "ios" ? "Menlo" : "monospace",
    marginBottom: Spacing.sm,
  },
  panelDesc: {
    color: Colors.dark.textSecondary,
    ...Typography.body,
    lineHeight: 20,
    marginBottom: Spacing.md,
  },
  panelButtons: {
    flexDirection: "row",
    gap: Spacing.sm,
  },
  editBtn: {
    flex: 1,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: Colors.dark.accent,
    paddingVertical: Spacing.sm + 2,
    borderRadius: BorderRadius.md,
    gap: Spacing.xs,
  },
  editBtnText: {
    color: "#fff",
    ...Typography.body,
    fontWeight: "700",
  },
  deleteBtn: {
    flex: 1,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: "#E53935",
    paddingVertical: Spacing.sm + 2,
    borderRadius: BorderRadius.md,
    gap: Spacing.xs,
  },
  deleteBtnDisabled: {
    opacity: 0.5,
  },
  deleteBtnText: {
    color: "#fff",
    ...Typography.body,
    fontWeight: "700",
  },
  loadingOverlay: {
    position: "absolute",
    top: "50%",
    alignSelf: "center",
  },
});
