import React from "react";
import { createNativeStackNavigator } from "@react-navigation/native-stack";
import { ActivityIndicator, View, StyleSheet } from "react-native";
import MainTabNavigator from "@/navigation/MainTabNavigator";
import CompassScreen from "@/screens/CompassScreen";
import ListDetailScreen from "@/screens/ListDetailScreen";
import TourDetailScreen from "@/screens/TourDetailScreen";
import VisitedPlacesScreen from "@/screens/VisitedPlacesScreen";
import AdminEditScreen from "@/screens/AdminEditScreen";
import LoginScreen from "@/screens/LoginScreen";
import { useScreenOptions } from "@/hooks/useScreenOptions";
import { Colors } from "@/constants/theme";
import { useAuth } from "@/contexts/AuthContext";

export type RootStackParamList = {
  Login: undefined;
  Main: undefined;
  Compass: undefined;
  ListDetail: { listId: string; listName: string };
  TourDetail: { tourId: string };
  VisitedPlaces: undefined;
  AdminEdit: { curioId: string; curioName: string; isNew?: boolean; latitude?: number; longitude?: number };
};

const Stack = createNativeStackNavigator<RootStackParamList>();

export default function RootStackNavigator() {
  const screenOptions = useScreenOptions();
  const { session, loading, isGuest } = useAuth();

  if (loading) {
    return (
      <View style={styles.loadingContainer}>
        <ActivityIndicator size="large" color={Colors.dark.accent} />
      </View>
    );
  }

  const isAuthenticated = session || isGuest;

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
      {isAuthenticated ? (
        <>
          <Stack.Screen
            name="Main"
            component={MainTabNavigator}
            options={{ headerShown: false }}
          />
          <Stack.Screen
            name="Compass"
            component={CompassScreen}
            options={{
              headerShown: false,
              presentation: "fullScreenModal",
              animation: "slide_from_bottom",
            }}
          />
          <Stack.Screen
            name="ListDetail"
            component={ListDetailScreen}
            options={{
              headerShown: false,
              animation: "slide_from_right",
            }}
          />
          <Stack.Screen
            name="TourDetail"
            component={TourDetailScreen}
            options={{
              headerShown: false,
              animation: "slide_from_right",
            }}
          />
          <Stack.Screen
            name="VisitedPlaces"
            component={VisitedPlacesScreen}
            options={{
              headerShown: false,
              animation: "slide_from_right",
            }}
          />
          <Stack.Screen
            name="AdminEdit"
            component={AdminEditScreen}
            options={{
              headerShown: false,
              animation: "slide_from_right",
            }}
          />
        </>
      ) : (
        <Stack.Screen
          name="Login"
          component={LoginScreen}
          options={{ headerShown: false }}
        />
      )}
    </Stack.Navigator>
  );
}

const styles = StyleSheet.create({
  loadingContainer: {
    flex: 1,
    justifyContent: "center",
    alignItems: "center",
    backgroundColor: Colors.dark.backgroundRoot,
  },
});
