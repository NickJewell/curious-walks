import { createClient } from '@supabase/supabase-js';
import AsyncStorage from '@react-native-async-storage/async-storage';

const supabaseUrl = process.env.EXPO_PUBLIC_SUPABASE_URL || '';
const supabaseAnonKey = process.env.EXPO_PUBLIC_SUPABASE_ANON_KEY || '';

function isServiceRoleKey(key: string): boolean {
  try {
    const parts = key.split('.');
    if (parts.length >= 2) {
      const payload = JSON.parse(atob(parts[1]));
      return payload.role === 'service_role';
    }
  } catch {
    return false;
  }
  return false;
}

if (!supabaseUrl || !supabaseAnonKey) {
  console.warn('Supabase URL or Anon Key is missing. Please set EXPO_PUBLIC_SUPABASE_URL and EXPO_PUBLIC_SUPABASE_ANON_KEY.');
}

if (supabaseAnonKey && isServiceRoleKey(supabaseAnonKey)) {
  console.error('WARNING: You are using a service_role key in the browser. This is a security risk! Please use the anon (public) key instead.');
}

export const supabase = createClient(supabaseUrl, supabaseAnonKey, {
  auth: {
    storage: AsyncStorage,
    autoRefreshToken: true,
    persistSession: true,
    detectSessionInUrl: false,
  },
});

export interface Curio {
  id: string;
  name: string;
  description: string;
  latitude: number;
  longitude: number;
}

function calculateDistance(lat1: number, lon1: number, lat2: number, lon2: number): number {
  const R = 6371000;
  const dLat = (lat2 - lat1) * Math.PI / 180;
  const dLon = (lon2 - lon1) * Math.PI / 180;
  const a = 
    Math.sin(dLat / 2) * Math.sin(dLat / 2) +
    Math.cos(lat1 * Math.PI / 180) * Math.cos(lat2 * Math.PI / 180) *
    Math.sin(dLon / 2) * Math.sin(dLon / 2);
  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
  return R * c;
}

export async function searchCurios(query: string, limit: number = 5): Promise<Curio[]> {
  if (!query || query.length < 2) return [];
  
  const searchTerm = `%${query}%`;
  
  const { data, error } = await supabase
    .from('places')
    .select('*')
    .or(`name.ilike.${searchTerm},detail-overview.ilike.${searchTerm}`)
    .limit(limit);
  
  if (error) {
    console.error('Search error:', error.message);
    return [];
  }

  if (!data || data.length === 0) {
    return [];
  }

  return data.map(place => {
    const placeLat = place.latitude ?? place.lat ?? place.y;
    const placeLng = place.longitude ?? place.lng ?? place.lon ?? place.x;
    const placeId = place['curio-id'] ?? place.curio_id ?? place.id ?? place.uuid ?? place.place_id ?? String(Math.random());
    const placeName = place.name ?? place.title ?? 'Unknown';
    const placeDesc = place['detail-overview'] ?? place.description ?? place.desc ?? place.summary ?? '';
    
    return {
      id: placeId,
      name: placeName,
      description: placeDesc,
      latitude: placeLat,
      longitude: placeLng,
    };
  }).filter(p => p.latitude != null && p.longitude != null);
}

export async function getNearestCurios(lat: number, lng: number, limit: number = 20): Promise<Curio[]> {
  console.log('Fetching places near:', lat, lng);
  
  const { data, error } = await supabase
    .from('places')
    .select('*');
  
  if (error) {
    console.error('Error fetching places:', error.message);
    return [];
  }

  if (!data || data.length === 0) {
    console.log('No places found in database');
    return [];
  }

  console.log('Found', data.length, 'places, sorting by distance from center');
  
  const placesWithCoords = data.filter(place => {
    const latField = place.latitude ?? place.lat ?? place.y;
    const lngField = place.longitude ?? place.lng ?? place.lon ?? place.x;
    return latField != null && lngField != null;
  });
  
  const placesWithDistance = placesWithCoords.map(place => {
    const placeLat = place.latitude ?? place.lat ?? place.y;
    const placeLng = place.longitude ?? place.lng ?? place.lon ?? place.x;
    const placeId = place['curio-id'] ?? place.curio_id ?? place.id ?? place.uuid ?? place.place_id ?? String(Math.random());
    const placeName = place.name ?? place.title ?? 'Unknown';
    const placeDesc = place['detail-overview'] ?? place.description ?? place.desc ?? place.summary ?? '';
    
    return {
      id: placeId,
      name: placeName,
      description: placeDesc,
      latitude: placeLat,
      longitude: placeLng,
      distance: calculateDistance(lat, lng, placeLat, placeLng)
    };
  });
  
  placesWithDistance.sort((a, b) => a.distance - b.distance);
  
  const nearest = placesWithDistance.slice(0, limit);
  console.log('Returning', nearest.length, 'nearest places');
  
  return nearest.map(({ distance, ...place }) => place);
}
