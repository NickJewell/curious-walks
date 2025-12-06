import React, { useState } from "react";
import {
  View,
  StyleSheet,
  Text,
  TextInput,
  Pressable,
  ActivityIndicator,
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { useNavigation } from "@react-navigation/native";
import { NativeStackNavigationProp } from "@react-navigation/native-stack";
import { Feather } from "@expo/vector-icons";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { KeyboardAwareScrollViewCompat } from "@/components/KeyboardAwareScrollViewCompat";
import { Colors, Spacing, BorderRadius, Typography } from "@/constants/theme";
import { apiRequest } from "@/lib/query-client";
import type { RootStackParamList } from "@/navigation/RootStackNavigator";
import type { Category, Region } from "@shared/schema";

function generateSlug(name: string): string {
  return name
    .toLowerCase()
    .replace(/[^a-z0-9\s-]/g, "")
    .replace(/\s+/g, "-")
    .replace(/-+/g, "-")
    .trim();
}

export default function AdminAddLocationScreen() {
  const insets = useSafeAreaInsets();
  const navigation = useNavigation<NativeStackNavigationProp<RootStackParamList>>();
  const queryClient = useQueryClient();

  const [latitude, setLatitude] = useState("51.5074");
  const [longitude, setLongitude] = useState("-0.1278");
  const [name, setName] = useState("");
  const [description, setDescription] = useState("");
  const [story, setStory] = useState("");
  const [address, setAddress] = useState("");
  const [categoryId, setCategoryId] = useState("");
  const [sourceAttribution, setSourceAttribution] = useState("");
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const { data: categories = [] } = useQuery<Category[]>({
    queryKey: ["/api/categories"],
  });

  const { data: regions = [] } = useQuery<Region[]>({
    queryKey: ["/api/regions"],
  });

  const createMutation = useMutation({
    mutationFn: async (data: any) => {
      return apiRequest("POST", "/api/locations", data);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/admin/locations"] });
      queryClient.invalidateQueries({ queryKey: ["/api/locations"] });
      window.alert("Location created successfully");
      navigation.goBack();
    },
    onError: (err: any) => {
      setError(err.message || "Failed to create location");
      setIsSubmitting(false);
    },
  });

  const handleSubmit = () => {
    setError(null);

    const lat = parseFloat(latitude);
    const lng = parseFloat(longitude);

    if (isNaN(lat) || lat < -90 || lat > 90) {
      setError("Please enter a valid latitude (-90 to 90).");
      return;
    }
    if (isNaN(lng) || lng < -180 || lng > 180) {
      setError("Please enter a valid longitude (-180 to 180).");
      return;
    }
    if (!name.trim()) {
      setError("Please enter a name for the location.");
      return;
    }
    if (!description.trim()) {
      setError("Please enter a description.");
      return;
    }
    if (!story.trim()) {
      setError("Please enter the story/history.");
      return;
    }
    if (!categoryId) {
      setError("Please select a category.");
      return;
    }

    setIsSubmitting(true);

    const londonRegion = regions.find(r => r.slug === "london");

    createMutation.mutate({
      name: name.trim(),
      slug: generateSlug(name.trim()),
      description: description.trim(),
      story: story.trim(),
      latitude: lat,
      longitude: lng,
      address: address.trim() || null,
      categoryId,
      regionId: londonRegion?.id || null,
      sourceAttribution: sourceAttribution.trim() || null,
      isActive: true,
    });
  };

  return (
    <View style={styles.container}>
      <KeyboardAwareScrollViewCompat
        style={styles.formScrollView}
        contentContainerStyle={[
          styles.formContent,
          { paddingBottom: insets.bottom + Spacing.xl + 80 },
        ]}
      >
        <View style={styles.webNotice}>
          <Feather name="info" size={16} color={Colors.dark.accent} />
          <Text style={styles.webNoticeText}>
            Use Expo Go on your phone for interactive map placement. On web, enter coordinates manually.
          </Text>
        </View>

        <Text style={styles.label}>Latitude *</Text>
        <TextInput
          style={styles.input}
          value={latitude}
          onChangeText={setLatitude}
          placeholder="e.g., 51.5074"
          placeholderTextColor={Colors.dark.inactive}
          keyboardType="numeric"
        />

        <Text style={styles.label}>Longitude *</Text>
        <TextInput
          style={styles.input}
          value={longitude}
          onChangeText={setLongitude}
          placeholder="e.g., -0.1278"
          placeholderTextColor={Colors.dark.inactive}
          keyboardType="numeric"
        />

        <Text style={styles.label}>Name *</Text>
        <TextInput
          style={styles.input}
          value={name}
          onChangeText={setName}
          placeholder="e.g., The Haunted Tavern"
          placeholderTextColor={Colors.dark.inactive}
        />

        <Text style={styles.label}>Category *</Text>
        <View style={styles.categoryPicker}>
          {categories.map((category) => (
            <Pressable
              key={category.id}
              style={[
                styles.categoryOption,
                categoryId === category.id && styles.categoryOptionSelected,
              ]}
              onPress={() => setCategoryId(category.id)}
            >
              <Text
                style={[
                  styles.categoryOptionText,
                  categoryId === category.id && styles.categoryOptionTextSelected,
                ]}
              >
                {category.name}
              </Text>
            </Pressable>
          ))}
        </View>

        <Text style={styles.label}>Short Description *</Text>
        <TextInput
          style={[styles.input, styles.textArea]}
          value={description}
          onChangeText={setDescription}
          placeholder="A brief one-line summary..."
          placeholderTextColor={Colors.dark.inactive}
          multiline
          numberOfLines={2}
        />

        <Text style={styles.label}>Full Story *</Text>
        <TextInput
          style={[styles.input, styles.largeTextArea]}
          value={story}
          onChangeText={setStory}
          placeholder="The detailed history and folklore of this location..."
          placeholderTextColor={Colors.dark.inactive}
          multiline
          numberOfLines={6}
        />

        <Text style={styles.label}>Address (optional)</Text>
        <TextInput
          style={styles.input}
          value={address}
          onChangeText={setAddress}
          placeholder="e.g., 123 Mystery Lane, London EC1"
          placeholderTextColor={Colors.dark.inactive}
        />

        <Text style={styles.label}>Source Attribution (optional)</Text>
        <TextInput
          style={styles.input}
          value={sourceAttribution}
          onChangeText={setSourceAttribution}
          placeholder="e.g., Local Folklore Society"
          placeholderTextColor={Colors.dark.inactive}
        />

        {error ? (
          <View style={styles.errorContainer}>
            <Feather name="alert-circle" size={16} color="#E57373" />
            <Text style={styles.errorText}>{error}</Text>
          </View>
        ) : null}
      </KeyboardAwareScrollViewCompat>

      <View style={[styles.bottomBar, { paddingBottom: insets.bottom + Spacing.md }]}>
        <Pressable
          style={({ pressed }) => [
            styles.submitButton,
            isSubmitting && styles.submitButtonDisabled,
            pressed && !isSubmitting && styles.submitButtonPressed,
          ]}
          onPress={handleSubmit}
          disabled={isSubmitting}
        >
          {isSubmitting ? (
            <ActivityIndicator color="#FFFFFF" />
          ) : (
            <>
              <Feather name="check" size={20} color="#FFFFFF" />
              <Text style={styles.submitButtonText}>Create Location</Text>
            </>
          )}
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
  formScrollView: {
    flex: 1,
  },
  formContent: {
    padding: Spacing.lg,
  },
  webNotice: {
    flexDirection: "row",
    alignItems: "center",
    gap: Spacing.sm,
    backgroundColor: Colors.dark.accent + "20",
    padding: Spacing.md,
    borderRadius: BorderRadius.sm,
    marginBottom: Spacing.lg,
  },
  webNoticeText: {
    ...Typography.body,
    color: Colors.dark.textSecondary,
    flex: 1,
  },
  label: {
    ...Typography.caption,
    color: Colors.dark.textSecondary,
    textTransform: "uppercase",
    letterSpacing: 1,
    marginBottom: Spacing.xs,
    marginTop: Spacing.md,
  },
  input: {
    backgroundColor: Colors.dark.backgroundDefault,
    borderRadius: BorderRadius.sm,
    padding: Spacing.md,
    ...Typography.body,
    color: Colors.dark.text,
    borderWidth: 1,
    borderColor: Colors.dark.border,
  },
  textArea: {
    minHeight: 60,
  },
  largeTextArea: {
    minHeight: 150,
  },
  categoryPicker: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: Spacing.sm,
  },
  categoryOption: {
    paddingHorizontal: Spacing.md,
    paddingVertical: Spacing.sm,
    borderRadius: BorderRadius.sm,
    backgroundColor: Colors.dark.backgroundDefault,
    borderWidth: 1,
    borderColor: Colors.dark.border,
  },
  categoryOptionSelected: {
    backgroundColor: Colors.dark.accent + "30",
    borderColor: Colors.dark.accent,
  },
  categoryOptionText: {
    ...Typography.body,
    color: Colors.dark.textSecondary,
  },
  categoryOptionTextSelected: {
    color: Colors.dark.accent,
    fontWeight: "600",
  },
  errorContainer: {
    flexDirection: "row",
    alignItems: "center",
    gap: Spacing.sm,
    backgroundColor: "#E5737320",
    padding: Spacing.md,
    borderRadius: BorderRadius.sm,
    marginTop: Spacing.lg,
  },
  errorText: {
    ...Typography.body,
    color: "#E57373",
    flex: 1,
  },
  bottomBar: {
    backgroundColor: Colors.dark.backgroundDefault,
    paddingTop: Spacing.md,
    paddingHorizontal: Spacing.lg,
    borderTopWidth: 1,
    borderTopColor: Colors.dark.border,
  },
  submitButton: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: Spacing.sm,
    backgroundColor: Colors.dark.accent,
    paddingVertical: Spacing.md,
    borderRadius: BorderRadius.sm,
  },
  submitButtonDisabled: {
    opacity: 0.7,
  },
  submitButtonPressed: {
    opacity: 0.8,
  },
  submitButtonText: {
    ...Typography.body,
    color: "#FFFFFF",
    fontWeight: "600",
  },
});
