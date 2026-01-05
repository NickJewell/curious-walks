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
    const placeId = place['curio-id'] ?? place.uuid ?? place.id ?? place.place_id ?? String(Math.random());
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
  
  // Supabase has a default limit of 1000 rows - fetch all by using range
  let allData: any[] = [];
  let from = 0;
  const pageSize = 1000;
  let hasMore = true;
  
  while (hasMore) {
    const { data: pageData, error: pageError } = await supabase
      .from('places')
      .select('*')
      .range(from, from + pageSize - 1);
    
    if (pageError) {
      console.error('Error fetching places:', pageError.message);
      return [];
    }
    
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
  
  // Debug: Check if FAKE-1 exists in the fetched data
  const fakeRecord = data.find(p => p['curio-id'] === 'FAKE-1' || p.uuid === 'a4ce69dc-ecc1-4225-a6a8-fb78775bdee7');
  if (fakeRecord) {
    console.log('DEBUG: FAKE-1 found in data:', JSON.stringify(fakeRecord, null, 2));
  } else {
    console.log('DEBUG: FAKE-1 NOT found in fetched data');
  }
  
  const placesWithCoords = data.filter(place => {
    const latField = place.latitude ?? place.lat ?? place.y;
    const lngField = place.longitude ?? place.lng ?? place.lon ?? place.x;
    return latField != null && lngField != null;
  });
  
  const placesWithDistance = placesWithCoords.map(place => {
    const placeLat = place.latitude ?? place.lat ?? place.y;
    const placeLng = place.longitude ?? place.lng ?? place.lon ?? place.x;
    const placeId = place['curio-id'] ?? place.uuid ?? place.id ?? place.place_id ?? String(Math.random());
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
  
  // Debug: Check if FAKE-1 is in the nearest places
  const fakeInNearest = nearest.find(p => p.id === 'FAKE-1');
  if (fakeInNearest) {
    console.log('DEBUG: FAKE-1 IS in nearest places, distance:', fakeInNearest.distance, 'm');
  } else {
    // Check its actual distance
    const fakePlace = placesWithDistance.find(p => p.id === 'FAKE-1');
    if (fakePlace) {
      console.log('DEBUG: FAKE-1 NOT in nearest. Distance:', fakePlace.distance, 'm. Cutoff distance:', nearest[nearest.length - 1]?.distance, 'm');
    }
  }
  
  console.log('Returning', nearest.length, 'nearest places');
  
  return nearest.map(({ distance, ...place }) => place);
}
