import { createClient } from '@supabase/supabase-js';

const supabaseUrl = process.env.EXPO_PUBLIC_SUPABASE_URL || '';
const supabaseAnonKey = process.env.EXPO_PUBLIC_SUPABASE_ANON_KEY || '';

if (!supabaseUrl || !supabaseAnonKey) {
  console.warn('Supabase URL or Anon Key is missing. Please set EXPO_PUBLIC_SUPABASE_URL and EXPO_PUBLIC_SUPABASE_ANON_KEY.');
}

export const supabase = createClient(supabaseUrl, supabaseAnonKey);

export interface Curio {
  id: string;
  name: string;
  description: string;
  latitude: number;
  longitude: number;
}

export async function getNearestCurios(lat: number, lng: number, limit: number = 20): Promise<Curio[]> {
  const { data, error } = await supabase.rpc('get_nearest_places', {
    user_lat: lat,
    user_lng: lng,
    limit_count: limit
  });
  
  if (error) {
    console.error('Error fetching nearest places:', error);
    return [];
  }
  
  return data || [];
}
