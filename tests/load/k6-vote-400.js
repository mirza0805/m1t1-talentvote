import http from 'k6/http';
import { check, fail } from 'k6';
import { Counter, Rate, Trend } from 'k6/metrics';

// Run ONLY against a dedicated test competition with test accounts.
// Never use a live competition or real voter tokens.
const voteSuccess = new Rate('vote_success');
const voteFailures = new Counter('vote_failures');
const voteDuration = new Trend('vote_duration', true);

const supabaseUrl = (__ENV.SUPABASE_URL || '').replace(/\/$/, '');
const anonKey = __ENV.SUPABASE_ANON_KEY || '';
const competitionId = __ENV.LOAD_TEST_COMPETITION_ID || '';
const participantId = __ENV.LOAD_TEST_PARTICIPANT_ID || '';
const tokens = (__ENV.LOAD_TEST_VOTER_TOKENS || '').split(',').map((x) => x.trim()).filter(Boolean);
const confirmed = __ENV.CONFIRM_TEST_COMPETITION === 'YES';

export const options = {
  scenarios: {
    four_hundred_voters: {
      executor: 'per-vu-iterations',
      vus: 400,
      iterations: 1,
      maxDuration: '3m',
    },
  },
  thresholds: {
    http_req_failed: ['rate<0.02'],
    http_req_duration: ['p(95)<3000'],
    vote_success: ['rate>0.98'],
  },
};

export function setup() {
  if (!confirmed) fail('Set CONFIRM_TEST_COMPETITION=YES only after creating a dedicated test competition.');
  if (!supabaseUrl || !anonKey || !competitionId || !participantId) {
    fail('Missing SUPABASE_URL, SUPABASE_ANON_KEY, LOAD_TEST_COMPETITION_ID, or LOAD_TEST_PARTICIPANT_ID.');
  }
  if (tokens.length < 400) {
    fail(`Need 400 distinct test-user access tokens; received ${tokens.length}.`);
  }
  if (new Set(tokens).size !== tokens.length) {
    fail('Duplicate access tokens detected. Supply 400 distinct test accounts.');
  }
  return { tokens };
}

export default function (data) {
  const token = data.tokens[__VU - 1];
  // Stable per virtual user for this run; unique across all 400 virtual users.
  const deviceKey = `tv-loadtest-${__VU}-${__ITER}-${Date.now()}`;
  const url = `${supabaseUrl}/rest/v1/rpc/cast_vote`;
  const payload = JSON.stringify({
    p_competition_id: competitionId,
    p_participant_id: participantId,
    p_device_key: deviceKey,
  });

  const response = http.post(url, payload, {
    headers: {
      apikey: anonKey,
      Authorization: `Bearer ${token}`,
      'Content-Type': 'application/json',
    },
    timeout: '30s',
  });

  let body = {};
  try { body = response.json(); } catch (_) { body = {}; }
  const success = response.status === 200 && body && body.success === true;
  voteSuccess.add(success);
  voteDuration.add(response.timings.duration);
  if (!success) voteFailures.add(1);

  check(response, {
    'HTTP response is 200': (r) => r.status === 200,
    'vote accepted by RPC': () => success,
  });
}
