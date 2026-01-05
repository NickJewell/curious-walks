import React, { useState, useEffect, useCallback } from 'react';
import {
  View,
  Text,
  StyleSheet,
  FlatList,
  Pressable,
  TextInput,
  Modal,
  Alert,
  ActivityIndicator,
  ImageBackground,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useBottomTabBarHeight } from '@react-navigation/bottom-tabs';
import { useNavigation, useFocusEffect } from '@react-navigation/native';
import type { NativeStackNavigationProp } from '@react-navigation/native-stack';
import { Feather } from '@expo/vector-icons';
import { BlurView } from 'expo-blur';
import { GestureHandlerRootView, Swipeable } from 'react-native-gesture-handler';
import Animated, { FadeIn, FadeOut } from 'react-native-reanimated';

import { Colors, Spacing, BorderRadius, Typography } from '@/constants/theme';
import { useAuth } from '@/contexts/AuthContext';
import { getUserLists, createList, deleteList, getOfficialTours } from '@/lib/lists';
import type { ListWithItemCount, Tour } from '../../shared/schema';
import type { RootStackParamList } from '@/navigation/RootStackNavigator';
import { KeyboardAwareScrollViewCompat } from '@/components/KeyboardAwareScrollViewCompat';

type NavigationProp = NativeStackNavigationProp<RootStackParamList>;
type TabOption = 'lists' | 'tours';

