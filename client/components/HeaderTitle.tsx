import React from "react";
import { View, StyleSheet, Image } from "react-native";
import { Feather } from "@expo/vector-icons";
import { Colors, Spacing, Typography } from "@/constants/theme";
import { ThemedText } from "@/components/ThemedText";

interface HeaderTitleProps {
  title?: string;
}

export function HeaderTitle({ title = "Lantern" }: HeaderTitleProps) {
  return (
    <View style={styles.container}>
      <View style={styles.iconContainer}>
        <Feather name="sun" size={18} color={Colors.dark.accent} />
      </View>
      <ThemedText style={styles.title}>{title}</ThemedText>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "flex-start",
  },
  iconContainer: {
    width: 28,
    height: 28,
    borderRadius: 14,
    backgroundColor: Colors.dark.backgroundDefault,
    justifyContent: "center",
    alignItems: "center",
    marginRight: Spacing.sm,
  },
  title: {
    ...Typography.headline,
    color: Colors.dark.textAccent,
  },
});
