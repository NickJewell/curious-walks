import React from 'react';
import {
  View,
  Text,
  StyleSheet,
  Pressable,
  Alert,
} from 'react-native';
import { Image } from 'expo-image';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { BlurView } from 'expo-blur';
import { Feather } from '@expo/vector-icons';
import { useAuth } from '@/contexts/AuthContext';
import { Colors, Spacing, BorderRadius, Typography } from '@/constants/theme';

export default function ProfileScreen() {
  const insets = useSafeAreaInsets();
  const { user, profile, isGuest, signOut, signInWithGoogle } = useAuth();

  const handleSignOut = async () => {
    Alert.alert(
      'Sign Out',
      'Are you sure you want to sign out?',
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Sign Out',
          style: 'destructive',
          onPress: async () => {
            try {
              await signOut();
            } catch (error) {
              console.error('Sign out error:', error);
            }
          },
        },
      ]
    );
  };

  const handleSignIn = async () => {
    try {
      await signInWithGoogle();
    } catch (error) {
      console.error('Sign in error:', error);
      Alert.alert('Error', 'Failed to sign in with Google');
    }
  };

  return (
    <View style={[styles.container, { paddingTop: insets.top + Spacing.xl }]}>
      <View style={styles.header}>
        <Text style={styles.headerTitle}>Profile</Text>
      </View>

      <View style={styles.content}>
        {isGuest ? (
          <View style={styles.guestCard}>
            <View style={styles.guestIconContainer}>
              <Feather name="user" size={40} color={Colors.dark.textSecondary} />
            </View>
            <Text style={styles.guestTitle}>Guest Mode</Text>
            <Text style={styles.guestSubtitle}>
              Sign in to save your progress and access all features
            </Text>
            <Pressable
              style={({ pressed }) => [
                styles.signInButton,
                pressed && styles.signInButtonPressed,
              ]}
              onPress={handleSignIn}
            >
              <View style={styles.googleIconContainer}>
                <Text style={styles.googleIcon}>G</Text>
              </View>
              <Text style={styles.signInButtonText}>Continue with Google</Text>
            </Pressable>
          </View>
        ) : (
          <View style={styles.profileCard}>
            {profile?.avatar_url ? (
              <Image
                source={{ uri: profile.avatar_url }}
                style={styles.avatar}
                contentFit="cover"
              />
            ) : (
              <View style={styles.avatarPlaceholder}>
                <Feather name="user" size={32} color={Colors.dark.text} />
              </View>
            )}
            <Text style={styles.profileName}>
              {profile?.full_name || 'Explorer'}
            </Text>
            <Text style={styles.profileEmail}>
              {user?.email || profile?.email || 'No email'}
            </Text>
          </View>
        )}

        {!isGuest ? (
          <View style={styles.menuSection}>
            <Pressable
              style={({ pressed }) => [
                styles.menuItem,
                styles.menuItemDanger,
                pressed && styles.menuItemPressed,
              ]}
              onPress={handleSignOut}
            >
              <Feather name="log-out" size={20} color="#E74C3C" />
              <Text style={styles.menuItemTextDanger}>Sign Out</Text>
            </Pressable>
          </View>
        ) : null}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: Colors.dark.backgroundRoot,
  },
  header: {
    paddingHorizontal: Spacing.xl,
    paddingBottom: Spacing.lg,
  },
  headerTitle: {
    fontSize: 32,
    fontWeight: '700',
    color: Colors.dark.text,
  },
  content: {
    flex: 1,
    paddingHorizontal: Spacing.xl,
  },
  guestCard: {
    backgroundColor: Colors.dark.backgroundCard,
    borderRadius: BorderRadius.lg,
    padding: Spacing.xl,
    alignItems: 'center',
  },
  guestIconContainer: {
    width: 80,
    height: 80,
    borderRadius: 40,
    backgroundColor: Colors.dark.backgroundRoot,
    justifyContent: 'center',
    alignItems: 'center',
    marginBottom: Spacing.lg,
  },
  guestTitle: {
    fontSize: 20,
    fontWeight: '600',
    color: Colors.dark.text,
    marginBottom: Spacing.sm,
  },
  guestSubtitle: {
    fontSize: 14,
    color: Colors.dark.textSecondary,
    textAlign: 'center',
    marginBottom: Spacing.xl,
    lineHeight: 20,
  },
  signInButton: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#FFFFFF',
    paddingVertical: Spacing.md,
    paddingHorizontal: Spacing.xl,
    borderRadius: BorderRadius.md,
    gap: Spacing.sm,
  },
  signInButtonPressed: {
    opacity: 0.9,
  },
  googleIconContainer: {
    width: 20,
    height: 20,
    borderRadius: 10,
    backgroundColor: '#4285F4',
    justifyContent: 'center',
    alignItems: 'center',
  },
  googleIcon: {
    fontSize: 12,
    fontWeight: '700',
    color: '#FFFFFF',
  },
  signInButtonText: {
    fontSize: 14,
    fontWeight: '600',
    color: '#1A1A1A',
  },
  profileCard: {
    backgroundColor: Colors.dark.backgroundCard,
    borderRadius: BorderRadius.lg,
    padding: Spacing.xl,
    alignItems: 'center',
  },
  avatar: {
    width: 80,
    height: 80,
    borderRadius: 40,
    marginBottom: Spacing.lg,
  },
  avatarPlaceholder: {
    width: 80,
    height: 80,
    borderRadius: 40,
    backgroundColor: Colors.dark.accent,
    justifyContent: 'center',
    alignItems: 'center',
    marginBottom: Spacing.lg,
  },
  profileName: {
    fontSize: 20,
    fontWeight: '600',
    color: Colors.dark.text,
    marginBottom: Spacing.xs,
  },
  profileEmail: {
    fontSize: 14,
    color: Colors.dark.textSecondary,
  },
  menuSection: {
    marginTop: Spacing.xl,
    gap: Spacing.sm,
  },
  menuItem: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: Colors.dark.backgroundCard,
    paddingVertical: Spacing.lg,
    paddingHorizontal: Spacing.lg,
    borderRadius: BorderRadius.md,
    gap: Spacing.md,
  },
  menuItemDanger: {},
  menuItemPressed: {
    opacity: 0.7,
  },
  menuItemTextDanger: {
    fontSize: 16,
    color: '#E74C3C',
  },
});
