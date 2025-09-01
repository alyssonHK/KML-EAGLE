
import { GeoJsonObject } from 'geojson';

export interface KMLPoint {
  id: string;
  name: string;
  lat: number;
  lng: number;
  isStartPoint?: boolean;
  isEndPoint?: boolean;
  visitOrder?: number;
}

export interface RouteInfo {
  nome: string;
  frequencia: string;
  turno: string;
}

export interface Direction {
  text: string;
  distance: string;
  duration: string;
}

export interface RouteData {
    routeGeometry: GeoJsonObject;
    directions: Direction[];
}

export interface ProcessRouteResult {
    response: OSRMResponse;
    routeGeometry: GeoJsonObject;
    directions: Direction[];
    info: string;
}

// Tipos para o Problema do Caixeiro Viajante (TSP)
export interface TSPSolution {
    route: KMLPoint[];
    totalDistance: number;
    totalDuration: number;
    iterations: number;
    executionTime: number;
}

export interface TSPConfig {
    startPointId?: string;
    endPointId?: string;
    algorithm: 'nearest_neighbor' | 'genetic' | '2opt';
    maxIterations?: number;
    collectionRadius?: number; // Raio da área de coleta em metros
}

// Tipos para compatibilidade com OSRM
export interface OSRMResponse {
  code: string;
  matchings: OSRMMatching[];
  tracepoints: any[];
}

export interface OSRMMatching {
  distance: number;
  duration: number;
  geometry: GeoJsonObject;
  legs: OSRMLeg[];
  confidence: number;
  weight: number;
  weight_name: string;
}

export interface OSRMLeg {
  steps: OSRMStep[];
  distance: number;
  duration: number;
  weight: number;
  summary: string;
}

export interface OSRMStep {
  distance: number;
  duration: number;
  geometry: GeoJsonObject;
  name: string;
  maneuver: OSRMManeuver;
}

export interface OSRMManeuver {
  type: string;
  modifier?: string;
  instruction: string;
  location: [number, number];
}
