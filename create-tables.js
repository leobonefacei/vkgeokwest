const { Client } = require('pg');

const client = new Client({
  connectionString: 'postgresql://postgres:postgres@db.zcgasztjgsiqlzmjlkkd.supabase.co:5432/postgres'
});

async function createTables() {
  console.log('Подключение к базе данных...');
  await client.connect();
  console.log('Подключено!');

  const sql = `
-- Основные таблицы для VK-Geo (Умникоины)

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
  created_at TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE(follower_id, following_id)
);

-- Индексы для оптимизации
CREATE INDEX IF NOT EXISTS idx_user_visits_user_id ON user_visits(user_id);
CREATE INDEX IF NOT EXISTS idx_user_visits_place_id ON user_visits(place_id);
CREATE INDEX IF NOT EXISTS idx_follows_follower ON follows(follower_id);
CREATE INDEX IF NOT EXISTS idx_follows_following ON follows(following_id);
CREATE INDEX IF NOT EXISTS idx_knowledge_places_osm_id ON knowledge_places(osm_id);
`;

  console.log('Создание таблиц...');
  await client.query(sql);
  console.log('Таблицы созданы!');

  // Enable RLS
  console.log('Включение RLS...');
  await client.query(`
    ALTER TABLE profiles ENABLE ROW LEVEL SECURITY;
    ALTER TABLE user_stats ENABLE ROW LEVEL SECURITY;
    ALTER TABLE user_visits ENABLE ROW LEVEL SECURITY;
    ALTER TABLE knowledge_places ENABLE ROW LEVEL SECURITY;
    ALTER TABLE users_permissions ENABLE ROW LEVEL SECURITY;
    ALTER TABLE follows ENABLE ROW LEVEL SECURITY;
  `);
  
  // Allow all operations
  console.log('Настройка политик RLS...');
  await client.query(`
    CREATE POLICY "Allow all profiles" ON profiles FOR ALL USING (true);
    CREATE POLICY "Allow all user_stats" ON user_stats FOR ALL USING (true);
    CREATE POLICY "Allow all user_visits" ON user_visits FOR ALL USING (true);
    CREATE POLICY "Allow all knowledge_places" ON knowledge_places FOR ALL USING (true);
    CREATE POLICY "Allow all users_permissions" ON users_permissions FOR ALL USING (true);
    CREATE POLICY "Allow all follows" ON follows FOR ALL USING (true);
  `);

  console.log('Готово!');
  await client.end();
}

createTables().catch(err => {
  console.error('Ошибка:', err.message);
  process.exit(1);
});
