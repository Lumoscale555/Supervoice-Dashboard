// Mirrors the Sonex Labs OpenAPI schemas (https://docs.sonexlabs.com/openapi.json)
// for the raw call/voice/balance fields, plus this dashboard's own multi-tenant
// layer: per-client login, agent-scoped data isolation, and a flat-rate
// billing model (server/pricing.js) with a client rate and (admin-only) a
// provider cost + margin.

export type Direction = 'inbound' | 'outbound';

export interface AgentRef {
  id: string;
  name: string;
}

export interface CallSummary {
  id: string;
  status: string; // in_progress | completed | failed | no_answer | ...
  direction: Direction;
  agent: AgentRef;
  from: string | null;
  to: string | null;
  started_at: string;
  ended_at: string | null;
  duration_secs: number;
  has_recording: boolean;
  has_transcript: boolean;
  /** This tenant's own rate: Rs.X/min. 0 for calls that didn't connect. */
  cost_inr: number;
}

export interface TranscriptTurn {
  role: 'agent' | 'caller';
  content: string;
  at: string;
}

export interface CallDetail extends CallSummary {
  campaign_id: string | null;
  provider: string;
  models: { llm?: string; transcription?: string; voice?: string } | null;
  transcript?: TranscriptTurn[];
  transcript_text?: string;
}

export interface CallList {
  data: CallSummary[];
  has_more: boolean;
  next_cursor: string | null;
}

export interface CallRecording {
  id: string;
  url: string | null;
  expires_at: string;
  duration_secs: number;
}

export interface BillingTotals {
  calls: number;
  connected: number;
  duration_secs: number;
  cost_inr: number;
  by_status: Record<string, number>;
  by_direction: Record<string, number>;
  // Admin-only fields (present on /api/admin/tenants/:id/billing only):
  provider_cost_inr?: number;
  margin_inr?: number;
}

export interface BillingDayRow {
  date: string;
  calls: number;
  connected: number;
  duration_secs: number;
  cost_inr: number;
  provider_cost_inr?: number;
  margin_inr?: number;
}

export interface BillingSummary {
  totals: BillingTotals;
  by_day: BillingDayRow[];
}

export interface Balance {
  wallet: { balance: number; currency: string };
  credits: Array<{ service: string; available: number; next_expiry: string | null }>;
}

export interface Voice {
  id: string;
  name: string;
  language: string | null;
  languages: string[];
  gender: 'female' | 'male' | 'neutral' | null;
  provider: string;
  type: 'platform' | 'custom';
  preview_url: string | null;
  tags: string[];
  created_at: string | null;
}

/** Reconstructed from a call's tool_calls - the API has no appointment resource. */
export interface Appointment {
  id: string;
  call_id: string;
  kind: 'book' | 'reschedule' | 'cancel';
  status: 'booked' | 'rescheduled' | 'cancelled' | 'failed';
  tool_name: string;
  booked_at: string | null;
  starts_at: string | null;
  customer_name: string | null;
  phone: string | null;
  email: string | null;
  service: string | null;
  location: string | null;
  reference: string | null;
  agent: AgentRef | null;
  direction: Direction | null;
  error: string | null;
  raw: { arguments: Record<string, unknown> | null; result: unknown };
}

export interface AppointmentsResponse {
  data: Appointment[];
  scanned_calls: number;
  total_calls_in_window: number;
  truncated: boolean;
  failures: Array<{ call_id: string; message: string }>;
  range: { from: string; to: string };
  tool_map: Record<string, string[]>;
}

export interface Overview {
  range: { from: string; to: string; days: number; timezone: string };
  summary: BillingSummary;
  previous: BillingTotals;
  balance: Balance;
  recent_calls: CallSummary[];
}

export interface Billing {
  range: { from: string; to: string; days: number; timezone: string };
  pricing: { rate_per_minute_inr: number };
  balance: Balance;
  summary: BillingSummary;
  line_items: Array<Pick<CallSummary, 'id' | 'started_at' | 'agent' | 'direction' | 'from' | 'to' | 'status' | 'duration_secs' | 'cost_inr'>>;
}

export type RangeKey = 'today' | '7d' | '30d' | '90d';

/* ------------------------------------------------------------- Tenancy */

export interface TenantPublic {
  id: string;
  name: string;
  username: string;
  agentName: string | null;
  clientRateInrPerMin: number;
  providerCostInrPerMin: number;
  createdAt: string;
  updatedAt: string;
  hasApiKey: boolean;
  apiKeyPreview: string | null;
}

export interface AuthMe {
  tenant: TenantPublic;
  mode: 'no_key' | 'live';
  pricing: { rate_per_minute_inr: number };
}

/** One call, priced both ways — admin/owner eyes only, never sent to a client's own session. */
export interface BillingLineItem extends CallSummary {
  provider_cost_inr: number;
  margin_inr: number;
}

export interface AdminBilling {
  tenant: TenantPublic;
  mode: 'no_key' | 'live';
  range: { from: string; to: string; days: number };
  summary: BillingSummary;
  line_items: BillingLineItem[];
}
