import React, { useState, useEffect, useCallback } from 'react';
import {
  View,
  Text,
  StyleSheet,
  Pressable,
  Alert,
  ActivityIndicator,
  TextInput,
  Dimensions,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useNavigation, useRoute, useFocusEffect } from '@react-navigation/native';
import type { NativeStackNavigationProp, NativeStackScreenProps } from '@react-navigation/native-stack';
import { Feather } from '@expo/vector-icons';
import { BlurView } from 'expo-blur';
import {
  GestureHandlerRootView,
  Swipeable,
  PanGestureHandler,
  PanGestureHandlerGestureEvent,
} from 'react-native-gesture-handler';
import Animated, {
  useAnimatedGestureHandler,
  useAnimatedStyle,
  useSharedValue,
  withSpring,
  runOnJS,
  scrollTo,
  useAnimatedRef,
  FadeIn,
} from 'react-native-reanimated';

import { Colors, Spacing, BorderRadius, Typography } from '@/constants/theme';
import { useAuth } from '@/contexts/AuthContext';
import { useHunt } from '@/contexts/HuntContext';
import { getListItems, removePlaceFromList, reorderListItems, updateListName, getListById } from '@/lib/lists';
import type { ListItem, UserList } from '../../shared/schema';
import type { RootStackParamList } from '@/navigation/RootStackNavigator';

const { height: SCREEN_HEIGHT } = Dimensions.get('window');
const ITEM_HEIGHT = 72;

type NavigationProp = NativeStackNavigationProp<RootStackParamList>;

