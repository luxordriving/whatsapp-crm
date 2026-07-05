import { createClient } from '@supabase/supabase-js';
import dotenv from 'dotenv';

dotenv.config({ path: '.env.local' });

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
const supabase = createClient(supabaseUrl, supabaseKey);

async function main() {
  const { data: contacts, error } = await supabase
    .from('contacts')
    .select('id, phone')
    .eq('phone', '9037272296');

  if (error) {
    console.error('Error fetching contacts:', error);
    return;
  }

  if (contacts.length === 0) {
    console.log('No contacts found with phone 9037272296.');
    return;
  }

  for (const contact of contacts) {
    const { error: updateError } = await supabase
      .from('contacts')
      .update({ wa_id: '919037272296' })
      .eq('id', contact.id);

    if (updateError) {
      console.error(`Failed to update contact ${contact.id}:`, updateError);
    } else {
      console.log(`Successfully updated contact ${contact.id} with wa_id 919037272296`);
    }
  }
}

main();
