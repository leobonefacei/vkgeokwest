
const { createClient } = require('@supabase/supabase-js');

async function applyMissingTables() {
  const client = createClient('https://ftckqoljlrusbmflezcw.supabase.co', 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImZ0Y2txb2xqbHJ1c2JtZmxlemN3Iiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImlhdCI6MTc3MTExNjc2OCwiZXhwIjoyMDg2NjkyNzY4fQ.gzT30Ly2SPSFNS9Gh70CNnbD1CU3ebiZZJON-kErBCw');

  console.log('Checking/Creating audit_log table...');
  const { error: err1 } = await client.rpc('exec_sql', {
    sql: `
      CREATE TABLE IF NOT EXISTS audit_log (
        id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        vk_id BIGINT NOT NULL,
        action TEXT NOT NULL,
        details JSONB DEFAULT '{}',
        created_at TIMESTAMPTZ DEFAULT NOW()
      );
      ALTER TABLE audit_log ENABLE ROW LEVEL SECURITY;
      CREATE POLICY "Allow all audit_log" ON audit_log FOR ALL USING (true);
    `
  });
  if (err1) console.log('Audit log table might need manual creation or RPC missing.');

  console.log('Checking/Creating zombie_spawn_rules table...');
  const { error: err2 } = await client.rpc('exec_sql', {
    sql: `
      CREATE TABLE IF NOT EXISTS zombie_spawn_rules (
        id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        preset_id UUID NOT NULL REFERENCES zombie_scenario_presets(id) ON DELETE CASCADE,
        name TEXT NOT NULL,
        trigger_type TEXT NOT NULL,
        turn_min INTEGER DEFAULT 0,
        turn_max INTEGER DEFAULT 0,
        zombie_count INTEGER DEFAULT 1,
        distance_min INTEGER DEFAULT 50,
        distance_max INTEGER DEFAULT 150,
        speed INTEGER DEFAULT 100,
        chance INTEGER DEFAULT 100,
        sort_order INTEGER DEFAULT 0,
        use_player_avatars BOOLEAN DEFAULT false,
        avatar_chance INTEGER DEFAULT 50,
        created_at TIMESTAMPTZ DEFAULT NOW(),
        updated_at TIMESTAMPTZ DEFAULT NOW()
      );
      ALTER TABLE zombie_spawn_rules ENABLE ROW LEVEL SECURITY;
      CREATE POLICY "Allow all zombie_spawn_rules" ON zombie_spawn_rules FOR ALL USING (true);
    `
  });
  if (err2) console.log('Zombie spawn rules table might need manual creation.');
  
  console.log('Done.');
}

applyMissingTables();
