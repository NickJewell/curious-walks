import React, { createContext, useContext, useEffect, useState, ReactNode } from 'react';
import { Session, User } from '@supabase/supabase-js';
import { supabase, getRedirectUrl } from '@/lib/supabase';
import * as WebBrowser from 'expo-web-browser';

WebBrowser.maybeCompleteAuthSession();

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
  signIn: (email: string, password: string) => Promise<{ error: string | null }>;
  signUp: (email: string, password: string, fullName?: string) => Promise<{ error: string | null; needsEmailConfirmation?: boolean }>;
  signInWithGoogle: () => Promise<{ error: string | null }>;
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

  useEffect(() => {
    supabase.auth.getSession().then(({ data: { session } }) => {
      setSession(session);
      setUser(session?.user ?? null);
      if (session?.user) {
        setIsGuest(false);
        fetchProfile(session.user.id, session.user.email, session.user.user_metadata);
      }
      setLoading(false);
    });

    const { data: { subscription } } = supabase.auth.onAuthStateChange((_event, session) => {
      setSession(session);
      setUser(session?.user ?? null);
      if (session?.user) {
        setIsGuest(false);
        fetchProfile(session.user.id, session.user.email, session.user.user_metadata);
      } else {
        setProfile(null);
        setIsGuest(false);
      }
    });

    return () => subscription.unsubscribe();
  }, []);

  const fetchProfile = async (userId: string, email?: string | null, userMetadata?: Record<string, any>) => {
    const { data, error } = await supabase
      .from('profiles')
      .select('*')
      .eq('id', userId)
      .single();

    if (!error && data) {
      setProfile({
        id: data.id,
        email: data.email || email,
        avatar_url: data.avatar_url,
        full_name: data.full_name,
      });
    } else {
      const fullName = userMetadata?.full_name || userMetadata?.name || null;
      const avatarUrl = userMetadata?.avatar_url || userMetadata?.picture || null;
      
      const { error: insertError } = await supabase
        .from('profiles')
        .upsert({
          id: userId,
          email: email || null,
          full_name: fullName,
          avatar_url: avatarUrl,
        });

      if (insertError) {
        console.error('Error creating profile:', insertError);
      }

      setProfile({
        id: userId,
        email: email ?? null,
        avatar_url: avatarUrl,
        full_name: fullName,
      });
    }
  };

  const signIn = async (email: string, password: string): Promise<{ error: string | null }> => {
    try {
      const { data, error } = await supabase.auth.signInWithPassword({
        email,
        password,
      });

      if (error) {
        return { error: error.message };
      }

      return { error: null };
    } catch (error) {
      console.error('Sign in error:', error);
      return { error: 'An unexpected error occurred' };
    }
  };

  const signUp = async (email: string, password: string, fullName?: string): Promise<{ error: string | null; needsEmailConfirmation?: boolean }> => {
    try {
      const { data, error } = await supabase.auth.signUp({
        email,
        password,
        options: {
          data: {
            full_name: fullName,
          },
        },
      });

      if (error) {
        return { error: error.message };
      }

      const needsEmailConfirmation = !data.session && data.user?.identities?.length === 0;

      if (data.user) {
        const { error: profileError } = await supabase
          .from('profiles')
          .upsert({
            id: data.user.id,
            email: email,
            full_name: fullName || null,
            avatar_url: null,
          });

        if (profileError) {
          console.error('Profile creation error:', profileError);
          return { error: 'Account created but profile setup failed. Please contact support.' };
        }
      }

      return { error: null, needsEmailConfirmation };
    } catch (error) {
      console.error('Sign up error:', error);
      return { error: 'An unexpected error occurred' };
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

  const signInWithGoogle = async (): Promise<{ error: string | null }> => {
    try {
      const redirectUrl = getRedirectUrl();
      
      const { data, error } = await supabase.auth.signInWithOAuth({
        provider: 'google',
        options: {
          redirectTo: redirectUrl,
          skipBrowserRedirect: true,
        },
      });

      if (error) {
        return { error: error.message };
      }

      if (data?.url) {
        const result = await WebBrowser.openAuthSessionAsync(data.url, redirectUrl);

        if (result.type === 'success' && result.url) {
          const url = new URL(result.url);
          const params = new URLSearchParams(url.hash.substring(1));
          const accessToken = params.get('access_token');
          const refreshToken = params.get('refresh_token');

          if (accessToken && refreshToken) {
            const { error: sessionError } = await supabase.auth.setSession({
              access_token: accessToken,
              refresh_token: refreshToken,
            });

            if (sessionError) {
              return { error: sessionError.message };
            }
          }
        } else if (result.type === 'cancel') {
          return { error: null };
        }
      }

      return { error: null };
    } catch (error) {
      console.error('Google sign in error:', error);
      return { error: 'An unexpected error occurred' };
    }
  };

  return (
    <AuthContext.Provider value={{ session, user, profile, loading, isGuest, signIn, signUp, signInWithGoogle, signOut, continueAsGuest }}>
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
