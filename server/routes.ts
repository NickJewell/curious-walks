import type { Express } from "express";
import { createServer, type Server } from "node:http";
import { createClient } from "@supabase/supabase-js";

const supabaseUrl = process.env.SUPABASE_URL || '';
const supabaseKey = process.env.SUPABASE_ANON_KEY || '';
const supabase = createClient(supabaseUrl, supabaseKey);

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
      const sorted = (data || []).sort((a, b) => {
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

      const { data, error } = await supabase
        .from('places')
        .update({ 'detail-overview': detailOverview })
        .eq('places-id', id)
        .select();

      if (error) {
        console.error('Error updating place:', error);
        return res.status(500).json({ error: error.message });
      }

      if (!data || data.length === 0) {
        return res.status(404).json({ error: 'Place not found' });
      }

      res.json({ success: true, place: data[0] });
    } catch (err) {
      console.error('Error updating place:', err);
      res.status(500).json({ error: 'Internal server error' });
    }
  });

  return createServer(app);
}
