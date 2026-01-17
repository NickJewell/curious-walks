import type { Express } from "express";
import { createServer, type Server } from "node:http";
import { createClient } from "@supabase/supabase-js";

const supabaseUrl = process.env.EXPO_PUBLIC_SUPABASE_URL || '';
const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY || '';
const supabase = createClient(supabaseUrl, supabaseServiceKey);

export async function registerRoutes(app: Express): Promise<Server> {
  // Admin API: Get places that need detail-overview (null), sorted by box-id
  app.get('/api/admin/places/needs-overview', async (req, res) => {
    try {
      // First get total count
      const { count } = await supabase
        .from('places')
        .select('*', { count: 'exact', head: true })
        .is('detail-overview', null);

      // Get records with null detail-overview
      const { data, error } = await supabase
        .from('places')
        .select('places-id, curio-id, name, plus-code, detail-overview')
        .is('detail-overview', null);

      if (error) {
        console.error('Error fetching places:', error);
        return res.status(500).json({ error: error.message });
      }

      // Sort by numeric part of curio-id (e.g., CURIO-190 → 190)
      const sorted = (data || []).sort((a: any, b: any) => {
        const numA = parseInt((a['curio-id'] || '').replace(/\D/g, '')) || 0;
        const numB = parseInt((b['curio-id'] || '').replace(/\D/g, '')) || 0;
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

  // Admin API: Update a place's detail-overview
  app.patch('/api/admin/places/:id', async (req, res) => {
    try {
      const { id } = req.params;
      const { 'detail-overview': detailOverview } = req.body;

      console.log('Updating place:', id, 'with detail-overview:', detailOverview?.substring(0, 50));

      // First verify the record exists
      const { data: existing, error: fetchError } = await supabase
        .from('places')
        .select('places-id, name')
        .eq('places-id', id)
        .single();

      if (fetchError) {
        console.error('Error fetching place:', fetchError);
        return res.status(404).json({ error: 'Place not found: ' + fetchError.message });
      }

      console.log('Found existing place:', (existing as any)?.name);

      // Use upsert-like approach - update with returning
      const { error: updateError } = await supabase
        .from('places')
        .update({ 'detail-overview': detailOverview })
        .eq('places-id', id);

      if (updateError) {
        console.error('Error updating place:', updateError);
        return res.status(500).json({ error: updateError.message });
      }

      res.json({ success: true, place: { ...(existing as any), 'detail-overview': detailOverview } });
    } catch (err) {
      console.error('Error updating place:', err);
      res.status(500).json({ error: 'Internal server error' });
    }
  });

  // Admin API: Lookup a place by curio-id
  app.get('/api/admin/places/lookup/:curioId', async (req, res) => {
    try {
      const { curioId } = req.params;
      
      const { data, error } = await supabase
        .from('places')
        .select('places-id, curio-id, name, detail-overview')
        .eq('curio-id', curioId)
        .single();

      if (error) {
        return res.status(404).json({ error: 'Place not found' });
      }

      res.json({ place: data });
    } catch (err) {
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
        .eq('curio-id', curioId);

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

  // Admin API: Get curio with place and facts by curio-id
  app.get('/api/admin/curio/:curioId', async (req, res) => {
    try {
      const { curioId } = req.params;
      
      // Get the place
      const { data: place, error: placeError } = await supabase
        .from('places')
        .select('*')
        .eq('curio-id', curioId)
        .single();

      if (placeError) {
        return res.status(404).json({ error: 'Place not found' });
      }

      // Get the facts
      const { data: facts, error: factsError } = await supabase
        .from('facts')
        .select('*')
        .eq('curio-id', curioId);

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
      const { 'curio-id': curioId, fact } = req.body;
      
      if (!curioId || !fact) {
        return res.status(400).json({ error: 'curio-id and fact are required' });
      }

      const { data, error } = await supabase
        .from('facts')
        .insert({ 'curio-id': curioId, fact })
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
        k === 'fact' || k === 'content' || k === 'text' || k === 'fact-text'
      ) || 'fact';

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

  return createServer(app);
}
