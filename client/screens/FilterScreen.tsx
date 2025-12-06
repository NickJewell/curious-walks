import React, { useState } from "react";
import {
  View,
  StyleSheet,
  ScrollView,
  Text,
  Pressable,
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { useNavigation, useRoute, RouteProp } from "@react-navigation/native";
import { Feather } from "@expo/vector-icons";
import { useQuery } from "@tanstack/react-query";
import { Colors, Spacing, BorderRadius, Typography, CategoryColors } from "@/constants/theme";
import type { RootStackParamList } from "@/navigation/RootStackNavigator";
import type { Category } from "@shared/schema";

export default function FilterScreen() {
  const insets = useSafeAreaInsets();
  const navigation = useNavigation();
  const route = useRoute<RouteProp<RootStackParamList, "Filter">>();
  const { selectedCategories: initialCategories, onApply } = route.params;

  const [selectedCategories, setSelectedCategories] = useState<string[]>(initialCategories);

  const { data: categories = [] } = useQuery<Category[]>({
    queryKey: ["/api/categories"],
  });

  const toggleCategory = (categoryId: string) => {
    setSelectedCategories((prev) =>
      prev.includes(categoryId)
        ? prev.filter((id) => id !== categoryId)
        : [...prev, categoryId]
    );
  };

  const handleApply = () => {
    onApply(selectedCategories);
    navigation.goBack();
  };

  const handleClearAll = () => {
    setSelectedCategories([]);
  };

  return (
    <View style={[styles.container, { backgroundColor: Colors.dark.backgroundRoot }]}>
      <View style={styles.header}>
        <Pressable
          style={({ pressed }) => [styles.headerButton, pressed && styles.headerButtonPressed]}
          onPress={() => navigation.goBack()}
        >
          <Text style={styles.cancelText}>Cancel</Text>
        </Pressable>
        <Text style={styles.title}>Filter</Text>
        <Pressable
          style={({ pressed }) => [styles.headerButton, pressed && styles.headerButtonPressed]}
          onPress={handleApply}
        >
          <Text style={styles.applyText}>Apply</Text>
        </Pressable>
      </View>

      <ScrollView
        style={styles.scrollView}
        contentContainerStyle={[styles.scrollContent, { paddingBottom: insets.bottom + Spacing.xl }]}
        showsVerticalScrollIndicator={false}
      >
        <View style={styles.section}>
          <View style={styles.sectionHeader}>
            <Text style={styles.sectionTitle}>Categories</Text>
            {selectedCategories.length > 0 ? (
              <Pressable onPress={handleClearAll}>
                <Text style={styles.clearText}>Clear all</Text>
              </Pressable>
            ) : null}
          </View>

          {categories.map((category) => {
            const isSelected = selectedCategories.includes(category.id);
            const color = CategoryColors[category.slug] || Colors.dark.accent;

            return (
              <Pressable
                key={category.id}
                style={({ pressed }) => [
                  styles.categoryItem,
                  isSelected && styles.categoryItemSelected,
                  pressed && styles.categoryItemPressed,
                ]}
                onPress={() => toggleCategory(category.id)}
              >
                <View style={[styles.categoryIcon, { backgroundColor: color }]}>
                  <Feather name={category.iconName as any} size={18} color="#FFFFFF" />
                </View>
                <View style={styles.categoryContent}>
                  <Text style={styles.categoryName}>{category.name}</Text>
                  {category.description ? (
                    <Text style={styles.categoryDescription}>{category.description}</Text>
                  ) : null}
                </View>
                <View style={[styles.checkbox, isSelected && { backgroundColor: color }]}>
                  {isSelected ? (
                    <Feather name="check" size={14} color="#FFFFFF" />
                  ) : null}
                </View>
              </Pressable>
            );
          })}
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
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingHorizontal: Spacing.lg,
    paddingVertical: Spacing.lg,
    borderBottomWidth: 1,
    borderBottomColor: Colors.dark.border,
  },
  headerButton: {
    minWidth: 60,
  },
  headerButtonPressed: {
    opacity: 0.6,
  },
  cancelText: {
    ...Typography.body,
    color: Colors.dark.textSecondary,
  },
  applyText: {
    ...Typography.body,
    color: Colors.dark.accent,
    fontWeight: "600",
    textAlign: "right",
  },
  title: {
    ...Typography.headline,
    color: Colors.dark.text,
  },
  scrollView: {
    flex: 1,
  },
  scrollContent: {
    paddingHorizontal: Spacing.lg,
    paddingTop: Spacing.lg,
  },
  section: {
    marginBottom: Spacing.xl,
  },
  sectionHeader: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    marginBottom: Spacing.md,
  },
  sectionTitle: {
    ...Typography.headline,
    color: Colors.dark.text,
  },
  clearText: {
    ...Typography.small,
    color: Colors.dark.accent,
  },
  categoryItem: {
    flexDirection: "row",
    alignItems: "center",
    backgroundColor: Colors.dark.backgroundDefault,
    borderRadius: BorderRadius.sm,
    padding: Spacing.md,
    marginBottom: Spacing.sm,
    borderWidth: 1,
    borderColor: "transparent",
  },
  categoryItemSelected: {
    borderColor: Colors.dark.accent,
  },
  categoryItemPressed: {
    opacity: 0.6,
  },
  categoryIcon: {
    width: 40,
    height: 40,
    borderRadius: 20,
    justifyContent: "center",
    alignItems: "center",
    marginRight: Spacing.md,
  },
  categoryContent: {
    flex: 1,
  },
  categoryName: {
    ...Typography.body,
    color: Colors.dark.text,
  },
  categoryDescription: {
    ...Typography.caption,
    color: Colors.dark.textSecondary,
    marginTop: 2,
  },
  checkbox: {
    width: 24,
    height: 24,
    borderRadius: 12,
    borderWidth: 2,
    borderColor: Colors.dark.inactive,
    justifyContent: "center",
    alignItems: "center",
  },
});
