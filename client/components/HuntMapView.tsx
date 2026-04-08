import React, { useEffect, useRef } from "react";
import { View, Text, StyleSheet } from "react-native";
import Animated, {
  useSharedValue,
  useAnimatedStyle,
  withRepeat,
  withTiming,
  Easing,
} from "react-native-reanimated";
import SafeMapView, { Marker, PROVIDER_GOOGLE, isMapAvailable } from "@/components/SafeMapView";
import { darkMapStyle, lightMapStyle } from "@/constants/mapStyle";
import { useTheme } from "@/hooks/useTheme";
import { getGreatCircleBearing } from "geolib";
import { Spacing } from "@/constants/theme";

const PULSE_THRESHOLD = 1000;

function getPulseDuration(distance: number): number {
  if (distance <= 50) return 400;
  if (distance >= 1000) return 2000;
  const t = (distance - 50) / 950;
  return Math.round(400 + t * 1600);
}

function getPulseTier(distance: number): number {
  if (distance > 1000) return 0;
  if (distance > 500) return 1;
  if (distance > 150) return 2;
  if (distance > 50) return 3;
  return 4;
}

function bearingToCardinal(bearing: number): string {
  const dirs = ["N", "NE", "E", "SE", "S", "SW", "W", "NW"];
  const index = Math.round((((bearing % 360) + 360) % 360) / 45) % 8;
  return dirs[index];
}

function formatDistance(distance: number): string {
  if (distance >= 1000) return `${(distance / 1000).toFixed(1)} km`;
  return `${Math.round(distance)} m`;
}

interface PulseRingMarkerProps {
  coordinate: { latitude: number; longitude: number };
  duration: number;
}

function PulseRingMarker({ coordinate, duration }: PulseRingMarkerProps) {
  const pulseScale = useSharedValue(1);
  const pulseOpacity = useSharedValue(0.75);

  useEffect(() => {
    pulseScale.value = withRepeat(
      withTiming(2.8, { duration, easing: Easing.out(Easing.ease) }),
      -1,
      false
    );
    pulseOpacity.value = withRepeat(
      withTiming(0, { duration, easing: Easing.out(Easing.ease) }),
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
      anchor={{ x: 0.5, y: 0.5 }}
      tracksViewChanges={false}
      zIndex={9}
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
    width: 34,
    height: 34,
    borderRadius: 17,
    borderWidth: 2.5,
    borderColor: "#D4AF7A",
    backgroundColor: "transparent",
  },
});

interface HuntMapViewProps {
  userLocation: { latitude: number; longitude: number } | null;
  target: { latitude: number; longitude: number; name: string };
  distance: number | null;
}

export default function HuntMapView({ userLocation, target, distance }: HuntMapViewProps) {
  const { isDark } = useTheme();
  const mapRef = useRef<any>(null);
  const fittedRef = useRef(false);

  const shouldPulse = distance !== null && distance < PULSE_THRESHOLD;
  const pulseTier = distance !== null ? getPulseTier(distance) : 0;
  const pulseDuration = distance !== null ? getPulseDuration(distance) : 2000;

  useEffect(() => {
    if (userLocation && mapRef.current && !fittedRef.current) {
      fittedRef.current = true;
      setTimeout(() => {
        mapRef.current?.fitToCoordinates(
          [
            { latitude: userLocation.latitude, longitude: userLocation.longitude },
            { latitude: target.latitude, longitude: target.longitude },
          ],
          {
            edgePadding: { top: 100, right: 80, bottom: 220, left: 80 },
            animated: true,
          }
        );
      }, 600);
    }
  }, [userLocation]);

  const bearing = userLocation
    ? getGreatCircleBearing(
        { latitude: userLocation.latitude, longitude: userLocation.longitude },
        { latitude: target.latitude, longitude: target.longitude }
      )
    : null;
  const cardinal = bearing !== null ? bearingToCardinal(bearing) : null;

  if (!isMapAvailable) {
    return (
      <View style={styles.fallback}>
        <Text style={styles.fallbackText}>Map not available on this platform</Text>
      </View>
    );
  }

  return (
    <View style={styles.container}>
      <SafeMapView
        ref={mapRef}
        style={styles.map}
        provider={PROVIDER_GOOGLE}
        customMapStyle={isDark ? darkMapStyle : lightMapStyle}
        showsUserLocation
        showsMyLocationButton={false}
        showsCompass={false}
        showsScale={false}
        initialRegion={{
          latitude: target.latitude,
          longitude: target.longitude,
          latitudeDelta: 0.012,
          longitudeDelta: 0.012,
        }}
      >
        {shouldPulse ? (
          <PulseRingMarker
            key={`pulse-tier-${pulseTier}`}
            coordinate={{ latitude: target.latitude, longitude: target.longitude }}
            duration={pulseDuration}
          />
        ) : null}

        <Marker
          coordinate={{ latitude: target.latitude, longitude: target.longitude }}
          anchor={{ x: 0.5, y: 0.5 }}
          tracksViewChanges={false}
          zIndex={10}
        >
          <View style={styles.markerContainer}>
            <View style={styles.targetDot} />
          </View>
        </Marker>
      </SafeMapView>

      <View style={styles.infoOverlay}>
        <Text style={styles.infoText}>
          {distance !== null
            ? `${formatDistance(distance)}${cardinal ? `  ·  ${cardinal}` : ""}`
            : "Locating..."}
        </Text>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
  },
  map: {
    flex: 1,
  },
  fallback: {
    flex: 1,
    justifyContent: "center",
    alignItems: "center",
    backgroundColor: "#000",
  },
  fallbackText: {
    color: "#888",
    fontSize: 16,
  },
  markerContainer: {
    width: 40,
    height: 40,
    justifyContent: "center",
    alignItems: "center",
  },
  targetDot: {
    width: 20,
    height: 20,
    borderRadius: 10,
    backgroundColor: "#D4AF7A",
    borderWidth: 2.5,
    borderColor: "#FFFFFF",
  },
  infoOverlay: {
    position: "absolute",
    bottom: Spacing.xl,
    alignSelf: "center",
    backgroundColor: "rgba(0,0,0,0.78)",
    borderRadius: 28,
    paddingHorizontal: Spacing["3xl"],
    paddingVertical: Spacing.md,
    borderWidth: 1,
    borderColor: "rgba(212,175,122,0.35)",
  },
  infoText: {
    color: "#FFFFFF",
    fontSize: 18,
    fontWeight: "600",
    letterSpacing: 0.5,
  },
});
