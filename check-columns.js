
const { createClient } = require('@supabase/supabase-js');

const supabaseUrl = 'https://ftckqoljlrusbmflezcw.supabase.co';
const supabaseKey = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImZ0Y2txb2xqbHJ1c2JtZmxlemN3Iiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImlhdCI6MTc3MTExNjc2OCwiZXhwIjoyMDg2NjkyNzY4fQ.gzT30Ly2SPSFNS9Gh70CNnbD1CU3ebiZZJON-kErBCw';

const supabase = createClient(supabaseUrl, supabaseKey);

async function checkColumns() {
  console.log('Checking columns...');
  
  const { data: follows, error: fErr } = await supabase.from('follows').select('*').limit(1);
  if (fErr) console.log('Follows error:', fErr.message);
  else console.log('Follows columns:', Object.keys(follows[0] || {}));

  const { data: profiles, error: pErr } = await supabase.from('profiles').select('*').limit(1);
  if (pErr) console.log('Profiles error:', pErr.message);
  else console.log('Profiles columns:', Object.keys(profiles[0] || {}));
}

checkColumns();
