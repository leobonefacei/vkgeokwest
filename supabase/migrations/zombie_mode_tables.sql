-- Таблицы для Зомби-режима
-- Выполните этот SQL в Supabase SQL Editor

-- Игровые сессии
CREATE TABLE IF NOT EXISTS zombie_game_sessions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  vk_id BIGINT NOT NULL REFERENCES profiles(vk_id),
  started_at TIMESTAMPTZ DEFAULT NOW(),
  ended_at TIMESTAMPTZ,
  is_active BOOLEAN DEFAULT true,
  player_hp INTEGER DEFAULT 100,
  max_hp INTEGER DEFAULT 100,
  action_points INTEGER DEFAULT 10,
  max_action_points INTEGER DEFAULT 10,
  last_ap_regen TIMESTAMPTZ DEFAULT NOW(),
  last_ap_use TIMESTAMPTZ DEFAULT NOW(),
  player_lat DOUBLE PRECISION NOT NULL,
  player_lon DOUBLE PRECISION NOT NULL,
  noise_level INTEGER DEFAULT 0,
  survival_time_seconds INTEGER DEFAULT 0,
  is_in_safe_zone BOOLEAN DEFAULT false,
  deaths_count INTEGER DEFAULT 0,
  move_count INTEGER DEFAULT 0,
  first_move_at TIMESTAMPTZ,
  last_move_at TIMESTAMPTZ,
  scenario_preset_id UUID,
  last_book_pickup TIMESTAMPTZ
);

-- Зомби
CREATE TABLE IF NOT EXISTS zombie_entities (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  session_id UUID NOT NULL REFERENCES zombie_game_sessions(id) ON DELETE CASCADE,
  lat DOUBLE PRECISION NOT NULL,
  lon DOUBLE PRECISION NOT NULL,
  is_hunting BOOLEAN DEFAULT false,
  target_lat DOUBLE PRECISION,
  target_lon DOUBLE PRECISION,
  speed INTEGER DEFAULT 100, -- метров за 5 минут
  last_move_at TIMESTAMPTZ DEFAULT NOW(),
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Объекты мира (ресурсы, убежища)
CREATE TABLE IF NOT EXISTS zombie_world_objects (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  session_id UUID NOT NULL REFERENCES zombie_game_sessions(id) ON DELETE CASCADE,
  type TEXT NOT NULL CHECK (type IN ('shelter', 'shop', 'pharmacy', 'gas_station', 'camp', 'extraction_camp', 'library', 'bookstore')),
  name TEXT NOT NULL,
  lat DOUBLE PRECISION NOT NULL,
  lon DOUBLE PRECISION NOT NULL,
  radius INTEGER DEFAULT 50,
  is_looted BOOLEAN DEFAULT false,
  respawn_at TIMESTAMPTZ,
  unlocks_at_move INTEGER
);

-- Инвентарь игрока
CREATE TABLE IF NOT EXISTS zombie_inventory (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  session_id UUID NOT NULL REFERENCES zombie_game_sessions(id) ON DELETE CASCADE,
  type TEXT NOT NULL CHECK (type IN ('medkit', 'food', 'water', 'weapon', 'ammo', 'flashlight', 'book')),
  name TEXT NOT NULL,
  quantity INTEGER DEFAULT 1,
  effect_value INTEGER DEFAULT 0,
  book_id TEXT
);

-- Статистика игроков
CREATE TABLE IF NOT EXISTS zombie_stats (
  vk_id BIGINT PRIMARY KEY REFERENCES profiles(vk_id),
  total_deaths INTEGER DEFAULT 0,
  best_survival_time_seconds INTEGER DEFAULT 0,
  total_zombies_evaded INTEGER DEFAULT 0,
  total_resources_collected INTEGER DEFAULT 0,
  games_played INTEGER DEFAULT 0
);

-- Индексы для оптимизации
CREATE INDEX IF NOT EXISTS idx_zombie_sessions_vk_id ON zombie_game_sessions(vk_id);
CREATE INDEX IF NOT EXISTS idx_zombie_sessions_active ON zombie_game_sessions(is_active);
CREATE INDEX IF NOT EXISTS idx_zombie_entities_session ON zombie_entities(session_id);
CREATE INDEX IF NOT EXISTS idx_zombie_world_objects_session ON zombie_world_objects(session_id);
CREATE INDEX IF NOT EXISTS idx_zombie_inventory_session ON zombie_inventory(session_id);

-- RLS политики (Row Level Security)
ALTER TABLE zombie_game_sessions ENABLE ROW LEVEL SECURITY;
ALTER TABLE zombie_entities ENABLE ROW LEVEL SECURITY;
ALTER TABLE zombie_world_objects ENABLE ROW LEVEL SECURITY;
ALTER TABLE zombie_inventory ENABLE ROW LEVEL SECURITY;
ALTER TABLE zombie_stats ENABLE ROW LEVEL SECURITY;

-- Разрешить все операции для анонимных пользователей (VK Mini App)
CREATE POLICY "Allow all for zombie_game_sessions" ON zombie_game_sessions FOR ALL USING (true);
CREATE POLICY "Allow all for zombie_entities" ON zombie_entities FOR ALL USING (true);
CREATE POLICY "Allow all for zombie_world_objects" ON zombie_world_objects FOR ALL USING (true);
CREATE POLICY "Allow all for zombie_inventory" ON zombie_inventory FOR ALL USING (true);
CREATE POLICY "Allow all for zombie_stats" ON zombie_stats FOR ALL USING (true);
