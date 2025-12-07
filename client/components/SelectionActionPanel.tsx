import React, { useState } from "react";
import {
  View,
  StyleSheet,
  Text,
  Pressable,
  Modal,
  FlatList,
  TextInput,
  ActivityIndicator,
} from "react-native";
import { BlurView } from "expo-blur";
import { Feather } from "@expo/vector-icons";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { useBottomTabBarHeight } from "@react-navigation/bottom-tabs";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { Colors, Spacing, BorderRadius, Typography } from "@/constants/theme";
import { useSelection } from "@/lib/selection-context";
import { useDeviceId } from "@/hooks/useDeviceId";
import { apiRequest } from "@/lib/query-client";
import type { Route } from "@shared/schema";

export default function SelectionActionPanel() {
  const insets = useSafeAreaInsets();
  const tabBarHeight = useBottomTabBarHeight();
  const queryClient = useQueryClient();
  const { selectedLocations, clearSelection, isSelecting } = useSelection();
  const deviceId = useDeviceId();
  
  const [showRouteSheet, setShowRouteSheet] = useState(false);
  const [showNewRouteModal, setShowNewRouteModal] = useState(false);
  const [newRouteName, setNewRouteName] = useState("");

  const { data: userRoutes = [], isLoading: loadingRoutes } = useQuery<Route[]>({
    queryKey: [`/api/user-routes?ownerId=${deviceId}`],
    enabled: !!deviceId && showRouteSheet,
  });

  const createRouteMutation = useMutation({
    mutationFn: async (name: string) => {
      const res = await apiRequest("POST", "/api/user-routes", {
        ownerId: deviceId,
        name,
        description: "My custom route",
      });
      return res.json() as Promise<Route>;
    },
    onSuccess: async (newRoute: Route) => {
      queryClient.invalidateQueries({ queryKey: [`/api/user-routes?ownerId=${deviceId}`] });
      queryClient.invalidateQueries({ queryKey: ["/api/routes"] });
      await addLocationsToRoute(newRoute.id);
      setShowNewRouteModal(false);
      setNewRouteName("");
    },
  });

  const addStopMutation = useMutation({
    mutationFn: async ({ routeId, locationId }: { routeId: string; locationId: string }) => {
      return apiRequest("POST", `/api/user-routes/${routeId}/stops`, {
        ownerId: deviceId,
        locationId,
      });
    },
  });

  const addLocationsToRoute = async (routeId: string) => {
    for (const location of selectedLocations) {
      await addStopMutation.mutateAsync({ routeId, locationId: location.id });
    }
    queryClient.invalidateQueries({ queryKey: ["/api/routes", routeId] });
    clearSelection();
    setShowRouteSheet(false);
  };

  const handleAddToExisting = (route: Route) => {
    addLocationsToRoute(route.id);
  };

  const handleCreateNewRoute = () => {
    if (newRouteName.trim()) {
      createRouteMutation.mutate(newRouteName.trim());
    }
  };

  if (!isSelecting || selectedLocations.length === 0) {
    return null;
  }

  return (
    <>
      <BlurView
        intensity={80}
        tint="dark"
        style={[styles.container, { bottom: tabBarHeight, paddingBottom: Spacing.md }]}
      >
        <View style={styles.header}>
          <Text style={styles.countText}>
            {selectedLocations.length} location{selectedLocations.length > 1 ? "s" : ""} selected
          </Text>
          <Pressable onPress={clearSelection} style={styles.cancelButton}>
            <Text style={styles.cancelText}>Cancel</Text>
          </Pressable>
        </View>

        <View style={styles.actions}>
          <Pressable
            style={styles.actionButton}
            onPress={() => {
              setShowNewRouteModal(true);
              setShowRouteSheet(false);
            }}
          >
            <Feather name="plus-circle" size={20} color={Colors.dark.text} />
            <Text style={styles.actionText}>New Route</Text>
          </Pressable>

          <Pressable
            style={styles.actionButton}
            onPress={() => setShowRouteSheet(true)}
          >
            <Feather name="folder-plus" size={20} color={Colors.dark.text} />
            <Text style={styles.actionText}>Add to Existing</Text>
          </Pressable>
        </View>
      </BlurView>

      <Modal
        visible={showRouteSheet}
        animationType="slide"
        transparent
        onRequestClose={() => setShowRouteSheet(false)}
      >
        <Pressable style={styles.modalOverlay} onPress={() => setShowRouteSheet(false)}>
          <BlurView intensity={80} tint="dark" style={[styles.sheet, { paddingBottom: insets.bottom + Spacing.lg }]}>
            <View style={styles.sheetHandle} />
            <Text style={styles.sheetTitle}>Add to Route</Text>
            
            {loadingRoutes ? (
              <ActivityIndicator color={Colors.dark.accent} style={styles.loader} />
            ) : userRoutes.length === 0 ? (
              <View style={styles.emptyState}>
                <Feather name="map" size={40} color={Colors.dark.inactive} />
                <Text style={styles.emptyText}>No custom routes yet</Text>
                <Pressable
                  style={styles.createFirstButton}
                  onPress={() => {
                    setShowRouteSheet(false);
                    setShowNewRouteModal(true);
                  }}
                >
                  <Text style={styles.createFirstText}>Create your first route</Text>
                </Pressable>
              </View>
            ) : (
              <FlatList
                data={userRoutes}
                keyExtractor={(item) => item.id}
                renderItem={({ item }) => (
                  <Pressable
                    style={styles.routeItem}
                    onPress={() => handleAddToExisting(item)}
                  >
                    <Feather name="map" size={20} color={Colors.dark.accent} />
                    <View style={styles.routeInfo}>
                      <Text style={styles.routeName}>{item.name}</Text>
                      <Text style={styles.routeDesc} numberOfLines={1}>{item.description}</Text>
                    </View>
                    <Feather name="plus" size={20} color={Colors.dark.textSecondary} />
                  </Pressable>
                )}
              />
            )}
          </BlurView>
        </Pressable>
      </Modal>

      <Modal
        visible={showNewRouteModal}
        animationType="fade"
        transparent
        onRequestClose={() => setShowNewRouteModal(false)}
      >
        <Pressable style={styles.modalOverlay} onPress={() => setShowNewRouteModal(false)}>
          <View style={styles.newRouteModal}>
            <Text style={styles.newRouteTitle}>Create New Route</Text>
            <TextInput
              style={styles.input}
              placeholder="Route name"
              placeholderTextColor={Colors.dark.inactive}
              value={newRouteName}
              onChangeText={setNewRouteName}
              autoFocus
            />
            <View style={styles.newRouteActions}>
              <Pressable
                style={styles.newRouteCancelBtn}
                onPress={() => setShowNewRouteModal(false)}
              >
                <Text style={styles.newRouteCancelText}>Cancel</Text>
              </Pressable>
              <Pressable
                style={[styles.newRouteCreateBtn, !newRouteName.trim() && styles.btnDisabled]}
                onPress={handleCreateNewRoute}
                disabled={!newRouteName.trim() || createRouteMutation.isPending}
              >
                {createRouteMutation.isPending ? (
                  <ActivityIndicator size="small" color="#FFFFFF" />
                ) : (
                  <Text style={styles.newRouteCreateText}>Create</Text>
                )}
              </Pressable>
            </View>
          </View>
        </Pressable>
      </Modal>
    </>
  );
}

