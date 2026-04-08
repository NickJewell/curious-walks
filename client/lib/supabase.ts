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
  detailAudioPath?: string | null;
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
    .eq('visible_flag', true)
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
    const audioPath = place.detail_audio_path ?? place['detail-audio-path'] ?? null;
    
    return {
      id: placeId,
      name: placeName,
      description: placeDesc,
      latitude: placeLat,
      longitude: placeLng,
      curioType: placeType,
      detailAudioPath: audioPath,
    };
  }).filter(p => p.latitude != null && p.longitude != null);
}

// Cache for nearby curios to prevent redundant requests
let nearbyCache: { lat: number; lng: number; data: Curio[]; timestamp: number } | null = null;
let fetchInProgress: Promise<Curio[]> | null = null;

function processPlaces(data: any[], lat: number, lng: number, limit: number): Curio[] {
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
    const audioPath = place.detail_audio_path ?? place['detail-audio-path'] ?? null;
    
    return {
      id: placeId,
      name: placeName,
      description: placeDesc,
      latitude: placeLat,
      longitude: placeLng,
      curioType: placeType,
      detailAudioPath: audioPath,
      distance: calculateDistance(lat, lng, placeLat, placeLng)
    };
  });
  
  placesWithDistance.sort((a, b) => a.distance - b.distance);
  
  return placesWithDistance.slice(0, limit).map(({ distance, ...place }) => place);
}

export async function getNearestCurios(lat: number, lng: number, limit: number = 10): Promise<Curio[]> {
  if (nearbyCache) {
    const cacheAge = Date.now() - nearbyCache.timestamp;
    const cacheDistance = calculateDistance(lat, lng, nearbyCache.lat, nearbyCache.lng);
    if (cacheAge < 30000 && cacheDistance < 100) {
      return nearbyCache.data.slice(0, limit);
    }
  }
  
  if (fetchInProgress) {
    return fetchInProgress;
  }
  
  fetchInProgress = (async () => {
    try {
      const latDelta = 0.018;
      const lngDelta = 0.028;
      
      const { data, error } = await supabase
        .from('places')
        .select('*')
        .eq('visible_flag', true)
        .gte('lat', lat - latDelta)
        .lte('lat', lat + latDelta)
        .gte('lon', lng - lngDelta)
        .lte('lon', lng + lngDelta)
        .limit(200);
      
      if (error) {
        console.error('Error fetching places:', error.message);
        return [];
      }

      if (!data || data.length === 0) {
        const { data: fallbackData, error: fallbackError } = await supabase
          .from('places')
          .select('*')
          .eq('visible_flag', true)
          .limit(100);
        
        if (fallbackError || !fallbackData?.length) return [];
        return processPlaces(fallbackData, lat, lng, limit);
      }
      
      const sortedPlaces = processPlaces(data, lat, lng, limit);
      nearbyCache = { lat, lng, data: sortedPlaces, timestamp: Date.now() };
      return sortedPlaces;
    } catch (error) {
      console.error('Error fetching places:', error);
      return [];
    } finally {
      fetchInProgress = null;
    }
  })();
  
  return fetchInProgress;
}

let radiusFetchInProgress: Promise<Curio[]> | null = null;

export async function getCuriosNearPoint(
  lat: number, lng: number, radiusMeters: number = 1000
): Promise<Curio[]> {
  if (radiusFetchInProgress) {
    return radiusFetchInProgress;
  }

  const latDelta = radiusMeters / 111320;
  const lngDelta = radiusMeters / (111320 * Math.cos(lat * Math.PI / 180));

  radiusFetchInProgress = (async () => {
    try {
      const { data, error } = await supabase
        .from('places')
        .select('*')
        .eq('visible_flag', true)
        .gte('lat', lat - latDelta)
        .lte('lat', lat + latDelta)
        .gte('lon', lng - lngDelta)
        .lte('lon', lng + lngDelta)
        .limit(500);

      if (error) {
        console.error('Error fetching nearby places:', error.message);
        return [];
      }

      if (!data || data.length === 0) return [];

      const allPlaces = processPlaces(data, lat, lng, 500);
      return allPlaces.filter(p => calculateDistance(lat, lng, p.latitude, p.longitude) <= radiusMeters);
    } catch (error) {
      console.error('Error fetching nearby places:', error);
      return [];
    } finally {
      radiusFetchInProgress = null;
    }
  })();

  return radiusFetchInProgress;
}