export default function ListsScreen() {
  const insets = useSafeAreaInsets();
  const tabBarHeight = useBottomTabBarHeight();
  const navigation = useNavigation<NavigationProp>();
  const { user, isGuest } = useAuth();

  const [activeTab, setActiveTab] = useState<TabOption>('lists');
  const [lists, setLists] = useState<ListWithItemCount[]>([]);
  const [tours, setTours] = useState<Tour[]>([]);
  const [loading, setLoading] = useState(true);
  const [showCreateModal, setShowCreateModal] = useState(false);
  const [newListName, setNewListName] = useState('');
  const [creating, setCreating] = useState(false);

  const loadLists = useCallback(async () => {
    if (!user?.id || isGuest) {
      setLists([]);
      setLoading(false);
      return;
    }

    setLoading(true);
    try {
      const userLists = await getUserLists(user.id);
      setLists(userLists);
    } catch (error) {
      console.error('Error loading lists:', error);
    } finally {
      setLoading(false);
    }
  }, [user?.id, isGuest]);

  const loadTours = useCallback(async () => {
    setLoading(true);
    try {
      const officialTours = await getOfficialTours();
      setTours(officialTours);
    } catch (error) {
      console.error('Error loading tours:', error);
    } finally {
      setLoading(false);
    }
  }, []);

  useFocusEffect(
    useCallback(() => {
      if (activeTab === 'lists') {
        loadLists();
      } else {
        loadTours();
      }
    }, [activeTab, loadLists, loadTours])
  );

  const handleCreateList = async () => {
    if (!newListName.trim() || !user?.id) return;

    setCreating(true);
    try {
      await createList(user.id, newListName);
      setNewListName('');
      setShowCreateModal(false);
      await loadLists();
    } catch (error) {
      Alert.alert('Error', 'Failed to create list. Please try again.');
    } finally {
      setCreating(false);
    }
  };

  const handleDeleteList = async (listId: string, listName: string) => {
    Alert.alert(
      'Delete List',
      `Are you sure you want to delete "${listName}"? This cannot be undone.`,
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Delete',
          style: 'destructive',
          onPress: async () => {
            const success = await deleteList(listId);
            if (success) {
              setLists((prev) => prev.filter((l) => l.id !== listId));
            } else {
              Alert.alert('Error', 'Failed to delete list.');
            }
          },
        },
      ]
    );
  };

  const handleOpenList = (list: ListWithItemCount) => {
    navigation.navigate('ListDetail', { listId: list.id, listName: list.name });
  };

  const handleOpenTour = (tour: Tour) => {
    navigation.navigate('TourDetail', { tourId: tour.id });
  };

  const renderRightActions = (listId: string, listName: string) => {
    return (
      <Pressable
        style={styles.deleteAction}
        onPress={() => handleDeleteList(listId, listName)}
      >
        <Feather name="trash-2" size={20} color="#FFFFFF" />
        <Text style={styles.deleteActionText}>Delete</Text>
      </Pressable>
    );
  };

  const renderListItem = ({ item }: { item: ListWithItemCount }) => {
    const formattedDate = new Date(item.created_at).toLocaleDateString('en-GB', {
      day: 'numeric',
      month: 'short',
      year: 'numeric',
    });

    return (
      <Swipeable
        renderRightActions={() => renderRightActions(item.id, item.name)}
        overshootRight={false}
      >
        <Pressable
          style={({ pressed }) => [
            styles.listCard,
            pressed && styles.listCardPressed,
          ]}
          onPress={() => handleOpenList(item)}
        >
          <View style={styles.listCardContent}>
            <View style={styles.listIcon}>
              <Feather name="list" size={20} color={Colors.dark.accent} />
            </View>
            <View style={styles.listInfo}>
              <Text style={styles.listName} numberOfLines={1}>
                {item.name}
              </Text>
              <Text style={styles.listMeta}>
                {item.item_count} {item.item_count === 1 ? 'place' : 'places'}
                {' · '}
                {formattedDate}
              </Text>
            </View>
            <Feather name="chevron-right" size={20} color={Colors.dark.textSecondary} />
          </View>
        </Pressable>
      </Swipeable>
    );
  };

  const renderTourCard = ({ item }: { item: Tour }) => {
    const difficulty = item.metadata?.difficulty || 'Unknown';
    const duration = item.metadata?.duration || 'Unknown';
    const heroImage = item.metadata?.hero_image;

    return (
      <Pressable
        style={({ pressed }) => [
          styles.tourCard,
          pressed && styles.tourCardPressed,
        ]}
        onPress={() => handleOpenTour(item)}
      >
        <ImageBackground
          source={heroImage ? { uri: heroImage } : undefined}
          style={styles.tourCardImage}
          resizeMode="cover"
        >
          <View style={styles.tourCardOverlay}>
            {!heroImage ? (
              <Feather name="map" size={32} color={Colors.dark.textSecondary} />
            ) : null}
          </View>
        </ImageBackground>
        <View style={styles.tourCardContent}>
          <Text style={styles.tourCardTitle} numberOfLines={2}>
            {item.name}
          </Text>
          <View style={styles.tourCardMeta}>
            <View style={styles.tourBadge}>
              <Text style={styles.tourBadgeText}>{difficulty}</Text>
            </View>
            <View style={styles.tourBadge}>
              <Feather name="clock" size={12} color={Colors.dark.textSecondary} />
              <Text style={styles.tourBadgeText}>{duration}</Text>
            </View>
          </View>
          <Text style={styles.tourCardStops}>
            {item.item_count} {item.item_count === 1 ? 'stop' : 'stops'}
          </Text>
        </View>
      </Pressable>
    );
  };

  const renderEmptyState = () => {
    if (activeTab === 'tours') {
      return (
        <View style={styles.emptyState}>
          <Feather name="map" size={48} color={Colors.dark.textSecondary} />
          <Text style={styles.emptyTitle}>No Tours Available</Text>
          <Text style={styles.emptyDescription}>
            Official curated tours will appear here. Check back soon!
          </Text>
        </View>
      );
    }

    if (isGuest) {
      return (
        <View style={styles.emptyState}>
          <Feather name="lock" size={48} color={Colors.dark.textSecondary} />
          <Text style={styles.emptyTitle}>Sign In Required</Text>
          <Text style={styles.emptyDescription}>
            Create an account to save your favorite places into custom lists.
          </Text>
          <Pressable
            style={styles.signInButton}
            onPress={() => navigation.navigate('Login' as any)}
          >
            <Text style={styles.signInButtonText}>Sign In</Text>
          </Pressable>
        </View>
      );
    }

    return (
      <View style={styles.emptyState}>
        <Feather name="list" size={48} color={Colors.dark.textSecondary} />
        <Text style={styles.emptyTitle}>No Lists Yet</Text>
        <Text style={styles.emptyDescription}>
          Create your first list to save places you want to explore.
        </Text>
      </View>
    );
  };

  const SegmentedControl = () => (
    <View style={styles.segmentedControl}>
      <Pressable
        style={[
          styles.segmentButton,
          activeTab === 'lists' && styles.segmentButtonActive,
        ]}
        onPress={() => setActiveTab('lists')}
      >
        <Text
          style={[
            styles.segmentButtonText,
            activeTab === 'lists' && styles.segmentButtonTextActive,
          ]}
        >
          My Lists
        </Text>
      </Pressable>
      <Pressable
        style={[
          styles.segmentButton,
          activeTab === 'tours' && styles.segmentButtonActive,
        ]}
        onPress={() => setActiveTab('tours')}
      >
        <Text
          style={[
            styles.segmentButtonText,
            activeTab === 'tours' && styles.segmentButtonTextActive,
          ]}
        >
          Official Tours
        </Text>
      </Pressable>
    </View>
  );

  return (
    <GestureHandlerRootView style={styles.container}>
      <View style={[styles.header, { paddingTop: insets.top + Spacing.md }]}>
        <Text style={styles.headerTitle}>
          {activeTab === 'lists' ? 'My Lists' : 'Tours'}
        </Text>
        {activeTab === 'lists' && !isGuest ? (
          <Pressable
            style={({ pressed }) => [
              styles.addButton,
              pressed && styles.addButtonPressed,
            ]}
            onPress={() => setShowCreateModal(true)}
          >
            <Feather name="plus" size={24} color={Colors.dark.text} />
          </Pressable>
        ) : (
          <View style={{ width: 44 }} />
        )}
      </View>

      <SegmentedControl />

      {loading ? (
        <View style={styles.loadingContainer}>
          <ActivityIndicator size="large" color={Colors.dark.accent} />
        </View>
      ) : activeTab === 'lists' ? (
        <FlatList
          key="lists-flatlist"
          data={lists}
          keyExtractor={(item) => item.id}
          renderItem={renderListItem}
          contentContainerStyle={[
            styles.listContent,
            { paddingBottom: tabBarHeight + Spacing.xl },
            lists.length === 0 && styles.emptyListContent,
          ]}
          ListEmptyComponent={renderEmptyState}
          showsVerticalScrollIndicator={false}
        />
      ) : (
        <FlatList
          key="tours-flatlist"
          data={tours}
          keyExtractor={(item) => item.id}
          renderItem={renderTourCard}
          numColumns={2}
          columnWrapperStyle={styles.tourGrid}
          contentContainerStyle={[
            styles.listContent,
            { paddingBottom: tabBarHeight + Spacing.xl },
            tours.length === 0 && styles.emptyListContent,
          ]}
          ListEmptyComponent={renderEmptyState}
          showsVerticalScrollIndicator={false}
        />
      )}

      <Modal
        visible={showCreateModal}
        animationType="fade"
        transparent
        onRequestClose={() => setShowCreateModal(false)}
      >
        <View style={styles.modalOverlay}>
          <Pressable
            style={StyleSheet.absoluteFill}
            onPress={() => setShowCreateModal(false)}
          />
          <Animated.View
            entering={FadeIn.duration(200)}
            exiting={FadeOut.duration(150)}
            style={styles.modalContent}
          >
            <BlurView intensity={80} tint="dark" style={StyleSheet.absoluteFill} />
            <View style={styles.modalInner}>
              <Text style={styles.modalTitle}>Create New List</Text>
              <TextInput
                style={styles.modalInput}
                placeholder="List name"
                placeholderTextColor={Colors.dark.textSecondary}
                value={newListName}
                onChangeText={setNewListName}
                autoFocus
                returnKeyType="done"
                onSubmitEditing={handleCreateList}
              />
              <View style={styles.modalButtons}>
                <Pressable
                  style={[styles.modalButton, styles.modalButtonCancel]}
                  onPress={() => {
                    setNewListName('');
                    setShowCreateModal(false);
                  }}
                >
                  <Text style={styles.modalButtonCancelText}>Cancel</Text>
                </Pressable>
                <Pressable
                  style={[
                    styles.modalButton,
                    styles.modalButtonCreate,
                    (!newListName.trim() || creating) && styles.modalButtonDisabled,
                  ]}
                  onPress={handleCreateList}
                  disabled={!newListName.trim() || creating}
                >
                  {creating ? (
                    <ActivityIndicator size="small" color="#FFFFFF" />
                  ) : (
                    <Text style={styles.modalButtonCreateText}>Create</Text>
                  )}
                </Pressable>
              </View>
            </View>
          </Animated.View>
        </View>
      </Modal>
    </GestureHandlerRootView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: Colors.dark.backgroundRoot,
  },
  header: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingHorizontal: Spacing.lg,
    paddingBottom: Spacing.md,
  },
  headerTitle: {
    ...Typography.largeTitle,
    color: Colors.dark.text,
  },
  addButton: {
    width: 44,
    height: 44,
    borderRadius: BorderRadius.sm,
    backgroundColor: Colors.dark.backgroundSecondary,
    justifyContent: 'center',
    alignItems: 'center',
  },
  addButtonPressed: {
    opacity: 0.6,
  },
  segmentedControl: {
    flexDirection: 'row',
    marginHorizontal: Spacing.lg,
    marginBottom: Spacing.lg,
    backgroundColor: Colors.dark.backgroundSecondary,
    borderRadius: BorderRadius.sm,
    padding: 4,
  },
  segmentButton: {
    flex: 1,
    paddingVertical: Spacing.sm,
    alignItems: 'center',
    borderRadius: BorderRadius.xs,
  },
  segmentButtonActive: {
    backgroundColor: Colors.dark.accent,
  },
  segmentButtonText: {
    ...Typography.callout,
    color: Colors.dark.textSecondary,
  },
  segmentButtonTextActive: {
    color: '#FFFFFF',
    fontWeight: '600',
  },
  loadingContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
  },
  listContent: {
    paddingHorizontal: Spacing.lg,
    paddingTop: Spacing.md,
  },
  emptyListContent: {
    flex: 1,
  },
  tourGrid: {
    gap: Spacing.md,
  },
  tourCard: {
    flex: 1,
    maxWidth: '48%',
    backgroundColor: Colors.dark.backgroundSecondary,
    borderRadius: BorderRadius.md,
    overflow: 'hidden',
    marginBottom: Spacing.md,
  },
  tourCardPressed: {
    opacity: 0.8,
  },
  tourCardImage: {
    height: 120,
    backgroundColor: Colors.dark.backgroundTertiary,
  },
  tourCardOverlay: {
    ...StyleSheet.absoluteFillObject,
    justifyContent: 'center',
    alignItems: 'center',
    backgroundColor: 'rgba(0, 0, 0, 0.2)',
  },
  tourCardContent: {
    padding: Spacing.md,
  },
  tourCardTitle: {
    ...Typography.headline,
    color: Colors.dark.text,
    marginBottom: Spacing.sm,
  },
  tourCardMeta: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: Spacing.xs,
    marginBottom: Spacing.sm,
  },
  tourBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: Colors.dark.backgroundTertiary,
    paddingVertical: 4,
    paddingHorizontal: Spacing.sm,
    borderRadius: BorderRadius.xs,
    gap: 4,
  },
  tourBadgeText: {
    ...Typography.caption,
    color: Colors.dark.textSecondary,
  },
  tourCardStops: {
    ...Typography.caption,
    color: Colors.dark.accent,
  },
  listCard: {
    backgroundColor: Colors.dark.backgroundSecondary,
    borderRadius: BorderRadius.md,
    marginBottom: Spacing.md,
  },
  listCardPressed: {
    opacity: 0.7,
  },
  listCardContent: {
    flexDirection: 'row',
    alignItems: 'center',
    padding: Spacing.lg,
  },
  listIcon: {
    width: 44,
    height: 44,
    borderRadius: BorderRadius.sm,
    backgroundColor: Colors.dark.backgroundTertiary,
    justifyContent: 'center',
    alignItems: 'center',
    marginRight: Spacing.md,
  },
  listInfo: {
    flex: 1,
  },
  listName: {
    ...Typography.headline,
    color: Colors.dark.text,
    marginBottom: Spacing.xs,
  },
  listMeta: {
    ...Typography.caption,
    color: Colors.dark.textSecondary,
  },
  deleteAction: {
    backgroundColor: '#C53030',
    justifyContent: 'center',
    alignItems: 'center',
    width: 80,
    marginBottom: Spacing.md,
    borderTopRightRadius: BorderRadius.md,
    borderBottomRightRadius: BorderRadius.md,
  },
  deleteActionText: {
    color: '#FFFFFF',
    ...Typography.caption,
    marginTop: Spacing.xs,
  },
  emptyState: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    paddingHorizontal: Spacing['3xl'],
  },
  emptyTitle: {
    ...Typography.title,
    color: Colors.dark.text,
    marginTop: Spacing.lg,
    marginBottom: Spacing.sm,
  },
  emptyDescription: {
    ...Typography.body,
    color: Colors.dark.textSecondary,
    textAlign: 'center',
    lineHeight: 24,
  },
  signInButton: {
    marginTop: Spacing.xl,
    backgroundColor: Colors.dark.accent,
    paddingVertical: Spacing.md,
    paddingHorizontal: Spacing['3xl'],
    borderRadius: BorderRadius.md,
  },
  signInButtonText: {
    color: '#FFFFFF',
    ...Typography.headline,
  },
  modalOverlay: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    backgroundColor: 'rgba(0, 0, 0, 0.6)',
  },
  modalContent: {
    width: '85%',
    borderRadius: BorderRadius.lg,
    overflow: 'hidden',
  },
  modalInner: {
    padding: Spacing.xl,
  },
  modalTitle: {
    ...Typography.title,
    color: Colors.dark.text,
    marginBottom: Spacing.lg,
    textAlign: 'center',
  },
  modalInput: {
    backgroundColor: Colors.dark.backgroundTertiary,
    borderRadius: BorderRadius.sm,
    paddingHorizontal: Spacing.lg,
    paddingVertical: Spacing.md,
    ...Typography.body,
    color: Colors.dark.text,
    marginBottom: Spacing.lg,
  },
  modalButtons: {
    flexDirection: 'row',
    gap: Spacing.md,
  },
  modalButton: {
    flex: 1,
    paddingVertical: Spacing.md,
    borderRadius: BorderRadius.sm,
    alignItems: 'center',
    justifyContent: 'center',
    height: 48,
  },
  modalButtonCancel: {
    backgroundColor: Colors.dark.backgroundTertiary,
  },
  modalButtonCancelText: {
    ...Typography.headline,
    color: Colors.dark.text,
  },
  modalButtonCreate: {
    backgroundColor: Colors.dark.accent,
  },
  modalButtonCreateText: {
    ...Typography.headline,
    color: '#FFFFFF',
  },
  modalButtonDisabled: {
    opacity: 0.5,
  },
});
