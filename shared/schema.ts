export interface Curio {
  id: string;
  name: string;
  description: string;
  latitude: number;
  longitude: number;
}

export interface UserList {
  id: string;
  user_id: string;
  name: string;
  created_at: string;
  updated_at: string;
}

export interface ListItem {
  id: string;
  list_id: string;
  place_id: string;
  place_name: string;
  place_description: string;
  place_latitude: number;
  place_longitude: number;
  order_index: number;
  created_at: string;
}

export interface ListWithItemCount extends UserList {
  item_count: number;
}
