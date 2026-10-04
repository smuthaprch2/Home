const BASE = "https://aeroapi.flightaware.com/aeroapi";

function getKey() {
  return process.env.FLIGHTAWARE_AEROAPI_KEY || "";
}

function parseTime(v) {
  if (!v) return null;
  const d = new Date(v);
  return Number.isNaN(d.getTime()) ? null : d;
}

function flightTime(f, primary, fallback) {
  return parseTime(f[primary]) || parseTime(f[fallback]) || null;
}

function summarizeFlight(f) {
  const out = flightTime(f, "actual_out", "scheduled_out");
  const inTime = flightTime(f, "actual_in", "scheduled_in");
  const estOut = parseTime(f.estimated_out);
  const estIn = parseTime(f.estimated_in);

  return {
    ident: f.ident || f.ident_icao || f.ident_iata || null,
    operator: f.operator || f.operator_icao || f.operator_iata || null,
    operator_name: f.operator_name || null,
    flight_number: f.flight_number || null,
    fa_flight_id: f.fa_flight_id || null,
    origin: f.origin || null,
    destination: f.destination || null,
    scheduled_out: f.scheduled_out || null,
    estimated_out: f.estimated_out || null,
    actual_out: f.actual_out || null,
    scheduled_in: f.scheduled_in || null,
    estimated_in: f.estimated_in || null,
    actual_in: f.actual_in || null,
    departure_delay: f.departure_delay ?? null,
    arrival_delay: f.arrival_delay ?? null,
    terminal_origin: f.terminal_origin || null,
    gate_origin: f.gate_origin || null,
    terminal_destination: f.terminal_destination || null,
    gate_destination: f.gate_destination || null,
    aircraft_type: f.aircraft_type || null,
    status: f.status || null,
    cancelled: Boolean(f.cancelled),
    diverted: Boolean(f.diverted),
    effective_out: (f.actual_out || f.estimated_out || f.scheduled_out || null),
    effective_in: (f.actual_in || f.estimated_in || f.scheduled_in || null),
    _sort_out: (out || estOut || parseTime(f.scheduled_out)),
    _sort_in: (inTime || estIn || parseTime(f.scheduled_in))
  };
}

async function getCityPair(origin, destination, maxPages = 2) {
  const key = getKey();
  if (!key) {
    const err = new Error("flightaware_not_configured");
    err.statusCode = 503;
    throw err;
  }

  const o = encodeURIComponent(String(origin || "").trim().toUpperCase());
  const d = encodeURIComponent(String(destination || "").trim().toUpperCase());
  if (!o || !d) {
    const err = new Error("origin_and_destination_required");
    err.statusCode = 400;
    throw err;
  }

  const url = new URL(`${BASE}/airports/${o}/flights/to/${d}`);
  url.searchParams.set("max_pages", String(Math.max(1, Math.min(Number(maxPages) || 2, 3))));

  const response = await fetch(url, {
    headers: { "x-apikey": key, "accept": "application/json" }
  });

  const text = await response.text();
  if (!response.ok) {
    const err = new Error(`flightaware_${response.status}:${text.slice(0, 400)}`);
    err.statusCode = response.status >= 400 && response.status < 500 ? 400 : 502;
    throw err;
  }

  let body;
  try { body = JSON.parse(text); }
  catch {
    const err = new Error("flightaware_invalid_json");
    err.statusCode = 502;
    throw err;
  }

  const rows = body.flights || body.scheduled || body.departures || [];
  return rows.map(summarizeFlight);
}

function rankFlights(flights, opts = {}) {
  const earliestDeparture = parseTime(opts.earliestDeparture);
  const latestArrival = parseTime(opts.latestArrival);
  const now = new Date();
  const includePast = String(opts.includePast || "") === "1";

  let rows = flights.filter(f => {
    const out = f._sort_out;
    const inn = f._sort_in;
    if (!out) return false;
    if (!includePast && out < new Date(now.getTime() - 2 * 60 * 60 * 1000)) return false;
    if (earliestDeparture && out < earliestDeparture) return false;
    if (latestArrival && (!inn || inn > latestArrival)) return false;
    return true;
  });

  rows = rows.map(f => {
    let score = 0;
    let marginMinutes = null;
    if (latestArrival && f._sort_in) {
      marginMinutes = Math.round((latestArrival - f._sort_in) / 60000);
      // prefer healthy margin without making the earliest flight automatically win
      score += Math.min(Math.max(marginMinutes, 0), 360) / 6;
    }
    if (earliestDeparture && f._sort_out) {
      const wait = Math.round((f._sort_out - earliestDeparture) / 60000);
      // after release, earlier departures are better
      score -= Math.max(wait, 0) / 10;
    }
    if (f.cancelled) score -= 10000;
    if (f.diverted) score -= 5000;
    if (Number.isFinite(f.departure_delay)) score -= Math.max(f.departure_delay, 0) / 60;
    if (Number.isFinite(f.arrival_delay)) score -= Math.max(f.arrival_delay, 0) / 60;
    return { ...f, margin_minutes: marginMinutes, _score: score };
  });

  rows.sort((a,b) => {
    if (latestArrival) return b._score - a._score || (a._sort_out - b._sort_out);
    return (a._sort_out - b._sort_out);
  });

  return rows.map(({_sort_out,_sort_in,_score,...rest}) => rest);
}

module.exports = { getKey, getCityPair, rankFlights };
