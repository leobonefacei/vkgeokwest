
const { createClient } = require('@supabase/supabase-js');

const supabaseUrl = 'https://zcgasztjgsiqlzmjlkkd.supabase.co';
const supabaseKey = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InpjZ2FzenRqZ3NpcWx6bWpsa2tkIiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImlhdCI6MTc3MTMyMzg1NywiZXhwIjoyMDg2ODk5ODU3fQ.oaczebjAlfk7XyNsGbny7XFRxSEPf184ipz70j36r_4';

const supabase = createClient(supabaseUrl, supabaseKey);

async function check() {
  console.log('Checking connection...');
  // Check if we can reach any system info
  const { data, error } = await supabase.from('profiles').select('*').limit(1);
  if (error) {
    console.log('Error (expected if table missing):', error.message);
  } else {
    console.log('Success! Table exists.');
  }
}

check();
