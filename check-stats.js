
const { createClient } = require('@supabase/supabase-js');

const supabaseUrl = 'https://ftckqoljlrusbmflezcw.supabase.co';
const supabaseKey = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImZ0Y2txb2xqbHJ1c2JtZmxlemN3Iiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImlhdCI6MTc3MTExNjc2OCwiZXhwIjoyMDg2NjkyNzY4fQ.gzT30Ly2SPSFNS9Gh70CNnbD1CU3ebiZZJON-kErBCw';

const supabase = createClient(supabaseUrl, supabaseKey);

async function checkStats() {
  const { data: stats } = await supabase.from('user_stats').select('*').eq('user_id', 35645976).single();
  console.log('Stats for 35645976:', stats);
}

checkStats();