const styles = StyleSheet.create({
  container: {
    position: "absolute",
    left: 0,
    right: 0,
    padding: Spacing.md,
    borderTopLeftRadius: BorderRadius.lg,
    borderTopRightRadius: BorderRadius.lg,
    overflow: "hidden",
  },
  header: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    marginBottom: Spacing.md,
  },
  countText: {
    ...Typography.headline,
    color: Colors.dark.text,
  },
  cancelButton: {
    padding: Spacing.sm,
  },
  cancelText: {
    ...Typography.body,
    color: Colors.dark.accent,
  },
  actions: {
    flexDirection: "row",
    gap: Spacing.md,
  },
  actionButton: {
    flex: 1,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: Spacing.sm,
    backgroundColor: Colors.dark.backgroundDefault,
    padding: Spacing.md,
    borderRadius: BorderRadius.sm,
  },
  actionText: {
    ...Typography.body,
    color: Colors.dark.text,
    fontWeight: "600",
  },
  modalOverlay: {
    flex: 1,
    backgroundColor: "rgba(0,0,0,0.5)",
    justifyContent: "flex-end",
  },
  sheet: {
    borderTopLeftRadius: BorderRadius.lg,
    borderTopRightRadius: BorderRadius.lg,
    padding: Spacing.lg,
    maxHeight: "60%",
  },
  sheetHandle: {
    width: 36,
    height: 5,
    backgroundColor: Colors.dark.inactive,
    borderRadius: 2.5,
    alignSelf: "center",
    marginBottom: Spacing.lg,
  },
  sheetTitle: {
    ...Typography.title,
    color: Colors.dark.text,
    marginBottom: Spacing.lg,
  },
  loader: {
    marginTop: Spacing.xl,
  },
  emptyState: {
    alignItems: "center",
    paddingVertical: Spacing.xl,
  },
  emptyText: {
    ...Typography.body,
    color: Colors.dark.textSecondary,
    marginTop: Spacing.md,
  },
  createFirstButton: {
    marginTop: Spacing.lg,
    padding: Spacing.md,
  },
  createFirstText: {
    ...Typography.body,
    color: Colors.dark.accent,
    fontWeight: "600",
  },
  routeItem: {
    flexDirection: "row",
    alignItems: "center",
    padding: Spacing.md,
    backgroundColor: Colors.dark.backgroundDefault,
    borderRadius: BorderRadius.sm,
    marginBottom: Spacing.sm,
    gap: Spacing.md,
  },
  routeInfo: {
    flex: 1,
  },
  routeName: {
    ...Typography.body,
    color: Colors.dark.text,
    fontWeight: "600",
  },
  routeDesc: {
    ...Typography.caption,
    color: Colors.dark.textSecondary,
  },
  newRouteModal: {
    backgroundColor: Colors.dark.backgroundDefault,
    margin: Spacing.lg,
    marginTop: "auto",
    marginBottom: "auto",
    borderRadius: BorderRadius.md,
    padding: Spacing.lg,
  },
  newRouteTitle: {
    ...Typography.title,
    color: Colors.dark.text,
    marginBottom: Spacing.lg,
  },
  input: {
    backgroundColor: Colors.dark.backgroundRoot,
    borderRadius: BorderRadius.sm,
    padding: Spacing.md,
    ...Typography.body,
    color: Colors.dark.text,
    marginBottom: Spacing.lg,
  },
  newRouteActions: {
    flexDirection: "row",
    gap: Spacing.md,
  },
  newRouteCancelBtn: {
    flex: 1,
    padding: Spacing.md,
    alignItems: "center",
    borderRadius: BorderRadius.sm,
    backgroundColor: Colors.dark.backgroundRoot,
  },
  newRouteCancelText: {
    ...Typography.body,
    color: Colors.dark.textSecondary,
  },
  newRouteCreateBtn: {
    flex: 1,
    padding: Spacing.md,
    alignItems: "center",
    borderRadius: BorderRadius.sm,
    backgroundColor: Colors.dark.accent,
  },
  btnDisabled: {
    opacity: 0.5,
  },
  newRouteCreateText: {
    ...Typography.body,
    color: "#FFFFFF",
    fontWeight: "600",
  },
});
