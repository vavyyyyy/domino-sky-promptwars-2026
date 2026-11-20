import rawDefaultDataset from './data/flight_network.json';
import { parseTimeToMinutes } from './timeUtils';
import type {
  Airport,
  AirportTier,
  FlightNetworkDataset,
  RawConnection,
  RawCrew,
  RawFlight,
  RawSpareAircraft,
} from './types';

const VALID_TIERS: ReadonlySet<AirportTier> = new Set([
  'mega_hub',
  'regional_hub',
  'spoke',
]);

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function assertString(obj: Record<string, unknown>, key: string, ctx: string): string {
  const val = obj[key];
  if (typeof val !== 'string' || val.trim() === '') {
    throw new Error(`${ctx}: "${key}" must be a non-empty string.`);
  }
  return val;
}

function assertFiniteNumber(obj: Record<string, unknown>, key: string, ctx: string): number {
  const val = obj[key];
  if (typeof val !== 'number' || !Number.isFinite(val)) {
    throw new Error(`${ctx}: "${key}" must be a finite number.`);
  }
  return val;
}

export function validateFlightNetworkDataset(input: unknown): FlightNetworkDataset {
  if (!isRecord(input)) {
    throw new Error('Dataset root must be a JSON object.');
  }

  // Validate meta
  if (!isRecord(input.meta)) {
    throw new Error('Missing or invalid "meta" object.');
  }
  const meta = {
    dataset: assertString(input.meta, 'dataset', 'meta'),
    operating_day: assertString(input.meta, 'operating_day', 'meta'),
    min_turnaround_minutes: assertFiniteNumber(input.meta, 'min_turnaround_minutes', 'meta'),
    seats_per_aircraft: assertFiniteNumber(input.meta, 'seats_per_aircraft', 'meta'),
    notes: Array.isArray(input.meta.notes)
      ? input.meta.notes.filter((n): n is string => typeof n === 'string')
      : [],
  };
  if (meta.min_turnaround_minutes < 0 || meta.seats_per_aircraft <= 0) {
    throw new Error('meta turnaround and seats_per_aircraft must be valid positive constraints.');
  }

  // Validate airports
  if (!Array.isArray(input.airports) || input.airports.length === 0) {
    throw new Error('"airports" must be a non-empty array.');
  }
  const airportIds = new Set<string>();
  const airports: Airport[] = input.airports.map((item, idx) => {
    const ctx = `airports[${idx}]`;
    if (!isRecord(item)) throw new Error(`${ctx} must be an object.`);
    const id = assertString(item, 'id', ctx);
    if (airportIds.has(id)) throw new Error(`Duplicate airport id "${id}".`);
    airportIds.add(id);

    const tier = assertString(item, 'tier', ctx) as AirportTier;
    if (!VALID_TIERS.has(tier)) {
      throw new Error(`${ctx}: invalid tier "${tier}".`);
    }

    return {
      id,
      name: assertString(item, 'name', ctx),
      city: assertString(item, 'city', ctx),
      lat: assertFiniteNumber(item, 'lat', ctx),
      lng: assertFiniteNumber(item, 'lng', ctx),
      tier,
      capacity_per_hour: assertFiniteNumber(item, 'capacity_per_hour', ctx),
    };
  });

  // Validate flights
  if (!Array.isArray(input.flights) || input.flights.length === 0) {
    throw new Error('"flights" must be a non-empty array.');
  }
  const flightIds = new Set<string>();
  const flightsByTail = new Map<string, RawFlight[]>();

  const flights: RawFlight[] = input.flights.map((item, idx) => {
    const ctx = `flights[${idx}]`;
    if (!isRecord(item)) throw new Error(`${ctx} must be an object.`);

    const flight_id = assertString(item, 'flight_id', ctx);
    if (flightIds.has(flight_id)) throw new Error(`Duplicate flight_id "${flight_id}".`);
    flightIds.add(flight_id);

    const tail_id = assertString(item, 'tail_id', ctx);
    const leg_order = assertFiniteNumber(item, 'leg_order', ctx);
    const origin = assertString(item, 'origin', ctx);
    const destination = assertString(item, 'destination', ctx);
    const dep = assertString(item, 'dep', ctx);
    const arr = assertString(item, 'arr', ctx);
    const block_minutes = assertFiniteNumber(item, 'block_minutes', ctx);
    const pax = assertFiniteNumber(item, 'pax', ctx);

    if (!airportIds.has(origin)) {
      throw new Error(`${ctx} (${flight_id}): unknown origin airport "${origin}".`);
    }
    if (!airportIds.has(destination)) {
      throw new Error(`${ctx} (${flight_id}): unknown destination airport "${destination}".`);
    }
    if (origin === destination) {
      throw new Error(`${ctx} (${flight_id}): origin and destination cannot be identical.`);
    }

    const depMins = parseTimeToMinutes(dep);
    const arrMins = parseTimeToMinutes(arr);
    if (arrMins - depMins !== block_minutes) {
      throw new Error(
        `${ctx} (${flight_id}): arr (${arr}) - dep (${dep}) = ${arrMins - depMins}m does not match block_minutes (${block_minutes}m).`
      );
    }
    if (pax < 0 || pax > meta.seats_per_aircraft) {
      throw new Error(`${ctx} (${flight_id}): pax (${pax}) out of range [0, ${meta.seats_per_aircraft}].`);
    }

    const rawTurnaround = item.turnaround_before_min;
    if (
      rawTurnaround !== null &&
      (typeof rawTurnaround !== 'number' || !Number.isFinite(rawTurnaround) || rawTurnaround < 0)
    ) {
      throw new Error(`${ctx} (${flight_id}): turnaround_before_min must be null or a non-negative number.`);
    }

    const flight: RawFlight = {
      flight_id,
      tail_id,
      leg_order,
      origin,
      destination,
      dep,
      arr,
      block_minutes,
      pax,
      turnaround_before_min: rawTurnaround,
    };

    const existing = flightsByTail.get(tail_id) ?? [];
    existing.push(flight);
    flightsByTail.set(tail_id, existing);

    return flight;
  });

  // Verify aircraft leg continuity & uniqueness
  for (const [tailId, tailFlights] of flightsByTail.entries()) {
    const sorted = [...tailFlights].sort((a, b) => a.leg_order - b.leg_order);
    for (let i = 0; i < sorted.length; i++) {
      if (sorted[i].leg_order !== i + 1) {
        throw new Error(`Aircraft ${tailId}: expected leg_order ${i + 1}, got ${sorted[i].leg_order}.`);
      }
      if (i > 0 && sorted[i].origin !== sorted[i - 1].destination) {
        throw new Error(
          `Aircraft ${tailId}: route discontinuity between ${sorted[i - 1].flight_id} (${sorted[i - 1].destination}) and ${sorted[i].flight_id} (${sorted[i].origin}).`
        );
      }
    }
  }

  // Validate connections
  if (!Array.isArray(input.connections)) {
    throw new Error('"connections" must be an array.');
  }
  const connectionIds = new Set<string>();
  const connections: RawConnection[] = input.connections.map((item, idx) => {
    const ctx = `connections[${idx}]`;
    if (!isRecord(item)) throw new Error(`${ctx} must be an object.`);

    const connection_id = assertString(item, 'connection_id', ctx);
    if (connectionIds.has(connection_id)) {
      throw new Error(`Duplicate connection_id "${connection_id}".`);
    }
    connectionIds.add(connection_id);

    const airport = assertString(item, 'airport', ctx);
    const from_flight = assertString(item, 'from_flight', ctx);
    const to_flight = assertString(item, 'to_flight', ctx);
    const passengers = assertFiniteNumber(item, 'passengers', ctx);
    const min_connect_minutes = assertFiniteNumber(item, 'min_connect_minutes', ctx);

    if (!airportIds.has(airport)) {
      throw new Error(`${ctx} (${connection_id}): unknown airport "${airport}".`);
    }
    if (!flightIds.has(from_flight)) {
      throw new Error(`${ctx} (${connection_id}): unknown from_flight "${from_flight}".`);
    }
    if (!flightIds.has(to_flight)) {
      throw new Error(`${ctx} (${connection_id}): unknown to_flight "${to_flight}".`);
    }
    if (passengers < 0 || min_connect_minutes < 0) {
      throw new Error(`${ctx} (${connection_id}): passengers and min_connect_minutes must be non-negative.`);
    }

    return {
      connection_id,
      airport,
      from_flight,
      to_flight,
      passengers,
      min_connect_minutes,
    };
  });

  // Validate crews
  if (!Array.isArray(input.crews)) {
    throw new Error('"crews" must be an array.');
  }
  const crewIds = new Set<string>();
  const crews: RawCrew[] = input.crews.map((item, idx) => {
    const ctx = `crews[${idx}]`;
    if (!isRecord(item)) throw new Error(`${ctx} must be an object.`);

    const crew_id = assertString(item, 'crew_id', ctx);
    if (crewIds.has(crew_id)) throw new Error(`Duplicate crew_id "${crew_id}".`);
    crewIds.add(crew_id);

    const tail_id = assertString(item, 'tail_id', ctx);
    const base = assertString(item, 'base', ctx);
    const duty_start = assertString(item, 'duty_start', ctx);
    parseTimeToMinutes(duty_start);
    const max_duty_mins = assertFiniteNumber(item, 'max_duty_mins', ctx);

    if (!airportIds.has(base)) {
      throw new Error(`${ctx} (${crew_id}): unknown base "${base}".`);
    }
    if (!Array.isArray(item.flight_ids) || item.flight_ids.length === 0) {
      throw new Error(`${ctx} (${crew_id}): flight_ids must be a non-empty array.`);
    }

    const flight_ids = item.flight_ids.map((fid, fIdx) => {
      if (typeof fid !== 'string' || !flightIds.has(fid)) {
        throw new Error(`${ctx} (${crew_id}): invalid flight_id at index ${fIdx}.`);
      }
      return fid;
    });

    return {
      crew_id,
      tail_id,
      base,
      duty_start,
      max_duty_mins,
      flight_ids,
    };
  });

  // Validate spare aircraft
  if (!Array.isArray(input.spare_aircraft)) {
    throw new Error('"spare_aircraft" must be an array.');
  }
  const spareIds = new Set<string>();
  const spare_aircraft: RawSpareAircraft[] = input.spare_aircraft.map((item, idx) => {
    const ctx = `spare_aircraft[${idx}]`;
    if (!isRecord(item)) throw new Error(`${ctx} must be an object.`);

    const tail_id = assertString(item, 'tail_id', ctx);
    if (spareIds.has(tail_id)) throw new Error(`Duplicate spare tail_id "${tail_id}".`);
    spareIds.add(tail_id);

    const base = assertString(item, 'base', ctx);
    if (!airportIds.has(base)) {
      throw new Error(`${ctx} (${tail_id}): unknown base "${base}".`);
    }
    const available_from = assertString(item, 'available_from', ctx);
    parseTimeToMinutes(available_from);
    const seats = assertFiniteNumber(item, 'seats', ctx);

    return {
      tail_id,
      base,
      available_from,
      seats,
    };
  });

  return {
    meta,
    airports,
    flights,
    connections,
    crews,
    spare_aircraft,
  };
}

export function loadDefaultFlightNetwork(): FlightNetworkDataset {
  return validateFlightNetworkDataset(rawDefaultDataset);
}
