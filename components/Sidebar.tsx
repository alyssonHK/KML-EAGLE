
import React, { useRef } from 'react';
import { OSRMResponse, KMLPoint, RouteInfo, TSPSolution, TSPConfig } from '../types';
import { Clock, Route, MapPin, ArrowUp, ArrowRight, ArrowLeft, RotateCcw, ArrowUpRight, ArrowUpLeft, Map as MapIcon, Upload, Settings, Trash2, Download, FileText, Globe, FileDown, FileType, Target, Navigation, Play, Square, Shuffle } from 'lucide-react';
import Button from './ui/Button';
import Spinner from './ui/Spinner';
import { generateProcessedKML, generateMapAndDirectionsHTML, generatePDF, generateWord, downloadFile } from '../services/exportService';

interface SidebarProps {
  onFileLoad: (file: File) => void;
  onProcessRoute: () => void;
  onDeleteSelected: () => void;
  onCleanupClusters: () => void;
  onResetToOriginal: () => void;
  optimizedRouteData: OSRMResponse | null;
  simplificationInfo: string;
  originalPoints: KMLPoint[];
  routeInfo: RouteInfo | null;
  isLoading: boolean;
  pointCount: number;
  selectedPointCount: number;
  isProcessed: boolean;
  tspMode: boolean;
  onToggleTSPMode: () => void;
  startPointId: string | null;
  endPointId: string | null;
  onSetStartPoint: (pointId: string) => void;
  onSetEndPoint: (pointId: string) => void;
  tspAlgorithm: TSPConfig['algorithm'];
  onSetTspAlgorithm: (algorithm: TSPConfig['algorithm']) => void;
  collectionRadius: number;
  onSetCollectionRadius: (radius: number) => void;
  tspSolution: TSPSolution | null;
}

// Formata tempo em horas e minutos a partir de horas decimais
const formatHours = (hours: number): string => {
  const totalMinutes = Math.round(hours * 60);
  const h = Math.floor(totalMinutes / 60);
  const m = totalMinutes % 60;
  if (h === 0) return `${m} min`;
  if (m === 0) return `${h}h`;
  return `${h}h ${m}min`;
};

// Mapeamento de tipos de manobra do OSRM para instruções em português
const getManeuverInstruction = (maneuver: any): string => {
  if (!maneuver) return 'Siga em frente';
  
  const type = maneuver.type;
  const modifier = maneuver.modifier;
  
  switch (type) {
    case 'depart':
      return 'Siga';
    case 'arrive':
      return 'Chegou ao destino';
    case 'turn':
      switch (modifier) {
        case 'left': return 'Vire à esquerda';
        case 'right': return 'Vire à direita';
        case 'sharp left': return 'Curva acentuada à esquerda';
        case 'sharp right': return 'Curva acentuada à direita';
        case 'slight left': return 'Curva leve à esquerda';
        case 'slight right': return 'Curva leve à direita';
        case 'straight': return 'Siga em frente';
        default: return 'Vire';
      }
    case 'continue':
      return 'Siga em frente';
    case 'merge':
      switch (modifier) {
        case 'left': return 'Converja à esquerda';
        case 'right': return 'Converja à direita';
        default: return 'Converja';
      }
    case 'on ramp':
      return 'Entre na rampa';
    case 'off ramp':
      return 'Saia da rampa';
    case 'fork':
      switch (modifier) {
        case 'left': return 'Mantenha-se à esquerda na bifurcação';
        case 'right': return 'Mantenha-se à direita na bifurcação';
        default: return 'Continue na bifurcação';
      }
    case 'roundabout':
      return 'Entre na rotatória';
    case 'roundabout turn':
      return 'Saia da rotatória';
    case 'new name':
      return 'Continue';
    case 'notification':
      return 'Continue';
    default:
      return 'Continue';
  }
};

