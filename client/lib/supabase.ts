import { createClient } from '@supabase/supabase-js';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { makeRedirectUri } from 'expo-auth-session';
import * as Linking from 'expo-linking';
import { Platform } from 'react-native';

const supabaseUrl = process.env.EXPO_PUBLIC_SUPABASE_URL || '';
const supabaseAnonKey = process.env.EXPO_PUBLIC_SUPABASE_ANON_KEY || '';

export const getRedirectUrl = () => {
  const redirectUri = makeRedirectUri({
    scheme: 'lantern',
    path: 'auth/callback',
  });
  console.log('OAuth redirect URL:', redirectUri);
  return redirectUri;
};

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
  curioType?: string;
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
    const placeId = place.curio_id ?? place['curio-id'] ?? place.uuid ?? place.id ?? place.place_id ?? String(Math.random());
    const placeName = place.name ?? place.title ?? 'Unknown';
    const placeDesc = place.detail_overview ?? place['detail-overview'] ?? place.description ?? place.desc ?? place.summary ?? '';
    const placeType = place.curio_type ?? place['curio-type'] ?? '';
    
    return {
      id: placeId,
      name: placeName,
      description: placeDesc,
      latitude: placeLat,
      longitude: placeLng,
      curioType: placeType,
    };
  }).filter(p => p.latitude != null && p.longitude != null);
}

// Cache for nearby curios to prevent redundant requests
let nearbyCache: { lat: number; lng: number; data: Curio[]; timestamp: number } | null = null;
let fetchInProgress: Promise<Curio[]> | null = null;

export async function getNearestCurios(lat: number, lng: number, limit: number = 20): Promise<Curio[]> {
  // Check if we have a recent cached result for nearby coordinates (within 100m)
  if (nearbyCache) {
    const cacheAge = Date.now() - nearbyCache.timestamp;
    const cacheDistance = calculateDistance(lat, lng, nearbyCache.lat, nearbyCache.lng);
    // Use cache if it's less than 30 seconds old and within 100 meters
    if (cacheAge < 30000 && cacheDistance < 100) {
      console.log('Using cached places data');
      return nearbyCache.data.slice(0, limit);
    }
  }
  
  // If a fetch is already in progress, wait for it
  if (fetchInProgress) {
    console.log('Waiting for existing fetch to complete');
    return fetchInProgress;
  }
  
  console.log('Fetching places near:', lat, lng);
  
  fetchInProgress = (async () => {
    try {
      console.log('Starting Supabase places query...');
      const startTime = Date.now();
      
      // Supabase has a default limit of 1000 rows - fetch all by using range
      let allData: any[] = [];
      let from = 0;
      const pageSize = 1000;
      let hasMore = true;
      
      while (hasMore) {
        console.log(`Fetching page starting at ${from}...`);
        const { data: pageData, error: pageError } = await supabase
          .from('places')
          .select('*')
          .range(from, from + pageSize - 1);
        
        if (pageError) {
          console.error('Error fetching places:', pageError.message, pageError);
          return [];
        }
        
        console.log(`Page fetched: ${pageData?.length || 0} records in ${Date.now() - startTime}ms`);
        
        if (pageData && pageData.length > 0) {
          allData = allData.concat(pageData);
          from += pageSize;
          hasMore = pageData.length === pageSize;
        } else {
          hasMore = false;
        }
      }
      
      const data = allData;

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
        const placeId = place.curio_id ?? place['curio-id'] ?? place.uuid ?? place.id ?? place.place_id ?? String(Math.random());
        const placeName = place.name ?? place.title ?? 'Unknown';
        const placeDesc = place.detail_overview ?? place['detail-overview'] ?? place.description ?? place.desc ?? place.summary ?? '';
        const placeType = place.curio_type ?? place['curio-type'] ?? '';
        
        return {
          id: placeId,
          name: placeName,
          description: placeDesc,
          latitude: placeLat,
          longitude: placeLng,
          curioType: placeType,
          distance: calculateDistance(lat, lng, placeLat, placeLng)
        };
      });
      
      placesWithDistance.sort((a, b) => a.distance - b.distance);
      
      const allSortedPlaces = placesWithDistance.map(({ distance, ...place }) => place);
      
      // Cache all fetched places for reuse
      nearbyCache = {
        lat,
        lng,
        data: allSortedPlaces,
        timestamp: Date.now()
      };
      
      console.log('Returning', Math.min(limit, allSortedPlaces.length), 'nearest places');
      
      return allSortedPlaces.slice(0, limit);
    } catch (error) {
      console.error('Error fetching places:', error);
      return [];
    } finally {
      fetchInProgress = null;
    }
  })();
  
  return fetchInProgress;
}
