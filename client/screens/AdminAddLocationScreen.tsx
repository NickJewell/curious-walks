import React, { useState, useRef, useEffect } from "react";
import {
  View,
  StyleSheet,
  Text,
  TextInput,
  Pressable,
  Alert,
  ActivityIndicator,
  Platform,
  Linking,
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { useNavigation, useRoute, RouteProp } from "@react-navigation/native";
import { NativeStackNavigationProp } from "@react-navigation/native-stack";
import { Feather } from "@expo/vector-icons";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import * as Location from "expo-location";
import SafeMapView, { Marker, PROVIDER_GOOGLE, isMapAvailable } from "@/components/SafeMapView";
import { KeyboardAwareScrollViewCompat } from "@/components/KeyboardAwareScrollViewCompat";
import { Colors, Spacing, BorderRadius, Typography } from "@/constants/theme";
import { apiRequest } from "@/lib/query-client";
import type { RootStackParamList } from "@/navigation/RootStackNavigator";
import type { Category, Region } from "@shared/schema";

type AdminAddLocationRouteProp = RouteProp<RootStackParamList, "AdminAddLocation">;

const LONDON_CENTER = {
  latitude: 51.5074,
  longitude: -0.1278,
  latitudeDelta: 0.05,
  longitudeDelta: 0.05,
};

function generateSlug(name: string): string {
  return name
    .toLowerCase()
    .replace(/[^a-z0-9\s-]/g, "")
    .replace(/\s+/g, "-")
    .replace(/-+/g, "-")
    .trim();
}

export default function AdminAddLocationScreen() {
  const insets = useSafeAreaInsets();
  const navigation = useNavigation<NativeStackNavigationProp<RootStackParamList>>();
  const route = useRoute<AdminAddLocationRouteProp>();
  const queryClient = useQueryClient();
  const mapRef = useRef<any>(null);

  const [step, setStep] = useState<"map" | "form">("map");
  const [coordinates, setCoordinates] = useState<{ latitude: number; longitude: number } | null>(
    route.params?.latitude && route.params?.longitude
      ? { latitude: route.params.latitude, longitude: route.params.longitude }
      : null
  );
  const [userLocation, setUserLocation] = useState<{ latitude: number; longitude: number } | null>(null);

  const [name, setName] = useState("");
  const [description, setDescription] = useState("");
  const [story, setStory] = useState("");
  const [address, setAddress] = useState("");
  const [categoryId, setCategoryId] = useState("");
  const [sourceAttribution, setSourceAttribution] = useState("");
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [usedDefaultLocation, setUsedDefaultLocation] = useState(false);

  const [permission, requestPermission] = Location.useForegroundPermissions();

  const { data: categories = [] } = useQuery<Category[]>({
    queryKey: ["/api/categories"],
  });

  const { data: regions = [] } = useQuery<Region[]>({
    queryKey: ["/api/regions"],
  });

  useEffect(() => {
    if (permission?.granted) {
      (async () => {
        const location = await Location.getCurrentPositionAsync({});
        setUserLocation({
          latitude: location.coords.latitude,
          longitude: location.coords.longitude,
        });
      })();
    }
  }, [permission?.granted]);

  const handleOpenSettings = async () => {
    if (Platform.OS !== "web") {
      try {
        await Linking.openSettings();
      } catch (error) {
        // openSettings not supported
      }
    }
  };

  const createMutation = useMutation({
    mutationFn: async (data: any) => {
      return apiRequest("POST", "/api/locations", data);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/admin/locations"] });
      queryClient.invalidateQueries({ queryKey: ["/api/locations"] });
      Alert.alert("Success", "Location created successfully", [
        { text: "OK", onPress: () => navigation.goBack() }
      ]);
    },
    onError: (error: any) => {
      Alert.alert("Error", error.message || "Failed to create location");
      setIsSubmitting(false);
    },
  });

  const handleMapPress = (event: any) => {
    const { latitude, longitude } = event.nativeEvent.coordinate;
    setCoordinates({ latitude, longitude });
  };

  const handleConfirmLocation = () => {
    if (!coordinates) {
      Alert.alert("Select Location", "Please tap on the map to select a location for the new point.");
      return;
    }
    setStep("form");
  };

  const handleSubmit = () => {
    if (!name.trim()) {
      Alert.alert("Required Field", "Please enter a name for the location.");
      return;
    }
    if (!description.trim()) {
      Alert.alert("Required Field", "Please enter a description.");
      return;
    }
    if (!story.trim()) {
      Alert.alert("Required Field", "Please enter the story/history.");
      return;
    }
    if (!categoryId) {
      Alert.alert("Required Field", "Please select a category.");
      return;
    }
    if (!coordinates) {
      Alert.alert("Error", "No coordinates selected.");
      return;
    }

    setIsSubmitting(true);

    const londonRegion = regions.find(r => r.slug === "london");

    createMutation.mutate({
      name: name.trim(),
      slug: generateSlug(name.trim()),
      description: description.trim(),
      story: story.trim(),
      latitude: coordinates.latitude,
      longitude: coordinates.longitude,
      address: address.trim() || null,
      categoryId,
      regionId: londonRegion?.id || null,
      sourceAttribution: sourceAttribution.trim() || null,
      isActive: true,
    });
  };

  const centerOnUser = () => {
    if (userLocation && mapRef.current) {
      mapRef.current.animateToRegion({
        ...userLocation,
        latitudeDelta: 0.02,
        longitudeDelta: 0.02,
      }, 300);
    }
  };

  if (step === "map") {
    if (!permission) {
      return (
        <View style={[styles.container, styles.centeredContainer]}>
          <ActivityIndicator size="large" color={Colors.dark.accent} />
          <Text style={styles.permissionText}>Checking location permission...</Text>
        </View>
      );
    }

    if (!permission.granted) {
      const canAsk = permission.status !== "denied" || permission.canAskAgain;
      return (
        <View style={[styles.container, styles.centeredContainer]}>
          <Feather name="map-pin" size={48} color={Colors.dark.inactive} />
          <Text style={styles.permissionTitle}>Location Access Required</Text>
          <Text style={styles.permissionText}>
            Enable location access to use the interactive map for placing markers. You can still proceed without it using London's center coordinates.
          </Text>
          {canAsk ? (
            <Pressable
              style={({ pressed }) => [
                styles.permissionButton,
                pressed && styles.permissionButtonPressed,
              ]}
              onPress={requestPermission}
            >
              <Feather name="navigation" size={18} color="#FFFFFF" />
              <Text style={styles.permissionButtonText}>Enable Location</Text>
            </Pressable>
          ) : Platform.OS !== "web" ? (
            <Pressable
              style={({ pressed }) => [
                styles.permissionButton,
                pressed && styles.permissionButtonPressed,
              ]}
              onPress={handleOpenSettings}
            >
              <Feather name="settings" size={18} color="#FFFFFF" />
              <Text style={styles.permissionButtonText}>Open Settings</Text>
            </Pressable>
          ) : null}
          <Pressable
            style={({ pressed }) => [
              styles.skipButton,
              pressed && styles.skipButtonPressed,
            ]}
            onPress={() => {
              setCoordinates({ latitude: LONDON_CENTER.latitude, longitude: LONDON_CENTER.longitude });
              setUsedDefaultLocation(true);
              setStep("form");
            }}
          >
            <Text style={styles.skipButtonText}>Continue with London Center</Text>
          </Pressable>
        </View>
      );
    }

    return (
      <View style={styles.container}>
        <View style={styles.instructionBar}>
          <Text style={styles.instructionText}>
            Tap on the map to place the location marker
          </Text>
        </View>

        <SafeMapView
          ref={mapRef}
          style={styles.map}
          provider={PROVIDER_GOOGLE}
          initialRegion={userLocation ? { ...userLocation, latitudeDelta: 0.05, longitudeDelta: 0.05 } : LONDON_CENTER}
          showsUserLocation
          showsMyLocationButton={false}
          userInterfaceStyle="dark"
          onPress={handleMapPress}
        >
          {isMapAvailable && Marker && coordinates ? (
            <Marker
              coordinate={coordinates}
              draggable
              onDragEnd={(e: any) => setCoordinates(e.nativeEvent.coordinate)}
            >
              <View style={styles.newMarker}>
                <Feather name="map-pin" size={20} color="#FFFFFF" />
              </View>
            </Marker>
          ) : null}
        </SafeMapView>

        <View style={[styles.mapControls, { top: insets.top + Spacing.md }]}>
          {userLocation ? (
            <Pressable
              style={({ pressed }) => [
                styles.controlButton,
                pressed && styles.controlButtonPressed,
              ]}
              onPress={centerOnUser}
            >
              <Feather name="navigation" size={20} color={Colors.dark.text} />
            </Pressable>
          ) : null}
        </View>

        {coordinates ? (
          <View style={styles.coordsDisplay}>
            <Text style={styles.coordsText}>
              {coordinates.latitude.toFixed(6)}, {coordinates.longitude.toFixed(6)}
            </Text>
          </View>
        ) : null}

        <View style={[styles.bottomBar, { paddingBottom: insets.bottom + Spacing.md }]}>
          <Pressable
            style={({ pressed }) => [
              styles.confirmButton,
              !coordinates && styles.confirmButtonDisabled,
              pressed && coordinates && styles.confirmButtonPressed,
            ]}
            onPress={handleConfirmLocation}
            disabled={!coordinates}
          >
            <Text style={styles.confirmButtonText}>Continue to Details</Text>
            <Feather name="arrow-right" size={20} color="#FFFFFF" />
          </Pressable>
        </View>
      </View>
    );
  }

  return (
    <View style={styles.container}>
      <KeyboardAwareScrollViewCompat
        style={styles.formScrollView}
        contentContainerStyle={[
          styles.formContent,
          { paddingBottom: insets.bottom + Spacing.xl + 80 },
        ]}
      >
        {usedDefaultLocation ? (
          <View style={styles.defaultLocationNotice}>
            <Feather name="info" size={16} color={Colors.dark.accent} />
            <Text style={styles.defaultLocationText}>
              Using London center coordinates. Tap below to select a different location.
            </Text>
          </View>
        ) : null}

        <Pressable
          style={styles.editLocationButton}
          onPress={() => {
            setUsedDefaultLocation(false);
            setStep("map");
          }}
        >
          <Feather name="map-pin" size={16} color={Colors.dark.accent} />
          <Text style={styles.editLocationText}>
            Location: {coordinates?.latitude.toFixed(4)}, {coordinates?.longitude.toFixed(4)}
          </Text>
          <Feather name="edit-2" size={14} color={Colors.dark.textSecondary} />
        </Pressable>

        <Text style={styles.label}>Name *</Text>
        <TextInput
          style={styles.input}
          value={name}
          onChangeText={setName}
          placeholder="e.g., The Haunted Tavern"
          placeholderTextColor={Colors.dark.inactive}
        />

        <Text style={styles.label}>Category *</Text>
        <View style={styles.categoryPicker}>
          {categories.map((category) => (
            <Pressable
              key={category.id}
              style={[
                styles.categoryOption,
                categoryId === category.id && styles.categoryOptionSelected,
              ]}
              onPress={() => setCategoryId(category.id)}
            >
              <Text
                style={[
                  styles.categoryOptionText,
                  categoryId === category.id && styles.categoryOptionTextSelected,
                ]}
              >
                {category.name}
              </Text>
            </Pressable>
          ))}
        </View>

        <Text style={styles.label}>Short Description *</Text>
        <TextInput
          style={[styles.input, styles.textArea]}
          value={description}
          onChangeText={setDescription}
          placeholder="A brief one-line summary..."
          placeholderTextColor={Colors.dark.inactive}
          multiline
          numberOfLines={2}
        />

        <Text style={styles.label}>Full Story *</Text>
        <TextInput
          style={[styles.input, styles.largeTextArea]}
          value={story}
          onChangeText={setStory}
          placeholder="The detailed history and folklore of this location..."
          placeholderTextColor={Colors.dark.inactive}
          multiline
          numberOfLines={6}
          textAlignVertical="top"
        />

        <Text style={styles.label}>Address (optional)</Text>
        <TextInput
          style={styles.input}
          value={address}
          onChangeText={setAddress}
          placeholder="e.g., 123 Mystery Lane, London EC1"
          placeholderTextColor={Colors.dark.inactive}
        />

        <Text style={styles.label}>Source Attribution (optional)</Text>
        <TextInput
          style={styles.input}
          value={sourceAttribution}
          onChangeText={setSourceAttribution}
          placeholder="e.g., Local Folklore Society"
          placeholderTextColor={Colors.dark.inactive}
        />
      </KeyboardAwareScrollViewCompat>

      <View style={[styles.bottomBar, { paddingBottom: insets.bottom + Spacing.md }]}>
        <Pressable
          style={({ pressed }) => [
            styles.submitButton,
            isSubmitting && styles.submitButtonDisabled,
            pressed && !isSubmitting && styles.submitButtonPressed,
          ]}
          onPress={handleSubmit}
          disabled={isSubmitting}
        >
          {isSubmitting ? (
            <ActivityIndicator color="#FFFFFF" />
          ) : (
            <>
              <Feather name="check" size={20} color="#FFFFFF" />
              <Text style={styles.submitButtonText}>Create Location</Text>
            </>
          )}
        </Pressable>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: Colors.dark.backgroundRoot,
  },
  instructionBar: {
    backgroundColor: Colors.dark.backgroundDefault,
    paddingVertical: Spacing.sm,
    paddingHorizontal: Spacing.lg,
    borderBottomWidth: 1,
    borderBottomColor: Colors.dark.border,
  },
  instructionText: {
    ...Typography.body,
    color: Colors.dark.textSecondary,
    textAlign: "center",
  },
  map: {
    flex: 1,
  },
  mapControls: {
    position: "absolute",
    right: Spacing.lg,
  },
  controlButton: {
    width: 44,
    height: 44,
    borderRadius: BorderRadius.sm,
    backgroundColor: "rgba(21, 26, 35, 0.9)",
    justifyContent: "center",
    alignItems: "center",
  },
  controlButtonPressed: {
    opacity: 0.6,
  },
  newMarker: {
    width: 40,
    height: 40,
    borderRadius: 20,
    backgroundColor: Colors.dark.accent,
    justifyContent: "center",
    alignItems: "center",
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.3,
    shadowRadius: 4,
    elevation: 4,
  },
  coordsDisplay: {
    position: "absolute",
    bottom: 100,
    left: Spacing.lg,
    right: Spacing.lg,
    backgroundColor: "rgba(21, 26, 35, 0.9)",
    padding: Spacing.sm,
    borderRadius: BorderRadius.xs,
    alignItems: "center",
  },
  coordsText: {
    ...Typography.body,
    color: Colors.dark.text,
    fontFamily: Platform.OS === "ios" ? "Menlo" : "monospace",
  },
  bottomBar: {
    backgroundColor: Colors.dark.backgroundDefault,
    paddingTop: Spacing.md,
    paddingHorizontal: Spacing.lg,
    borderTopWidth: 1,
    borderTopColor: Colors.dark.border,
  },
  confirmButton: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: Spacing.sm,
    backgroundColor: Colors.dark.accent,
    paddingVertical: Spacing.md,
    borderRadius: BorderRadius.sm,
  },
  confirmButtonDisabled: {
    opacity: 0.5,
  },
  confirmButtonPressed: {
    opacity: 0.8,
  },
  confirmButtonText: {
    ...Typography.body,
    color: "#FFFFFF",
    fontWeight: "600",
  },
  formScrollView: {
    flex: 1,
  },
  formContent: {
    padding: Spacing.lg,
  },
  editLocationButton: {
    flexDirection: "row",
    alignItems: "center",
    gap: Spacing.sm,
    backgroundColor: Colors.dark.backgroundDefault,
    padding: Spacing.md,
    borderRadius: BorderRadius.sm,
    marginBottom: Spacing.lg,
  },
  editLocationText: {
    ...Typography.body,
    color: Colors.dark.text,
    flex: 1,
  },
  label: {
    ...Typography.caption,
    color: Colors.dark.textSecondary,
    textTransform: "uppercase",
    letterSpacing: 1,
    marginBottom: Spacing.xs,
    marginTop: Spacing.md,
  },
  input: {
    backgroundColor: Colors.dark.backgroundDefault,
    borderRadius: BorderRadius.sm,
    padding: Spacing.md,
    ...Typography.body,
    color: Colors.dark.text,
    borderWidth: 1,
    borderColor: Colors.dark.border,
  },
  textArea: {
    minHeight: 60,
    textAlignVertical: "top",
  },
  largeTextArea: {
    minHeight: 150,
    textAlignVertical: "top",
  },
  categoryPicker: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: Spacing.sm,
  },
  categoryOption: {
    paddingHorizontal: Spacing.md,
    paddingVertical: Spacing.sm,
    borderRadius: BorderRadius.sm,
    backgroundColor: Colors.dark.backgroundDefault,
    borderWidth: 1,
    borderColor: Colors.dark.border,
  },
  categoryOptionSelected: {
    backgroundColor: Colors.dark.accent + "30",
    borderColor: Colors.dark.accent,
  },
  categoryOptionText: {
    ...Typography.body,
    color: Colors.dark.textSecondary,
  },
  categoryOptionTextSelected: {
    color: Colors.dark.accent,
    fontWeight: "600",
  },
  submitButton: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: Spacing.sm,
    backgroundColor: Colors.dark.accent,
    paddingVertical: Spacing.md,
    borderRadius: BorderRadius.sm,
  },
  submitButtonDisabled: {
    opacity: 0.7,
  },
  submitButtonPressed: {
    opacity: 0.8,
  },
  submitButtonText: {
    ...Typography.body,
    color: "#FFFFFF",
    fontWeight: "600",
  },
  centeredContainer: {
    justifyContent: "center",
    alignItems: "center",
    paddingHorizontal: Spacing.xl,
  },
  permissionTitle: {
    ...Typography.title2,
    color: Colors.dark.text,
    marginTop: Spacing.lg,
    marginBottom: Spacing.sm,
    textAlign: "center",
  },
  permissionText: {
    ...Typography.body,
    color: Colors.dark.textSecondary,
    textAlign: "center",
    marginTop: Spacing.sm,
  },
  permissionButton: {
    flexDirection: "row",
    alignItems: "center",
    gap: Spacing.sm,
    backgroundColor: Colors.dark.accent,
    paddingVertical: Spacing.md,
    paddingHorizontal: Spacing.xl,
    borderRadius: BorderRadius.sm,
    marginTop: Spacing.xl,
  },
  permissionButtonPressed: {
    opacity: 0.8,
  },
  permissionButtonText: {
    ...Typography.body,
    color: "#FFFFFF",
    fontWeight: "600",
  },
  skipButton: {
    marginTop: Spacing.lg,
    padding: Spacing.md,
  },
  skipButtonPressed: {
    opacity: 0.6,
  },
  skipButtonText: {
    ...Typography.body,
    color: Colors.dark.textSecondary,
    textDecorationLine: "underline",
  },
  defaultLocationNotice: {
    flexDirection: "row",
    alignItems: "center",
    gap: Spacing.sm,
    backgroundColor: Colors.dark.accent + "20",
    padding: Spacing.md,
    borderRadius: BorderRadius.sm,
    marginBottom: Spacing.md,
  },
  defaultLocationText: {
    ...Typography.body,
    color: Colors.dark.textSecondary,
    flex: 1,
  },
});
