
const { createClient } = require('@supabase/supabase-js');

const supabaseUrl = 'https://ftckqoljlrusbmflezcw.supabase.co';
const supabaseKey = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImZ0Y2txb2xqbHJ1c2JtZmxlemN3Iiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImlhdCI6MTc3MTExNjc2OCwiZXhwIjoyMDg2NjkyNzY4fQ.gzT30Ly2SPSFNS9Gh70CNnbD1CU3ebiZZJON-kErBCw';

const supabase = createClient(supabaseUrl, supabaseKey);

async function checkLatestData() {
  const vkId = 35645976;
  console.log('Checking data for user:', vkId);
  
  const { data: stats } = await supabase.from('user_stats').select('*').eq('user_id', vkId).single();
  console.log('User Stats:', stats);
  
  const { data: visits } = await supabase.from('user_visits').select('*').eq('user_id', vkId).order('timestamp', { ascending: false }).limit(5);
  console.log('Latest Visits:', visits);
}

checkLatestData();
