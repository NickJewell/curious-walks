# Lantern - Folklore & Legend Explorer

## Overview

Lantern is a React Native mobile application built with Expo that helps users discover and explore folklore, legends, and mysterious locations in London. The app features an interactive map, browseable location catalog, curated walking routes, and detailed information about each supernatural or historical site. Users can search, filter by categories (ghosts, folklore, historical events, Fortean phenomena), and navigate to locations of interest.

The application uses a client-server architecture with a React Native frontend and Express backend, connected to a PostgreSQL database for storing location data, categories, regions, and routes.

## User Preferences

Preferred communication style: Simple, everyday language.

## System Architecture

### Frontend Architecture

**Technology Stack:**
- React Native 0.81.5 with Expo SDK 54
- React 19.1.0 with new architecture enabled
- React Navigation for routing (native-stack and bottom-tabs)
- TanStack Query for server state management
- Reanimated and Gesture Handler for animations

**Navigation Structure:**
- Stack navigator as root with tab navigator nested inside
- 4 bottom tabs: Map, Explore, Routes, Settings
- Modal presentations for location details and filters
- Platform-specific implementations (.web.tsx files for web compatibility)

**State Management:**
- TanStack Query handles all server data fetching and caching
- Local component state for UI interactions (search, filters, selections)
- No global state management library needed due to query-based architecture

**Key Design Patterns:**
- Themed components (ThemedView, ThemedText) for consistent styling
- Custom hooks (useTheme, useScreenOptions, useColorScheme) for reusable logic
- Error boundaries for graceful error handling
- Platform-specific file extensions for web/native differences
- Safe area context for handling device notches and system UI

**Map Implementation:**
- Conditional rendering based on platform capabilities
- React Native Maps for native platforms with Google Maps provider
- Fallback UI for web and environments where maps are unavailable
- SafeMapView component wraps map with error boundary

### Backend Architecture

**Server Framework:**
- Express.js with TypeScript
- RESTful API design pattern
- Modular route registration system
- CORS configuration for Replit deployment environment

**API Endpoints:**
- `GET /api/categories` - Fetch all location categories
- `GET /api/locations` - Fetch all locations
- `GET /api/locations/:id` - Fetch single location by ID
- `GET /api/locations/category/:categoryId` - Filter by category
- `GET /api/locations/nearby` - Geospatial queries for proximity search
- `GET /api/routes` - Fetch walking routes
- `GET /api/routes/:id` - Fetch route with stops

**Data Layer:**
- Storage interface pattern (IStorage) for database abstraction
- DatabaseStorage class implements storage operations
- Drizzle ORM for type-safe database queries
- Schema-driven development with shared types

**Database Schema:**

*Categories:* Store types of locations (ghosts, folklore, historical, Fortean)
- Fields: id, name, slug, color, iconName, description, timestamps
- One-to-many relationship with locations

*Locations:* Core entity for mysterious sites
- Fields: id, name, slug, description, story, latitude, longitude, address, categoryId, imageUrl, sourceAttribution, regionId, isActive, timestamps
- Belongs to category and region
- Has many route stops

*Regions:* Geographic groupings for locations
- Referenced by locations and routes

*Routes:* Curated walking tours
- Fields: id, name, slug, description, estimatedDurationMinutes, distanceMeters, difficulty
- Has many route stops
- Belongs to region

*RouteStops:* Junction table connecting routes to locations
- Maintains order of stops in route
- References both route and location

**Geospatial Features:**
- Latitude/longitude coordinates for all locations
- Distance calculation using Haversine formula
- Nearby location queries with configurable radius

### External Dependencies

**Expo Modules:**
- expo-location: User geolocation and permission handling
- expo-blur: Glassmorphism effects for UI
- expo-constants: App metadata access
- expo-haptics: Tactile feedback
- expo-image: Optimized image loading
- expo-symbols: System icons
- expo-web-browser: External link handling

**Navigation:**
- @react-navigation/native: Core navigation
- @react-navigation/native-stack: Stack navigation
- @react-navigation/bottom-tabs: Tab bar navigation
- react-native-safe-area-context: Device inset handling
- react-native-screens: Native screen optimization

**Maps & Location:**
- react-native-maps: Interactive maps (native only)
- Google Maps Platform: Map tiles and provider

**Database:**
- PostgreSQL: Primary data store (configured via DATABASE_URL)
- Drizzle ORM: TypeScript ORM with schema migrations
- pg: PostgreSQL client for Node.js
- drizzle-zod: Schema validation integration

**UI & Interaction:**
- react-native-gesture-handler: Touch gesture system
- react-native-reanimated: High-performance animations
- react-native-keyboard-controller: Keyboard behavior management
- @expo/vector-icons: Icon library (Feather icons primarily)

**Data Fetching:**
- @tanstack/react-query: Server state management and caching
- Custom query client with retry logic and error handling

**Build & Development:**
- TypeScript: Type safety across codebase
- tsx: TypeScript execution for server
- esbuild: Server bundling for production
- drizzle-kit: Database migration tooling

**Deployment Environment:**
- Replit-specific environment variables for domain configuration
- HTTP proxy middleware for development
- WebSocket support (ws package)
- Express static file serving for production builds

**Validation:**
- Zod: Runtime schema validation
- drizzle-zod: Automatic schema generation from database
- zod-validation-error: Friendly error formatting