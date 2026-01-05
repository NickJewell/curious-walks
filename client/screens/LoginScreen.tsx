import React, { useState } from 'react';
import {
  View,
  Text,
  StyleSheet,
  Pressable,
  ActivityIndicator,
  Alert,
  TextInput,
} from 'react-native';
import { Image } from 'expo-image';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Feather } from '@expo/vector-icons';
import { useAuth } from '@/contexts/AuthContext';
import { Colors, Spacing, BorderRadius, Typography } from '@/constants/theme';
import { KeyboardAwareScrollViewCompat } from '@/components/KeyboardAwareScrollViewCompat';

type AuthMode = 'signIn' | 'signUp';

export default function LoginScreen() {
  const insets = useSafeAreaInsets();
  const { signIn, signUp, continueAsGuest } = useAuth();
  const [isLoading, setIsLoading] = useState(false);
  const [mode, setMode] = useState<AuthMode>('signIn');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [fullName, setFullName] = useState('');
  const [showPassword, setShowPassword] = useState(false);

  const handleSubmit = async () => {
    if (!email.trim() || !password.trim()) {
      Alert.alert('Missing Information', 'Please enter your email and password.');
      return;
    }

    if (mode === 'signUp' && password.length < 6) {
      Alert.alert('Weak Password', 'Password must be at least 6 characters.');
      return;
    }

    try {
      setIsLoading(true);
      
      if (mode === 'signIn') {
        const { error } = await signIn(email.trim(), password);
        if (error) {
          Alert.alert('Sign In Failed', error);
        }
      } else {
        const { error, needsEmailConfirmation } = await signUp(email.trim(), password, fullName.trim() || undefined);
        if (error) {
          Alert.alert('Sign Up Failed', error);
        } else if (needsEmailConfirmation) {
          Alert.alert(
            'Check Your Email',
            'We sent you a confirmation link. Please check your email to verify your account before signing in.',
            [{ text: 'OK' }]
          );
          setMode('signIn');
        } else {
          Alert.alert(
            'Account Created',
            'Your account has been created. You can now explore Lantern!',
            [{ text: 'OK' }]
          );
        }
      }
    } catch (error) {
      console.error('Auth error:', error);
      Alert.alert('Error', 'Something went wrong. Please try again.');
    } finally {
      setIsLoading(false);
    }
  };

  const toggleMode = () => {
    setMode(mode === 'signIn' ? 'signUp' : 'signIn');
    setPassword('');
  };

  const handleGuestAccess = () => {
    continueAsGuest();
  };

  return (
    <View style={styles.container}>
      <Image
        source={require('../../assets/images/splash.jpg')}
        style={styles.heroImage}
        contentFit="cover"
      />
      
      <View style={styles.overlay} />

      <KeyboardAwareScrollViewCompat
        style={styles.scrollView}
        contentContainerStyle={[
          styles.content,
          { paddingBottom: insets.bottom + Spacing.xl }
        ]}
        keyboardShouldPersistTaps="handled"
      >
        <View style={styles.titleContainer}>
          <Text style={styles.title}>Discover</Text>
          <Text style={styles.titleAccent}>Hidden London</Text>
          <Text style={styles.subtitle}>
            Uncover mysteries, legends, and forgotten stories scattered across the city
          </Text>
        </View>

        <View style={styles.formContainer}>
          {mode === 'signUp' && (
            <View style={styles.inputContainer}>
              <Feather name="user" size={20} color={Colors.dark.textSecondary} style={styles.inputIcon} />
              <TextInput
                style={styles.input}
                placeholder="Full Name (optional)"
                placeholderTextColor={Colors.dark.textSecondary}
                value={fullName}
                onChangeText={setFullName}
                autoCapitalize="words"
                autoCorrect={false}
              />
            </View>
          )}

          <View style={styles.inputContainer}>
            <Feather name="mail" size={20} color={Colors.dark.textSecondary} style={styles.inputIcon} />
            <TextInput
              style={styles.input}
              placeholder="Email"
              placeholderTextColor={Colors.dark.textSecondary}
              value={email}
              onChangeText={setEmail}
              keyboardType="email-address"
              autoCapitalize="none"
              autoCorrect={false}
            />
          </View>

          <View style={styles.inputContainer}>
            <Feather name="lock" size={20} color={Colors.dark.textSecondary} style={styles.inputIcon} />
            <TextInput
              style={[styles.input, styles.passwordInput]}
              placeholder="Password"
              placeholderTextColor={Colors.dark.textSecondary}
              value={password}
              onChangeText={setPassword}
              secureTextEntry={!showPassword}
              autoCapitalize="none"
              autoCorrect={false}
            />
            <Pressable onPress={() => setShowPassword(!showPassword)} style={styles.eyeButton}>
              <Feather 
                name={showPassword ? "eye-off" : "eye"} 
                size={20} 
                color={Colors.dark.textSecondary} 
              />
            </Pressable>
          </View>

          <Pressable
            style={({ pressed }) => [
              styles.submitButton,
              pressed && styles.submitButtonPressed,
              isLoading && styles.submitButtonDisabled,
            ]}
            onPress={handleSubmit}
            disabled={isLoading}
          >
            {isLoading ? (
              <ActivityIndicator size="small" color="#FFFFFF" />
            ) : (
              <Text style={styles.submitButtonText}>
                {mode === 'signIn' ? 'Sign In' : 'Create Account'}
              </Text>
            )}
          </Pressable>

          <Pressable style={styles.toggleLink} onPress={toggleMode}>
            <Text style={styles.toggleText}>
              {mode === 'signIn' 
                ? "Don't have an account? " 
                : "Already have an account? "}
              <Text style={styles.toggleTextBold}>
                {mode === 'signIn' ? 'Sign Up' : 'Sign In'}
              </Text>
            </Text>
          </Pressable>

          <View style={styles.divider}>
            <View style={styles.dividerLine} />
            <Text style={styles.dividerText}>or</Text>
            <View style={styles.dividerLine} />
          </View>

          <Pressable style={styles.guestLink} onPress={handleGuestAccess}>
            <Text style={styles.guestText}>Continue as Guest</Text>
            <Feather name="arrow-right" size={16} color={Colors.dark.textSecondary} />
          </Pressable>
        </View>
      </KeyboardAwareScrollViewCompat>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: Colors.dark.backgroundRoot,
  },
  heroImage: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    height: '50%',
  },
  overlay: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    backgroundColor: 'rgba(10, 14, 20, 0.5)',
  },
  scrollView: {
    flex: 1,
  },
  content: {
    flex: 1,
    justifyContent: 'flex-end',
    paddingHorizontal: Spacing.xl,
    minHeight: '100%',
  },
  titleContainer: {
    marginBottom: Spacing.xl,
  },
  title: {
    fontSize: 40,
    fontWeight: '300',
    color: Colors.dark.text,
    letterSpacing: -1,
  },
  titleAccent: {
    fontSize: 40,
    fontWeight: '700',
    color: Colors.dark.accent,
    letterSpacing: -1,
    marginBottom: Spacing.sm,
  },
  subtitle: {
    fontSize: 15,
    color: Colors.dark.textSecondary,
    lineHeight: 22,
    maxWidth: 280,
  },
  formContainer: {
    gap: Spacing.md,
  },
  inputContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: 'rgba(255, 255, 255, 0.1)',
    borderRadius: BorderRadius.md,
    borderWidth: 1,
    borderColor: 'rgba(255, 255, 255, 0.15)',
  },
  inputIcon: {
    paddingLeft: Spacing.md,
  },
  input: {
    flex: 1,
    paddingVertical: Spacing.md,
    paddingHorizontal: Spacing.md,
    fontSize: 16,
    color: Colors.dark.text,
  },
  passwordInput: {
    paddingRight: Spacing.xl * 2,
  },
  eyeButton: {
    position: 'absolute',
    right: Spacing.md,
    padding: Spacing.xs,
  },
  submitButton: {
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: Colors.dark.accent,
    paddingVertical: Spacing.lg,
    paddingHorizontal: Spacing.xl,
    borderRadius: BorderRadius.md,
    marginTop: Spacing.sm,
  },
  submitButtonPressed: {
    opacity: 0.9,
    transform: [{ scale: 0.98 }],
  },
  submitButtonDisabled: {
    opacity: 0.7,
  },
  submitButtonText: {
    fontSize: 16,
    fontWeight: '600',
    color: '#FFFFFF',
  },
  toggleLink: {
    alignItems: 'center',
    paddingVertical: Spacing.sm,
  },
  toggleText: {
    fontSize: 14,
    color: Colors.dark.textSecondary,
  },
  toggleTextBold: {
    fontWeight: '600',
    color: Colors.dark.accent,
  },
  divider: {
    flexDirection: 'row',
    alignItems: 'center',
    marginVertical: Spacing.sm,
  },
  dividerLine: {
    flex: 1,
    height: 1,
    backgroundColor: 'rgba(255, 255, 255, 0.15)',
  },
  dividerText: {
    paddingHorizontal: Spacing.md,
    fontSize: 13,
    color: Colors.dark.textSecondary,
  },
  guestLink: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: Spacing.md,
    gap: Spacing.xs,
  },
  guestText: {
    fontSize: 14,
    color: Colors.dark.textSecondary,
  },
});
