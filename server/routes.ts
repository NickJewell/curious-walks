import type { Express } from "express";
import { createServer, type Server } from "node:http";
import { createClient } from "@supabase/supabase-js";

const supabaseUrl = process.env.EXPO_PUBLIC_SUPABASE_URL || '';
const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY || '';
const supabase = createClient(supabaseUrl, supabaseServiceKey);

// Calculate distance between two points in meters using Haversine formula
function calculateDistance(lat1: number, lon1: number, lat2: number, lon2: number): number {
  const R = 6371000; // Earth's radius in meters
  const dLat = (lat2 - lat1) * Math.PI / 180;
  const dLon = (lon2 - lon1) * Math.PI / 180;
  const a = 
    Math.sin(dLat / 2) * Math.sin(dLat / 2) +
    Math.cos(lat1 * Math.PI / 180) * Math.cos(lat2 * Math.PI / 180) *
    Math.sin(dLon / 2) * Math.sin(dLon / 2);
  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
  return R * c;
}

export async function registerRoutes(app: Express): Promise<Server> {
  // Admin API: Get places that need detail_overview (null), sorted by box_id
  app.get('/api/admin/places/needs-overview', async (req, res) => {
    try {
      // First get total count
      const { count } = await supabase
        .from('places')
        .select('*', { count: 'exact', head: true })
        .is('detail_overview', null);

      // Get records with null detail_overview
      const { data, error } = await supabase
        .from('places')
        .select('places_id, curio_id, name, plus_code, detail_overview')
        .is('detail_overview', null);

      if (error) {
        console.error('Error fetching places:', error);
        return res.status(500).json({ error: error.message });
      }

      // Sort by numeric part of curio_id (e.g., CURIO-190 → 190)
      const sorted = (data || []).sort((a: any, b: any) => {
        const numA = parseInt((a['curio_id'] || '').replace(/\D/g, '')) || 0;
        const numB = parseInt((b['curio_id'] || '').replace(/\D/g, '')) || 0;
        return numA - numB;
      });

      // Limit to first 10
      const limited = sorted.slice(0, 10);

      res.json({ places: limited, total: count || 0 });
    } catch (err) {
      console.error('Error in needs-overview:', err);
      res.status(500).json({ error: 'Internal server error' });
    }
  });

  // Admin API: Update a place's detail_overview
  app.patch('/api/admin/places/:id', async (req, res) => {
    try {
      const { id } = req.params;
      const { 'detail_overview': detailOverview } = req.body;

      console.log('Updating place:', id, 'with detail_overview:', detailOverview?.substring(0, 50));

      // First verify the record exists
      const { data: existing, error: fetchError } = await supabase
        .from('places')
        .select('places_id, name')
        .eq('places_id', id)
        .single();

      if (fetchError) {
        console.error('Error fetching place:', fetchError);
        return res.status(404).json({ error: 'Place not found: ' + fetchError.message });
      }

      console.log('Found existing place:', (existing as any)?.name);

      // Use upsert-like approach - update with returning
      const { error: updateError } = await supabase
        .from('places')
        .update({ 'detail_overview': detailOverview })
        .eq('places_id', id);

      if (updateError) {
        console.error('Error updating place:', updateError);
        return res.status(500).json({ error: updateError.message });
      }

      res.json({ success: true, place: { ...(existing as any), 'detail_overview': detailOverview } });
    } catch (err) {
      console.error('Error updating place:', err);
      res.status(500).json({ error: 'Internal server error' });
    }
  });

  // Admin API: Lookup a place by curio_id
  app.get('/api/admin/places/lookup/:curioId', async (req, res) => {
    try {
      const { curioId } = req.params;
      
      const { data, error } = await supabase
        .from('places')
        .select('places_id, curio_id, name, detail_overview')
        .eq('curio_id', curioId)
        .single();

      if (error) {
        return res.status(404).json({ error: 'Place not found' });
      }

      res.json({ place: data });
    } catch (err) {
      res.status(500).json({ error: 'Internal server error' });
    }
  });

  app.get('/api/places/:curioId/audio-url', async (req, res) => {
    try {
      const { curioId } = req.params;

      const { data: place, error: placeError } = await supabase
        .from('places')
        .select('detail_audio_path')
        .eq('curio_id', curioId)
        .single();

      if (placeError || !place?.detail_audio_path) {
        return res.status(404).json({ error: 'No audio available for this place' });
      }

      const audioPath = place.detail_audio_path as string;
      let bucket: string;
      let filePath: string;

      if (audioPath.startsWith('http')) {
        const url = new URL(audioPath);
        const parts = url.pathname.replace('/storage/v1/object/public/', '').split('/');
        bucket = parts[0];
        filePath = parts.slice(1).join('/');
      } else {
        const parts = audioPath.split('/');
        bucket = parts[0];
        filePath = parts.slice(1).join('/');
      }

      const { data, error } = await supabase.storage
        .from(bucket)
        .createSignedUrl(filePath, 3600);

      if (error || !data?.signedUrl) {
        console.error('Error creating signed URL:', error);
        return res.status(500).json({ error: 'Could not generate audio URL' });
      }

      res.json({ url: data.signedUrl });
    } catch (error) {
      console.error('Error generating audio URL:', error);
      res.status(500).json({ error: 'Internal server error' });
    }
  });

  // Get random facts for a place
  app.get('/api/places/:curioId/facts', async (req, res) => {
    try {
      const { curioId } = req.params;
      
      const { data, error } = await supabase
        .from('facts')
        .select('*')
        .eq('curio_id', curioId);

      if (error) {
        console.log('Facts table may not exist:', error.message);
        return res.json({ facts: [] });
      }

      res.json({ facts: data || [] });
    } catch (err) {
      res.status(500).json({ error: 'Internal server error' });
    }
  });

  // Submit content vote (thumbs up/down)
  app.post('/api/content/vote', async (req, res) => {
    try {
      const { curioId, voteType, userId } = req.body;
      
      if (!curioId || !voteType) {
        return res.status(400).json({ error: 'curioId and voteType are required' });
      }

      const { data, error } = await supabase
        .from('content_votes')
        .insert({
          curio_id: curioId,
          vote_type: voteType,
          user_id: userId || null,
        })
        .select()
        .single();

      if (error) {
        console.log('Vote error (table may not exist):', error.message);
        return res.status(500).json({ error: 'Could not save vote. Table may not exist.' });
      }

      res.json({ success: true, vote: data });
    } catch (err) {
      res.status(500).json({ error: 'Internal server error' });
    }
  });

  // Remove content vote
  app.delete('/api/content/vote', async (req, res) => {
    try {
      const { curioId, voteType, userId } = req.body;
      
      if (!curioId || !voteType) {
        return res.status(400).json({ error: 'curioId and voteType are required' });
      }

      // Build query to find and delete the vote
      let query = supabase
        .from('content_votes')
        .delete()
        .eq('curio_id', curioId)
        .eq('vote_type', voteType);
      
      // If userId provided, match it; otherwise match null
      if (userId) {
        query = query.eq('user_id', userId);
      } else {
        query = query.is('user_id', null);
      }

      const { error } = await query;

      if (error) {
        console.log('Vote delete error:', error.message);
        return res.status(500).json({ error: 'Could not remove vote.' });
      }

      res.json({ success: true });
    } catch (err) {
      res.status(500).json({ error: 'Internal server error' });
    }
  });

  // Submit content report
  app.post('/api/content/report', async (req, res) => {
    try {
      const { curioId, reason, comment, userId } = req.body;
      
      if (!curioId || !reason) {
        return res.status(400).json({ error: 'curioId and reason are required' });
      }

      const { data, error } = await supabase
        .from('content_reports')
        .insert({
          curio_id: curioId,
          reason: reason,
          comment: comment || null,
          user_id: userId || null,
        })
        .select()
        .single();

      if (error) {
        console.log('Report error (table may not exist):', error.message);
        return res.status(500).json({ error: 'Could not save report. Table may not exist.' });
      }

      res.json({ success: true, report: data });
    } catch (err) {
      res.status(500).json({ error: 'Internal server error' });
    }
  });

  // Admin API: Get curio with place and facts by curio_id
  app.get('/api/admin/curio/:curioId', async (req, res) => {
    try {
      const { curioId } = req.params;
      
      // Get the place
      const { data: place, error: placeError } = await supabase
        .from('places')
        .select('*')
        .eq('curio_id', curioId)
        .single();

      if (placeError) {
        return res.status(404).json({ error: 'Place not found' });
      }

      // Get the facts
      const { data: facts, error: factsError } = await supabase
        .from('facts')
        .select('*')
        .eq('curio_id', curioId);

      res.json({ 
        place, 
        facts: factsError ? [] : (facts || []) 
      });
    } catch (err) {
      res.status(500).json({ error: 'Internal server error' });
    }
  });

  // Admin API: Create a new fact
  app.post('/api/admin/facts', async (req, res) => {
    try {
      const { 'curio_id': curioId, fact } = req.body;
      
      if (!curioId || !fact) {
        return res.status(400).json({ error: 'curio_id and fact are required' });
      }

      const { data, error } = await supabase
        .from('facts')
        .insert({ 'curio_id': curioId, 'fact_info': fact })
        .select()
        .single();

      if (error) {
        console.error('Error creating fact:', error);
        return res.status(500).json({ error: error.message });
      }

      res.json({ success: true, fact: data });
    } catch (err) {
      res.status(500).json({ error: 'Internal server error' });
    }
  });

  // Admin API: Update a fact
  app.patch('/api/admin/facts/:id', async (req, res) => {
    try {
      const { id } = req.params;
      const { fact: factText } = req.body;
      
      if (!factText) {
        return res.status(400).json({ error: 'fact is required' });
      }

      // First get the current fact to check the column structure
      const { data: existingFact, error: fetchError } = await supabase
        .from('facts')
        .select('*')
        .eq('id', id)
        .single();

      if (fetchError) {
        console.error('Error fetching fact:', fetchError);
        return res.status(404).json({ error: 'Fact not found' });
      }

      // Log the column names to debug
      console.log('Existing fact columns:', Object.keys(existingFact || {}));

      // Try to determine the correct column name
      const columnName = Object.keys(existingFact || {}).find(k => 
        k === 'fact' || k === 'content' || k === 'text' || k === 'fact_text' || k === 'fact_info'
      ) || 'fact_info';

      console.log('Using column name:', columnName);

      const updateData: Record<string, string> = {};
      updateData[columnName] = factText;

      const { error } = await supabase
        .from('facts')
        .update(updateData)
        .eq('id', id);

      if (error) {
        console.error('Error updating fact:', error);
        return res.status(500).json({ error: error.message });
      }

      res.json({ success: true });
    } catch (err) {
      res.status(500).json({ error: 'Internal server error' });
    }
  });

  // Admin API: Delete a fact
  app.delete('/api/admin/facts/:id', async (req, res) => {
    try {
      const { id } = req.params;

      const { error } = await supabase
        .from('facts')
        .delete()
        .eq('id', id);

      if (error) {
        console.error('Error deleting fact:', error);
        return res.status(500).json({ error: error.message });
      }

      res.json({ success: true });
    } catch (err) {
      res.status(500).json({ error: 'Internal server error' });
    }
  });

  // Admin API: Get places near a point (within specified radius in meters)
  app.get('/api/admin/places/nearby', async (req, res) => {
    try {
      const lat = parseFloat(req.query.lat as string);
      const lon = parseFloat(req.query.lon as string);
      const radius = parseFloat(req.query.radius as string) || 250;

      if (isNaN(lat) || isNaN(lon)) {
        return res.status(400).json({ error: 'lat and lon are required' });
      }

      // Fetch ALL places by paginating through all records
      let allPlaces: any[] = [];
      let from = 0;
      const pageSize = 1000;
      let hasMore = true;

      while (hasMore) {
        const { data: page, error: fetchError } = await supabase
          .from('places')
          .select('places_id, curio_id, name, lat, lon, plus_code')
          .range(from, from + pageSize - 1);

        if (fetchError) {
          console.error('Error fetching places:', fetchError);
          return res.status(500).json({ error: fetchError.message });
        }

        if (page && page.length > 0) {
          allPlaces = allPlaces.concat(page);
          from += pageSize;
          hasMore = page.length === pageSize;
        } else {
          hasMore = false;
        }
      }

      // Calculate distance and filter by radius
      const nearbyPlaces = allPlaces
        .map((place: any) => ({
          places_id: place.places_id,
          curio_id: place.curio_id,
          name: place.name,
          latitude: place.lat,
          longitude: place.lon,
          plus_code: place.plus_code,
        }))
        .filter((place: any) => place.latitude != null && place.longitude != null)
        .map((place: any) => {
          const distance = calculateDistance(lat, lon, place.latitude, place.longitude);
          return { ...place, distance };
        })
        .filter((place: any) => place.distance <= radius)
        .sort((a: any, b: any) => a.distance - b.distance);

      res.json({ places: nearbyPlaces });
    } catch (err) {
      console.error('Error in nearby places:', err);
      res.status(500).json({ error: 'Internal server error' });
    }
  });

  // Admin API: Get next curio_id
  app.get('/api/admin/places/next-curio-id', async (req, res) => {
    try {
      // Fetch ALL curio_ids by paginating through all records
      let allCurioIds: string[] = [];
      let from = 0;
      const pageSize = 1000;
      let hasMore = true;

      while (hasMore) {
        const { data: page, error: fetchError } = await supabase
          .from('places')
          .select('curio_id')
          .not('curio_id', 'is', null)
          .range(from, from + pageSize - 1);

        if (fetchError) {
          console.error('Error fetching curio_ids:', fetchError);
          return res.status(500).json({ error: fetchError.message });
        }

        if (page && page.length > 0) {
          allCurioIds = allCurioIds.concat(page.map((p: any) => p.curio_id));
          from += pageSize;
          hasMore = page.length === pageSize;
        } else {
          hasMore = false;
        }
      }

      // Extract numeric part from curio_id matching pattern CURIO-[0-9]+
      let maxNum = 0;
      allCurioIds.forEach((curioId: string) => {
        const match = (curioId || '').match(/^CURIO-(\d+)$/);
        if (match) {
          const num = parseInt(match[1], 10);
          if (num > maxNum) maxNum = num;
        }
      });

      const nextCurioId = `CURIO-${maxNum + 1}`;
      console.log(`Found ${allCurioIds.length} curio_ids, max is ${maxNum}, next is ${nextCurioId}`);
      res.json({ nextCurioId, maxNum });
    } catch (err) {
      console.error('Error getting next curio_id:', err);
      res.status(500).json({ error: 'Internal server error' });
    }
  });

  // Admin API: Create a new place
  app.post('/api/admin/places', async (req, res) => {
    try {
      const { curio_id, name, detail_overview, latitude, longitude, plus_code } = req.body;

      if (!name) {
        return res.status(400).json({ error: 'name is required' });
      }

      if (!curio_id) {
        return res.status(400).json({ error: 'curio_id is required' });
      }

      if (latitude == null || longitude == null) {
        return res.status(400).json({ error: 'latitude and longitude are required' });
      }

      // Check if curio_id already exists
      const { data: existing, error: checkError } = await supabase
        .from('places')
        .select('curio_id')
        .eq('curio_id', curio_id)
        .maybeSingle();

      if (checkError) {
        console.error('Error checking existing curio_id:', checkError);
        return res.status(500).json({ error: checkError.message });
      }

      if (existing) {
        return res.status(400).json({ error: `curio_id ${curio_id} already exists` });
      }

      // Use 'lat' and 'lon' as column names based on existing schema
      const { data, error } = await supabase
        .from('places')
        .insert({
          curio_id,
          name,
          detail_overview: detail_overview || null,
          lat: latitude,
          lon: longitude,
          plus_code: plus_code || null
        })
        .select()
        .single();

      if (error) {
        console.error('Error creating place:', error);
        return res.status(500).json({ error: error.message });
      }

      res.json({ success: true, place: data });
    } catch (err) {
      console.error('Error creating place:', err);
      res.status(500).json({ error: 'Internal server error' });
    }
  });

  app.get('/api/tours', async (req, res) => {
    try {
      const { data: tours, error: toursError } = await supabase
        .from('lists')
        .select('*')
        .eq('list_type', 'tour')
        .order('created_at', { ascending: false });

      if (toursError) {
        console.error('Error fetching tours:', toursError);
        return res.status(500).json({ error: toursError.message });
      }

      if (!tours || tours.length === 0) {
        return res.json([]);
      }

      const toursWithCounts = await Promise.all(
        tours.map(async (tour) => {
          const { data: items, error: itemsError } = await supabase
            .from('list_items')
            .select('place_id, place_uuid, order_index')
            .eq('list_uuid', tour.id)
            .order('order_index', { ascending: true });

          let itemCount = 0;
          if (!itemsError && items) {
            itemCount = items.length;
          }

          return {
            ...tour,
            item_count: itemCount,
            metadata: tour.metadata || {},
          };
        })
      );

      res.json(toursWithCounts);
    } catch (err) {
      console.error('Error fetching tours:', err);
      res.status(500).json({ error: 'Internal server error' });
    }
  });

  app.get('/api/tours/:tourId', async (req, res) => {
    try {
      const { tourId } = req.params;

      const { data: tour, error: tourError } = await supabase
        .from('lists')
        .select('*')
        .eq('id', tourId)
        .eq('list_type', 'tour')
        .single();

      if (tourError || !tour) {
        return res.status(404).json({ error: 'Tour not found' });
      }

      const { data: items, error: itemsError } = await supabase
        .from('list_items')
        .select('*')
        .eq('list_uuid', tourId)
        .order('order_index', { ascending: true });

      let stops: any[] = [];
      if (!itemsError && items && items.length > 0) {
        const placeIds = items.map((item: any) => item.place_id);
        const { data: places } = await supabase
          .from('places')
          .select('curio_id, name, detail_overview, lat, lon')
          .in('curio_id', placeIds);

        const placeMap: Record<string, any> = {};
        if (places) {
          for (const p of places) {
            placeMap[p.curio_id] = p;
          }
        }

        stops = items.map((item: any) => {
          const place = placeMap[item.place_id];
          return {
            id: item.list_item_uuid,
            list_id: item.list_uuid,
            place_id: item.place_id,
            place_name: place?.name || 'Unknown Place',
            place_description: place?.detail_overview || '',
            place_latitude: place?.lat || 0,
            place_longitude: place?.lon || 0,
            order_index: item.order_index,
            created_at: item.created_at,
          };
        });
      }

      res.json({
        tour: {
          ...tour,
          item_count: stops.length,
          metadata: tour.metadata || {},
        },
        stops,
      });
    } catch (err) {
      console.error('Error fetching tour detail:', err);
      res.status(500).json({ error: 'Internal server error' });
    }
  });

  return createServer(app);
}