export async function getPlacesInViewport(
  lat: number,
  lng: number,
  latitudeDelta: number,
  longitudeDelta: number
): Promise<Curio[]> {
  // Expand the bounding box by 30% on each side so places just outside the
  // visible edge are pre-loaded, preventing flicker when panning near borders.
  const BUFFER = 0.3;
  const latMin = lat - latitudeDelta * (0.5 + BUFFER);
  const latMax = lat + latitudeDelta * (0.5 + BUFFER);
  const lngMin = lng - longitudeDelta * (0.5 + BUFFER);
  const lngMax = lng + longitudeDelta * (0.5 + BUFFER);

  try {
    const { data, error } = await supabase
      .from('places')
      .select('*')
      .eq('visible_flag', true)
      .gte('lat', latMin)
      .lte('lat', latMax)
      .gte('lon', lngMin)
      .lte('lon', lngMax)
      .limit(200);

    if (error) {
      console.error('Error fetching viewport places:', error.message);
      return [];
    }

    if (!data || data.length === 0) return [];

    return data.map(place => {
      const placeLat = place.latitude ?? place.lat ?? place.y;
      const placeLng = place.longitude ?? place.lng ?? place.lon ?? place.x;
      const placeId = place.curio_id ?? place['curio-id'] ?? place.uuid ?? place.id ?? place.place_id ?? String(Math.random());
      const placeName = place.name ?? place.title ?? 'Unknown';
      const placeDesc = place.detail_overview ?? place['detail-overview'] ?? place.description ?? place.desc ?? place.summary ?? '';
      const placeType = place.curio_type ?? place['curio-type'] ?? '';
      const audioPath = place.detail_audio_path ?? place['detail-audio-path'] ?? null;

      return {
        id: placeId,
        name: placeName,
        description: placeDesc,
        latitude: placeLat,
        longitude: placeLng,
        curioType: placeType,
        detailAudioPath: audioPath,
      };
    }).filter(p => p.latitude != null && p.longitude != null);
  } catch (error) {
    console.error('Error fetching viewport places:', error);
    return [];
  }
}

let nearest20InProgress: Promise<Curio[]> | null = null;
let nearest20Cache: { lat: number; lng: number; data: Curio[]; timestamp: number } | null = null;

export async function getNearest20(lat: number, lng: number): Promise<Curio[]> {
  if (nearest20Cache) {
    const cacheAge = Date.now() - nearest20Cache.timestamp;
    const cacheDist = calculateDistance(lat, lng, nearest20Cache.lat, nearest20Cache.lng);
    if (cacheAge < 10000 && cacheDist < 50) {
      return nearest20Cache.data;
    }
  }

  if (nearest20InProgress) {
    return nearest20InProgress;
  }

  nearest20InProgress = (async () => {
    try {
      const latDelta = 0.015;
      const lngDelta = 0.023;

      const { data, error } = await supabase
        .from('places')
        .select('*')
        .eq('visible_flag', true)
        .gte('lat', lat - latDelta)
        .lte('lat', lat + latDelta)
        .gte('lon', lng - lngDelta)
        .lte('lon', lng + lngDelta)
        .limit(100);

      if (error) {
        console.error('Error fetching nearest 20:', error.message);
        return [];
      }

      if (!data || data.length === 0) {
        const { data: widerData, error: widerError } = await supabase
          .from('places')
          .select('*')
          .eq('visible_flag', true)
          .gte('lat', lat - latDelta * 3)
          .lte('lat', lat + latDelta * 3)
          .gte('lon', lng - lngDelta * 3)
          .lte('lon', lng + lngDelta * 3)
          .limit(100);

        if (widerError || !widerData?.length) return [];
        const result = processPlaces(widerData, lat, lng, 20);
        nearest20Cache = { lat, lng, data: result, timestamp: Date.now() };
        return result;
      }

      const result = processPlaces(data, lat, lng, 20);
      nearest20Cache = { lat, lng, data: result, timestamp: Date.now() };
      return result;
    } catch (error) {
      console.error('Error fetching nearest 20:', error);
      return [];
    } finally {
      nearest20InProgress = null;
    }
  })();

  return nearest20InProgress;
}
