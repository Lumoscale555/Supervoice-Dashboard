// Demo data shaped exactly like the Sonex API responses, so every page renders
// without a key and the UI never has to know which mode it is in.

const AGENTS = [
  { id: '3f0c9d18-1c4a-4a3a-9a75-7e1c2b6f42aa', name: 'Front Desk' },
  { id: '8b21c7aa-5d33-4f10-9c2e-11a4d7e9c001', name: 'Appointments Line' },
  { id: 'c41e5f92-7a18-4b6d-8e33-2d9b0f7a5512', name: 'Outbound Reminders' },
];
const SERVICES = ['Consultation', 'Dental Cleaning', 'Follow-up', 'Diagnostics', 'Vaccination'];
const NAMES = ['Asha Menon', 'Rahul Verma', 'Priya Nair', 'Daniel Cole', 'Meera Iyer', 'Tom Whitfield', 'Sana Khan', 'Arjun Rao'];
// Weighted so roughly four calls in five connect; `in_progress` is reserved for
// the live call seeded at the top of today.
const STATUSES = ['completed', 'completed', 'completed', 'completed', 'completed', 'completed', 'completed', 'no_answer', 'failed'];

// Deterministic PRNG so reloading the dashboard does not reshuffle the demo.
function rng(seed) {
  let s = seed >>> 0;
  return () => {
    s = (s * 1664525 + 1013904223) >>> 0;
    return s / 4294967296;
  };
}
const pickFrom = (r, arr) => arr[Math.floor(r() * arr.length)];

function buildCalls() {
  const r = rng(20260922);
  const calls = [];
  const now = Date.now();

  for (let day = 29; day >= 0; day -= 1) {
    // A weekday-shaped volume curve reads more like a real deployment.
    const date = new Date(now - day * 86400000);
    const weekend = [0, 6].includes(date.getDay());
    const count = Math.round((weekend ? 6 : 18) + r() * (weekend ? 5 : 14));

    for (let i = 0; i < count; i += 1) {
      const status = day === 0 && i === 0 ? 'in_progress' : pickFrom(r, STATUSES);
      const direction = r() > 0.42 ? 'inbound' : 'outbound';
      const connected = status === 'completed';
      const duration = connected ? Math.round(35 + r() * 260) : Math.round(r() * 12);
      const start = new Date(date);
      start.setHours(8 + Math.floor(r() * 11), Math.floor(r() * 60), Math.floor(r() * 60), 0);

      const llm = +(duration * 0.000043 * (0.7 + r() * 0.6)).toFixed(6);
      const stt = +(duration * 0.0001 * (0.8 + r() * 0.4)).toFixed(6);
      const tts = +(duration * 0.000105 * (0.8 + r() * 0.4)).toFixed(6);
      const telephony = +(Math.ceil(duration / 60) * 0.0042).toFixed(6);
      const total = +(llm + stt + tts + telephony).toFixed(6);

      calls.push({
        id: 'CA' + (r() * 1e16).toString(16).slice(0, 16).padEnd(16, '0'),
        status,
        direction,
        agent: pickFrom(r, AGENTS),
        from: direction === 'inbound' ? '+1415555' + (Math.floor(r() * 9000) + 1000) : '+14155550100',
        to: direction === 'inbound' ? '+14155550100' : '+9163019' + (Math.floor(r() * 90000) + 10000),
        started_at: start.toISOString(),
        ended_at: new Date(start.getTime() + duration * 1000).toISOString(),
        duration_secs: duration,
        cost_usd: total,
        has_recording: connected,
        has_transcript: connected,
        _cost: { total_usd: total, llm, stt, tts, telephony },
        _seed: Math.floor(r() * 1e9),
      });
    }
  }

  calls.sort((a, b) => new Date(b.started_at) - new Date(a.started_at));
  return calls;
}

const CALLS = buildCalls();

function transcriptFor(call) {
  const r = rng(call._seed);
  const name = pickFrom(r, NAMES);
  const service = pickFrom(r, SERVICES);
  const base = new Date(call.started_at).getTime();
  const turns = [
    ['agent', 'Thanks for calling Northside Clinic. How can I help you today?'],
    ['caller', 'Hi, this is ' + name + '. I would like to book a ' + service.toLowerCase() + '.'],
    ['agent', 'Happy to help. Let me check what we have open this week.'],
    ['caller', 'Something in the morning would be ideal.'],
    ['agent', 'I have 10:00 or 11:30 on Thursday. Which suits you better?'],
    ['caller', 'Ten works.'],
    ['agent', 'Booked for Thursday at 10:00. You will get a confirmation by text. Anything else, ' + name.split(' ')[0] + '?'],
    ['caller', 'No, that is all. Thank you.'],
  ];
  return turns.map(([role, content], i) => ({
    role,
    content,
    at: new Date(base + (i + 1) * Math.max(4, Math.floor(call.duration_secs / turns.length)) * 1000).toISOString(),
  }));
}

