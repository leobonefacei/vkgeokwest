
const { createClient } = require('@supabase/supabase-js');

const supabaseUrl = 'https://ftckqoljlrusbmflezcw.supabase.co';
const supabaseKey = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImZ0Y2txb2xqbHJ1c2JtZmxlemN3Iiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImlhdCI6MTc3MTExNjc2OCwiZXhwIjoyMDg2NjkyNzY4fQ.gzT30Ly2SPSFNS9Gh70CNnbD1CU3ebiZZJON-kErBCw';

const supabase = createClient(supabaseUrl, supabaseKey);

async function checkAvatars() {
  const { data: profiles } = await supabase.from('profiles').select('vk_id, first_name, photo_200').limit(10);
  console.log('Avatars check:');
  profiles.forEach(p => {
    console.log(`- ${p.vk_id}: ${p.first_name} | Photo: ${p.photo_200 ? 'YES (' + p.photo_200.substring(0, 30) + '...)' : 'NO'}`);
  });
}

checkAvatars();
