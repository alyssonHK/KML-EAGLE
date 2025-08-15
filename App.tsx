
import React, { useState, useCallback } from 'react';
import { LatLng } from 'leaflet';
import Sidebar from './components/Sidebar';
import MapComponent from './components/MapComponent';
import Header from './components/Header';
import RouteInfoModal from './components/RouteInfoModal';
import { KMLPoint, OSRMResponse, ProcessRouteResult, RouteInfo } from './types';
import { parseKML } from './services/kmlParser';
import { processRoute } from './services/osrmService';

export default function App() {
  const [points, setPoints] = useState<KMLPoint[]>([]);
  const [selectedPointIds, setSelectedPointIds] = useState<Set<string>>(new Set());
  const [optimizedRouteData, setOptimizedRouteData] = useState<OSRMResponse | null>(null);
  const [simplificationInfo, setSimplificationInfo] = useState<string>('');
  const [routeGeometry, setRouteGeometry] = useState<any>(null);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [routeInfo, setRouteInfo] = useState<RouteInfo | null>(null);
  const [showRouteInfoModal, setShowRouteInfoModal] = useState(false);
  const [pendingFile, setPendingFile] = useState<File | null>(null);

  const handleFileLoad = async (file: File) => {
    // Mostrar modal para coletar informações da rota
    setPendingFile(file);
    setShowRouteInfoModal(true);
  };

  const handleRouteInfoSave = async (info: RouteInfo) => {
    if (!pendingFile) return;
    
    setRouteInfo(info);
    setIsLoading(true);
    setError(null);
    setPoints([]);
    setOptimizedRouteData(null);
    setSimplificationInfo('');
    setRouteGeometry(null);
    setSelectedPointIds(new Set());
    
    try {
      const reader = new FileReader();
      reader.onload = async (e) => {
        const text = e.target?.result as string;
        if (text) {
          try {
            const parsedPoints = parseKML(text);
            if (parsedPoints.length === 0) {
              setError("Nenhuma coordenada encontrada no arquivo KML.");
            }
            setPoints(parsedPoints);
          } catch (err) {
            setError("Falha ao analisar o arquivo KML. Por favor, verifique o formato do arquivo.");
            console.error(err);
          } finally {
            setIsLoading(false);
            setPendingFile(null);
          }
        }
      };
      reader.onerror = () => {
        setError("Falha ao ler o arquivo.");
        setIsLoading(false);
        setPendingFile(null);
      };
      reader.readAsText(pendingFile);
    } catch (err) {
      setError("Ocorreu um erro inesperado ao carregar o arquivo.");
      console.error(err);
      setIsLoading(false);
      setPendingFile(null);
    }
  };

  const handleRouteInfoModalClose = () => {
    setShowRouteInfoModal(false);
    setPendingFile(null);
  };

  const handlePointUpdate = useCallback((id: string, newLatLng: LatLng) => {
    setPoints(prevPoints =>
      prevPoints.map(p => (p.id === id ? { ...p, lat: newLatLng.lat, lng: newLatLng.lng } : p))
    );
  }, []);

  const handlePointDelete = useCallback((id: string) => {
    setPoints(prevPoints => prevPoints.filter(p => p.id !== id));
    setSelectedPointIds(prev => {
      const newSelection = new Set(prev);
      newSelection.delete(id);
      return newSelection;
    });
  }, []);
  
  const handleCreatePoint = useCallback((latlng: LatLng) => {
    const newPoint: KMLPoint = {
      id: `new-${Date.now()}`,
      lat: latlng.lat,
      lng: latlng.lng,
      name: `Novo Ponto ${new Date().toLocaleTimeString()}`,
    };
    setPoints(prevPoints => [...prevPoints, newPoint]);
  }, []);

  const handleDeleteSelected = () => {
    if (selectedPointIds.size === 0) return;
    setPoints(prevPoints => prevPoints.filter(p => !selectedPointIds.has(p.id)));
    setSelectedPointIds(new Set());
  };

  // Função para calcular distância entre dois pontos em metros
  const calculateDistance = (lat1: number, lon1: number, lat2: number, lon2: number): number => {
    const R = 6371e3; // Raio da Terra em metros
    const φ1 = lat1 * Math.PI/180;
    const φ2 = lat2 * Math.PI/180;
    const Δφ = (lat2-lat1) * Math.PI/180;
    const Δλ = (lon2-lon1) * Math.PI/180;

    const a = Math.sin(Δφ/2) * Math.sin(Δφ/2) +
              Math.cos(φ1) * Math.cos(φ2) *
              Math.sin(Δλ/2) * Math.sin(Δλ/2);
    const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1-a));

    return R * c;
  };

  const handleCleanupClusters = () => {
    if (points.length < 3) return;
    
    const minDistance = 25; // Distância mínima em metros entre pontos consecutivos
    const cleanedPoints: KMLPoint[] = [];
    
    // Sempre manter o primeiro ponto
    cleanedPoints.push(points[0]);
    
    for (let i = 1; i < points.length - 1; i++) {
      const currentPoint = points[i];
      const lastKeptPoint = cleanedPoints[cleanedPoints.length - 1];
      
      const distance = calculateDistance(
        currentPoint.lat, 
        currentPoint.lng,
        lastKeptPoint.lat, 
        lastKeptPoint.lng
      );
      
      // Manter o ponto se a distância for maior que a mínima
      if (distance >= minDistance) {
        cleanedPoints.push(currentPoint);
      }
    }
    
    // Sempre manter o último ponto
    if (points.length > 1) {
      cleanedPoints.push(points[points.length - 1]);
    }
    
    // Atualizar os pontos e limpar seleções
    setPoints(cleanedPoints);
    setSelectedPointIds(new Set());
    
    // Mostrar feedback ao usuário
    const removedCount = points.length - cleanedPoints.length;
    if (removedCount > 0) {
      alert(`${removedCount} ponto(s) próximo(s) foram removidos. Pontos restantes: ${cleanedPoints.length}`);
    } else {
      alert('Nenhum ponto muito próximo foi encontrado para remoção.');
    }
  };

  const handleProcessRoute = async () => {
    if (points.length < 2) {
      setError("São necessários pelo menos dois pontos para processar uma rota.");
      return;
    }
    setIsLoading(true);
    setError(null);
    try {
      const result = await processRoute(points);
      setOptimizedRouteData(result.response);
      setSimplificationInfo(result.info);
      setRouteGeometry(result.routeGeometry);
    } catch (err) {
      const errorMessage = err instanceof Error ? err.message : "Ocorreu um erro desconhecido durante o processamento da rota.";
      setError(errorMessage);
      console.error(err);
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <div className="flex flex-col h-screen bg-gray-100 font-sans">
      <Header />
      {error && (
        <div className="absolute top-16 left-1/2 -translate-x-1/2 bg-red-500 text-white px-4 py-2 rounded-md shadow-lg z-[1001]" role="alert">
          <span className="font-bold">Erro:</span> {error}
          <button onClick={() => setError(null)} className="ml-4 font-bold">X</button>
        </div>
      )}
      <div className="flex flex-1 overflow-hidden">
        <Sidebar
          onFileLoad={handleFileLoad}
          onProcessRoute={handleProcessRoute}
          onDeleteSelected={handleDeleteSelected}
          onCleanupClusters={handleCleanupClusters}
          optimizedRouteData={optimizedRouteData}
          simplificationInfo={simplificationInfo}
          originalPoints={points}
          routeInfo={routeInfo}
          isLoading={isLoading}
          pointCount={points.length}
          selectedPointCount={selectedPointIds.size}
        />
        <main className="flex-1 h-full">
          <MapComponent
            points={points}
            selectedPointIds={selectedPointIds}
            setSelectedPointIds={setSelectedPointIds}
            onPointUpdate={handlePointUpdate}
            onPointDelete={handlePointDelete}
            onCreatePoint={handleCreatePoint}
            routeGeometry={routeGeometry}
            onDeleteSelected={handleDeleteSelected}
          />
        </main>
      </div>
      
      <RouteInfoModal
        isOpen={showRouteInfoModal}
        onClose={handleRouteInfoModalClose}
        onSave={handleRouteInfoSave}
        fileName={pendingFile?.name}
      />
    </div>
  );
}
