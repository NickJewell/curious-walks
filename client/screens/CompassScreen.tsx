import React, { useState, useEffect, useRef } from "react";
import {
  View,
  StyleSheet,
  Text,
  Pressable,
  Platform,
  Animated,
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { BlurView } from "expo-blur";
import { Feather } from "@expo/vector-icons";
import * as Location from "expo-location";
import * as Haptics from "expo-haptics";
import { Magnetometer } from "expo-sensors";
import { getGreatCircleBearing, getDistance } from "geolib";
import { Colors, Spacing, BorderRadius, Typography } from "@/constants/theme";
import { useHunt } from "@/contexts/HuntContext";
import type { NativeStackNavigationProp } from "@react-navigation/native-stack";
import type { RootStackParamList } from "@/navigation/RootStackNavigator";

interface Props {
  navigation: NativeStackNavigationProp<RootStackParamList, "Compass">;
}

const ARRIVAL_THRESHOLD = 10;
const LOW_PASS_FACTOR = 0.15;

function normalizeAngle(angle: number): number {
  return ((angle % 360) + 360) % 360;
}

function circularMean(current: number, target: number, factor: number): number {
  const currentRad = (current * Math.PI) / 180;
  const targetRad = (target * Math.PI) / 180;
  
  const currentX = Math.cos(currentRad);
  const currentY = Math.sin(currentRad);
  const targetX = Math.cos(targetRad);
  const targetY = Math.sin(targetRad);
  
  const newX = currentX * (1 - factor) + targetX * factor;
  const newY = currentY * (1 - factor) + targetY * factor;
  
  let result = (Math.atan2(newY, newX) * 180) / Math.PI;
  return normalizeAngle(result);
}

export default function CompassScreen({ navigation }: Props) {
  const insets = useSafeAreaInsets();
  const { activeTarget, setActiveTarget } = useHunt();

  const [userLocation, setUserLocation] = useState<{ latitude: number; longitude: number } | null>(null);
  const [distance, setDistance] = useState<number | null>(null);
  const [hasArrived, setHasArrived] = useState(false);
  const [magnetometerAvailable, setMagnetometerAvailable] = useState(true);
  const [heading, setHeading] = useState(0);

  const arrowRotation = useRef(new Animated.Value(0)).current;
  const filteredHeading = useRef(0);
  const lastHeadingRef = useRef(0);

  useEffect(() => {
    setHasArrived(false);
    setDistance(null);
    setUserLocation(null);
    arrowRotation.setValue(0);
    filteredHeading.current = 0;
    lastHeadingRef.current = 0;
  }, [activeTarget?.id]);

  useEffect(() => {
    let locationSub: Location.LocationSubscription | null = null;
    let magnetometerSub: { remove: () => void } | null = null;

    const setup = async () => {
      const { status } = await Location.requestForegroundPermissionsAsync();
      if (status !== "granted") return;

      locationSub = await Location.watchPositionAsync(
        {
          accuracy: Location.Accuracy.High,
          timeInterval: 1000,
          distanceInterval: 1,
        },
        (loc) => {
          const coords = {
            latitude: loc.coords.latitude,
            longitude: loc.coords.longitude,
          };
          setUserLocation(coords);

          if (activeTarget) {
            const dist = getDistance(
              { latitude: coords.latitude, longitude: coords.longitude },
              { latitude: activeTarget.latitude, longitude: activeTarget.longitude }
            );
            setDistance(dist);

            if (dist < ARRIVAL_THRESHOLD && !hasArrived) {
              setHasArrived(true);
              Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
            }
          }
        }
      );

      const available = await Magnetometer.isAvailableAsync();
      setMagnetometerAvailable(available);

      if (available) {
        Magnetometer.setUpdateInterval(100);
        magnetometerSub = Magnetometer.addListener((data: { x: number; y: number; z: number }) => {
          const angle = Math.atan2(data.y, data.x) * (180 / Math.PI);
          const normalizedAngle = normalizeAngle(angle);
          
          filteredHeading.current = circularMean(
            filteredHeading.current,
            normalizedAngle,
            LOW_PASS_FACTOR
          );
          
          setHeading(filteredHeading.current);
        });
      }
    };

    setup();

    return () => {
      if (locationSub) locationSub.remove();
      if (magnetometerSub) magnetometerSub.remove();
    };
  }, [activeTarget, hasArrived]);

  useEffect(() => {
    if (!userLocation || !activeTarget) return;

    const bearing = getGreatCircleBearing(
      { latitude: userLocation.latitude, longitude: userLocation.longitude },
      { latitude: activeTarget.latitude, longitude: activeTarget.longitude }
    );

    const rotation = bearing - heading;
    const normalizedRotation = ((rotation + 360) % 360);

    let diff = normalizedRotation - lastHeadingRef.current;
    if (diff > 180) diff -= 360;
    if (diff < -180) diff += 360;
    
    const newValue = lastHeadingRef.current + diff;
    lastHeadingRef.current = newValue;

    Animated.spring(arrowRotation, {
      toValue: newValue,
      useNativeDriver: true,
      tension: 40,
      friction: 7,
    }).start();
  }, [userLocation, activeTarget, heading]);

  const handleViewOnMap = () => {
    navigation.navigate("Main");
  };

  const handleStopHunt = () => {
    setActiveTarget(null);
    navigation.navigate("Main");
  };

  const formatDistance = (meters: number): string => {
    if (meters >= 1000) {
      return `${(meters / 1000).toFixed(1)}km`;
    }
    return `${Math.round(meters)}m`;
  };

  if (!activeTarget) {
    return (
      <View style={[styles.container, { paddingTop: insets.top }]}>
        <View style={styles.noTargetContainer}>
          <Feather name="compass" size={64} color={Colors.dark.textSecondary} />
          <Text style={styles.noTargetText}>No active hunt</Text>
          <Pressable style={styles.backButton} onPress={() => navigation.navigate("Main")}>
            <Text style={styles.backButtonText}>Return to Map</Text>
          </Pressable>
        </View>
      </View>
    );
  }

  if (!magnetometerAvailable && Platform.OS !== "web") {
    return (
      <View style={[styles.container, { paddingTop: insets.top }]}>
        <View style={styles.noTargetContainer}>
          <Feather name="alert-circle" size={64} color={Colors.dark.textSecondary} />
          <Text style={styles.noTargetText}>Compass not supported on this device</Text>
          <Pressable style={styles.backButton} onPress={() => navigation.navigate("Main")}>
            <Text style={styles.backButtonText}>Return to Map</Text>
          </Pressable>
        </View>
      </View>
    );
  }

  if (hasArrived) {
    return (
      <View style={[styles.container, { paddingTop: insets.top }]}>
        <View style={styles.arrivedContainer}>
          <View style={styles.arrivedIcon}>
            <Feather name="check-circle" size={80} color="#4CAF50" />
          </View>
          <Text style={styles.arrivedTitle}>You Arrived!</Text>
          <Text style={styles.arrivedSubtitle}>{activeTarget.name}</Text>
          <Text style={styles.arrivedDescription} numberOfLines={4}>
            {activeTarget.description}
          </Text>
          <Pressable
            style={[styles.actionButton, styles.primaryButton]}
            onPress={handleStopHunt}
          >
            <Text style={styles.actionButtonText}>Complete Hunt</Text>
          </Pressable>
        </View>
      </View>
    );
  }

  const spin = arrowRotation.interpolate({
    inputRange: [-360, 0, 360],
    outputRange: ["-360deg", "0deg", "360deg"],
  });

  return (
    <View style={[styles.container, { paddingTop: insets.top }]}>
      <View style={styles.targetInfo}>
        <View style={styles.targetIcon}>
          <Feather name="map-pin" size={24} color={Colors.dark.text} />
        </View>
        <View style={styles.targetTextContainer}>
          <Text style={styles.targetName}>{activeTarget.name}</Text>
          <Text style={styles.targetDescription} numberOfLines={2}>
            {activeTarget.description}
          </Text>
        </View>
      </View>

      <View style={styles.compassContainer}>
        <View style={styles.compassRing}>
          <Animated.View style={[styles.arrowContainer, { transform: [{ rotate: spin }] }]}>
            <Feather name="navigation" size={120} color="#D4AF7A" />
          </Animated.View>
        </View>
        
        <View style={styles.distanceContainer}>
          <Text style={styles.distanceValue}>
            {distance !== null ? formatDistance(distance) : "..."}
          </Text>
          <Text style={styles.distanceLabel}>to destination</Text>
        </View>
      </View>

      <View style={[styles.controls, { paddingBottom: insets.bottom + Spacing.lg }]}>
        <Pressable
          style={({ pressed }) => [
            styles.controlButton,
            pressed && styles.controlButtonPressed,
          ]}
          onPress={handleViewOnMap}
        >
          <BlurView intensity={80} tint="dark" style={StyleSheet.absoluteFill} />
          <Feather name="map" size={20} color={Colors.dark.text} />
          <Text style={styles.controlButtonText}>View on Map</Text>
        </Pressable>

        <Pressable
          style={({ pressed }) => [
            styles.controlButton,
            styles.stopButton,
            pressed && styles.controlButtonPressed,
          ]}
          onPress={handleStopHunt}
        >
          <Feather name="x" size={20} color="#FF6B6B" />
          <Text style={[styles.controlButtonText, styles.stopButtonText]}>Stop Hunt</Text>
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
  noTargetContainer: {
    flex: 1,
    justifyContent: "center",
    alignItems: "center",
    padding: Spacing.xl,
  },
  noTargetText: {
    color: Colors.dark.textSecondary,
    ...Typography.headline,
    marginTop: Spacing.lg,
    marginBottom: Spacing.xl,
  },
  backButton: {
    paddingHorizontal: Spacing.xl,
    paddingVertical: Spacing.md,
    backgroundColor: Colors.dark.accent,
    borderRadius: BorderRadius.md,
  },
  backButtonText: {
    color: Colors.dark.text,
    ...Typography.body,
    fontWeight: "600",
  },
  targetInfo: {
    flexDirection: "row",
    alignItems: "center",
    padding: Spacing.lg,
    marginHorizontal: Spacing.lg,
    marginTop: Spacing.lg,
    backgroundColor: Colors.dark.backgroundSecondary,
    borderRadius: BorderRadius.md,
  },
  targetIcon: {
    width: 48,
    height: 48,
    borderRadius: 24,
    backgroundColor: Colors.dark.accent,
    justifyContent: "center",
    alignItems: "center",
    marginRight: Spacing.md,
  },
  targetTextContainer: {
    flex: 1,
  },
  targetName: {
    color: Colors.dark.text,
    ...Typography.headline,
    marginBottom: Spacing.xs,
  },
  targetDescription: {
    color: Colors.dark.textSecondary,
    ...Typography.small,
  },
  compassContainer: {
    flex: 1,
    justifyContent: "center",
    alignItems: "center",
  },
  compassRing: {
    width: 280,
    height: 280,
    borderRadius: 140,
    borderWidth: 3,
    borderColor: Colors.dark.border,
    justifyContent: "center",
    alignItems: "center",
    backgroundColor: Colors.dark.backgroundSecondary,
  },
  arrowContainer: {
    justifyContent: "center",
    alignItems: "center",
  },
  distanceContainer: {
    marginTop: Spacing["3xl"],
    alignItems: "center",
  },
  distanceValue: {
    color: Colors.dark.textAccent,
    fontSize: 64,
    fontWeight: "700",
    letterSpacing: -2,
  },
  distanceLabel: {
    color: Colors.dark.textSecondary,
    ...Typography.body,
    marginTop: Spacing.xs,
  },
  controls: {
    flexDirection: "row",
    gap: Spacing.md,
    paddingHorizontal: Spacing.lg,
    paddingTop: Spacing.lg,
  },
  controlButton: {
    flex: 1,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    paddingVertical: Spacing.lg,
    borderRadius: BorderRadius.md,
    overflow: "hidden",
    backgroundColor: Colors.dark.backgroundSecondary,
    gap: Spacing.sm,
  },
  controlButtonPressed: {
    opacity: 0.7,
  },
  controlButtonText: {
    color: Colors.dark.text,
    ...Typography.body,
    fontWeight: "600",
  },
  stopButton: {
    backgroundColor: "rgba(255, 107, 107, 0.15)",
  },
  stopButtonText: {
    color: "#FF6B6B",
  },
  arrivedContainer: {
    flex: 1,
    justifyContent: "center",
    alignItems: "center",
    padding: Spacing.xl,
  },
  arrivedIcon: {
    marginBottom: Spacing.xl,
  },
  arrivedTitle: {
    color: "#4CAF50",
    fontSize: 36,
    fontWeight: "700",
    marginBottom: Spacing.sm,
  },
  arrivedSubtitle: {
    color: Colors.dark.text,
    ...Typography.headline,
    marginBottom: Spacing.md,
    textAlign: "center",
  },
  arrivedDescription: {
    color: Colors.dark.textSecondary,
    ...Typography.body,
    textAlign: "center",
    marginBottom: Spacing["3xl"],
    paddingHorizontal: Spacing.lg,
  },
  actionButton: {
    paddingHorizontal: Spacing["3xl"],
    paddingVertical: Spacing.lg,
    borderRadius: BorderRadius.md,
  },
  primaryButton: {
    backgroundColor: Colors.dark.accent,
  },
  actionButtonText: {
    color: Colors.dark.text,
    ...Typography.headline,
    fontWeight: "600",
  },
});
