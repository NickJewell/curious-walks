import React, { createContext, useContext, useEffect, useState, ReactNode } from 'react';
import { Session, User } from '@supabase/supabase-js';
import { supabase } from '@/lib/supabase';
import * as WebBrowser from 'expo-web-browser';
import * as Google from 'expo-auth-session/providers/google';
import { makeRedirectUri } from 'expo-auth-session';
import { Platform } from 'react-native';

WebBrowser.maybeCompleteAuthSession();

const GOOGLE_WEB_CLIENT_ID = process.env.EXPO_PUBLIC_GOOGLE_WEB_CLIENT_ID || '';
const GOOGLE_IOS_CLIENT_ID = process.env.EXPO_PUBLIC_GOOGLE_IOS_CLIENT_ID || '';
const GOOGLE_ANDROID_CLIENT_ID = process.env.EXPO_PUBLIC_GOOGLE_ANDROID_CLIENT_ID || '';

interface UserProfile {
  id: string;
  email: string | null;
  avatar_url: string | null;
  full_name: string | null;
}

interface AuthContextType {
  session: Session | null;
  user: User | null;
  profile: UserProfile | null;
  loading: boolean;
  isGuest: boolean;
  signInWithGoogle: () => Promise<void>;
  signOut: () => Promise<void>;
  continueAsGuest: () => void;
}

const AuthContext = createContext<AuthContextType | undefined>(undefined);

export function AuthProvider({ children }: { children: ReactNode }) {
  const [session, setSession] = useState<Session | null>(null);
  const [user, setUser] = useState<User | null>(null);
  const [profile, setProfile] = useState<UserProfile | null>(null);
  const [loading, setLoading] = useState(true);
  const [isGuest, setIsGuest] = useState(false);

  // For iOS, Google uses reversed client ID as scheme
  const iosReversedClientId = GOOGLE_IOS_CLIENT_ID 
    ? GOOGLE_IOS_CLIENT_ID.split('.').reverse().join('.')
    : '';

  const redirectUri = Platform.select({
    web: typeof window !== 'undefined' ? `${window.location.origin}/auth/google/callback` : undefined,
    ios: iosReversedClientId ? `${iosReversedClientId}:/` : undefined,
    default: undefined,
  });

  console.log('OAuth redirect URI:', redirectUri || 'using default');
  console.log('Platform:', Platform.OS);

  const [request, response, promptAsync] = Google.useIdTokenAuthRequest({
    clientId: GOOGLE_WEB_CLIENT_ID,
    iosClientId: GOOGLE_IOS_CLIENT_ID || undefined,
    androidClientId: GOOGLE_ANDROID_CLIENT_ID || undefined,
    ...(redirectUri && { redirectUri }),
  });

  useEffect(() => {
    const handleGoogleResponse = async () => {
      console.log('Google OAuth response:', response?.type);
      
      if (response?.type === 'success') {
        const { id_token } = response.params;
        console.log('Got id_token:', id_token ? 'yes' : 'no');
        
        if (id_token) {
          try {
            const { data, error } = await supabase.auth.signInWithIdToken({
              provider: 'google',
              token: id_token,
            });
            
            if (error) {
              console.error('Supabase signInWithIdToken error:', error);
            } else {
              console.log('Supabase sign in successful');
            }
          } catch (error) {
            console.error('Error exchanging Google token:', error);
          }
        }
      } else if (response?.type === 'error') {
        console.error('Google OAuth error:', response.error);
      }
    };

    handleGoogleResponse();
  }, [response]);

  useEffect(() => {
    supabase.auth.getSession().then(({ data: { session } }) => {
      setSession(session);
      setUser(session?.user ?? null);
      if (session?.user) {
        setIsGuest(false);
        fetchProfile(session.user.id);
      }
      setLoading(false);
    });

    const { data: { subscription } } = supabase.auth.onAuthStateChange((_event, session) => {
      setSession(session);
      setUser(session?.user ?? null);
      if (session?.user) {
        setIsGuest(false);
        fetchProfile(session.user.id);
      } else {
        setProfile(null);
        setIsGuest(false);
      }
    });

    return () => subscription.unsubscribe();
  }, []);

  const fetchProfile = async (userId: string) => {
    const { data, error } = await supabase
      .from('profiles')
      .select('*')
      .eq('id', userId)
      .single();

    if (!error && data) {
      setProfile({
        id: data.id,
        email: data.email,
        avatar_url: data.avatar_url,
        full_name: data.full_name,
      });
    } else {
      setProfile({
        id: userId,
        email: user?.email ?? null,
        avatar_url: user?.user_metadata?.avatar_url ?? null,
        full_name: user?.user_metadata?.full_name ?? null,
      });
    }
  };

  const signInWithGoogle = async () => {
    if (!GOOGLE_WEB_CLIENT_ID) {
      console.error('Google Web Client ID not configured. Please set EXPO_PUBLIC_GOOGLE_WEB_CLIENT_ID');
      throw new Error('Google authentication not configured');
    }
    
    try {
      await promptAsync();
    } catch (error) {
      console.error('Google sign-in error:', error);
      throw error;
    }
  };

  const signOut = async () => {
    try {
      await supabase.auth.signOut();
      setSession(null);
      setUser(null);
      setProfile(null);
      setIsGuest(false);
    } catch (error) {
      console.error('Sign out error:', error);
      throw error;
    }
  };

  const continueAsGuest = () => {
    setIsGuest(true);
  };

  return (
    <AuthContext.Provider value={{ session, user, profile, loading, isGuest, signInWithGoogle, signOut, continueAsGuest }}>
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth() {
  const context = useContext(AuthContext);
  if (context === undefined) {
    throw new Error('useAuth must be used within an AuthProvider');
  }
  return context;
}
