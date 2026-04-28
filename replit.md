# Defesa Civil de Ouro Branco — Sistema de Vistorias

## Overview
This project is a comprehensive web system designed for the Defesa Civil de Ouro Branco (MG) to register and manage occurrences. Its primary purpose is to streamline the workflow for civil defense operations, providing tools for real-time incident tracking, reporting, and team coordination. The system aims to enhance efficiency in emergency response and disaster management through robust data management, mapping capabilities, and offline functionality. Key capabilities include incident logging, GPS-enabled mapping, report generation, and real-time communication features for field agents.

## User Preferences
The user prefers clear and concise information. The development should prioritize iterative progress, with frequent communication regarding major changes or architectural decisions. The user values a clean, maintainable codebase and prefers modern development practices.

## System Architecture
The system is built as a Progressive Web Application (PWA) with an offline-first approach, ensuring functionality even without internet connectivity.

### UI/UX Decisions
-   **Color Scheme**: The application uses a blue and orange theme, consistent with the Defesa Civil branding.
-   **Map Integration**: React-Leaflet is used for interactive maps, displaying occurrences with colored markers and offering standard and satellite views. GPS functionality is integrated for accurate location tagging and real-time agent tracking.
-   **Design Patterns**: The frontend employs React 19 with TypeScript, organized into modular components.

### Technical Implementations
-   **Frontend**: Developed with React 19, TypeScript, and Vite 5.
-   **Backend**: Express.js server handles all API routes, WebSocket real-time communication, DOCX report generation, and serves the built frontend in production.
-   **Database**: Replit PostgreSQL, connected via `DATABASE_URL` environment variable. Schema auto-created on startup by `server/index.js`.
-   **Real-time Communication**: Custom WebSocket server (`/ws`) handles:
    - Real-time GPS agent location tracking (posicao/parar/remover messages)
    - SOS alert broadcasting (sos/sos-audio/sos-cancelar messages)
    - Occurrence update notifications (ocorrencias_atualizadas message)
-   **WebSocket Client**: `src/wsClient.ts` — shared singleton WebSocket with auto-reconnect logic.
-   **Offline Support**: A Service Worker (`sw.js`) manages caching for the app shell, map tiles, and road network data. IndexedDB queues offline-saved occurrences for automatic synchronization upon reconnection.
-   **Mapping & Navigation**:
    -   Offline map tiles (20 km radius, zooms 11-16) and OpenStreetMap road network data are downloadable for offline use.
    -   Address search features an offline-first autocomplete, querying local network data before Nominatim.
    -   Offline GPS routing uses Dijkstra's algorithm on the local road network graph.
-   **Reporting**: DOCX reports are generated server-side using a template and JSZip. Excel exports (global occurrences, monthly schedules, vehicle checklists) are supported via ExcelJS.
-   **SOS Critical Feature**: A floating button triggers an SOS alert upon a 1.5-second hold or specific volume key presses. It captures GPS, battery percentage, records 10 seconds of audio, and broadcasts via WebSocket, triggering visual and auditory alarms on other logged-in agents' devices.

### API Routes
-   `GET/POST /api/ocorrencias` — list/create incidents
-   `GET/PUT/DELETE /api/ocorrencias/:id` — get/update/delete incident
-   `GET/PUT /api/escala` — agent schedule state
-   `GET/POST/DELETE /api/checklists` — vehicle checklists
-   `POST /api/relatorio-vistoria` — generate DOCX report
-   `GET /api/tiles/:z/:x/:y` — OSM tile proxy
-   `GET /api/geocode` — Nominatim geocoding proxy
-   `GET /api/rota` — OSRM routing proxy
-   `GET /api/tempo` — weather data (INMET/Open-Meteo)
-   `GET /api/health` — health check

### Feature Specifications
-   **Occurrence Management**: Comprehensive form for logging various incident types (Vistoria, Diligência, Apoio) with conditional sub-natures, risk levels, status, photos, GPS coordinates, address, owner details, involved agents, and detailed observations.
-   **Vehicle Checklists**: Allows daily vehicle inspections with photo capture for damage, mileage, driver, digital signature, and provides historical records.
-   **Agent Scheduling (Escala)**: Unified calendar for managing agent shifts, on-call duties, vacations, and compensatory time off. Features a detailed hour bank system with custom rules for different agent roles and an Excel export for monthly schedules.
-   **Offline-First Data Synchronization**: Occurrences created offline are stored in IndexedDB and automatically synced when connectivity is restored.

## Authentication
Simple hardcoded credential login (no external auth service):
- Email: `defesacivilob@gmail.com`
- Password: `dc-2026`
- Agent name selection after login (stored in sessionStorage/localStorage)

## Running the App
- Development: `npm run start` (runs Express on port 3001 + Vite dev server on port 5000)
- Vite proxies `/api` and `/ws` to the Express backend on port 3001
- Workflow: "Start application" → `npm run start` → waits on port 5000

## External Dependencies
-   **Replit PostgreSQL**: Primary database (`DATABASE_URL` secret auto-configured).
-   **OpenStreetMap**: Provides base map data and tiles (proxied through backend).
-   **Nominatim**: Geocoding service for address search (proxied through backend).
-   **Overpass API**: Used for fetching detailed road network data for offline routing.
-   **OSRM**: Public routing service used as a fallback for online routing (proxied through backend).
-   **React-Leaflet**: React components for interactive maps.
-   **JSZip**: Used for generating DOCX reports server-side.
-   **ExcelJS**: Used for generating Excel reports.
-   **Open-Meteo / INMET**: Provides weather data.
