import 'dotenv/config';
import { createClient } from '@supabase/supabase-js';
import { createSonexClient } from './server/sonex.js';

async function checkRecordings() {
  console.log('Connecting to database...');
  const supabase = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY);
  const { data: tenants, error } = await supabase.from('tenants').select('*');
  
  if (error || !tenants?.length) {
    console.error('Error fetching tenants:', error);
    process.exit(1);
  }

  console.log(`Found ${tenants.length} tenants.\n`);
  let totalRecordingsFound = 0;

  for (const tenant of tenants) {
    if (!tenant.sonex_api_key) continue;
    const client = createSonexClient({ apiKey: tenant.sonex_api_key.trim() });

    console.log(`-----------------------------------------------------------------`);
    console.log(`Tenant: "${tenant.name}" (${tenant.username})`);
    console.log(`Agent Filter: "${tenant.agent_name || '(all calls)'}"`);

    try {
      const callsRes = await client.listCalls({ limit: 20 });
      const calls = callsRes.data || [];
      const callsWithRecording = calls.filter(c => c.has_recording);

      console.log(`Total calls inspected: ${calls.length}`);
      console.log(`Calls with recording flag: ${callsWithRecording.length}`);

      if (callsWithRecording.length > 0) {
        // Fetch recording URL for the first 2 calls with recordings
        for (const call of callsWithRecording.slice(0, 2)) {
          const t0 = Date.now();
          const rec = await client.getRecording(call.id);
          const elapsed = Date.now() - t0;

          if (rec && rec.url) {
            totalRecordingsFound++;
            console.log(`\n  [SUCCESS] Call ID: ${call.id}`);
            console.log(`  Agent: ${call.agent?.name} | Duration: ${call.duration_secs}s`);
            console.log(`  Fetch time: ${elapsed}ms`);
            console.log(`  Recording URL: ${rec.url}`);

            // Verify URL is accessible and streamable via Range request
            const check = await fetch(rec.url, { headers: { Range: 'bytes=0-31' } });
            console.log(`  Audio stream status: ${check.status} (${check.headers.get('content-type')})`);
          } else {
            console.log(`  [EMPTY] Call ID: ${call.id} returned no URL.`);
          }
        }
      }
    } catch (err) {
      console.error(`  Error for tenant ${tenant.name}:`, err.message);
    }
  }

  console.log(`\n=================================================================`);
  console.log(`RECORDING URL CHECK RESULT: ${totalRecordingsFound > 0 ? 'PASS' : 'FAIL'}`);
  console.log(`Total working recording URLs returned: ${totalRecordingsFound}`);
}

checkRecordings().catch(console.error);
