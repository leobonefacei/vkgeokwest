
const { createClient } = require('@supabase/supabase-js');

const supabaseUrl = 'https://ftckqoljlrusbmflezcw.supabase.co';
const supabaseKey = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImZ0Y2txb2xqbHJ1c2JtZmxlemN3Iiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImlhdCI6MTc3MTExNjc2OCwiZXhwIjoyMDg2NjkyNzY4fQ.gzT30Ly2SPSFNS9Gh70CNnbD1CU3ebiZZJON-kErBCw';

const supabase = createClient(supabaseUrl, supabaseKey);

async function fixFollowsTable() {
  console.log('Fixing follows table...');
  
  // Try to add is_blocked column
  const { error } = await supabase.rpc('exec_sql', {
    sql: 'ALTER TABLE follows ADD COLUMN IF NOT EXISTS is_blocked BOOLEAN DEFAULT false;'
  });

  if (error) {
    console.error('Error adding column via exec_sql:', error);
    console.log('Trying manual check...');
    
    const { data, error: selectError } = await supabase.from('follows').select('is_blocked').limit(1);
    if (selectError) {
      console.log('Column is_blocked missing or table error:', selectError.message);
    } else {
      console.log('Column is_blocked exists.');
    }
  } else {
    console.log('Column is_blocked added successfully!');
  }
}

fixFollowsTable();
