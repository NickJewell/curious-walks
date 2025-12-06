import React from "react";
import { StyleSheet, Text, Pressable } from "react-native";
import { Feather } from "@expo/vector-icons";
import { Colors, Spacing, BorderRadius, Typography, CategoryColors } from "@/constants/theme";
import type { Category } from "@shared/schema";

interface CategoryChipProps {
  category: Category;
  selected: boolean;
  onPress: () => void;
}

export default function CategoryChip({ category, selected, onPress }: CategoryChipProps) {
  const categoryColor = CategoryColors[category.slug] || Colors.dark.accent;

  return (
    <Pressable
      style={({ pressed }) => [
        styles.container,
        selected && { backgroundColor: categoryColor },
        pressed && styles.containerPressed,
      ]}
      onPress={onPress}
    >
      <Feather
        name={category.iconName as any}
        size={14}
        color={selected ? "#FFFFFF" : categoryColor}
      />
      <Text
        style={[
          styles.text,
          { color: selected ? "#FFFFFF" : categoryColor },
        ]}
      >
        {category.name}
      </Text>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  container: {
    flexDirection: "row",
    alignItems: "center",
    paddingHorizontal: Spacing.md,
    paddingVertical: Spacing.sm,
    borderRadius: BorderRadius.full,
    backgroundColor: Colors.dark.backgroundDefault,
    borderWidth: 1,
    borderColor: Colors.dark.border,
    gap: Spacing.xs,
  },
  containerPressed: {
    opacity: 0.6,
  },
  text: {
    ...Typography.small,
    fontWeight: "600",
  },
});
