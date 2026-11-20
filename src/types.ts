export type AirportTier = 'mega_hub' | 'regional_hub' | 'spoke';

export interface DatasetMeta {
  dataset: string;
  operating_day: string;
  min_turnaround_minutes: number;
  seats_per_aircraft: number;
  notes: string[];
}

export interface Airport {
  id: string;
  name: string;
  city: string;
  lat: number;
  lng: number;
  tier: AirportTier;
  capacity_per_hour: number;
}

export interface RawFlight {
  flight_id: string;
  tail_id: string;
  leg_order: number;
  origin: string;
  destination: string;
  dep: string;
  arr: string;
  block_minutes: number;
  pax: number;
  turnaround_before_min: number | null;
}

export interface RawConnection {
  connection_id: string;
  airport: string;
  from_flight: string;
  to_flight: string;
  passengers: number;
  min_connect_minutes: number;
}

export interface RawCrew {
  crew_id: string;
  tail_id: string;
  base: string;
  duty_start: string;
  max_duty_mins: number;
  flight_ids: string[];
}

export interface RawSpareAircraft {
  tail_id: string;
  base: string;
  available_from: string;
  seats: number;
}

export interface FlightNetworkDataset {
  meta: DatasetMeta;
  airports: Airport[];
  flights: RawFlight[];
  connections: RawConnection[];
  crews: RawCrew[];
  spare_aircraft: RawSpareAircraft[];
}

export interface AirportClosureInput {
  id: string;
  airportId: string;
  startTime: string; // HH:MM
  endTime: string;   // HH:MM
}

export interface NormalizedClosure {
  id: string;
  airportId: string;
  startTime: string;
  endTime: string;
  startMins: number;
  endMins: number;
}

export type DelayReason =
  | 'ORIGIN_CLOSURE'
  | 'DESTINATION_CLOSURE'
  | 'TURNAROUND_PROPAGATION';

export interface FlightSimulationResult {
  flightId: string;
  tailId: string;
  legOrder: number;
  origin: string;
  destination: string;
  scheduledDep: string;
  scheduledArr: string;
  scheduledDepMins: number;
  scheduledArrMins: number;
  actualDep: string;
  actualArr: string;
  actualDepMins: number;
  actualArrMins: number;
  blockMinutes: number;
  delayMinutes: number;
  delayReasons: DelayReason[];
  delayNotes: string[];
  pax: number;
  turnaroundBeforeActualMins: number | null;
}

export interface ConnectionSimulationResult {
  connectionId: string;
  airport: string;
  fromFlightId: string;
  toFlightId: string;
  passengers: number;
  minConnectMinutes: number;
  fromActualArr: string;
  toActualDep: string;
  availableConnectMinutes: number;
  shortfallMinutes: number;
  failed: boolean;
}

export interface CrewSimulationResult {
  crewId: string;
  tailId: string;
  base: string;
  dutyStart: string;
  dutyStartMins: number;
  maxDutyMins: number;
  flightIds: string[];
  scheduledDutyEnd: string;
  scheduledDutyMins: number;
  actualDutyEnd: string;
  actualDutyEndMins: number;
  actualDutyMins: number;
  overtimeMins: number;
  exceedsLimit: boolean;
}

export interface AircraftUtilisationResult {
  tailId: string;
  isSpare: boolean;
  base: string;
  seats: number;
  flightsOperated: number;
  scheduledBlockMinutes: number;
  actualBlockMinutes: number;
  firstActualDep: string | null;
  lastActualArr: string | null;
  activeSpanMinutes: number;
  totalGroundTurnaroundMinutes: number;
  totalDelayMinutes: number;
  utilisation24hPct: number;
}

export interface AirportImpactSummary {
  airportId: string;
  city: string;
  tier: AirportTier;
  departuresCount: number;
  arrivalsCount: number;
  delayedDepartures: number;
  delayedArrivals: number;
  totalDepartureDelayMinutes: number;
  failedConnectionsAtAirport: number;
  strandedPassengersAtAirport: number;
  isClosed: boolean;
}

export interface SimulationKPIs {
  totalFlights: number;
  onTimeFlights: number;
  delayedFlights: number;
  onTimePerformancePct: number;
  totalDelayMinutes: number;
  averageDelayPerDelayedFlight: number;
  averageDelayAllFlights: number;
  maxDelayMinutes: number;
  totalPassengers: number;
  delayedPassengers: number;
  totalConnections: number;
  failedConnectionsCount: number;
  strandedPassengers: number;
  totalCrews: number;
  crewViolationsCount: number;
  totalCrewOvertimeMinutes: number;
  activeAircraftCount: number;
  spareAircraftCount: number;
  averageAircraftUtilisationPct: number;
}

export interface SimulationResult {
  closures: NormalizedClosure[];
  flights: FlightSimulationResult[];
  connections: ConnectionSimulationResult[];
  failedConnections: ConnectionSimulationResult[];
  crews: CrewSimulationResult[];
  crewViolations: CrewSimulationResult[];
  aircraftUtilisation: AircraftUtilisationResult[];
  airportImpacts: AirportImpactSummary[];
  kpis: SimulationKPIs;
}
