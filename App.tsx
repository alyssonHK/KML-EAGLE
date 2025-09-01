
import React, { useState, useCallback } from 'react';
import { LatLng } from 'leaflet';
import Sidebar from './components/Sidebar';
import MapComponent from './components/MapComponent';
import Header from './components/Header';
import RouteInfoModal from './components/RouteInfoModal';
import { KMLPoint, OSRMResponse, ProcessRouteResult, RouteInfo, TSPSolution, TSPConfig } from './types';
import { parseKML } from './services/kmlParser';
import { processRoute } from './services/osrmService';
import { solveTSP, validateTSPConfig } from './services/tspService';

export default function App() {
  const [points, setPoints] = useState<KMLPoint[]>([]);
  const [originalPoints, setOriginalPoints] = useState<KMLPoint[]>([]); // Preservar pontos originais
  const [selectedPointIds, setSelectedPointIds] = useState<Set<string>>(new Set());
  const [optimizedRouteData, setOptimizedRouteData] = useState<OSRMResponse | null>(null);
  const [simplificationInfo, setSimplificationInfo] = useState<string>('');
  const [routeGeometry, setRouteGeometry] = useState<any>(null);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [routeInfo, setRouteInfo] = useState<RouteInfo | null>(null);
  const [showRouteInfoModal, setShowRouteInfoModal] = useState(false);
  const [pendingFile, setPendingFile] = useState<File | null>(null);
  const [isProcessed, setIsProcessed] = useState<boolean>(false); // Controlar estado processado
  
  // Estados TSP
  const [tspSolution, setTspSolution] = useState<TSPSolution | null>(null);
  const [tspMode, setTspMode] = useState<boolean>(false);
  const [startPointId, setStartPointId] = useState<string | null>(null);
  const [endPointId, setEndPointId] = useState<string | null>(null);
  const [tspAlgorithm, setTspAlgorithm] = useState<TSPConfig['algorithm']>('2opt');
  const [collectionRadius, setCollectionRadius] = useState<number>(20);

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
    setOriginalPoints([]); // Limpar pontos originais também
    setOptimizedRouteData(null);
    setSimplificationInfo('');
    setRouteGeometry(null);
    setSelectedPointIds(new Set());
    setIsProcessed(false);
    
    // Resetar estados TSP
    setTspSolution(null);
    setStartPointId(null);
    setEndPointId(null);
    
    try {
      const reader = new FileReader();
      reader.onload = async (e) => {
        const text = e.target?.result as string;
        if (text) {
          try {
            const parsedPoints = parseKML(text);
            if (parsedPoints.length === 0) {
              setError("Nenhuma coordenada encontrada no arquivo KML.");
            } else {
              setPoints(parsedPoints);
              setOriginalPoints([...parsedPoints]); // Salvar cópia dos pontos originais
              setSimplificationInfo(`Carregados ${parsedPoints.length} pontos do arquivo KML.`);
            }
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
    
    // Identificar pontos de início e fim atuais
    const currentStartPoint = startPointId ? points.find(p => p.id === startPointId) : null;
    const currentEndPoint = endPointId ? points.find(p => p.id === endPointId) : null;
    
    // Sempre manter o primeiro ponto
    cleanedPoints.push(points[0]);
    
    for (let i = 1; i < points.length - 1; i++) {
      const currentPoint = points[i];
      const lastKeptPoint = cleanedPoints[cleanedPoints.length - 1];
      
      // Se é um ponto de início ou fim do TSP, sempre manter
      if ((currentStartPoint && currentPoint.id === currentStartPoint.id) ||
          (currentEndPoint && currentPoint.id === currentEndPoint.id)) {
        cleanedPoints.push(currentPoint);
        continue;
      }
      
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
    
    // Verificar se os pontos de início e fim ainda existem, se não, ajustar
    let newStartPointId = startPointId;
    let newEndPointId = endPointId;
    
    if (startPointId && !cleanedPoints.find(p => p.id === startPointId)) {
      // Se o ponto de início foi removido, usar o primeiro ponto
      newStartPointId = cleanedPoints[0]?.id || null;
      console.log('Ponto de início foi ajustado para o primeiro ponto após limpeza');
    }
    
    if (endPointId && !cleanedPoints.find(p => p.id === endPointId)) {
      // Se o ponto final foi removido, usar o último ponto
      newEndPointId = cleanedPoints[cleanedPoints.length - 1]?.id || null;
      console.log('Ponto final foi ajustado para o último ponto após limpeza');
    }
    
    // Atualizar os pontos e ajustar pontos de TSP se necessário
    setPoints(cleanedPoints);
    setSelectedPointIds(new Set());
    
    if (newStartPointId !== startPointId) {
      setStartPointId(newStartPointId);
    }
    if (newEndPointId !== endPointId) {
      setEndPointId(newEndPointId);
    }
    
    // Mostrar feedback ao usuário
    const removedCount = points.length - cleanedPoints.length;
    let message = '';
    
    if (removedCount > 0) {
      message = `${removedCount} ponto(s) próximo(s) foram removidos. Pontos restantes: ${cleanedPoints.length}`;
      
      // Adicionar informação sobre ajustes nos pontos TSP
      if (newStartPointId !== startPointId || newEndPointId !== endPointId) {
        message += '\n\n⚠️ Pontos de início/fim do TSP foram ajustados automaticamente para manter a funcionalidade.';
      }
    } else {
      message = 'Nenhum ponto muito próximo foi encontrado para remoção.';
    }
    
    alert(message);
  };

  // Função para resetar para o estado original (não processado)
  const handleResetToOriginal = () => {
    if (originalPoints.length === 0) {
      setError("Não há pontos originais para restaurar.");
      return;
    }

    setPoints([...originalPoints]);
    setOptimizedRouteData(null);
    setRouteGeometry(null);
    setTspSolution(null);
    setSelectedPointIds(new Set());
    setStartPointId(null);
    setEndPointId(null);
    setIsProcessed(false);
    setSimplificationInfo(`Restaurados ${originalPoints.length} pontos originais. Pronto para reprocessamento.`);
  };

  const handleProcessRoute = async () => {
    if (points.length < 2) {
      setError("São necessários pelo menos dois pontos para processar uma rota.");
      return;
    }
    setIsLoading(true);
    setError(null);
    try {
      if (tspMode) {
        // Processar como TSP
        await handleProcessTSP();
      } else {
        // Processar rota sequencial normal
        const result = await processRoute(points);
        setOptimizedRouteData(result.response);
        setSimplificationInfo(result.info);
        setRouteGeometry(result.routeGeometry);
        setIsProcessed(true); // Marcar como processado
      }
    } catch (err) {
      const errorMessage = err instanceof Error ? err.message : "Ocorreu um erro desconhecido durante o processamento da rota.";
      setError(errorMessage);
      console.error(err);
    } finally {
      setIsLoading(false);
    }
  };

  const handleProcessTSP = async () => {
    if (points.length < 2) {
      setError("São necessários pelo menos dois pontos para resolver o TSP.");
      return;
    }

    const config: TSPConfig = {
      startPointId: startPointId,
      endPointId: endPointId,
      algorithm: tspAlgorithm,
      maxIterations: 1000,
      collectionRadius: collectionRadius
    };

    // Validar configuração com auto-correção
    const validation = validateTSPConfig(points, config);
    if (validation.errors.length > 0) {
      setError(validation.errors.join('; '));
      return;
    }

    // Usar configuração corrigida se houve ajustes
    const finalConfig = validation.correctedConfig;
    
    // Atualizar estados se houve correções nos pontos de início/fim
    if (finalConfig.startPointId !== startPointId) {
      setStartPointId(finalConfig.startPointId);
      console.log('Ponto de início ajustado automaticamente');
    }
    if (finalConfig.endPointId !== endPointId) {
      setEndPointId(finalConfig.endPointId);
      console.log('Ponto final ajustado automaticamente');
    }

    // Mostrar feedback se houve ajustes
    let adjustmentMessage = '';
    if (finalConfig.startPointId !== startPointId || finalConfig.endPointId !== endPointId) {
      adjustmentMessage = '⚠️ Pontos de início/fim foram ajustados automaticamente após limpeza. ';
    }

    try {
      console.log('Resolvendo TSP...');
      
      // Mostrar aviso para muitos pontos
      if (points.length > 1000 && tspAlgorithm === '2opt') {
        setSimplificationInfo(`⏳ Processando ${points.length} pontos com 2-opt - isso pode demorar alguns minutos...`);
      } else if (points.length > 500) {
        setSimplificationInfo(`⏳ Processando ${points.length} pontos...`);
      }
      
      const solution = await solveTSP(points, finalConfig);
      setTspSolution(solution);
      
      // Processar a rota otimizada com OSRM
      const result = await processRoute(solution.route);
      setOptimizedRouteData(result.response);
      setSimplificationInfo(`${adjustmentMessage}✅ TSP: ${solution.iterations} iterações, ${(solution.executionTime).toFixed(0)}ms, ${(solution.totalDistance/1000).toFixed(2)}km. ${result.info}`);
      setRouteGeometry(result.routeGeometry);
      
      // Atualizar pontos com ordem de visita
      setPoints(solution.route);
      setIsProcessed(true); // Marcar como processado
      
    } catch (err) {
      const errorMessage = err instanceof Error ? err.message : "Erro ao resolver TSP";
      setError(errorMessage);
      console.error(err);
    }
  };

  const handleToggleTSPMode = () => {
    setTspMode(!tspMode);
    setTspSolution(null);
    setStartPointId(null);
    setEndPointId(null);
    setOptimizedRouteData(null);
    setRouteGeometry(null);
    setSimplificationInfo('');
  };

  const handleSetStartPoint = (pointId: string) => {
    if (startPointId === pointId || pointId === '') {
      setStartPointId(null);
      setSimplificationInfo('Ponto inicial removido');
      // Limpar mensagem após 2 segundos
      setTimeout(() => setSimplificationInfo(''), 2000);
    } else {
      setStartPointId(pointId);
      // Se o ponto final é o mesmo, limpar
      if (endPointId === pointId) {
        setEndPointId(null);
      }
      const point = points.find(p => p.id === pointId);
      setSimplificationInfo(point ? `🏁 Ponto inicial definido: ${point.name}` : '🏁 Ponto inicial definido');
      // Limpar mensagem após 3 segundos
      setTimeout(() => setSimplificationInfo(''), 3000);
    }
  };

  const handleSetEndPoint = (pointId: string) => {
    if (endPointId === pointId || pointId === '') {
      setEndPointId(null);
      setSimplificationInfo('Ponto final removido');
      // Limpar mensagem após 2 segundos
      setTimeout(() => setSimplificationInfo(''), 2000);
    } else {
      setEndPointId(pointId);
      // Se o ponto inicial é o mesmo, limpar
      if (startPointId === pointId) {
        setStartPointId(null);
      }
      const point = points.find(p => p.id === pointId);
      setSimplificationInfo(point ? `🏆 Ponto final definido: ${point.name}` : '🏆 Ponto final definido');
      // Limpar mensagem após 3 segundos
      setTimeout(() => setSimplificationInfo(''), 3000);
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
          onResetToOriginal={handleResetToOriginal}
          optimizedRouteData={optimizedRouteData}
          simplificationInfo={simplificationInfo}
          originalPoints={originalPoints}
          routeInfo={routeInfo}
          isLoading={isLoading}
          pointCount={points.length}
          selectedPointCount={selectedPointIds.size}
          isProcessed={isProcessed}
          tspMode={tspMode}
          onToggleTSPMode={handleToggleTSPMode}
          startPointId={startPointId}
          endPointId={endPointId}
          onSetStartPoint={handleSetStartPoint}
          onSetEndPoint={handleSetEndPoint}
          tspAlgorithm={tspAlgorithm}
          onSetTspAlgorithm={setTspAlgorithm}
          collectionRadius={collectionRadius}
          onSetCollectionRadius={setCollectionRadius}
          tspSolution={tspSolution}
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
            tspMode={tspMode}
            startPointId={startPointId}
            endPointId={endPointId}
            onSetStartPoint={handleSetStartPoint}
            onSetEndPoint={handleSetEndPoint}
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
