import { useEffect } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { supabase } from '../../lib/supabase';

export type InventoryRow = {
  unit_type_id: string;
  project_id: string;
  project: string;
  location_id: string;
  location: string;
  usp: string | null;
  parking_charge: number | null;
  registration_pct: number | null;
  floor_hike_per_floor: number | null;
  builder_id: string | null;
  builder: string | null;
  configuration_id: string;
  config: string;
  config_order: number;
  type_name: string;
  available_count: number;
  sqft: number | null;
  price: number | null;
  sqft_rate: number | null;
  property_type: 'apartment' | 'villa';
  total_floor_count: number | null;
  total_units: number | null;
  latitude: number | null;
  longitude: number | null;
  builder_logo_path: string | null;
  thumbnail_path: string | null;
  floor_plan_path: string | null;
  brochure_path: string | null;
  status: 'ready_to_move' | 'off_plan';
};

const KEY = ['inventory'];

export function useInventory() {
  const qc = useQueryClient();

  useEffect(() => {
    const channel = supabase
      .channel('inventory-changes')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'unit_types' }, () =>
        qc.invalidateQueries({ queryKey: KEY }),
      )
      .subscribe();
    return () => {
      supabase.removeChannel(channel);
    };
  }, [qc]);

  return useQuery({
    queryKey: KEY,
    queryFn: async (): Promise<InventoryRow[]> => {
      const { data, error } = await supabase
        .from('inventory_view')
        .select('*')
        .order('project')
        .order('config_order')
        .order('type_name');
      if (error) throw error;
      return data as InventoryRow[];
    },
  });
}

export function useUpdateAvailability() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async ({ id, count }: { id: string; count: number }) => {
      const { error } = await supabase.from('unit_types').update({ available_count: count }).eq('id', id);
      if (error) throw error;
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: KEY }),
  });
}