function toolCallsFor(call) {
  if (!call.has_transcript) return [];
  const r = rng(call._seed + 7);
  const name = pickFrom(r, NAMES);
  const service = pickFrom(r, SERVICES);
  const base = new Date(call.started_at).getTime();
  const day = new Date(base + (1 + Math.floor(r() * 9)) * 86400000);
  const date = day.toISOString().slice(0, 10);
  const time = pickFrom(r, ['09:30', '10:00', '11:30', '14:00', '15:45', '16:30']);
  const failed = r() > 0.92;

  const tools = [
    {
      name: 'check_availability',
      status: 'success',
      at: new Date(base + 14000).toISOString(),
      duration_ms: 280 + Math.floor(r() * 400),
      arguments: { date, service },
      result: { slots: ['09:30', '10:00', '11:30', '14:00'] },
    },
  ];

  if (r() > 0.34) {
    tools.push(
      failed
        ? {
            name: 'book_appointment',
            status: 'error',
            at: new Date(base + 31000).toISOString(),
            duration_ms: 1900,
            arguments: { date, time, name, service, phone: call.from },
            error: 'Slot was taken before confirmation',
          }
        : {
            name: 'book_appointment',
            status: 'success',
            at: new Date(base + 31000).toISOString(),
            duration_ms: 310 + Math.floor(r() * 500),
            arguments: { date, time, name, service, phone: call.from },
            result: {
              booking_id: 'BK-' + (Math.floor(r() * 90000) + 10000),
              date,
              time,
              service,
              location: 'Northside Clinic',
              customer_name: name,
            },
          },
    );
  } else if (r() > 0.6) {
    tools.push({
      name: 'cancel_appointment',
      status: 'success',
      at: new Date(base + 28000).toISOString(),
      duration_ms: 240,
      arguments: { booking_id: 'BK-' + (Math.floor(r() * 90000) + 10000), name },
      result: { cancelled: true, date, time, customer_name: name, service },
    });
  }

  return tools;
}

const strip = ({ _cost, _seed, ...rest }) => rest;