// Mapeamento de ícones para tipos de manobra
const getManeuverIcon = (maneuver: any) => {
  if (!maneuver) return <ArrowUp className="h-4 w-4 text-blue-600" />;
  
  const type = maneuver.type;
  const modifier = maneuver.modifier;
  
  switch (type) {
    case 'depart':
      return <ArrowUp className="h-4 w-4 text-green-600" />;
    case 'arrive':
      return <MapPin className="h-4 w-4 text-red-600" />;
    case 'turn':
      switch (modifier) {
        case 'left':
        case 'sharp left':
          return <ArrowLeft className="h-4 w-4 text-blue-600" />;
        case 'right':
        case 'sharp right':
          return <ArrowRight className="h-4 w-4 text-blue-600" />;
        case 'slight left':
          return <ArrowUpLeft className="h-4 w-4 text-blue-600" />;
        case 'slight right':
          return <ArrowUpRight className="h-4 w-4 text-blue-600" />;
        case 'straight':
          return <ArrowUp className="h-4 w-4 text-blue-600" />;
        default:
          return <ArrowUp className="h-4 w-4 text-blue-600" />;
      }
    case 'roundabout':
    case 'roundabout turn':
      return <RotateCcw className="h-4 w-4 text-purple-600" />;
    case 'merge':
      switch (modifier) {
        case 'left':
          return <ArrowUpLeft className="h-4 w-4 text-orange-600" />;
        case 'right':
          return <ArrowUpRight className="h-4 w-4 text-orange-600" />;
        default:
          return <ArrowUp className="h-4 w-4 text-orange-600" />;
      }
    case 'fork':
      return <ArrowUpRight className="h-4 w-4 text-yellow-600" />;
    default:
      return <ArrowUp className="h-4 w-4 text-blue-600" />;
  }
};

// Formatação de distância para ser mais legível
const formatDistance = (distance: number): string => {
  if (distance >= 1000) {
    return `${(distance / 1000).toFixed(1)} km`;
  }
  return `${Math.round(distance)} m`;
};

const formatDuration = (durationInSeconds: number): string => {
  const minutes = Math.round(durationInSeconds / 60);
  if (minutes < 1) return '< 1 min';
  if (minutes < 60) {
    return `${minutes} min`;
  }
  const hours = Math.floor(minutes / 60);
  const remainingMinutes = minutes % 60;
  return `${hours}h ${remainingMinutes}min`;
};

// Função para consolidar steps consecutivos da mesma rua
const consolidateConsecutiveStreets = (steps: any[]) => {
  if (steps.length === 0) return [];
  
  const consolidated = [];
  let currentGroup = {
    maneuver: steps[0].maneuver,
    name: steps[0].name,
    distance: steps[0].distance,
    originalSteps: [steps[0]]
  };
  
  for (let i = 1; i < steps.length; i++) {
    const step = steps[i];
    
    // Se a rua atual é a mesma da anterior, agrupa
    if (step.name === currentGroup.name) {
      currentGroup.distance += step.distance;
      currentGroup.originalSteps.push(step);
    } else {
      // Nova rua, salva o grupo atual e inicia novo
      consolidated.push(currentGroup);
      currentGroup = {
        maneuver: step.maneuver,
        name: step.name,
        distance: step.distance,
        originalSteps: [step]
      };
    }
  }
  
  // Adiciona o último grupo
  consolidated.push(currentGroup);
  
  return consolidated;
};