export default function ListDetailScreen() {
  const insets = useSafeAreaInsets();
  const navigation = useNavigation<NavigationProp>();
  const route = useRoute<any>();
  const { listId, listName: initialListName } = route.params || {};
  const { setActiveTarget } = useHunt();

  const [list, setList] = useState<UserList | null>(null);
  const [items, setItems] = useState<ListItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [editingName, setEditingName] = useState(false);
  const [listName, setListName] = useState(initialListName || '');

  const loadListData = useCallback(async () => {
    if (!listId) return;

    setLoading(true);
    try {
      const [listData, listItems] = await Promise.all([
        getListById(listId),
        getListItems(listId),
      ]);
      setList(listData);
      setItems(listItems);
      if (listData) {
        setListName(listData.name);
      }
    } catch (error) {
      console.error('Error loading list data:', error);
    } finally {
      setLoading(false);
    }
  }, [listId]);

  useFocusEffect(
    useCallback(() => {
      loadListData();
    }, [loadListData])
  );

  const handleRemoveItem = async (itemId: string, placeName: string) => {
    Alert.alert(
      'Remove Place',
      `Remove "${placeName}" from this list?`,
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Remove',
          style: 'destructive',
          onPress: async () => {
            const success = await removePlaceFromList(itemId);
            if (success) {
              setItems((prev) => prev.filter((item) => item.id !== itemId));
            } else {
              Alert.alert('Error', 'Failed to remove place.');
            }
          },
        },
      ]
    );
  };

  const handleSaveName = async () => {
    if (!listName.trim() || !listId) return;
    
    setEditingName(false);
    const success = await updateListName(listId, listName);
    if (!success) {
      Alert.alert('Error', 'Failed to update list name.');
      if (list) {
        setListName(list.name);
      }
    }
  };

  const handleStartHunt = () => {
    if (items.length === 0) {
      Alert.alert('Empty List', 'Add some places to your list first.');
      return;
    }
    
    const firstItem = items[0];
    setActiveTarget({
      id: firstItem.place_id,
      name: firstItem.place_name,
      description: firstItem.place_description,
      latitude: firstItem.place_latitude,
      longitude: firstItem.place_longitude,
    });
    navigation.navigate('Compass');
  };

  const moveItem = useCallback(async (fromIndex: number, toIndex: number) => {
    if (fromIndex === toIndex) return;

    const newItems = [...items];
    const [movedItem] = newItems.splice(fromIndex, 1);
    newItems.splice(toIndex, 0, movedItem);

    const updatedItems = newItems.map((item, index) => ({
      ...item,
      order_index: index + 1,
    }));

    setItems(updatedItems);

    const reorderData = updatedItems.map((item) => ({
      id: item.id,
      order_index: item.order_index,
    }));

    await reorderListItems(listId, reorderData);
  }, [items, listId]);

  const renderRightActions = (itemId: string, placeName: string) => {
    return (
      <Pressable
        style={styles.deleteAction}
        onPress={() => handleRemoveItem(itemId, placeName)}
      >
        <Feather name="trash-2" size={20} color="#FFFFFF" />
      </Pressable>
    );
  };

  const renderItem = (item: ListItem, index: number) => {
    return (
      <DraggableItem
        key={item.id}
        item={item}
        index={index}
        itemsCount={items.length}
        onMove={moveItem}
        onRemove={() => handleRemoveItem(item.id, item.place_name)}
        renderRightActions={() => renderRightActions(item.id, item.place_name)}
      />
    );
  };

  if (loading) {
    return (
      <View style={[styles.container, styles.loadingContainer]}>
        <ActivityIndicator size="large" color={Colors.dark.accent} />
      </View>
    );
  }

  return (
    <GestureHandlerRootView style={styles.container}>
      <View style={[styles.header, { paddingTop: insets.top + Spacing.md }]}>
        <Pressable
          style={styles.backButton}
          onPress={() => navigation.goBack()}
        >
          <Feather name="arrow-left" size={24} color={Colors.dark.text} />
        </Pressable>
        
        {editingName ? (
          <TextInput
            style={styles.headerTitleInput}
            value={listName}
            onChangeText={setListName}
            onBlur={handleSaveName}
            onSubmitEditing={handleSaveName}
            autoFocus
            selectTextOnFocus
          />
        ) : (
          <Pressable onPress={() => setEditingName(true)} style={styles.headerTitleContainer}>
            <Text style={styles.headerTitle} numberOfLines={1}>
              {listName}
            </Text>
            <Feather name="edit-2" size={16} color={Colors.dark.textSecondary} />
          </Pressable>
        )}
      </View>

      {items.length === 0 ? (
        <View style={styles.emptyState}>
          <Feather name="map-pin" size={48} color={Colors.dark.textSecondary} />
          <Text style={styles.emptyTitle}>No Places Yet</Text>
          <Text style={styles.emptyDescription}>
            Find places on the map and save them to this list.
          </Text>
        </View>
      ) : (
        <Animated.ScrollView
          style={styles.scrollView}
          contentContainerStyle={[
            styles.scrollContent,
            { paddingBottom: insets.bottom + 100 },
          ]}
          showsVerticalScrollIndicator={false}
        >
          <Text style={styles.itemCount}>
            {items.length} {items.length === 1 ? 'place' : 'places'}
          </Text>
          <Text style={styles.hintText}>
            Swipe left to remove, hold and drag to reorder
          </Text>
          {items.map((item, index) => renderItem(item, index))}
        </Animated.ScrollView>
      )}

      {items.length > 0 ? (
        <View style={[styles.footer, { paddingBottom: insets.bottom + Spacing.lg }]}>
          <Pressable
            style={({ pressed }) => [
              styles.startButton,
              pressed && styles.startButtonPressed,
            ]}
            onPress={handleStartHunt}
          >
            <BlurView intensity={80} tint="dark" style={StyleSheet.absoluteFill} />
            <Feather name="navigation" size={20} color={Colors.dark.textAccent} />
            <Text style={styles.startButtonText}>Start Hunt</Text>
          </Pressable>
        </View>
      ) : null}
    </GestureHandlerRootView>
  );
}

interface DraggableItemProps {
  item: ListItem;
  index: number;
  itemsCount: number;
  onMove: (from: number, to: number) => void;
  onRemove: () => void;
  renderRightActions: () => React.ReactNode;
}

