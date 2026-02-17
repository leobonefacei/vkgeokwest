const { createClient } = require('@supabase/supabase-js');

const supabaseUrl = 'https://zcgasztjgsiqlzmjlkkd.supabase.co';
const supabaseKey = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InpjZ2FzenRqZ3NpcWx6bWpsa2tkIiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImlhdCI6MTc3MTMyMzg1NywiZXhwIjoyMDg2ODk5ODU3fQ.oaczebjAlfk7XyNsGbny7XFRxSEPf184ipz70j36r_4';

const supabase = createClient(supabaseUrl, supabaseKey);

async function tryExec() {
  // Try to call a function that might execute SQL
  const functions = ['exec_sql', 'pg_catalog', 'pg_exec', 'sql_exec'];
  
  for (const fn of functions) {
    try {
      const { data, error } = await supabase.rpc(fn, { sql: 'SELECT 1' });
      console.log(`Function ${fn}:`, error ? error.message : 'OK');
    } catch (e) {
      console.log(`Function ${fn}: error:`, e.message);
    }
  }
}

tryExec();