const Sidebar: React.FC<SidebarProps> = ({
  onFileLoad,
  onProcessRoute,
  onDeleteSelected,
  onCleanupClusters,
  onResetToOriginal,
  optimizedRouteData,
  simplificationInfo,
  originalPoints,
  routeInfo,
  isLoading,
  pointCount,
  selectedPointCount,
  isProcessed,
  tspMode,
  onToggleTSPMode,
  startPointId,
  endPointId,
  onSetStartPoint,
  onSetEndPoint,
  tspAlgorithm,
  onSetTspAlgorithm,
  collectionRadius,
  onSetCollectionRadius,
  tspSolution
}) => {
  const fileInputRef = useRef<HTMLInputElement>(null);

  const handleFileChange = (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (file) {
      onFileLoad(file);
    }
  };

  const handleUploadClick = () => {
    fileInputRef.current?.click();
  };

  const handleExportKML = () => {
    if (!optimizedRouteData) return;
    
    const kmlContent = generateProcessedKML(optimizedRouteData, originalPoints, routeInfo);
    const fileName = routeInfo?.nome ? 
      `${routeInfo.nome.replace(/[<>:"/\\|?*]/g, '_')}_processado.kml` : 
      `rota_processada_${new Date().toISOString().slice(0, 16).replace('T', '_').replace(':', '-')}.kml`;
    downloadFile(kmlContent, fileName, 'application/vnd.google-earth.kml+xml');
  };

  const handleExportMapHTML = () => {
    if (!optimizedRouteData) return;
    
    const htmlContent = generateMapAndDirectionsHTML(optimizedRouteData, originalPoints, routeInfo);
    const fileName = routeInfo?.nome ? 
      `${routeInfo.nome.replace(/[<>:"/\\|?*]/g, '_')}_mapa_e_direcoes.html` : 
      `mapa_e_direcoes_${new Date().toISOString().slice(0, 16).replace('T', '_').replace(':', '-')}.html`;
    downloadFile(htmlContent, fileName, 'text/html');
  };

  const handleExportPDF = async () => {
    if (!optimizedRouteData) return;
    
    try {
      await generatePDF(optimizedRouteData, originalPoints, routeInfo);
    } catch (error) {
      console.error('Erro ao gerar PDF:', error);
      alert('Erro ao gerar arquivo PDF. Tente novamente.');
    }
  };

  const handleExportWord = async () => {
    if (!optimizedRouteData) return;
    
    try {
      await generateWord(optimizedRouteData, originalPoints, routeInfo);
    } catch (error) {
      console.error('Erro ao gerar Word:', error);
      alert('Erro ao gerar arquivo Word. Tente novamente.');
    }
  };

  if (!optimizedRouteData) {
    return (
      <aside className="w-96 bg-white shadow-lg p-4 flex flex-col h-full overflow-y-auto">
        <div className="border-b pb-4 mb-4">
          <h2 className="text-lg font-semibold text-gray-700 mb-3">Controles</h2>
          <div className="space-y-2">
            <input
              type="file"
              ref={fileInputRef}
              onChange={handleFileChange}
              className="hidden"
              accept=".kml"
            />
            <Button onClick={handleUploadClick} disabled={isLoading}>
              <Upload className="mr-2 h-4 w-4" />
              {pointCount > 0 ? 'Carregar Novo KML' : 'Carregar Arquivo KML'}
            </Button>
            
            {/* Controles TSP */}
            <div className="border-t pt-3 mt-3">
              <div className="flex items-center justify-between mb-3">
                <h3 className="text-sm font-semibold text-gray-700">Modo Caixeiro Viajante</h3>
                <Button 
                  onClick={onToggleTSPMode} 
                  disabled={isLoading}
                  variant={tspMode ? "primary" : "secondary"}
                  size="sm"
                >
                  <Shuffle className="mr-1 h-3 w-3" />
                  {tspMode ? 'ON' : 'OFF'}
                </Button>
              </div>
              
              {tspMode && (
                <div className="space-y-2 text-xs">
                  <div className="bg-blue-50 p-2 rounded text-xs border">
                    <div className="font-semibold text-blue-800 mb-1">🖱️ Como selecionar pontos:</div>
                    <div className="text-blue-700">
                      • <kbd className="bg-blue-200 px-1 rounded text-xs">Ctrl + Click</kbd> = Ponto inicial<br/>
                      • <kbd className="bg-blue-200 px-1 rounded text-xs">Alt + Click</kbd> = Ponto final<br/>
                      • <kbd className="bg-blue-200 px-1 rounded text-xs">Click</kbd> = Abrir menu do ponto
                    </div>
                  </div>
                  
                  <div>
                    <label className="block text-gray-600 mb-1">Algoritmo:</label>
                    <select 
                      value={tspAlgorithm} 
                      onChange={(e) => onSetTspAlgorithm(e.target.value as TSPConfig['algorithm'])}
                      className="w-full p-1 border rounded text-xs"
                      disabled={isLoading}
                    >
                      <option value="nearest_neighbor">Vizinho Mais Próximo (Rápido)</option>
                      <option value="2opt">2-opt (Melhor Qualidade)</option>
                      <option value="genetic">Algoritmo Genético</option>
                    </select>
                    {pointCount > 500 && (
                      <div className="text-xs text-orange-600 mt-1">
                        💡 Para +500 pontos, use "Vizinho Mais Próximo" para velocidade
                      </div>
                    )}
                  </div>
                  
                  <div>
                    <label className="block text-gray-600 mb-1">
                      Área de Coleta: {collectionRadius}m
                      <span className="text-xs text-gray-500 ml-1">
                        (pontos próximos são agrupados)
                      </span>
                    </label>
                    <input
                      type="range"
                      min="5"
                      max="100"
                      step="5"
                      value={collectionRadius}
                      onChange={(e) => onSetCollectionRadius(Number(e.target.value))}
                      className="w-full"
                      disabled={isLoading}
                    />
                    <div className="flex justify-between text-xs text-gray-500 mt-1">
                      <span>5m</span>
                      <span className="text-blue-600 font-medium">{collectionRadius}m</span>
                      <span>100m</span>
                    </div>
                    <div className="text-xs text-gray-600 mt-1">
                      💡 Maior raio = menos voltas na mesma rua
                    </div>
                  </div>
                  
                  {pointCount > 0 && (
                    <div className="bg-gray-50 p-2 rounded text-xs">
                      <div className="flex items-center justify-between mb-1">
                        <div className="font-semibold text-gray-700">Pontos Selecionados:</div>
                        {(startPointId || endPointId) && (
                          <button
                            onClick={() => {
                              onSetStartPoint(''); // Limpar início
                              onSetEndPoint('');   // Limpar fim
                            }}
                            className="text-red-500 hover:text-red-700 text-xs underline"
                          >
                            Limpar tudo
                          </button>
                        )}
                      </div>
                      <div className="space-y-1">
                        <div className="flex items-center justify-between">
                          <span className="text-green-600">🚩 Início:</span>
                          <div className="flex items-center">
                            <span className="ml-2 text-gray-600 text-xs">
                              {startPointId ? 
                                originalPoints.find(p => p.id === startPointId)?.name || 'Ponto selecionado' : 
                                'Ctrl+Click no mapa'
                              }
                            </span>
                            {startPointId && (
                              <button
                                onClick={() => onSetStartPoint('')}
                                className="ml-1 text-red-400 hover:text-red-600 text-xs"
                              >
                                ❌
                              </button>
                            )}
                          </div>
                        </div>
                        <div className="flex items-center justify-between">
                          <span className="text-red-600">🎯 Fim:</span>
                          <div className="flex items-center">
                            <span className="ml-2 text-gray-600 text-xs">
                              {endPointId ? 
                                originalPoints.find(p => p.id === endPointId)?.name || 'Ponto selecionado' : 
                                'Alt+Click no mapa'
                              }
                            </span>
                            {endPointId && (
                              <button
                                onClick={() => onSetEndPoint('')}
                                className="ml-1 text-red-400 hover:text-red-600 text-xs"
                              >
                                ❌
                              </button>
                            )}
                          </div>
                        </div>
                      </div>
                    </div>
                  )}
                  
                  <div>
                    <label className="block text-gray-600 mb-1">Algoritmo:</label>
                    <select 
                      value={tspAlgorithm} 
                      onChange={(e) => onSetTspAlgorithm(e.target.value as TSPConfig['algorithm'])}
                      className="w-full p-1 border rounded text-xs"
                      disabled={isLoading}
                    >
                      <option value="nearest_neighbor">Vizinho Mais Próximo (Rápido)</option>
                      <option value="2opt">2-opt (Melhor Qualidade)</option>
                      <option value="genetic">Algoritmo Genético</option>
                    </select>
                    {pointCount > 500 && (
                      <div className="text-xs text-orange-600 mt-1">
                        💡 Para +500 pontos, use "Vizinho Mais Próximo" para velocidade
                      </div>
                    )}
                  </div>
                  
                  {tspSolution && (
                    <div className="bg-green-50 p-2 rounded text-xs">
                      <div className="font-semibold text-green-800">Solução TSP:</div>
                      <div>Distância: {(tspSolution.totalDistance / 1000).toFixed(2)}km</div>
                      <div>Iterações: {tspSolution.iterations}</div>
                      <div>Tempo: {tspSolution.executionTime.toFixed(0)}ms</div>
                    </div>
                  )}
                </div>
              )}
            </div>
            
            <Button onClick={onProcessRoute} disabled={isLoading || pointCount < 2} variant="primary">
              {isLoading ? <Spinner /> : <Settings className="mr-2 h-4 w-4" />}
              {tspMode ? 'Resolver TSP' : 'Processar Rota'}
            </Button>
            
            {isProcessed && (
              <Button onClick={onResetToOriginal} disabled={isLoading} variant="secondary">
                <RotateCcw className="mr-2 h-4 w-4" />
                Voltar ao Original
              </Button>
            )}
            
            <Button onClick={onCleanupClusters} disabled={isLoading || pointCount < 3} variant="secondary">
              <Target className="mr-2 h-4 w-4" />
              Limpar Aglomerados
            </Button>
            <Button onClick={onDeleteSelected} disabled={isLoading || selectedPointCount === 0} variant="danger">
              <Trash2 className="mr-2 h-4 w-4" />
              Excluir Selecionados ({selectedPointCount})
            </Button>
          </div>
        </div>
        
        <div className="flex-1">
          {isLoading ? (
            <div className="text-center py-4">
              <p className="text-gray-600">Processando rota...</p>
            </div>
          ) : (
            <div className="text-center py-4 px-2 text-gray-500 bg-gray-100 rounded-lg">
              <p>Carregue um arquivo KML e processe a rota para ver as instruções de navegação aqui.</p>
            </div>
          )}
        </div>
      </aside>
    );
  }

  const matching = optimizedRouteData.matchings[0];

  // Verificar se legs existe, caso contrário usar array vazio
  const legs = matching.legs || [];
  
  // Coletar todos os steps de todas as legs
  const allSteps = legs.flatMap(leg => leg.steps || []);
  
  // Filter out steps with distance < 5 meters or without street names
  const filteredSteps = allSteps.filter(step => 
    step.distance >= 5 && step.name && step.name.trim() !== ''
  );

  // Consolidar ruas consecutivas com o mesmo nome
  const consolidatedSteps = consolidateConsecutiveStreets(filteredSteps);

  return (
    <div className="w-full h-full bg-white shadow-lg overflow-y-auto flex flex-col">
      <div className="p-4 border-b border-gray-200">
        <div className="space-y-2 mb-4">
          <input
            type="file"
            ref={fileInputRef}
            onChange={handleFileChange}
            className="hidden"
            accept=".kml"
          />
          <Button onClick={handleUploadClick} disabled={isLoading}>
            <Upload className="mr-2 h-4 w-4" />
            {pointCount > 0 ? 'Carregar Novo KML' : 'Carregar Arquivo KML'}
          </Button>
          <Button onClick={onProcessRoute} disabled={isLoading || pointCount < 2} variant="primary">
            {isLoading ? <Spinner /> : <Settings className="mr-2 h-4 w-4" />}
            Processar Rota
          </Button>
          
          {isProcessed && (
            <Button onClick={onResetToOriginal} disabled={isLoading} variant="secondary">
              <RotateCcw className="mr-2 h-4 w-4" />
              Voltar ao Original
            </Button>
          )}
          
          <Button onClick={onCleanupClusters} disabled={isLoading || pointCount < 3} variant="secondary">
            <Target className="mr-2 h-4 w-4" />
            Limpar Aglomerados
          </Button>
          <Button onClick={onDeleteSelected} disabled={isLoading || selectedPointCount === 0} variant="danger">
            <Trash2 className="mr-2 h-4 w-4" />
            Excluir Selecionados ({selectedPointCount})
          </Button>
        </div>
        
        <h2 className="text-xl font-bold text-gray-800">Resumo da Rota</h2>
        <div className="mt-4 space-y-3 text-gray-600">
          <div className="flex items-center">
            <MapIcon className="h-5 w-5 mr-3 text-blue-500" />
            <span>Distância Total: <span className="font-semibold text-gray-800">{formatDistance(matching.distance)}</span></span>
          </div>
          <div className="flex items-center">
            <Clock className="h-5 w-5 mr-3 text-blue-500" />
            <span>Tempo Estimado: <span className="font-semibold text-gray-800">{formatDuration(matching.duration)}</span></span>
          </div>
          <div className="flex items-center">
            <Clock className="h-5 w-5 mr-3 text-green-600" />
            <span>Tempo em Coleta: <span className="font-semibold text-gray-800">{
              formatHours((matching.distance / 1000) / 10)
            }</span> <span className="text-gray-500">(a 10 km/h)</span></span>
          </div>
          <div className="flex items-center">
            <Route className="h-5 w-5 mr-3 text-blue-500" />
            <span>Segmentos da Rota: <span className="font-semibold text-gray-800">{consolidatedSteps.length}</span></span>
          </div>
          {simplificationInfo && (
            <div className="flex items-center">
              <MapPin className="h-5 w-5 mr-3 text-orange-500" />
              <span>{simplificationInfo}</span>
            </div>
          )}
        </div>
        
        {/* Botões de Exportação */}
        <div className="mt-6 pt-4 border-t border-gray-200">
          <h3 className="text-lg font-semibold text-gray-800 mb-3">Exportar</h3>
          <div className="space-y-2">
            <Button onClick={handleExportKML} disabled={isLoading} variant="secondary">
              <Globe className="mr-2 h-4 w-4" />
              Exportar KML Processado
            </Button>
            <Button onClick={handleExportMapHTML} disabled={isLoading} variant="secondary">
              <FileText className="mr-2 h-4 w-4" />
              Exportar Mapa e Direções (HTML)
            </Button>
            <Button onClick={handleExportPDF} disabled={isLoading} variant="secondary">
              <FileDown className="mr-2 h-4 w-4" />
              Exportar Relatório (PDF)
            </Button>
            <Button onClick={handleExportWord} disabled={isLoading} variant="secondary">
              <FileType className="mr-2 h-4 w-4" />
              Exportar Relatório (Word)
            </Button>
          </div>
        </div>
      </div>
      <div className="flex-grow p-4">
        <h3 className="text-lg font-semibold text-gray-800 mb-3">Direções</h3>
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-gray-200 bg-gray-50">
                <th className="px-2 py-2 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Passo</th>
                <th className="px-2 py-2 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Instrução</th>
                <th className="px-2 py-2 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Rua/Estrada</th>
                <th className="px-2 py-2 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Distância (m)</th>
              </tr>
            </thead>
            <tbody className="bg-white divide-y divide-gray-100">
              {consolidatedSteps.map((step, index) => (
                <tr key={index} className="hover:bg-gray-50">
                  <td className="px-2 py-3 whitespace-nowrap">
                    <div className="flex items-center">
                      {getManeuverIcon(step.maneuver)}
                      <span className="text-sm font-medium text-gray-900 ml-2">{index + 1}</span>
                    </div>
                  </td>
                  <td className="px-2 py-3">
                    <div className="text-sm text-gray-900 font-medium">
                      {getManeuverInstruction(step.maneuver)}
                      {step.name && step.name !== step.maneuver?.modifier && (
                        <span className="text-gray-500"> em direção à {step.name}</span>
                      )}
                      {/* {step.originalSteps.length > 1 && (
                        <div className="text-xs text-blue-600 mt-1">
                          {step.originalSteps.length} segmentos consolidados
                        </div>
                      )} */}
                    </div>
                  </td>
                  <td className="px-2 py-3">
                    <div className="text-sm text-gray-700">{step.name}</div>
                  </td>
                  <td className="px-2 py-3 whitespace-nowrap">
                    <div className="text-sm text-gray-900">{Math.round(step.distance)}</div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
};

export default Sidebar;
