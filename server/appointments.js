// Appointments are NOT a first-class Sonex resource. The API exposes no
// /v1/appointments endpoint, so a booking only exists in the record as a tool the
// agent invoked during a call: GET /v1/calls/{id}?include=tool_calls.
//
// This module reconstructs an appointment feed from those tool calls. Which tool
// names count as a booking is tenant-specific, so it is configuration (see
// DEFAULT_TOOL_MAP) rather than something we can infer.

export const DEFAULT_TOOL_MAP = {
  book: ['book_appointment', 'schedule_appointment', 'create_booking', 'book_slot'],
  reschedule: ['reschedule_appointment', 'move_appointment', 'update_booking'],
  cancel: ['cancel_appointment', 'cancel_booking'],
  check: ['check_availability', 'get_availability', 'list_slots'],
};

const FIELD_ALIASES = {
  startsAt: ['start', 'start_time', 'starts_at', 'datetime', 'date_time', 'appointment_time', 'slot', 'when'],
  date: ['date', 'appointment_date', 'day'],
  time: ['time', 'appointment_time', 'slot_time'],
  name: ['name', 'customer_name', 'patient_name', 'full_name', 'caller_name', 'contact_name'],
  phone: ['phone', 'phone_number', 'mobile', 'contact', 'number'],
  email: ['email', 'email_address'],
  service: ['service', 'reason', 'type', 'appointment_type', 'purpose', 'treatment'],
  location: ['location', 'branch', 'office', 'clinic', 'store'],
  reference: ['id', 'booking_id', 'appointment_id', 'reference', 'confirmation', 'confirmation_number'],
};

function pick(source, aliases) {
  if (!source || typeof source !== 'object') return undefined;
  const lower = new Map(Object.entries(source).map(([k, v]) => [k.toLowerCase(), v]));
  for (const alias of aliases) {
    const value = lower.get(alias);
    if (value !== undefined && value !== null && value !== '') return value;
  }
  return undefined;
}

function classify(toolName, map) {
  const name = String(toolName || '').toLowerCase();
  for (const [kind, names] of Object.entries(map)) {
    if (names.some((n) => name === n.toLowerCase())) return kind;
  }
  // Fall back to a loose match so an unmapped tool still surfaces rather than
  // silently dropping a real booking.
  if (/cancel/.test(name)) return 'cancel';
  if (/reschedul|resched/.test(name)) return 'reschedule';
  if (/avail|slot.*list|list.*slot/.test(name)) return 'check';
  if (/book|appoint|schedul|reserv/.test(name)) return 'book';
  return null;
}

// The booked time can arrive as one ISO string, or as separate date + time
// fields, and it may live in the arguments the model supplied or in the value the
// tool returned. Try the result first: it is the system of record.
function resolveStartsAt(tool) {
  for (const source of [tool.result, tool.arguments]) {
    const direct = pick(source, FIELD_ALIASES.startsAt);
    if (typeof direct === 'string') {
      const parsed = new Date(direct);
      if (!Number.isNaN(parsed.valueOf())) return parsed.toISOString();
    }
    const date = pick(source, FIELD_ALIASES.date);
    const time = pick(source, FIELD_ALIASES.time);
    if (date) {
      const parsed = new Date(`${date}${time ? `T${String(time).padStart(5, '0')}` : 'T00:00:00'}`);
      if (!Number.isNaN(parsed.valueOf())) return parsed.toISOString();
    }
  }
  return null;
}

function field(tool, aliases) {
  return pick(tool.result, aliases) ?? pick(tool.arguments, aliases) ?? undefined;
}

/** Turn one call detail into zero or more appointment records. */
export function appointmentsFromCall(call, toolMap = DEFAULT_TOOL_MAP) {
  const tools = Array.isArray(call?.tool_calls) ? call.tool_calls : [];
  const out = [];

  tools.forEach((tool, index) => {
    const kind = classify(tool.name, toolMap);
    if (!kind || kind === 'check') return;

    const startsAt = resolveStartsAt(tool);
    const status =
      tool.status === 'error' ? 'failed' : kind === 'cancel' ? 'cancelled' : kind === 'reschedule' ? 'rescheduled' : 'booked';

    out.push({
      id: `${call.id}:${index}`,
      call_id: call.id,
      kind,
      status,
      tool_name: tool.name,
      booked_at: tool.at || call.started_at || null,
      starts_at: startsAt,
      customer_name: field(tool, FIELD_ALIASES.name) ?? null,
      phone: field(tool, FIELD_ALIASES.phone) ?? call.from ?? call.to ?? null,
      email: field(tool, FIELD_ALIASES.email) ?? null,
      service: field(tool, FIELD_ALIASES.service) ?? null,
      location: field(tool, FIELD_ALIASES.location) ?? null,
      reference: field(tool, FIELD_ALIASES.reference) ?? null,
      agent: call.agent ?? null,
      direction: call.direction ?? null,
      error: tool.error ?? null,
      raw: { arguments: tool.arguments ?? null, result: tool.result ?? null },
    });
  });

  return out;
}

/**
 * Scan recent calls for bookings.
 *
 * There is no server-side filter for "calls that ran a tool", so this fetches
 * call details one by one. The client's rate limiter paces those requests, and
 * `scanLimit` bounds how far back a single refresh reaches.
 */
export async function collectAppointments(client, { toolMap = DEFAULT_TOOL_MAP, scanLimit = 60, calls, ...params } = {}) {
  const all = calls ?? (await client.listAllCalls(params, { maxPages: Math.ceil(scanLimit / 100) || 1 }));
  // Only a call that actually connected can have run a booking tool.
  const eligible = all.filter(isScannable);
  const candidates = eligible.slice(0, scanLimit);

  const appointments = [];
  const failures = [];

  for (let i = 0; i < candidates.length; i += 25) {
    const batch = candidates.slice(i, i + 25);
    const settled = await Promise.allSettled(batch.map((s) => client.getCall(s.id, 'tool_calls')));
    settled.forEach((r, j) => {
      if (r.status === 'fulfilled') appointments.push(...appointmentsFromCall({ ...batch[j], ...r.value }, toolMap));
      else failures.push({ call_id: batch[j].id, message: r.reason?.message || 'Error' });
    });
  }

  appointments.sort((a, b) => new Date(b.booked_at || 0) - new Date(a.booked_at || 0));

  return {
    data: appointments,
    scanned_calls: candidates.length,
    total_calls_in_window: all.length,
    truncated: eligible.length > candidates.length,
    failures,
  };
}

export const isScannable = (call) => call.status === 'completed' && call.duration_secs > 0;
