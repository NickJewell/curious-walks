import { createClient } from '@supabase/supabase-js';

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

export const supabase = createClient(supabaseUrl, supabaseAnonKey);

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

export async function getNearestCurios(lat: number, lng: number, limit: number = 20): Promise<Curio[]> {
  console.log('Supabase URL:', supabaseUrl);
  console.log('Supabase key present:', !!supabaseAnonKey);
  console.log('Fetching places from Supabase...');
  
  // Try fetching with a limit first to see if we get any data
  const { data, error, count } = await supabase
    .from('places')
    .select('*', { count: 'exact' })
    .limit(5);
  
  console.log('Query result - data:', data?.length ?? 0, 'items, error:', JSON.stringify(error), 'count:', count);
  if (data && data.length > 0) {
    console.log('First row columns:', Object.keys(data[0]));
  }
  
  if (error) {
    console.error('Error fetching places:', JSON.stringify(error));
    return [];
  }

  if (!data || data.length === 0) {
    console.log('No places found in database - table may be empty or RLS is blocking access');
    return [];
  }

  console.log('Sample place data:', JSON.stringify(data[0]));
  
  const placesWithCoords = data.filter(place => {
    const latField = place.latitude ?? place.lat ?? place.y;
    const lngField = place.longitude ?? place.lng ?? place.lon ?? place.x;
    return latField != null && lngField != null;
  });
  
  const placesWithDistance = placesWithCoords.map(place => {
    const placeLat = place.latitude ?? place.lat ?? place.y;
    const placeLng = place.longitude ?? place.lng ?? place.lon ?? place.x;
    const placeId = place.id ?? place.uuid ?? place.place_id ?? String(Math.random());
    const placeName = place.name ?? place.title ?? 'Unknown';
    const placeDesc = place.description ?? place.desc ?? place.summary ?? '';
    
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
  
  return placesWithDistance.slice(0, limit).map(({ distance, ...place }) => place);
}
