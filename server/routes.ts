import type { Express } from "express";
import { createServer, type Server } from "node:http";
import path from "node:path";
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

  // Admin API: Extract all columns from places table by curio_id
  app.get('/api/admin/places/extract/:curioId', async (req, res) => {
    try {
      const { curioId } = req.params;

      const { data, error } = await supabase
        .from('places')
        .select('*')
        .eq('curio_id', curioId)
        .single();

      if (error || !data) {
        return res.status(404).json({ error: `Place with curio_id "${curioId}" not found` });
      }

      res.json(data);
    } catch (err) {
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

      const match = curioId.match(/(\d+)$/);
      if (!match) {
        return res.status(400).json({ error: 'Invalid curio ID format' });
      }

      const num = parseInt(match[1], 10);
      const bucketStart = Math.floor((num - 1) / 1000) * 1000 + 1;
      const bucketEnd = bucketStart + 999;
      const folderStart = Math.floor((num - 1) / 100) * 100 + 1;
      const folderEnd = folderStart + 99;

      const bucket = `audio_overviews_${bucketStart}_${bucketEnd}`;
      const filePath = `${folderStart}-${folderEnd}/curio_detail_${num}.mp3`;

      const { data, error } = await supabase.storage
        .from(bucket)
        .createSignedUrl(filePath, 3600);

      if (error || !data?.signedUrl) {
        console.error('Error creating signed URL:', error, `bucket=${bucket} path=${filePath}`);
        return res.status(404).json({ error: 'Audio not available for this place' });
      }

      res.json({ url: data.signedUrl });
    } catch (error) {
      console.error('Error generating audio URL:', error);
      res.status(500).json({ error: 'Internal server error' });
    }
  });

  app.get('/api/places/:curioId/fact-audio/:factId', async (req, res) => {
    try {
      const { curioId, factId } = req.params;

      const match = curioId.match(/(\d+)$/);
      if (!match) {
        return res.status(400).json({ error: 'Invalid curio ID format' });
      }

      const num = parseInt(match[1], 10);
      const bucketStart = Math.floor((num - 1) / 1000) * 1000 + 1;
      const bucketEnd = bucketStart + 999;
      const folderStart = Math.floor((num - 1) / 100) * 100 + 1;
      const folderEnd = folderStart + 99;

      const bucket = `audio_overviews_${bucketStart}_${bucketEnd}`;
      const filePath = `${folderStart}-${folderEnd}/curio_${num}_${factId}.mp3`;

      const { data, error } = await supabase.storage
        .from(bucket)
        .createSignedUrl(filePath, 3600);

      if (error || !data?.signedUrl) {
        console.error('Error creating fact audio signed URL:', error, `bucket=${bucket} path=${filePath}`);
        return res.status(404).json({ error: 'Fact audio not available' });
      }

      res.json({ url: data.signedUrl });
    } catch (error) {
      console.error('Error generating fact audio URL:', error);
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

  // Submit content issue
  app.post('/api/content/issue', async (req, res) => {
    try {
      const { sourceType, sourceId, issueType, otherDesc, userId } = req.body;
      
      if (!sourceId || !issueType) {
        return res.status(400).json({ error: 'sourceId and issueType are required' });
      }

      const row: Record<string, any> = {
        source_id: sourceId,
        source_type: sourceType || 'place',
        issue_type: issueType,
        user_id: userId || null,
      };
      if (issueType === 'other' && otherDesc) {
        row.other_desc = String(otherDesc).slice(0, 200);
      }

      const { data, error } = await supabase
        .from('issues')
        .insert(row)
        .select()
        .single();

      if (error) {
        console.log('Issue insert error:', error.message);
        return res.status(500).json({ error: 'Could not save issue.' });
      }

      res.json({ success: true, issue: data });
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

  // Admin API: Create a new place with auto-generated curio_id
  app.post('/api/admin/place', async (req, res) => {
    try {
      const { lat, lon, name } = req.body;

      if (lat == null || lon == null) {
        return res.status(400).json({ error: 'lat and lon are required' });
      }

      // Find the highest existing curio_id number
      const { data: maxRows, error: maxError } = await supabase
        .from('places')
        .select('curio_id')
        .order('curio_id', { ascending: false })
        .limit(200);

      if (maxError) {
        console.error('Error finding max curio_id:', maxError);
        return res.status(500).json({ error: maxError.message });
      }

      let maxNum = 0;
      for (const row of (maxRows || [])) {
        const num = parseInt((row.curio_id || '').replace(/\D/g, '')) || 0;
        if (num > maxNum) maxNum = num;
      }
      const newCurioId = `CURIO-${maxNum + 1}`;

      const { data, error } = await supabase
        .from('places')
        .insert({
          curio_id: newCurioId,
          name: name || 'New Place',
          lat: lat,
          lon: lon,
        })
        .select()
        .single();

      if (error) {
        console.error('Error creating place:', error);
        return res.status(500).json({ error: error.message });
      }

      res.json({ success: true, place: data, curioId: newCurioId });
    } catch (err) {
      console.error('Error creating place:', err);
      res.status(500).json({ error: 'Internal server error' });
    }
  });

  // Admin API: Update place name
  app.patch('/api/admin/place/:curioId/name', async (req, res) => {
    try {
      const { curioId } = req.params;
      const { name } = req.body;

      if (!name) {
        return res.status(400).json({ error: 'name is required' });
      }

      const { data, error } = await supabase
        .from('places')
        .update({ name })
        .eq('curio_id', curioId)
        .select()
        .single();

      if (error) {
        console.error('Error updating place name:', error);
        return res.status(500).json({ error: error.message });
      }

      res.json({ success: true, place: data });
    } catch (err) {
      res.status(500).json({ error: 'Internal server error' });
    }
  });

  // Admin API: Delete a place and all its related facts by curio_id
  app.delete('/api/admin/place/:curioId', async (req, res) => {
    try {
      const { curioId } = req.params;

      const { error: factsError } = await supabase
        .from('facts')
        .delete()
        .eq('curio_id', curioId);

      if (factsError) {
        console.error('Error deleting facts:', factsError);
      }

      const { error: placeError } = await supabase
        .from('places')
        .delete()
        .eq('curio_id', curioId);

      if (placeError) {
        console.error('Error deleting place:', placeError);
        return res.status(500).json({ error: placeError.message });
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
          .in('curio_id', placeIds)
          .eq('visible_flag', true);

        const placeMap: Record<string, any> = {};
        if (places) {
          for (const p of places) {
            placeMap[p.curio_id] = p;
          }
        }

        stops = items
          .filter((item: any) => placeMap[item.place_id])
          .map((item: any) => {
            const place = placeMap[item.place_id];
            return {
              id: item.list_item_uuid,
              list_id: item.list_uuid,
              place_id: item.place_id,
              place_name: place.name || 'Unknown Place',
              place_description: place.detail_overview || '',
              place_latitude: place.lat || 0,
              place_longitude: place.lon || 0,
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

  // ============================================
  // Admin Tours (Lists) Management
  // ============================================

  // Serve admin tours HTML page
  app.get('/admin/tours', (_req, res) => {
    res.sendFile('admin-tours.html', { root: path.join(__dirname, '..', 'server') });
  });

  // Get all tours
  app.get('/api/admin/tours', async (_req, res) => {
    try {
      const { data: tours, error } = await supabase
        .from('lists')
        .select('*')
        .eq('list_type', 'tour')
        .order('created_at', { ascending: false });

      if (error) return res.status(500).json({ error: error.message });

      const toursWithCounts = await Promise.all(
        (tours || []).map(async (tour) => {
          const { count } = await supabase
            .from('list_items')
            .select('*', { count: 'exact', head: true })
            .eq('list_uuid', tour.id);
          return { ...tour, item_count: count || 0 };
        })
      );

      res.json(toursWithCounts);
    } catch (err) {
      res.status(500).json({ error: 'Internal server error' });
    }
  });

  // Create a new tour
  app.post('/api/admin/tours', async (req, res) => {
    try {
      const { name, description, tour_length, tour_length_category, tour_start_region, tour_end_region, tour_id } = req.body;
      if (!name) return res.status(400).json({ error: 'name is required' });

      const insert: any = {
        name: name.trim(),
        description: description || null,
        list_type: 'tour',
        user_id: 'fafec54e-cf0e-45ce-8467-7b2a50870987',
      };
      if (tour_length) insert.tour_length = tour_length;
      if (tour_length_category) insert.tour_length_category = tour_length_category;
      if (tour_start_region) insert.tour_start_region = tour_start_region;
      if (tour_end_region) insert.tour_end_region = tour_end_region;
      if (tour_id) insert.tour_id = tour_id;

      const { data, error } = await supabase
        .from('lists')
        .insert(insert)
        .select()
        .single();

      if (error) return res.status(500).json({ error: error.message });
      res.json(data);
    } catch (err) {
      res.status(500).json({ error: 'Internal server error' });
    }
  });

  // Update a tour
  app.patch('/api/admin/tours/:id', async (req, res) => {
    try {
      const { id } = req.params;
      const { name, description, tour_length, tour_length_category, tour_start_region, tour_end_region, tour_id, promoted_flag } = req.body;
      const updates: any = { updated_at: new Date().toISOString() };
      if (name !== undefined) updates.name = name.trim();
      if (description !== undefined) updates.description = description;
      if (tour_length !== undefined) updates.tour_length = tour_length;
      if (tour_length_category !== undefined) updates.tour_length_category = tour_length_category;
      if (tour_start_region !== undefined) updates.tour_start_region = tour_start_region;
      if (tour_end_region !== undefined) updates.tour_end_region = tour_end_region;
      if (tour_id !== undefined) updates.tour_id = tour_id;
      if (promoted_flag !== undefined) updates.promoted_flag = promoted_flag;

      const { data, error } = await supabase
        .from('lists')
        .update(updates)
        .eq('id', id)
        .eq('list_type', 'tour')
        .select()
        .single();

      if (error) return res.status(500).json({ error: error.message });
      res.json(data);
    } catch (err) {
      res.status(500).json({ error: 'Internal server error' });
    }
  });

  // Delete a tour and its items
  app.delete('/api/admin/tours/:id', async (req, res) => {
    try {
      const { id } = req.params;

      await supabase.from('list_items').delete().eq('list_uuid', id);

      const { error } = await supabase
        .from('lists')
        .delete()
        .eq('id', id)
        .eq('list_type', 'tour');

      if (error) return res.status(500).json({ error: error.message });
      res.json({ success: true });
    } catch (err) {
      res.status(500).json({ error: 'Internal server error' });
    }
  });

  // Get tour items
  app.get('/api/admin/tours/:id/items', async (req, res) => {
    try {
      const { id } = req.params;
      const { data: items, error } = await supabase
        .from('list_items')
        .select('*')
        .eq('list_uuid', id)
        .order('order_index', { ascending: true });

      if (error) return res.status(500).json({ error: error.message });

      // Enrich with place details
      const placeIds = (items || []).map((i: any) => i.place_id).filter(Boolean);
      let placeMap: Record<string, any> = {};
      if (placeIds.length > 0) {
        const { data: places } = await supabase
          .from('places')
          .select('curio_id, name, lat, lon')
          .in('curio_id', placeIds)
          .eq('visible_flag', true);
        if (places) {
          for (const p of places) placeMap[p.curio_id] = p;
        }
      }

      const enriched = (items || [])
        .filter((item: any) => placeMap[item.place_id])
        .map((item: any) => {
          const place = placeMap[item.place_id];
          return {
            id: item.list_item_uuid || item.id,
            list_uuid: item.list_uuid,
            place_id: item.place_id,
            place_name: place.name || 'Unknown',
            place_lat: place.lat || 0,
            place_lon: place.lon || 0,
            order_index: item.order_index,
          };
        });

      res.json(enriched);
    } catch (err) {
      res.status(500).json({ error: 'Internal server error' });
    }
  });

  // Add item to tour
  app.post('/api/admin/tours/:id/items', async (req, res) => {
    try {
      const { id } = req.params;
      const { place_id } = req.body;
      if (!place_id) return res.status(400).json({ error: 'place_id (curio_id) is required' });

      // Verify the place exists
      const { data: place, error: placeErr } = await supabase
        .from('places')
        .select('curio_id, name, lat, lon')
        .eq('curio_id', place_id)
        .single();

      if (placeErr || !place) return res.status(404).json({ error: 'Place not found' });

      // Get next order index
      const { count } = await supabase
        .from('list_items')
        .select('*', { count: 'exact', head: true })
        .eq('list_uuid', id);

      const { data, error } = await supabase
        .from('list_items')
        .insert({
          list_id: id,
          list_uuid: id,
          place_id: place.curio_id,
          order_index: (count || 0) + 1,
        })
        .select()
        .single();

      if (error) {
        if (error.code === '23505') return res.status(409).json({ error: 'Place already in this tour' });
        return res.status(500).json({ error: error.message });
      }

      res.json({ ...data, id: data.list_item_uuid || data.id });
    } catch (err) {
      res.status(500).json({ error: 'Internal server error' });
    }
  });

  // Remove item from tour
  app.delete('/api/admin/tours/:id/items/:itemId', async (req, res) => {
    try {
      const { itemId } = req.params;

      const { error } = await supabase
        .from('list_items')
        .delete()
        .eq('list_item_uuid', itemId);

      if (error) return res.status(500).json({ error: error.message });
      res.json({ success: true });
    } catch (err) {
      res.status(500).json({ error: 'Internal server error' });
    }
  });

  // Reorder tour items
  app.patch('/api/admin/tours/:id/items/reorder', async (req, res) => {
    try {
      const { items } = req.body;
      if (!items || !Array.isArray(items)) return res.status(400).json({ error: 'items array is required' });

      for (const item of items) {
        await supabase
          .from('list_items')
          .update({ order_index: item.order_index })
          .eq('list_item_uuid', item.id);
      }

      res.json({ success: true });
    } catch (err) {
      res.status(500).json({ error: 'Internal server error' });
    }
  });

  // Random place for admin review
  app.get('/api/admin/places/random', async (req, res) => {
    try {
      const { count, error: countError } = await supabase
        .from('places')
        .select('*', { count: 'exact', head: true });

      if (countError || !count) return res.status(500).json({ error: 'Could not count places' });

      const offset = Math.floor(Math.random() * count);
      const { data, error } = await supabase
        .from('places')
        .select('curio_id, name, lat, lon')
        .range(offset, offset)
        .limit(1);

      if (error || !data?.length) return res.status(500).json({ error: 'Could not fetch random place' });
      res.json(data[0]);
    } catch (err) {
      res.status(500).json({ error: 'Internal server error' });
    }
  });

  // Search places for adding to tours
  app.get('/api/admin/places/search', async (req, res) => {
    try {
      const query = (req.query.q as string || '').trim();
      if (query.length < 2) return res.json([]);

      const searchTerm = `%${query}%`;
      const { data, error } = await supabase
        .from('places')
        .select('curio_id, name, lat, lon')
        .or(`name.ilike.${searchTerm},curio_id.ilike.${searchTerm}`)
        .limit(20);

      if (error) return res.status(500).json({ error: error.message });
      res.json(data || []);
    } catch (err) {
      res.status(500).json({ error: 'Internal server error' });
    }
  });

  return createServer(app);
}
