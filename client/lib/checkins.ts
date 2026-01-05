import { supabase } from './supabase';

export interface Badge {
  id: string;
  name: string;
  description: string;
  icon_name: string;
  requirement_type: string;
  requirement_value: number;
}

export interface UserBadge extends Badge {
  earned_at: string;
}

export interface Checkin {
  id: string;
  place_id: string;
  place_name: string;
  place_latitude: number;
  place_longitude: number;
  checked_in_at: string;
}

export interface UserProgress {
  total_checkins: number;
  total_badges: number;
  badges: UserBadge[];
  recent_checkins: Checkin[];
}

export async function getUserProgress(userId: string): Promise<UserProgress | null> {
  try {
    const { data, error } = await supabase.rpc('get_user_progress', { uid: userId });
    
    if (error) {
      console.error('Error fetching user progress:', error);
      return null;
    }
    
    return data as UserProgress;
  } catch (error) {
    console.error('Error in getUserProgress:', error);
    return null;
  }
}

export async function getAllBadges(): Promise<Badge[]> {
  try {
    const { data, error } = await supabase
      .from('badges')
      .select('*')
      .order('requirement_value', { ascending: true });
    
    if (error) {
      console.error('Error fetching badges:', error);
      return [];
    }
    
    return data || [];
  } catch (error) {
    console.error('Error in getAllBadges:', error);
    return [];
  }
}

export async function checkIn(
  userId: string,
  placeId: string,
  placeName: string,
  latitude: number,
  longitude: number
): Promise<{ success: boolean; isNewCheckin: boolean; error?: string }> {
  try {
    const { error } = await supabase.from('checkins').insert({
      user_id: userId,
      place_id: placeId,
      place_name: placeName,
      place_latitude: latitude,
      place_longitude: longitude,
    });
    
    if (error) {
      if (error.code === '23505') {
        return { success: true, isNewCheckin: false };
      }
      console.error('Check-in error:', error);
      return { success: false, isNewCheckin: false, error: error.message };
    }
    
    return { success: true, isNewCheckin: true };
  } catch (error) {
    console.error('Error in checkIn:', error);
    return { success: false, isNewCheckin: false, error: 'Failed to check in' };
  }
}

export async function hasCheckedIn(userId: string, placeId: string): Promise<boolean> {
  try {
    const { data, error } = await supabase
      .from('checkins')
      .select('id')
      .eq('user_id', userId)
      .eq('place_id', placeId)
      .single();
    
    if (error && error.code !== 'PGRST116') {
      console.error('Error checking if checked in:', error);
    }
    
    return !!data;
  } catch (error) {
    console.error('Error in hasCheckedIn:', error);
    return false;
  }
}

export async function checkAndAwardBadges(userId: string): Promise<UserBadge[]> {
  const newBadges: UserBadge[] = [];
  
  try {
    const { data: checkinCount } = await supabase
      .from('checkins')
      .select('id', { count: 'exact', head: true })
      .eq('user_id', userId);
    
    const totalCheckins = checkinCount?.length ?? 0;
    
    const { data: allBadges } = await supabase
      .from('badges')
      .select('*')
      .eq('requirement_type', 'checkin_count')
      .lte('requirement_value', totalCheckins);
    
    if (!allBadges) return newBadges;
    
    const { data: earnedBadges } = await supabase
      .from('user_badges')
      .select('badge_id')
      .eq('user_id', userId);
    
    const earnedBadgeIds = new Set(earnedBadges?.map(b => b.badge_id) || []);
    
    for (const badge of allBadges) {
      if (!earnedBadgeIds.has(badge.id)) {
        const { error } = await supabase.from('user_badges').insert({
          user_id: userId,
          badge_id: badge.id,
        });
        
        if (!error) {
          newBadges.push({
            ...badge,
            earned_at: new Date().toISOString(),
          });
        }
      }
    }
    
    return newBadges;
  } catch (error) {
    console.error('Error in checkAndAwardBadges:', error);
    return newBadges;
  }
}

export async function getCheckinCount(userId: string): Promise<number> {
  try {
    const { count, error } = await supabase
      .from('checkins')
      .select('*', { count: 'exact', head: true })
      .eq('user_id', userId);
    
    if (error) {
      console.error('Error getting checkin count:', error);
      return 0;
    }
    
    return count || 0;
  } catch (error) {
    console.error('Error in getCheckinCount:', error);
    return 0;
  }
}
