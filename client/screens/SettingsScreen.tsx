import React, { useState, useEffect } from "react";
import {
  View,
  StyleSheet,
  ScrollView,
  Text,
  Pressable,
  Linking,
  Platform,
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { useBottomTabBarHeight } from "@react-navigation/bottom-tabs";
import { useNavigation } from "@react-navigation/native";
import { NativeStackNavigationProp } from "@react-navigation/native-stack";
import { Feather } from "@expo/vector-icons";
import AsyncStorage from "@react-native-async-storage/async-storage";
import Constants from "expo-constants";
import { Colors, Spacing, BorderRadius, Typography } from "@/constants/theme";
import type { RootStackParamList } from "@/navigation/RootStackNavigator";

const WALKING_THRESHOLD_KEY = "walking_time_threshold";
const DEFAULT_WALKING_THRESHOLD = 15;
const THRESHOLD_OPTIONS = [10, 15, 20, 25, 30];

interface SettingsItemProps {
  icon: keyof typeof Feather.glyphMap;
  title: string;
  subtitle?: string;
  onPress?: () => void;
  showArrow?: boolean;
}

function SettingsItem({ icon, title, subtitle, onPress, showArrow = true }: SettingsItemProps) {
  return (
    <Pressable
      style={({ pressed }) => [
        styles.settingsItem,
        pressed && styles.settingsItemPressed,
      ]}
      onPress={onPress}
      disabled={!onPress}
    >
      <View style={styles.settingsItemIcon}>
        <Feather name={icon} size={20} color={Colors.dark.accent} />
      </View>
      <View style={styles.settingsItemContent}>
        <Text style={styles.settingsItemTitle}>{title}</Text>
        {subtitle ? <Text style={styles.settingsItemSubtitle}>{subtitle}</Text> : null}
      </View>
      {showArrow && onPress ? (
        <Feather name="chevron-right" size={20} color={Colors.dark.inactive} />
      ) : null}
    </Pressable>
  );
}

function SettingsSection({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <View style={styles.section}>
      <Text style={styles.sectionTitle}>{title}</Text>
      <View style={styles.sectionContent}>{children}</View>
    </View>
  );
}

export default function SettingsScreen() {
  const insets = useSafeAreaInsets();
  const tabBarHeight = useBottomTabBarHeight();
  const navigation = useNavigation<NativeStackNavigationProp<RootStackParamList>>();
  const appVersion = Constants.expoConfig?.version || "1.0.0";
  const [walkingThreshold, setWalkingThreshold] = useState(DEFAULT_WALKING_THRESHOLD);

  useEffect(() => {
    AsyncStorage.getItem(WALKING_THRESHOLD_KEY).then((value) => {
      if (value) {
        setWalkingThreshold(parseInt(value, 10));
      }
    });
  }, []);

  const handleThresholdChange = async (value: number) => {
    setWalkingThreshold(value);
    await AsyncStorage.setItem(WALKING_THRESHOLD_KEY, value.toString());
  };

  const handleOpenSettings = async () => {
    if (Platform.OS !== "web") {
      try {
        await Linking.openSettings();
      } catch (error) {
        console.log("Could not open settings");
      }
    }
  };

  return (
    <View style={[styles.container, { backgroundColor: Colors.dark.backgroundRoot }]}>
      <View style={[styles.header, { paddingTop: insets.top + Spacing.lg }]}>
        <Text style={styles.title}>Settings</Text>
      </View>

      <ScrollView
        style={styles.scrollView}
        contentContainerStyle={[
          styles.scrollContent,
          { paddingBottom: tabBarHeight + Spacing.xl },
        ]}
        showsVerticalScrollIndicator={false}
      >
        <SettingsSection title="Preferences">
          <SettingsItem
            icon="map"
            title="Location Services"
            subtitle="Enable to see nearby locations"
            onPress={handleOpenSettings}
          />
          <SettingsItem
            icon="bell"
            title="Notifications"
            subtitle="Coming soon"
            showArrow={false}
          />
        </SettingsSection>

        <SettingsSection title="Routes">
          <View style={styles.thresholdContainer}>
            <View style={styles.thresholdHeader}>
              <View style={styles.settingsItemIcon}>
                <Feather name="alert-triangle" size={20} color={Colors.dark.accent} />
              </View>
              <View style={styles.thresholdContent}>
                <Text style={styles.settingsItemTitle}>Walking Time Warning</Text>
                <Text style={styles.settingsItemSubtitle}>
                  Show warning when walk between stops exceeds threshold
                </Text>
              </View>
            </View>
            <View style={styles.thresholdOptions}>
              {THRESHOLD_OPTIONS.map((option) => (
                <Pressable
                  key={option}
                  style={[
                    styles.thresholdOption,
                    walkingThreshold === option && styles.thresholdOptionActive,
                  ]}
                  onPress={() => handleThresholdChange(option)}
                >
                  <Text
                    style={[
                      styles.thresholdOptionText,
                      walkingThreshold === option && styles.thresholdOptionTextActive,
                    ]}
                  >
                    {option} min
                  </Text>
                </Pressable>
              ))}
            </View>
          </View>
        </SettingsSection>

        <SettingsSection title="About">
          <SettingsItem
            icon="info"
            title="Version"
            subtitle={appVersion}
            showArrow={false}
          />
          <SettingsItem
            icon="book-open"
            title="About Lantern"
            subtitle="Discover London's hidden stories"
            showArrow={false}
          />
        </SettingsSection>

        <SettingsSection title="Developer">
          <SettingsItem
            icon="tool"
            title="Admin Panel"
            subtitle="Manage locations and content"
            onPress={() => navigation.navigate("Admin")}
          />
        </SettingsSection>

        <View style={styles.footer}>
          <View style={styles.iconContainer}>
            <Feather name="sun" size={32} color={Colors.dark.accent} />
          </View>
          <Text style={styles.footerTitle}>Lantern</Text>
          <Text style={styles.footerSubtitle}>
            Illuminating London's folklore, legends, and mysteries
          </Text>
        </View>
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
  },
  header: {
    paddingHorizontal: Spacing.lg,
    marginBottom: Spacing.lg,
  },
  title: {
    ...Typography.largeTitle,
    color: Colors.dark.text,
  },
  scrollView: {
    flex: 1,
  },
  scrollContent: {
    paddingHorizontal: Spacing.lg,
  },
  section: {
    marginBottom: Spacing.xl,
  },
  sectionTitle: {
    ...Typography.caption,
    color: Colors.dark.textSecondary,
    textTransform: "uppercase",
    letterSpacing: 1,
    marginBottom: Spacing.sm,
    marginLeft: Spacing.md,
  },
  sectionContent: {
    backgroundColor: Colors.dark.backgroundDefault,
    borderRadius: BorderRadius.sm,
    overflow: "hidden",
  },
  settingsItem: {
    flexDirection: "row",
    alignItems: "center",
    paddingVertical: Spacing.md,
    paddingHorizontal: Spacing.md,
    borderBottomWidth: 1,
    borderBottomColor: Colors.dark.border,
  },
  settingsItemPressed: {
    opacity: 0.6,
  },
  settingsItemIcon: {
    width: 36,
    height: 36,
    borderRadius: BorderRadius.xs,
    backgroundColor: Colors.dark.backgroundSecondary,
    justifyContent: "center",
    alignItems: "center",
    marginRight: Spacing.md,
  },
  settingsItemContent: {
    flex: 1,
  },
  settingsItemTitle: {
    ...Typography.body,
    color: Colors.dark.text,
  },
  settingsItemSubtitle: {
    ...Typography.small,
    color: Colors.dark.textSecondary,
    marginTop: 2,
  },
  thresholdContainer: {
    paddingVertical: Spacing.md,
    paddingHorizontal: Spacing.md,
  },
  thresholdHeader: {
    flexDirection: "row",
    alignItems: "center",
    marginBottom: Spacing.md,
  },
  thresholdContent: {
    flex: 1,
  },
  thresholdOptions: {
    flexDirection: "row",
    gap: Spacing.sm,
  },
  thresholdOption: {
    flex: 1,
    paddingVertical: Spacing.sm,
    paddingHorizontal: Spacing.md,
    backgroundColor: Colors.dark.backgroundSecondary,
    borderRadius: BorderRadius.xs,
    alignItems: "center",
  },
  thresholdOptionActive: {
    backgroundColor: Colors.dark.accent,
  },
  thresholdOptionText: {
    ...Typography.small,
    color: Colors.dark.textSecondary,
  },
  thresholdOptionTextActive: {
    color: "#FFFFFF",
    fontWeight: "600",
  },
  footer: {
    alignItems: "center",
    paddingVertical: Spacing["3xl"],
    marginTop: Spacing.xl,
  },
  iconContainer: {
    width: 64,
    height: 64,
    borderRadius: 32,
    backgroundColor: Colors.dark.backgroundDefault,
    justifyContent: "center",
    alignItems: "center",
    marginBottom: Spacing.lg,
  },
  footerTitle: {
    ...Typography.headline,
    color: Colors.dark.textAccent,
    marginBottom: Spacing.xs,
  },
  footerSubtitle: {
    ...Typography.small,
    color: Colors.dark.textSecondary,
    textAlign: "center",
    maxWidth: 250,
  },
});