function DraggableItem({
  item,
  index,
  itemsCount,
  onMove,
  onRemove,
  renderRightActions,
}: DraggableItemProps) {
  const translateY = useSharedValue(0);
  const isActive = useSharedValue(false);
  const contextY = useSharedValue(0);

  const gestureHandler = useAnimatedGestureHandler<
    PanGestureHandlerGestureEvent,
    { startY: number }
  >({
    onStart: (_, ctx) => {
      ctx.startY = translateY.value;
      isActive.value = true;
    },
    onActive: (event, ctx) => {
      translateY.value = ctx.startY + event.translationY;
    },
    onEnd: () => {
      const newIndex = Math.round(translateY.value / ITEM_HEIGHT) + index;
      const clampedIndex = Math.max(0, Math.min(itemsCount - 1, newIndex));
      
      if (clampedIndex !== index) {
        runOnJS(onMove)(index, clampedIndex);
      }
      
      translateY.value = withSpring(0);
      isActive.value = false;
    },
  });

  const animatedStyle = useAnimatedStyle(() => {
    return {
      transform: [{ translateY: translateY.value }],
      zIndex: isActive.value ? 100 : 1,
      shadowOpacity: isActive.value ? 0.3 : 0,
    };
  });

  return (
    <Animated.View style={[styles.itemWrapper, animatedStyle]}>
      <Swipeable
        renderRightActions={renderRightActions}
        overshootRight={false}
      >
        <View style={styles.itemContainer}>
          <View style={styles.itemContent}>
            <View style={styles.orderBadge}>
              <Text style={styles.orderNumber}>{index + 1}</Text>
            </View>
            <View style={styles.itemInfo}>
              <Text style={styles.itemName} numberOfLines={1}>
                {item.place_name}
              </Text>
              <Text style={styles.itemDescription} numberOfLines={1}>
                {item.place_description}
              </Text>
            </View>
            <PanGestureHandler onGestureEvent={gestureHandler}>
              <Animated.View style={styles.dragHandle}>
                <Feather name="menu" size={20} color={Colors.dark.textSecondary} />
              </Animated.View>
            </PanGestureHandler>
          </View>
        </View>
      </Swipeable>
    </Animated.View>
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
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: Spacing.lg,
    paddingBottom: Spacing.md,
    gap: Spacing.md,
  },
  backButton: {
    width: 44,
    height: 44,
    justifyContent: 'center',
    alignItems: 'center',
  },
  headerTitleContainer: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.sm,
  },
  headerTitle: {
    ...Typography.title,
    color: Colors.dark.text,
    flex: 1,
  },
  headerTitleInput: {
    flex: 1,
    ...Typography.title,
    color: Colors.dark.text,
    backgroundColor: Colors.dark.backgroundSecondary,
    borderRadius: BorderRadius.sm,
    paddingHorizontal: Spacing.md,
    paddingVertical: Spacing.sm,
  },
  scrollView: {
    flex: 1,
  },
  scrollContent: {
    paddingHorizontal: Spacing.lg,
    paddingTop: Spacing.md,
  },
  itemCount: {
    ...Typography.caption,
    color: Colors.dark.textSecondary,
    marginBottom: Spacing.xs,
  },
  hintText: {
    ...Typography.caption,
    color: Colors.dark.textSecondary,
    marginBottom: Spacing.lg,
    fontStyle: 'italic',
  },
  itemWrapper: {
    marginBottom: Spacing.sm,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 4 },
    shadowRadius: 8,
  },
  itemContainer: {
    backgroundColor: Colors.dark.backgroundSecondary,
    borderRadius: BorderRadius.md,
    overflow: 'hidden',
  },
  itemContent: {
    flexDirection: 'row',
    alignItems: 'center',
    padding: Spacing.md,
    height: ITEM_HEIGHT,
  },
  orderBadge: {
    width: 32,
    height: 32,
    borderRadius: 16,
    backgroundColor: Colors.dark.accent,
    justifyContent: 'center',
    alignItems: 'center',
    marginRight: Spacing.md,
  },
  orderNumber: {
    ...Typography.headline,
    color: '#FFFFFF',
    fontSize: 14,
  },
  itemInfo: {
    flex: 1,
  },
  itemName: {
    ...Typography.headline,
    color: Colors.dark.text,
    marginBottom: Spacing.xs,
  },
  itemDescription: {
    ...Typography.caption,
    color: Colors.dark.textSecondary,
  },
  dragHandle: {
    width: 44,
    height: 44,
    justifyContent: 'center',
    alignItems: 'center',
  },
  deleteAction: {
    backgroundColor: '#C53030',
    justifyContent: 'center',
    alignItems: 'center',
    width: 60,
    borderTopRightRadius: BorderRadius.md,
    borderBottomRightRadius: BorderRadius.md,
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
  footer: {
    position: 'absolute',
    left: Spacing.lg,
    right: Spacing.lg,
    bottom: 0,
  },
  startButton: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: Spacing.lg,
    borderRadius: BorderRadius.lg,
    overflow: 'hidden',
    backgroundColor: 'rgba(21, 26, 35, 0.9)',
    gap: Spacing.sm,
  },
  startButtonPressed: {
    opacity: 0.7,
  },
  startButtonText: {
    ...Typography.headline,
    color: Colors.dark.textAccent,
  },
});
