-- Основные таблицы для VK-Geo (Умникоины)
-- Выполните этот SQL в Supabase SQL Editor

-- Профили пользователей (ключевая таблица)
CREATE TABLE IF NOT EXISTS profiles (
  vk_id BIGINT PRIMARY KEY,
  first_name TEXT,
  last_name TEXT,
  photo_200 TEXT,
  is_private BOOLEAN DEFAULT false,
  last_lat DOUBLE PRECISION,
  last_lon DOUBLE PRECISION,
  last_category TEXT,
  last_location_name TEXT,
  last_mined_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- Статистика пользователя
CREATE TABLE IF NOT EXISTS user_stats (
  user_id BIGINT PRIMARY KEY REFERENCES profiles(vk_id) ON DELETE CASCADE,
  balance INTEGER DEFAULT 0,
  mined_balance INTEGER DEFAULT 0,
  visits_today INTEGER DEFAULT 0,
  visits_this_week INTEGER DEFAULT 0,
  weekly_days INTEGER DEFAULT 0,
  last_check_in TIMESTAMPTZ,
  category_cooldowns JSONB DEFAULT '{}',
  daily_claimed BOOLEAN DEFAULT false,
  weekly_claimed BOOLEAN DEFAULT false,
  last_daily_reset TEXT,
  last_weekly_reset TEXT,
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- История посещений
CREATE TABLE IF NOT EXISTS user_visits (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id BIGINT NOT NULL REFERENCES profiles(vk_id) ON DELETE CASCADE,
  place_id UUID NOT NULL,
  location_name TEXT NOT NULL,
  category TEXT,
  coins_earned INTEGER DEFAULT 0,
  timestamp TIMESTAMPTZ DEFAULT NOW(),
  lat DOUBLE PRECISION,
  lon DOUBLE PRECISION
);

-- Места знаний
CREATE TABLE IF NOT EXISTS knowledge_places (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  osm_id TEXT UNIQUE,
  name TEXT NOT NULL,
  category TEXT NOT NULL,
  lat DOUBLE PRECISION NOT NULL,
  lon DOUBLE PRECISION NOT NULL,
  description TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Индекс для поиска по OSM ID
CREATE INDEX IF NOT EXISTS idx_knowledge_places_osm_id ON knowledge_places(osm_id);

-- Права доступа пользователей
CREATE TABLE IF NOT EXISTS users_permissions (
  vk_id BIGINT PRIMARY KEY REFERENCES profiles(vk_id) ON DELETE CASCADE,
  permissions JSONB DEFAULT '{}',
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Подписки (друзья)
CREATE TABLE IF NOT EXISTS follows (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  follower_id BIGINT NOT NULL REFERENCES profiles(vk_id) ON DELETE CASCADE,
  following_id BIGINT NOT NULL REFERENCES profiles(vk_id) ON DELETE CASCADE,
  is_blocked BOOLEAN DEFAULT false,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE(follower_id, following_id)
);

-- Таблицы для зомби-режима (из существующей миграции)
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
  speed INTEGER DEFAULT 100,
  last_move_at TIMESTAMPTZ DEFAULT NOW(),
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Объекты мира
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

-- Инвентарь
CREATE TABLE IF NOT EXISTS zombie_inventory (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  session_id UUID NOT NULL REFERENCES zombie_game_sessions(id) ON DELETE CASCADE,
  type TEXT NOT NULL CHECK (type IN ('medkit', 'food', 'water', 'weapon', 'ammo', 'flashlight', 'book')),
  name TEXT NOT NULL,
  quantity INTEGER DEFAULT 1,
  effect_value INTEGER DEFAULT 0,
  book_id TEXT
);

-- Статистика зомби
CREATE TABLE IF NOT EXISTS zombie_stats (
  vk_id BIGINT PRIMARY KEY REFERENCES profiles(vk_id),
  total_deaths INTEGER DEFAULT 0,
  best_survival_time_seconds INTEGER DEFAULT 0,
  total_zombies_evaded INTEGER DEFAULT 0,
  total_resources_collected INTEGER DEFAULT 0,
  games_played INTEGER DEFAULT 0
);

-- Индексы для оптимизации
CREATE INDEX IF NOT EXISTS idx_user_visits_user_id ON user_visits(user_id);
CREATE INDEX IF NOT EXISTS idx_user_visits_place_id ON user_visits(place_id);
CREATE INDEX IF NOT EXISTS idx_follows_follower ON follows(follower_id);
CREATE INDEX IF NOT EXISTS idx_follows_following ON follows(following_id);
CREATE INDEX IF NOT EXISTS idx_zombie_sessions_vk_id ON zombie_game_sessions(vk_id);
CREATE INDEX IF NOT EXISTS idx_zombie_sessions_active ON zombie_game_sessions(is_active);
CREATE INDEX IF NOT EXISTS idx_zombie_entities_session ON zombie_entities(session_id);
CREATE INDEX IF NOT EXISTS idx_zombie_world_objects_session ON zombie_world_objects(session_id);
CREATE INDEX IF NOT EXISTS idx_zombie_inventory_session ON zombie_inventory(session_id);

-- RLS политики
ALTER TABLE profiles ENABLE ROW LEVEL SECURITY;
ALTER TABLE user_stats ENABLE ROW LEVEL SECURITY;
ALTER TABLE user_visits ENABLE ROW LEVEL SECURITY;
ALTER TABLE knowledge_places ENABLE ROW LEVEL SECURITY;
ALTER TABLE users_permissions ENABLE ROW LEVEL SECURITY;
ALTER TABLE follows ENABLE ROW LEVEL SECURITY;
ALTER TABLE zombie_game_sessions ENABLE ROW LEVEL SECURITY;
ALTER TABLE zombie_entities ENABLE ROW LEVEL SECURITY;
ALTER TABLE zombie_world_objects ENABLE ROW LEVEL SECURITY;
ALTER TABLE zombie_inventory ENABLE ROW LEVEL SECURITY;
ALTER TABLE zombie_stats ENABLE ROW LEVEL SECURITY;

-- Разрешить все операции для anon (VK Mini App)
CREATE POLICY "Allow all profiles" ON profiles FOR ALL USING (true);
CREATE POLICY "Allow all user_stats" ON user_stats FOR ALL USING (true);
CREATE POLICY "Allow all user_visits" ON user_visits FOR ALL USING (true);
CREATE POLICY "Allow all knowledge_places" ON knowledge_places FOR ALL USING (true);
CREATE POLICY "Allow all users_permissions" ON users_permissions FOR ALL USING (true);
CREATE POLICY "Allow all follows" ON follows FOR ALL USING (true);
CREATE POLICY "Allow all zombie_game_sessions" ON zombie_game_sessions FOR ALL USING (true);
CREATE POLICY "Allow all zombie_entities" ON zombie_entities FOR ALL USING (true);
CREATE POLICY "Allow all zombie_world_objects" ON zombie_world_objects FOR ALL USING (true);
CREATE POLICY "Allow all zombie_inventory" ON zombie_inventory FOR ALL USING (true);
CREATE POLICY "Allow all zombie_stats" ON zombie_stats FOR ALL USING (true);
