
const { createClient } = require('@supabase/supabase-js');

const supabaseUrl = 'https://zcgasztjgsiqlzmjlkkd.supabase.co';
const supabaseKey = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InpjZ2FzenRqZ3NpcWx6bWpsa2tkIiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImlhdCI6MTc3MTMyMzg1NywiZXhwIjoyMDg2ODk5ODU3fQ.oaczebjAlfk7XyNsGbny7XFRxSEPf184ipz70j36r_4';

const supabase = createClient(supabaseUrl, supabaseKey);

async function applyMigration() {
  console.log('Attempting to apply migration...');
  
  // Try to use a common RPC name for SQL execution if it exists
  const { data, error } = await supabase.rpc('exec_sql', {
    sql: `
      ALTER TABLE knowledge_places ADD COLUMN IF NOT EXISTS osm_id TEXT UNIQUE;
      CREATE INDEX IF NOT EXISTS idx_knowledge_places_osm_id ON knowledge_places(osm_id);
    `
  });

  if (error) {
    console.error('Error applying migration via exec_sql:', error);
    
    // Try another approach: check if column exists by trying to select it
    const { data: selectData, error: selectError } = await supabase
      .from('knowledge_places')
      .select('osm_id')
      .limit(1);
      
    if (selectError && selectError.message.includes('column "osm_id" does not exist')) {
      console.log('Column osm_id definitely does not exist.');
    } else {
      console.log('Column osm_id seems to exist or selectError is different:', selectError);
    }
  } else {
    console.log('Migration applied successfully via exec_sql!');
  }
}

applyMigration();
