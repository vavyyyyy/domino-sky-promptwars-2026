# DOMINO SKY
### Airline Disruption & Recovery Intelligence Simulator

**Tagline:** Detect the disruption. Trace the domino effect. Recover the network.

## 1. Chosen Challenge Vertical

DOMINO SKY addresses the aviation operations and intelligent decision-making vertical.

It is an airline disruption and recovery simulation platform designed to demonstrate how airport closures and operational disruptions cascade across an airline network.

## 2. Problem Statement

A disruption at one airport can affect multiple flights, aircraft rotations, passenger connections, and crew schedules.

Airline operations teams need to understand these cascading effects and identify recovery strategies while respecting operational constraints.

DOMINO SKY provides an interactive environment to simulate disruptions, visualize their consequences, and evaluate recovery decisions.

## 3. Approach and Logic

The application uses a deterministic simulation engine to model airline operations.

Its core approach includes:

- **Disruption Simulation:** Introduces airport closures over configurable time windows.
- **Domino Effect Analysis:** Tracks how disruptions propagate through flight schedules, aircraft rotations, passenger connections, and crew assignments.
- **Recovery Intelligence:** Evaluates recovery strategies such as standby aircraft deployment, aircraft tail swaps, and connecting-flight holds.
- **Constraint Validation:** Checks airport closure restrictions, aircraft turnaround requirements, spare aircraft availability, passenger capacity, and crew duty constraints.
- **Scenario Comparison:** Compares disrupted and recovered operational outcomes.
- **Recovery Scorecard:** Evaluates strategies using delay reduction, passenger protection, crew legality, aircraft feasibility, and operational simplicity.

## 4. How the Solution Works

1. The user selects an airport and defines a disruption window.
2. The simulation engine calculates affected arrivals and departures.
3. Delays propagate through aircraft rotations and connected operational dependencies.
4. The Domino Timeline displays the chronological sequence of events.
5. The Recovery Centre evaluates possible recovery strategies.
6. The user previews and applies feasible recovery actions.
7. Before-and-after analytics display the operational improvements.

## 5. Key Features

- Airline Operations Control Centre dashboard.
- Interactive airport closure controls.
- Flight operations monitoring.
- Airline network visualization.
- Domino Effect Timeline with playback controls.
- Recovery Strategy Engine.
- Operational constraint validator.
- Before-and-after scenario comparison.
- Deterministic recovery scorecard.
- Hourly departure and fleet analytics.
- Dataset upload and validation.

## 6. Technology Stack

- React
- TypeScript
- Vite
- Tailwind CSS
- JavaScript-based simulation logic
- Vitest for automated testing
- Vercel for deployment
- Google AI Studio for AI-assisted development

## 7. Assumptions and Limitations

- The application uses a simulated airline dataset rather than live airline operational feeds.
- Airport closures are modeled using configured time windows.
- Aircraft turnaround requirements are enforced using a minimum turnaround assumption of 30 minutes.
- Recovery strategies are evaluated against modeled operational constraints.
- Runway and ATC throughput capacity are not fully simulated.
- Reserve crew availability is simplified.
- Simulation results are intended for educational and decision-support demonstration, not direct real-world airline dispatch.

## 8. Testing and Validation

The latest development validation reported:

- 33 automated tests passed.
- TypeScript type checking completed without errors.
- Production build completed successfully.

These results correspond to the latest development validation and should be rerun after subsequent code changes.

## 9. Deployment

**Live Application:** https://domino-sky-promptwars-2026-k2v2vrc6l-vavy1.vercel.app

**GitHub Repository:** https://github.com/vavyyyyy/domino-sky-promptwars-2026

## 10. Project Objective

DOMINO SKY demonstrates how intelligent simulation, constraint-based decision-making, and recovery analysis can help understand complex airline disruptions.

**Detect the silent disruption. Understand the domino effect. Recover the network.**
