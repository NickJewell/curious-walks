import React, { useState, useEffect, useCallback } from 'react';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  Pressable,
  ImageBackground,
  ActivityIndicator,
  Alert,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useNavigation, useRoute, RouteProp } from '@react-navigation/native';
import type { NativeStackNavigationProp } from '@react-navigation/native-stack';
import { Feather } from '@expo/vector-icons';
import { BlurView } from 'expo-blur';
import { LinearGradient } from 'expo-linear-gradient';

import { Colors, Spacing, BorderRadius, Typography } from '@/constants/theme';
import { getTourById, getListItems } from '@/lib/lists';
import { useTour } from '@/contexts/TourContext';
import { useHunt } from '@/contexts/HuntContext';
import type { Tour, ListItem } from '../../shared/schema';
import type { RootStackParamList } from '@/navigation/RootStackNavigator';

type NavigationProp = NativeStackNavigationProp<RootStackParamList>;
type RouteProps = RouteProp<RootStackParamList, 'TourDetail'>;

export default function TourDetailScreen() {
  const insets = useSafeAreaInsets();
  const navigation = useNavigation<NavigationProp>();
  const route = useRoute<RouteProps>();
  const { tourId } = route.params;

  const { setActiveTour } = useTour();
  const { setActiveTarget } = useHunt();

  const [tour, setTour] = useState<Tour | null>(null);
  const [stops, setStops] = useState<ListItem[]>([]);
  const [loading, setLoading] = useState(true);

  const loadTourData = useCallback(async () => {
    setLoading(true);
    try {
      const [tourData, stopsData] = await Promise.all([
        getTourById(tourId),
        getListItems(tourId),
      ]);
      setTour(tourData);
      setStops(stopsData);
    } catch (error) {
      console.error('Error loading tour:', error);
    } finally {
      setLoading(false);
    }
  }, [tourId]);

  useEffect(() => {
    loadTourData();
  }, [loadTourData]);

  const handleStartTour = () => {
    if (!tour || stops.length === 0) {
      Alert.alert('Cannot Start Tour', 'This tour has no stops to visit.');
      return;
    }

    setActiveTour(tour);

    const firstStop = stops[0];
    setActiveTarget({
      id: firstStop.place_id,
      name: firstStop.place_name,
      description: firstStop.place_description,
      latitude: firstStop.place_latitude,
      longitude: firstStop.place_longitude,
    });

    navigation.navigate('Compass');
  };

  const handleStopPress = (stop: ListItem) => {
    setActiveTarget({
      id: stop.place_id,
      name: stop.place_name,
      description: stop.place_description,
      latitude: stop.place_latitude,
      longitude: stop.place_longitude,
    });
    navigation.navigate('Compass');
  };

  if (loading) {
    return (
      <View style={[styles.container, styles.loadingContainer]}>
        <ActivityIndicator size="large" color={Colors.dark.accent} />
      </View>
    );
  }

  if (!tour) {
    return (
      <View style={[styles.container, styles.errorContainer]}>
        <Feather name="alert-circle" size={48} color={Colors.dark.textSecondary} />
        <Text style={styles.errorText}>Tour not found</Text>
        <Pressable style={styles.backButton} onPress={() => navigation.goBack()}>
          <Text style={styles.backButtonText}>Go Back</Text>
        </Pressable>
      </View>
    );
  }

  const heroImage = tour.metadata?.hero_image;
  const difficulty = tour.metadata?.difficulty || 'Unknown';
  const duration = tour.metadata?.duration || 'Unknown';
  const distance = tour.metadata?.distance || 'Unknown';

  return (
    <View style={styles.container}>
      <ScrollView
        style={styles.scrollView}
        contentContainerStyle={{ paddingBottom: 100 + insets.bottom }}
        showsVerticalScrollIndicator={false}
      >
        <ImageBackground
          source={heroImage ? { uri: heroImage } : undefined}
          style={styles.heroImage}
          resizeMode="cover"
        >
          <LinearGradient
            colors={['transparent', 'rgba(10, 14, 20, 0.8)', Colors.dark.backgroundRoot]}
            style={styles.heroGradient}
          />
          <Pressable
            style={[styles.headerBackButton, { top: insets.top + Spacing.md }]}
            onPress={() => navigation.goBack()}
          >
            <BlurView intensity={40} tint="dark" style={StyleSheet.absoluteFill} />
            <Feather name="arrow-left" size={24} color={Colors.dark.text} />
          </Pressable>
          {!heroImage ? (
            <View style={styles.heroPlaceholder}>
              <Feather name="map" size={64} color={Colors.dark.textSecondary} />
            </View>
          ) : null}
        </ImageBackground>

        <View style={styles.content}>
          <Text style={styles.title}>{tour.name}</Text>

          <View style={styles.statsRow}>
            <View style={styles.statBadge}>
              <Feather name="activity" size={14} color={Colors.dark.accent} />
              <Text style={styles.statText}>{difficulty}</Text>
            </View>
            <View style={styles.statBadge}>
              <Feather name="clock" size={14} color={Colors.dark.accent} />
              <Text style={styles.statText}>{duration}</Text>
            </View>
            <View style={styles.statBadge}>
              <Feather name="map-pin" size={14} color={Colors.dark.accent} />
              <Text style={styles.statText}>{distance}</Text>
            </View>
          </View>

          {tour.description ? (
            <Text style={styles.description}>{tour.description}</Text>
          ) : null}

          <Text style={styles.sectionTitle}>
            Route ({stops.length} {stops.length === 1 ? 'stop' : 'stops'})
          </Text>

          <View style={styles.routeList}>
            {stops.map((stop, index) => (
              <Pressable
                key={stop.id}
                style={({ pressed }) => [
                  styles.stopItem,
                  pressed && styles.stopItemPressed,
                ]}
                onPress={() => handleStopPress(stop)}
              >
                <View style={styles.stopConnector}>
                  <View style={styles.stopNumber}>
                    <Text style={styles.stopNumberText}>{index + 1}</Text>
                  </View>
                  {index < stops.length - 1 ? (
                    <View style={styles.connectorLine} />
                  ) : null}
                </View>
                <View style={styles.stopContent}>
                  <Text style={styles.stopName} numberOfLines={1}>
                    {stop.place_name}
                  </Text>
                  <Text style={styles.stopDescription} numberOfLines={2}>
                    {stop.place_description}
                  </Text>
                </View>
                <Feather name="chevron-right" size={20} color={Colors.dark.textSecondary} />
              </Pressable>
            ))}
          </View>
        </View>
      </ScrollView>

      <View style={[styles.bottomBar, { paddingBottom: insets.bottom + Spacing.lg }]}>
        <BlurView intensity={60} tint="dark" style={StyleSheet.absoluteFill} />
        <Pressable
          style={({ pressed }) => [
            styles.startButton,
            pressed && styles.startButtonPressed,
            stops.length === 0 && styles.startButtonDisabled,
          ]}
          onPress={handleStartTour}
          disabled={stops.length === 0}
        >
          <Feather name="navigation" size={20} color="#FFFFFF" />
          <Text style={styles.startButtonText}>Start Tour</Text>
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
  loadingContainer: {
    justifyContent: 'center',
    alignItems: 'center',
  },
  errorContainer: {
    justifyContent: 'center',
    alignItems: 'center',
    gap: Spacing.lg,
  },
  errorText: {
    ...Typography.headline,
    color: Colors.dark.textSecondary,
  },
  backButton: {
    backgroundColor: Colors.dark.accent,
    paddingVertical: Spacing.md,
    paddingHorizontal: Spacing['2xl'],
    borderRadius: BorderRadius.md,
  },
  backButtonText: {
    ...Typography.headline,
    color: '#FFFFFF',
  },
  scrollView: {
    flex: 1,
  },
  heroImage: {
    height: 280,
    backgroundColor: Colors.dark.backgroundSecondary,
  },
  heroGradient: {
    ...StyleSheet.absoluteFillObject,
  },
  heroPlaceholder: {
    ...StyleSheet.absoluteFillObject,
    justifyContent: 'center',
    alignItems: 'center',
  },
  headerBackButton: {
    position: 'absolute',
    left: Spacing.lg,
    width: 44,
    height: 44,
    borderRadius: BorderRadius.sm,
    overflow: 'hidden',
    justifyContent: 'center',
    alignItems: 'center',
  },
  content: {
    padding: Spacing.lg,
  },
  title: {
    ...Typography.title,
    color: Colors.dark.text,
    marginBottom: Spacing.md,
  },
  statsRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: Spacing.sm,
    marginBottom: Spacing.lg,
  },
  statBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: Colors.dark.backgroundSecondary,
    paddingVertical: Spacing.sm,
    paddingHorizontal: Spacing.md,
    borderRadius: BorderRadius.sm,
    gap: Spacing.xs,
  },
  statText: {
    ...Typography.caption,
    color: Colors.dark.text,
  },
  description: {
    ...Typography.body,
    color: Colors.dark.textSecondary,
    lineHeight: 24,
    marginBottom: Spacing.xl,
  },
  sectionTitle: {
    ...Typography.headline,
    color: Colors.dark.text,
    marginBottom: Spacing.lg,
  },
  routeList: {
    gap: 0,
  },
  stopItem: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    paddingVertical: Spacing.md,
  },
  stopItemPressed: {
    opacity: 0.7,
  },
  stopConnector: {
    width: 40,
    alignItems: 'center',
  },
  stopNumber: {
    width: 28,
    height: 28,
    borderRadius: 14,
    backgroundColor: Colors.dark.accent,
    justifyContent: 'center',
    alignItems: 'center',
  },
  stopNumberText: {
    ...Typography.caption,
    color: '#FFFFFF',
    fontWeight: '600',
  },
  connectorLine: {
    width: 2,
    flex: 1,
    minHeight: 40,
    backgroundColor: Colors.dark.accent,
    opacity: 0.3,
    marginTop: Spacing.xs,
  },
  stopContent: {
    flex: 1,
    paddingHorizontal: Spacing.md,
  },
  stopName: {
    ...Typography.headline,
    color: Colors.dark.text,
    marginBottom: Spacing.xs,
  },
  stopDescription: {
    ...Typography.caption,
    color: Colors.dark.textSecondary,
    lineHeight: 18,
  },
  bottomBar: {
    position: 'absolute',
    bottom: 0,
    left: 0,
    right: 0,
    paddingTop: Spacing.lg,
    paddingHorizontal: Spacing.lg,
    overflow: 'hidden',
  },
  startButton: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: Colors.dark.accent,
    paddingVertical: Spacing.lg,
    borderRadius: BorderRadius.md,
    gap: Spacing.sm,
  },
  startButtonPressed: {
    opacity: 0.8,
  },
  startButtonDisabled: {
    opacity: 0.5,
  },
  startButtonText: {
    ...Typography.headline,
    color: '#FFFFFF',
  },
});
