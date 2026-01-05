import React, { useState, useEffect, useRef } from "react";
import {
  View,
  StyleSheet,
  Text,
  Pressable,
  Platform,
  Animated,
  Modal,
  ActivityIndicator,
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { BlurView } from "expo-blur";
import { Feather } from "@expo/vector-icons";
import * as Location from "expo-location";
import * as Haptics from "expo-haptics";
import { Magnetometer } from "expo-sensors";
import { getGreatCircleBearing, getDistance } from "geolib";
import ConfettiCannon from "react-native-confetti-cannon";
import { Colors, Spacing, BorderRadius, Typography } from "@/constants/theme";
import { useHunt } from "@/contexts/HuntContext";
import { useAuth } from "@/contexts/AuthContext";
import { checkIn, checkAndAwardBadges, hasCheckedIn, uncheckIn, type UserBadge } from "@/lib/checkins";
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

const CHECKIN_THRESHOLD = 20;

export default function CompassScreen({ navigation }: Props) {
  const insets = useSafeAreaInsets();
  const { activeTarget, setActiveTarget } = useHunt();
  const { user, isGuest } = useAuth();

  const [userLocation, setUserLocation] = useState<{ latitude: number; longitude: number } | null>(null);
  const [distance, setDistance] = useState<number | null>(null);
  const [hasArrived, setHasArrived] = useState(false);
  const [magnetometerAvailable, setMagnetometerAvailable] = useState(true);
  const [heading, setHeading] = useState(0);
  
  const [canCheckIn, setCanCheckIn] = useState(false);
  const [alreadyCheckedIn, setAlreadyCheckedIn] = useState(false);
  const [checkingIn, setCheckingIn] = useState(false);
  const [showConfetti, setShowConfetti] = useState(false);
  const [newBadge, setNewBadge] = useState<UserBadge | null>(null);
  const [showBadgeModal, setShowBadgeModal] = useState(false);
  const [checkingOut, setCheckingOut] = useState(false);

  const arrowRotation = useRef(new Animated.Value(0)).current;
  const filteredHeading = useRef(0);
  const lastHeadingRef = useRef(0);
  const confettiRef = useRef<ConfettiCannon>(null);

  useEffect(() => {
    setHasArrived(false);
    setDistance(null);
    setUserLocation(null);
    setCanCheckIn(false);
    setAlreadyCheckedIn(false);
    setShowConfetti(false);
    arrowRotation.setValue(0);
    filteredHeading.current = 0;
    lastHeadingRef.current = 0;
    
    if (activeTarget && user && !isGuest) {
      hasCheckedIn(user.id, activeTarget.id).then(setAlreadyCheckedIn);
    }
  }, [activeTarget?.id, user?.id]);

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
            console.log('DEBUG Compass: User at', coords.latitude, coords.longitude);
            console.log('DEBUG Compass: Target at', activeTarget.latitude, activeTarget.longitude);
            
            const dist = getDistance(
              { latitude: coords.latitude, longitude: coords.longitude },
              { latitude: activeTarget.latitude, longitude: activeTarget.longitude }
            );
            console.log('DEBUG Compass: Distance =', dist, 'm, hasArrived =', hasArrived, 'canCheckIn =', dist < CHECKIN_THRESHOLD);
            
            setDistance(dist);
            setCanCheckIn(dist < CHECKIN_THRESHOLD);

            if (dist < ARRIVAL_THRESHOLD && !hasArrived) {
              console.log('DEBUG Compass: TRIGGERING ARRIVAL!');
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

  const handleCheckIn = async () => {
    if (!activeTarget || !user || isGuest || checkingIn || alreadyCheckedIn || !canCheckIn) return;
    
    setCheckingIn(true);
    
    console.log('DEBUG: Attempting check-in with:', {
      userId: user.id,
      placeId: activeTarget.id,
      placeName: activeTarget.name,
      lat: activeTarget.latitude,
      lon: activeTarget.longitude
    });
    
    try {
      const result = await checkIn(
        user.id,
        activeTarget.id,
        activeTarget.name,
        activeTarget.latitude,
        activeTarget.longitude
      );
      
      console.log('DEBUG: Check-in result:', result);
      
      if (result.success && result.isNewCheckin) {
        setShowConfetti(true);
        setAlreadyCheckedIn(true);
        Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
        
        const newBadges = await checkAndAwardBadges(user.id);
        if (newBadges.length > 0) {
          setNewBadge(newBadges[0]);
          setTimeout(() => setShowBadgeModal(true), 1500);
        }
      } else if (result.success && !result.isNewCheckin) {
        setAlreadyCheckedIn(true);
      }
    } catch (error) {
      console.error('Check-in error:', error);
    } finally {
      setCheckingIn(false);
    }
  };

  const handleCheckOut = async () => {
    if (!activeTarget || !user || isGuest || checkingOut) return;
    
    setCheckingOut(true);
    try {
      const result = await uncheckIn(user.id, activeTarget.id);
      if (result.success) {
        setAlreadyCheckedIn(false);
        Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
      }
    } catch (error) {
      console.error('Check-out error:', error);
    } finally {
      setCheckingOut(false);
    }
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
        {showConfetti ? (
          <ConfettiCannon
            ref={confettiRef}
            count={200}
            origin={{ x: -10, y: 0 }}
            autoStart={true}
            fadeOut={true}
          />
        ) : null}
        
        <View style={styles.arrivedContainer}>
          <View style={styles.arrivedIcon}>
            <Feather 
              name={alreadyCheckedIn ? "check-circle" : "map-pin"} 
              size={80} 
              color={alreadyCheckedIn ? "#4CAF50" : "#D4AF7A"} 
            />
          </View>
          <Text style={styles.arrivedTitle}>
            {alreadyCheckedIn ? "Checked In!" : "You Arrived!"}
          </Text>
          <Text style={styles.arrivedSubtitle}>{activeTarget.name}</Text>
          <Text style={styles.arrivedDescription} numberOfLines={4}>
            {activeTarget.description}
          </Text>
          
          {!isGuest && !alreadyCheckedIn && canCheckIn ? (
            <Pressable
              style={[styles.actionButton, styles.checkInButton]}
              onPress={handleCheckIn}
              disabled={checkingIn}
            >
              {checkingIn ? (
                <ActivityIndicator size="small" color="#FFFFFF" />
              ) : (
                <>
                  <Feather name="check" size={20} color="#FFFFFF" />
                  <Text style={styles.checkInButtonText}>Check In Now</Text>
                </>
              )}
            </Pressable>
          ) : !isGuest && !alreadyCheckedIn && !canCheckIn ? (
            <View style={[styles.actionButton, styles.disabledCheckInButton]}>
              <Feather name="map-pin" size={20} color={Colors.dark.textSecondary} />
              <Text style={styles.disabledCheckInText}>Get closer to check in ({CHECKIN_THRESHOLD}m)</Text>
            </View>
          ) : null}
          
          <Pressable
            style={[styles.actionButton, styles.primaryButton]}
            onPress={handleStopHunt}
          >
            <Text style={styles.actionButtonText}>
              {alreadyCheckedIn ? "Done" : "Complete Hunt"}
            </Text>
          </Pressable>
          
          {!isGuest && alreadyCheckedIn ? (
            <Pressable
              style={styles.checkOutButton}
              onPress={handleCheckOut}
              disabled={checkingOut}
            >
              {checkingOut ? (
                <ActivityIndicator size="small" color="#E74C3C" />
              ) : (
                <>
                  <Feather name="x-circle" size={16} color="#E74C3C" />
                  <Text style={styles.checkOutText}>Remove Check-in</Text>
                </>
              )}
            </Pressable>
          ) : null}
        </View>
        
        <Modal
          visible={showBadgeModal}
          transparent
          animationType="fade"
          onRequestClose={() => setShowBadgeModal(false)}
        >
          <View style={styles.badgeModalOverlay}>
            <Pressable 
              style={StyleSheet.absoluteFill}
              onPress={() => setShowBadgeModal(false)}
            />
            <View style={styles.badgeModalContent}>
              <BlurView intensity={80} tint="dark" style={StyleSheet.absoluteFill} />
              <View style={styles.badgeModalInner}>
                <View style={styles.badgeIcon}>
                  <Feather 
                    name={(newBadge?.icon_name as any) || "award"} 
                    size={48} 
                    color="#D4AF7A" 
                  />
                </View>
                <Text style={styles.badgeModalTitle}>Badge Unlocked!</Text>
                <Text style={styles.badgeModalName}>{newBadge?.name}</Text>
                <Text style={styles.badgeModalDescription}>
                  {newBadge?.description}
                </Text>
                <Pressable
                  style={styles.badgeModalButton}
                  onPress={() => setShowBadgeModal(false)}
                >
                  <Text style={styles.badgeModalButtonText}>Awesome!</Text>
                </Pressable>
              </View>
            </View>
          </View>
        </Modal>
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

      {/* Check-in button when within 20m */}
      {!isGuest && canCheckIn && !alreadyCheckedIn ? (
        <View style={styles.checkInContainer}>
          <Pressable
            style={[styles.actionButton, styles.checkInButton]}
            onPress={handleCheckIn}
            disabled={checkingIn}
          >
            {checkingIn ? (
              <ActivityIndicator size="small" color="#FFFFFF" />
            ) : (
              <>
                <Feather name="check" size={20} color="#FFFFFF" />
                <Text style={styles.checkInButtonText}>Check In Now</Text>
              </>
            )}
          </Pressable>
        </View>
      ) : !isGuest && !canCheckIn && distance !== null && distance < 50 ? (
        <View style={styles.checkInContainer}>
          <View style={[styles.actionButton, styles.disabledCheckInButton]}>
            <Feather name="map-pin" size={20} color={Colors.dark.textSecondary} />
            <Text style={styles.disabledCheckInText}>Get within {CHECKIN_THRESHOLD}m to check in</Text>
          </View>
        </View>
      ) : alreadyCheckedIn ? (
        <View style={styles.checkInContainer}>
          <View style={[styles.actionButton, styles.checkedInButton]}>
            <Feather name="check-circle" size={20} color="#4CAF50" />
            <Text style={styles.checkedInText}>Checked In</Text>
          </View>
          <Pressable
            style={[styles.checkOutButton]}
            onPress={handleCheckOut}
            disabled={checkingOut}
          >
            {checkingOut ? (
              <ActivityIndicator size="small" color="#E74C3C" />
            ) : (
              <>
                <Feather name="x-circle" size={16} color="#E74C3C" />
                <Text style={styles.checkOutText}>Remove Check-in</Text>
              </>
            )}
          </Pressable>
        </View>
      ) : null}

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
    marginBottom: Spacing.md,
  },
  primaryButton: {
    backgroundColor: Colors.dark.accent,
  },
  checkInButton: {
    backgroundColor: "#4CAF50",
    flexDirection: "row",
    alignItems: "center",
    gap: Spacing.sm,
  },
  checkInButtonText: {
    color: "#FFFFFF",
    ...Typography.headline,
    fontWeight: "600",
  },
  disabledCheckInButton: {
    backgroundColor: Colors.dark.backgroundSecondary,
    flexDirection: "row",
    alignItems: "center",
    gap: Spacing.sm,
  },
  disabledCheckInText: {
    color: Colors.dark.textSecondary,
    ...Typography.body,
  },
  checkInContainer: {
    paddingHorizontal: Spacing.lg,
    marginBottom: Spacing.md,
  },
  checkedInButton: {
    backgroundColor: "rgba(76, 175, 80, 0.15)",
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: Spacing.sm,
  },
  checkedInText: {
    color: "#4CAF50",
    ...Typography.body,
    fontWeight: "600",
  },
  checkOutButton: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: Spacing.xs,
    paddingVertical: Spacing.md,
    marginTop: Spacing.sm,
  },
  checkOutText: {
    color: "#E74C3C",
    ...Typography.caption,
    fontWeight: "500",
  },
  actionButtonText: {
    color: Colors.dark.text,
    ...Typography.headline,
    fontWeight: "600",
  },
  badgeModalOverlay: {
    flex: 1,
    justifyContent: "center",
    alignItems: "center",
    backgroundColor: "rgba(0, 0, 0, 0.7)",
  },
  badgeModalContent: {
    width: "80%",
    borderRadius: BorderRadius.lg,
    overflow: "hidden",
  },
  badgeModalInner: {
    padding: Spacing["3xl"],
    alignItems: "center",
  },
  badgeIcon: {
    width: 100,
    height: 100,
    borderRadius: 50,
    backgroundColor: "rgba(212, 175, 122, 0.2)",
    justifyContent: "center",
    alignItems: "center",
    marginBottom: Spacing.xl,
  },
  badgeModalTitle: {
    color: "#D4AF7A",
    ...Typography.title,
    marginBottom: Spacing.sm,
  },
  badgeModalName: {
    color: Colors.dark.text,
    fontSize: 24,
    fontWeight: "700",
    marginBottom: Spacing.md,
    textAlign: "center",
  },
  badgeModalDescription: {
    color: Colors.dark.textSecondary,
    ...Typography.body,
    textAlign: "center",
    marginBottom: Spacing.xl,
  },
  badgeModalButton: {
    backgroundColor: "#D4AF7A",
    paddingHorizontal: Spacing["3xl"],
    paddingVertical: Spacing.md,
    borderRadius: BorderRadius.md,
  },
  badgeModalButtonText: {
    color: "#1A1A1A",
    ...Typography.headline,
    fontWeight: "600",
  },
});
