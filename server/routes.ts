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

      // Then get first 10 records sorted by box-id
      const { data, error } = await supabase
        .from('places')
        .select('places-id, curio-id, name, box-id, detail-overview')
        .is('detail-overview', null)
        .order('box-id', { ascending: true, nullsFirst: false })
        .limit(10);

      if (error) {
        console.error('Error fetching places:', error);
        return res.status(500).json({ error: error.message });
      }

      res.json({ places: data || [], total: count || 0 });
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
