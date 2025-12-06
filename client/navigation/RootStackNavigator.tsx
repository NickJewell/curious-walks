import React from "react";
import { createNativeStackNavigator } from "@react-navigation/native-stack";
import MainTabNavigator from "@/navigation/MainTabNavigator";
import LocationDetailScreen from "@/screens/LocationDetailScreen";
import RouteDetailScreen from "@/screens/RouteDetailScreen";
import FilterScreen from "@/screens/FilterScreen";
import AdminScreen from "@/screens/AdminScreen";
import AdminAddLocationScreen from "@/screens/AdminAddLocationScreen";
import { useScreenOptions } from "@/hooks/useScreenOptions";
import { Colors } from "@/constants/theme";
import type { Location, Route as AppRoute, Category } from "@shared/schema";

export type RootStackParamList = {
  Main: undefined;
  LocationDetail: { location: Location; category?: Category };
  RouteDetail: { route: AppRoute };
  Filter: { 
    selectedCategories: string[];
    onApply: (categories: string[]) => void;
  };
  Admin: undefined;
  AdminAddLocation: { latitude?: number; longitude?: number };
};

const Stack = createNativeStackNavigator<RootStackParamList>();

export default function RootStackNavigator() {
  const screenOptions = useScreenOptions();

  return (
    <Stack.Navigator 
      screenOptions={{
        ...screenOptions,
        headerStyle: {
          backgroundColor: Colors.dark.backgroundRoot,
        },
        headerTintColor: Colors.dark.text,
      }}
    >
      <Stack.Screen
        name="Main"
        component={MainTabNavigator}
        options={{ headerShown: false }}
      />
      <Stack.Screen
        name="LocationDetail"
        component={LocationDetailScreen}
        options={{
          presentation: "modal",
          headerShown: false,
        }}
      />
      <Stack.Screen
        name="RouteDetail"
        component={RouteDetailScreen}
        options={{
          headerTitle: "Route Details",
          headerBackTitle: "Back",
        }}
      />
      <Stack.Screen
        name="Filter"
        component={FilterScreen}
        options={{
          presentation: "modal",
          headerTitle: "Filter",
        }}
      />
      <Stack.Screen
        name="Admin"
        component={AdminScreen}
        options={{
          headerTitle: "Admin",
          headerBackTitle: "Back",
        }}
      />
      <Stack.Screen
        name="AdminAddLocation"
        component={AdminAddLocationScreen}
        options={{
          presentation: "modal",
          headerTitle: "Add Location",
        }}
      />
    </Stack.Navigator>
  );
}