export function createMockClient() {
  return {
    clearCache() {},

    async listCalls({ limit = 25, cursor, ...filters } = {}) {
      const filtered = applyFilters(CALLS, filters);
      const offset = cursor ? Number(Buffer.from(cursor, 'base64').toString()) || 0 : 0;
      const page = filtered.slice(offset, offset + Number(limit));
      const next = offset + page.length;
      return {
        data: page.map(strip),
        has_more: next < filtered.length,
        next_cursor: next < filtered.length ? Buffer.from(String(next)).toString('base64') : null,
      };
    },

    async listAllCalls(filters = {}, { maxPages = 20, limit = 100 } = {}) {
      return applyFilters(CALLS, filters).slice(0, maxPages * limit).map(strip);
    },

    async getCall(id, include = 'transcript,tool_calls') {
      const call = CALLS.find((c) => c.id === id);
      if (!call) {
        const err = new Error('Call not found');
        err.status = 404;
        throw err;
      }
      const parts = String(include).split(',').map((s) => s.trim());
      const detail = {
        ...strip(call),
        campaign_id: call.direction === 'outbound' ? 'camp_reminders_q3' : null,
        provider: 'vobiz',
        models: { llm: 'Sonex Multilingual LLM', transcription: 'Soniox Real-time v5', voice: 'Panini TTS' },
        cost: call._cost,
      };
      if (parts.includes('transcript') && call.has_transcript) {
        detail.transcript = transcriptFor(call);
        detail.transcript_text = detail.transcript
          .map((t) => (t.role === 'agent' ? 'Agent: ' : 'Caller: ') + t.content)
          .join('\n');
      }
      if (parts.includes('tool_calls')) detail.tool_calls = toolCallsFor(call);
      return detail;
    },

    async getTranscript(id) {
      const detail = await this.getCall(id, 'transcript');
      return { id, transcript: detail.transcript || [], transcript_text: detail.transcript_text || '' };
    },

    async getRecording(id) {
      const call = CALLS.find((c) => c.id === id);
      return {
        id,
        url: null,
        expires_at: new Date(Date.now() + 15 * 60000).toISOString(),
        duration_secs: call ? call.duration_secs : 0,
        _demo: true,
      };
    },

    async getUsage({ from, to, group_by = 'day', timezone = 'UTC' } = {}) {
      const start = from ? new Date(from) : new Date(Date.now() - 30 * 86400000);
      const end = to ? new Date(to) : new Date();
      const inRange = CALLS.filter((c) => {
        const t = new Date(c.started_at);
        return t >= start && t <= end;
      });

      const totals = bucket(inRange);
      totals.calls.by_status = tally(inRange, (c) => c.status);
      totals.calls.by_direction = tally(inRange, (c) => c.direction);

      let breakdown = [];
      if (group_by === 'day') {
        const byDay = new Map();
        for (const c of inRange) {
          const key = c.started_at.slice(0, 10);
          if (!byDay.has(key)) byDay.set(key, []);
          byDay.get(key).push(c);
        }
        breakdown = [...byDay.entries()]
          .sort(([a], [b]) => a.localeCompare(b))
          .map(([date, rows]) => ({ date, ...bucket(rows) }));
      } else if (group_by === 'agent') {
        const byAgent = new Map();
        for (const c of inRange) {
          if (!byAgent.has(c.agent.id)) byAgent.set(c.agent.id, { agent: c.agent, rows: [] });
          byAgent.get(c.agent.id).rows.push(c);
        }
        breakdown = [...byAgent.values()]
          .map(({ agent, rows }) => ({ agent, ...bucket(rows, { speech: false }) }))
          .sort((a, b) => b.cost_usd - a.cost_usd);
      }

      return {
        period: { from: start.toISOString(), to: end.toISOString(), timezone },
        totals,
        group_by,
        breakdown,
      };
    },

    async getBalance() {
      const spent = CALLS.reduce((s, c) => s + c.cost_usd, 0);
      return {
        wallet: { balance: +(250 - spent).toFixed(2), currency: 'USD' },
        credits: [
          { service: 'tts', available: 148320, next_expiry: new Date(Date.now() + 21 * 86400000).toISOString() },
          { service: 'stt', available: 9450, next_expiry: null },
        ],
      };
    },

    async listVoices() {
      return {
        data: [
          { id: 'v_priya_hi', name: 'Priya (Hindi)', language: 'Hindi', languages: ['Hindi'], gender: 'female', provider: 'panini', type: 'platform', preview_url: null, tags: ['Indian', 'Natural, Professional'], created_at: null },
          { id: 'v_arjun_en', name: 'Arjun (English)', language: 'English', languages: ['English'], gender: 'male', provider: 'panini', type: 'platform', preview_url: null, tags: ['Indian', 'Warm'], created_at: null },
          { id: 'v_maya_en', name: 'Maya (English)', language: 'English', languages: ['English'], gender: 'female', provider: 'panini', type: 'platform', preview_url: null, tags: ['American', 'Calm'], created_at: null },
          { id: 'v_clone_01', name: 'Clinic Brand Voice', language: null, languages: [], gender: null, provider: 'custom', type: 'custom', preview_url: null, tags: ['custom', 'cloned'], created_at: new Date(Date.now() - 12 * 86400000).toISOString() },
        ],
      };
    },
  };
}

function applyFilters(calls, { agent_id, status, direction, phone_number, started_after, started_before } = {}) {
  return calls.filter((c) => {
    if (agent_id && c.agent.id !== agent_id) return false;
    if (status && c.status !== status) return false;
    if (direction && c.direction !== direction) return false;
    if (phone_number && c.from !== phone_number && c.to !== phone_number) return false;
    if (started_after && new Date(c.started_at) < new Date(started_after)) return false;
    if (started_before && new Date(c.started_at) > new Date(started_before)) return false;
    return true;
  });
}

function bucket(rows, { speech = true } = {}) {
  const sum = (f) => +rows.reduce((s, c) => s + f(c), 0).toFixed(6);
  const out = {
    cost_usd: sum((c) => c.cost_usd),
    cost: {
      llm: sum((c) => c._cost.llm),
      stt: sum((c) => c._cost.stt),
      tts: sum((c) => c._cost.tts),
      telephony: sum((c) => c._cost.telephony),
    },
    calls: {
      total: rows.length,
      connected: rows.filter((c) => c.status === 'completed').length,
      duration_secs: rows.reduce((s, c) => s + c.duration_secs, 0),
    },
  };
  if (speech) {
    out.speech = { requests: Math.round(rows.length * 1.8), characters: rows.length * 640 };
  }
  return out;
}

function tally(rows, keyFn) {
  return rows.reduce((acc, r) => {
    const k = keyFn(r);
    acc[k] = (acc[k] || 0) + 1;
    return acc;
  }, {});
}
