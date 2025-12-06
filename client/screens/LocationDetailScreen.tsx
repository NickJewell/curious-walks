import React from "react";
import {
  View,
  StyleSheet,
  ScrollView,
  Text,
  Pressable,
  Linking,
  Platform,
  Dimensions,
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { useNavigation, useRoute, RouteProp } from "@react-navigation/native";
import { Feather } from "@expo/vector-icons";
import SafeMapView, { Marker, PROVIDER_DEFAULT, isMapAvailable } from "@/components/SafeMapView";
import { Colors, Spacing, BorderRadius, Typography, CategoryColors, Fonts } from "@/constants/theme";
import type { RootStackParamList } from "@/navigation/RootStackNavigator";

const { width } = Dimensions.get("window");

export default function LocationDetailScreen() {
  const insets = useSafeAreaInsets();
  const navigation = useNavigation();
  const route = useRoute<RouteProp<RootStackParamList, "LocationDetail">>();
  const { location, category } = route.params;

  const categoryColor = category ? CategoryColors[category.slug] || Colors.dark.accent : Colors.dark.accent;

  const handleGetDirections = () => {
    const scheme = Platform.select({
      ios: "maps:",
      android: "geo:",
      default: "https://maps.google.com/maps?",
    });
    const url = Platform.select({
      ios: `${scheme}?daddr=${location.latitude},${location.longitude}`,
      android: `${scheme}${location.latitude},${location.longitude}`,
      default: `${scheme}daddr=${location.latitude},${location.longitude}`,
    });
    Linking.openURL(url);
  };

  const handleShare = async () => {
    if (Platform.OS === "web") {
      return;
    }
    try {
      const { Share } = await import("react-native");
      await Share.share({
        title: location.name,
        message: `Check out ${location.name} on Lantern: ${location.description}`,
      });
    } catch (error) {
      console.log("Share error:", error);
    }
  };

  return (
    <View style={[styles.container, { backgroundColor: Colors.dark.backgroundRoot }]}>
      <View style={[styles.header, { paddingTop: insets.top + Spacing.md }]}>
        <Pressable
          style={({ pressed }) => [styles.headerButton, pressed && styles.headerButtonPressed]}
          onPress={() => navigation.goBack()}
        >
          <Feather name="x" size={24} color={Colors.dark.text} />
        </Pressable>
        <Pressable
          style={({ pressed }) => [styles.headerButton, pressed && styles.headerButtonPressed]}
          onPress={handleShare}
        >
          <Feather name="share" size={24} color={Colors.dark.text} />
        </Pressable>
      </View>

      <ScrollView
        style={styles.scrollView}
        contentContainerStyle={[styles.scrollContent, { paddingBottom: insets.bottom + 100 }]}
        showsVerticalScrollIndicator={false}
      >
        <View style={styles.mapContainer}>
          <SafeMapView
            style={styles.map}
            provider={PROVIDER_DEFAULT}
            initialRegion={{
              latitude: location.latitude,
              longitude: location.longitude,
              latitudeDelta: 0.005,
              longitudeDelta: 0.005,
            }}
            scrollEnabled={false}
            zoomEnabled={false}
            pitchEnabled={false}
            rotateEnabled={false}
            userInterfaceStyle="dark"
          >
            {isMapAvailable && Marker ? (
              <Marker
                coordinate={{
                  latitude: location.latitude,
                  longitude: location.longitude,
                }}
              >
                <View style={[styles.marker, { backgroundColor: categoryColor }]}>
                  <Feather name={(category?.iconName as any) || "map-pin"} size={16} color="#FFFFFF" />
                </View>
              </Marker>
            ) : null}
          </SafeMapView>
          <View style={styles.mapGradient} />
        </View>

        <View style={styles.content}>
          <View style={[styles.categoryBadge, { backgroundColor: categoryColor }]}>
            <Feather name={(category?.iconName as any) || "map-pin"} size={14} color="#FFFFFF" />
            <Text style={styles.categoryText}>{category?.name || "Unknown"}</Text>
          </View>

          <Text style={styles.title}>{location.name}</Text>
          
          {location.address ? (
            <View style={styles.addressContainer}>
              <Feather name="map-pin" size={14} color={Colors.dark.textSecondary} />
              <Text style={styles.address}>{location.address}</Text>
            </View>
          ) : null}

          <Text style={styles.description}>{location.description}</Text>

          <View style={styles.divider} />

          <Text style={styles.storyTitle}>The Story</Text>
          <Text style={styles.story}>{location.story}</Text>

          {location.sourceAttribution ? (
            <View style={styles.attribution}>
              <Feather name="book-open" size={14} color={Colors.dark.inactive} />
              <Text style={styles.attributionText}>Source: {location.sourceAttribution}</Text>
            </View>
          ) : null}
        </View>
      </ScrollView>

      <View style={[styles.footer, { paddingBottom: insets.bottom + Spacing.lg }]}>
        <Pressable
          style={({ pressed }) => [styles.directionsButton, pressed && styles.directionsButtonPressed]}
          onPress={handleGetDirections}
        >
          <Feather name="navigation" size={20} color="#FFFFFF" />
          <Text style={styles.directionsText}>Get Directions</Text>
        </Pressable>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
  },
  header: {
    position: "absolute",
    top: 0,
    left: 0,
    right: 0,
    flexDirection: "row",
    justifyContent: "space-between",
    paddingHorizontal: Spacing.lg,
    zIndex: 10,
  },
  headerButton: {
    width: 40,
    height: 40,
    borderRadius: 20,
    backgroundColor: "rgba(10, 14, 20, 0.8)",
    justifyContent: "center",
    alignItems: "center",
  },
  headerButtonPressed: {
    opacity: 0.6,
  },
  scrollView: {
    flex: 1,
  },
  scrollContent: {
    flexGrow: 1,
  },
  mapContainer: {
    height: 250,
    position: "relative",
  },
  map: {
    flex: 1,
  },
  mapGradient: {
    position: "absolute",
    bottom: 0,
    left: 0,
    right: 0,
    height: 60,
    backgroundColor: "transparent",
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
  content: {
    paddingHorizontal: Spacing.lg,
    paddingTop: Spacing.lg,
  },
  categoryBadge: {
    flexDirection: "row",
    alignItems: "center",
    alignSelf: "flex-start",
    paddingHorizontal: Spacing.md,
    paddingVertical: Spacing.xs,
    borderRadius: BorderRadius.full,
    gap: Spacing.xs,
    marginBottom: Spacing.md,
  },
  categoryText: {
    ...Typography.caption,
    color: "#FFFFFF",
    fontWeight: "600",
  },
  title: {
    ...Typography.h2,
    color: Colors.dark.text,
    marginBottom: Spacing.sm,
  },
  addressContainer: {
    flexDirection: "row",
    alignItems: "center",
    gap: Spacing.xs,
    marginBottom: Spacing.lg,
  },
  address: {
    ...Typography.small,
    color: Colors.dark.textSecondary,
    flex: 1,
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
  storyTitle: {
    ...Typography.headline,
    color: Colors.dark.textAccent,
    marginBottom: Spacing.md,
  },
  story: {
    ...Typography.body,
    color: Colors.dark.text,
    fontFamily: Fonts?.serif,
    lineHeight: 28,
    marginBottom: Spacing.xl,
  },
  attribution: {
    flexDirection: "row",
    alignItems: "center",
    gap: Spacing.sm,
    paddingTop: Spacing.lg,
    borderTopWidth: 1,
    borderTopColor: Colors.dark.border,
  },
  attributionText: {
    ...Typography.caption,
    color: Colors.dark.inactive,
    fontStyle: "italic",
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
  directionsButton: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: Colors.dark.accent,
    height: Spacing.buttonHeight,
    borderRadius: BorderRadius.sm,
    gap: Spacing.sm,
  },
  directionsButtonPressed: {
    opacity: 0.6,
  },
  directionsText: {
    ...Typography.headline,
    color: "#FFFFFF",
  },
});
