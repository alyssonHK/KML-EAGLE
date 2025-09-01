
import React, { useEffect, useRef, useState } from 'react';
import { MapContainer, TileLayer, Marker, Popup, useMap, GeoJSON, Polyline } from 'react-leaflet';
import L, { LatLng, LatLngBounds } from 'leaflet';
import 'leaflet-draw';
import { KMLPoint } from '../types';
import { Trash2, MapPin } from 'lucide-react';
import { GeoJsonObject } from 'geojson';

// Adicionar estilos CSS para marcadores destacados
const highlightedMarkerStyle = `
  .highlighted-marker {
    z-index: 9999 !important;
    position: relative !important;
  }
  .leaflet-marker-pane .highlighted-marker {
    z-index: 9999 !important;
  }
  .highlighted-marker .leaflet-marker-icon {
    z-index: 9999 !important;
  }
  .leaflet-marker-icon.highlighted-marker {
    z-index: 9999 !important;
    transform-origin: center center !important;
  }
`;

// Injetar estilos no head se não existirem
if (typeof document !== 'undefined' && !document.getElementById('highlighted-marker-styles')) {
  const style = document.createElement('style');
  style.id = 'highlighted-marker-styles';
  style.textContent = highlightedMarkerStyle;
  document.head.appendChild(style);
}

// Fix for default icon issue with webpack
delete (L.Icon.Default.prototype as any)._getIconUrl;
L.Icon.Default.mergeOptions({
  iconRetinaUrl: 'https://unpkg.com/leaflet@1.9.4/dist/images/marker-icon-2x.png',
  iconUrl: 'https://unpkg.com/leaflet@1.9.4/dist/images/marker-icon.png',
  shadowUrl: 'https://unpkg.com/leaflet@1.9.4/dist/images/marker-shadow.png',
});

// Gera ícone numerado menor para os pontos (sequência)
const getNumberIcon = (index: number, isSelected: boolean, isStart?: boolean, isEnd?: boolean) => {
  const size = 26; // menor
  let bg = '#2563eb';
  let color = 'white';
  let borderColor = 'white';
  let content = (index + 1).toString();

  if (isStart) {
    bg = '#10b981'; // verde para início
    color = 'white';
    borderColor = '#065f46';
    content = '🚩'; // bandeira para início
  } else if (isEnd) {
    bg = '#ef4444'; // vermelho para fim
    color = 'white';
    borderColor = '#991b1b';
    content = '🎯'; // alvo para fim
  } else if (isSelected) {
    bg = '#fbbf24'; // amarelo para selecionado
    color = 'black';
    borderColor = '#d97706';
  }

  const html = `
    <div style="display:flex;align-items:center;justify-content:center;width:${size}px;height:${size}px;border-radius:50%;background:${bg};color:${color};font-weight:700;font-size:${isStart || isEnd ? '14px' : '12px'};box-shadow:0 2px 4px rgba(0,0,0,0.3);border:2px solid ${borderColor};">
      ${content}
    </div>`;

  return L.divIcon({
    html,
    className: 'bg-transparent border-0 p-0',
    iconSize: [size, size],
    iconAnchor: [size / 2, size / 2],
    popupAnchor: [0, -(size / 2) - 6]
  });
};

const getHighlightedIcon = (index: number) => {
  const size = 40; // Aumentar mais o tamanho
  const bg = '#f59e0b';
  const color = 'black';
  const number = (index + 1).toString();

  const html = `
    <div style="display:flex;align-items:center;justify-content:center;width:${size}px;height:${size}px;border-radius:50%;background:${bg};color:${color};font-weight:800;font-size:16px;box-shadow:0 6px 16px rgba(0,0,0,0.6), 0 0 0 4px rgba(245, 158, 11, 0.4), 0 0 0 8px rgba(245, 158, 11, 0.2);border:4px solid white;position:relative;z-index:9999;transform:scale(1.1);">
      ${number}
    </div>`;

  return L.divIcon({
    html,
    className: 'bg-transparent border-0 p-0 highlighted-marker',
    iconSize: [size + 8, size + 8], // Aumentar área clicável
    iconAnchor: [(size + 8) / 2, (size + 8) / 2],
    popupAnchor: [0, -((size + 8) / 2) - 6]
  });
};

// Interface para o CustomMarker (com índice para exibir número)
interface CustomMarkerProps {
  point: KMLPoint;
  index: number;
  isSelected: boolean;
  currentInstructionIndex?: number;
  onSelect: (id: string, shiftKey: boolean) => void;
  onUpdate: (id: string, latlng: LatLng) => void;
  onDelete: (id: string) => void;
  onNavigate?: (index: number) => void;
  tspMode?: boolean;
  startPointId?: string | null;
  endPointId?: string | null;
  onSetStartPoint?: (pointId: string) => void;
  onSetEndPoint?: (pointId: string) => void;
}

// Ícone usado pelo draw control (pequeno marcador padrão) — reusa getNumberIcon
const getMarkerIcon = (isSelected: boolean) => {
  return getNumberIcon(0, isSelected);
};

const CustomMarker: React.FC<CustomMarkerProps> = ({ 
  point, 
  index, 
  isSelected, 
  currentInstructionIndex, 
  onSelect, 
  onUpdate, 
  onDelete, 
  onNavigate,
  tspMode,
  startPointId,
  endPointId,
  onSetStartPoint,
  onSetEndPoint
}) => {
  const markerRef = useRef<L.Marker>(null);
  
  const isStart = startPointId === point.id;
  const isEnd = endPointId === point.id;
  const isHighlighted = currentInstructionIndex === index;

  // Definir z-index baseado no estado do marcador
  const zIndexOffset = isHighlighted ? 10000 : isStart || isEnd ? 1000 : isSelected ? 500 : 0;

  // Atualizar z-index do marcador quando o estado muda
  useEffect(() => {
    if (markerRef.current) {
      markerRef.current.setZIndexOffset(zIndexOffset);
      
      // Se for o ponto destacado, trazer para frente
      if (isHighlighted) {
        markerRef.current.getElement()?.style.setProperty('z-index', '9999', 'important');
      }
    }
  }, [isHighlighted, zIndexOffset]);

  return (
    <Marker
      ref={markerRef}
      position={[point.lat, point.lng]}
      draggable={true}
      icon={isHighlighted ? getHighlightedIcon(index) : getNumberIcon(index, isSelected, isStart, isEnd)}
      zIndexOffset={zIndexOffset}
      eventHandlers={{
        dragstart: () => {
          try { document.dispatchEvent(new CustomEvent('suppressFitBounds')); } catch(e) {}
        },
        dragend: () => {
          if (markerRef.current) {
            onUpdate(point.id, markerRef.current.getLatLng());
          }
        },
        click: (e) => {
          L.DomEvent.stopPropagation(e);
          
          // Comportamento baseado no modo e teclas modificadoras
          if (tspMode && e.originalEvent.ctrlKey && onSetStartPoint) {
            // Ctrl+click no modo TSP = definir ponto inicial
            onSetStartPoint(point.id);
          } else if (tspMode && e.originalEvent.altKey && onSetEndPoint) {
            // Alt+click no modo TSP = definir ponto final  
            onSetEndPoint(point.id);
          } else if (e.originalEvent.shiftKey) {
            // Shift+click = seleção múltipla
            onSelect(point.id, true);
          } else if (typeof onNavigate === 'function' && !tspMode) {
            // Click normal fora do TSP = navegação por instruções
            onNavigate(index);
          } else if (tspMode) {
            // Click normal no TSP = abrir popup para seleção manual
            // O popup já tem os botões de seleção
          }
        },
      }}
    >
      <Popup>
        <div className="flex flex-col space-y-2">
          <div className="font-bold">{point.name}</div>
          <div className="text-xs text-gray-500">
            {point.lat.toFixed(6)}, {point.lng.toFixed(6)}
          </div>
          
          {tspMode && onSetStartPoint && onSetEndPoint && (
            <div className="flex flex-col space-y-1 border-t pt-2">
              <div className="text-xs font-semibold text-gray-600">Modo TSP:</div>
              <div className="text-xs text-gray-500 mb-2">
                💡 <strong>Ctrl+Click</strong> = Início | <strong>Alt+Click</strong> = Fim
              </div>
              <div className="flex space-x-1">
                <button
                  onClick={() => onSetStartPoint(point.id)}
                  className={`px-2 py-1 text-xs rounded ${
                    isStart 
                      ? 'bg-green-500 text-white' 
                      : 'bg-green-100 text-green-700 hover:bg-green-200'
                  }`}
                >
                  {isStart ? '🏁 Início' : 'Def. Início'}
                </button>
                <button
                  onClick={() => onSetEndPoint(point.id)}
                  className={`px-2 py-1 text-xs rounded ${
                    isEnd 
                      ? 'bg-red-500 text-white' 
                      : 'bg-red-100 text-red-700 hover:bg-red-200'
                  }`}
                >
                  {isEnd ? '🏆 Fim' : 'Def. Fim'}
                </button>
              </div>
            </div>
          )}
          
          <button
            onClick={() => onDelete(point.id)}
            className="flex items-center justify-center text-red-500 hover:text-red-700 text-sm p-1 rounded"
          >
            <Trash2 className="mr-1 h-4 w-4" /> Excluir
          </button>
        </div>
  </Popup>
    </Marker>
  );
};

interface MapManagerProps {
  points: KMLPoint[];
  selectedPointIds: Set<string>;
  setSelectedPointIds: React.Dispatch<React.SetStateAction<Set<string>>>;
  onCreatePoint: (latlng: LatLng) => void;
  routeGeometry: GeoJsonObject | null;
  currentInstructionIndex?: number;
  setCurrentInstructionIndex?: React.Dispatch<React.SetStateAction<number>>;
}

// Componente de ajuda para seleção
const SelectionHelper: React.FC<{ 
  visible: boolean; 
  selectedCount: number; 
  isShiftPressed: boolean; 
}> = ({ visible, selectedCount, isShiftPressed }) => {
  if (!visible && selectedCount === 0 && !isShiftPressed) return null;
  
  let message = '';
  if (visible) {
    message = '🖱️ Arraste para selecionar área • Del para excluir';
  } else if (isShiftPressed) {
    message = '🖱️ Segure e arraste para selecionar área';
  } else if (selectedCount > 0) {
    message = `✅ ${selectedCount} ponto${selectedCount !== 1 ? 's' : ''} selecionado${selectedCount !== 1 ? 's' : ''} • Del para excluir`;
  }
  
  return (
    <div 
      style={{
        position: 'absolute',
        top: '10px',
        left: '50%',
        transform: 'translateX(-50%)',
        background: visible ? 'rgba(251, 191, 36, 0.9)' : selectedCount > 0 ? 'rgba(34, 197, 94, 0.9)' : 'rgba(0, 0, 0, 0.8)',
        color: visible || selectedCount > 0 ? 'black' : 'white',
        padding: '8px 16px',
        borderRadius: '8px',
        fontSize: '14px',
        zIndex: 1000,
        pointerEvents: 'none',
        fontWeight: '500'
      }}
    >
      {message}
    </div>
  );
};

const MapManager: React.FC<MapManagerProps> = ({ points, selectedPointIds, setSelectedPointIds, onCreatePoint, routeGeometry, currentInstructionIndex = 0, setCurrentInstructionIndex }) => {
  const map = useMap();
  const drawLayerRef = useRef<L.FeatureGroup>(new L.FeatureGroup());
  const highlightRef = useRef<L.Layer | null>(null);
  const suppressFitRef = useRef(false);
  const selectionBoxRef = useRef<L.Rectangle | null>(null);
  const isSelectingRef = useRef(false);
  const startPointRef = useRef<LatLng | null>(null);
  const [showHelper, setShowHelper] = React.useState(false);
  const [isShiftPressed, setIsShiftPressed] = React.useState(false);

  // Listen for requests to suppress the automatic fitBounds (e.g. when user is dragging a marker)
  useEffect(() => {
    const handler = () => { suppressFitRef.current = true; };
    document.addEventListener('suppressFitBounds', handler as EventListener);
    return () => document.removeEventListener('suppressFitBounds', handler as EventListener);
  }, []);

  useEffect(() => {
    map.addLayer(drawLayerRef.current);

    // Controle de desenho para criar novos pontos
    const drawControl = new (L.Control as any).Draw({
      position: 'topright',
      draw: {
        polyline: false,
        polygon: false,
        circle: false,
        circlemarker: false,
        marker: {
            icon: getMarkerIcon(false)
        },
        rectangle: false, // Desabilitamos o retângulo do draw control
      },
      edit: {
        featureGroup: drawLayerRef.current,
      },
    });

    map.addControl(drawControl);

    // Event listener para criação de novos pontos
    map.on('draw:created', (e: any) => {
      const { layer, layerType } = e;
      if (layerType === 'marker') {
        onCreatePoint(layer.getLatLng());
      }
    });

    // Implementação de seleção de área com Shift + arrastar
    let isSelecting = false;
    let startPoint: LatLng | null = null;
    let selectionBox: L.Rectangle | null = null;

    const handleMouseDown = (e: L.LeafletMouseEvent) => {
      if (e.originalEvent.shiftKey && !isSelectingRef.current) {
        e.originalEvent.preventDefault();
        e.originalEvent.stopPropagation();
        
        isSelecting = true;
        isSelectingRef.current = true;
        startPoint = e.latlng;
        startPointRef.current = e.latlng;
        map.dragging.disable();
        map.scrollWheelZoom.disable();
        setShowHelper(true);
        
        // Criar retângulo de seleção inicial
        const bounds = L.latLngBounds(startPoint, startPoint);
        selectionBox = L.rectangle(bounds, {
          color: '#fbbf24',
          fillColor: '#fef3c7',
          fillOpacity: 0.3,
          weight: 2,
          dashArray: '5, 5'
        }).addTo(map);
        selectionBoxRef.current = selectionBox;
      }
    };

    const handleMouseMove = (e: L.LeafletMouseEvent) => {
      if (isSelecting && startPoint && selectionBox) {
        e.originalEvent.preventDefault();
        e.originalEvent.stopPropagation();
        
        // Atualizar o retângulo de seleção
        const bounds = L.latLngBounds(startPoint, e.latlng);
        selectionBox.setBounds(bounds);
        
        // Destacar pontos dentro da área em tempo real
        const newSelectedIds = new Set<string>();
        points.forEach(point => {
          if (bounds.contains([point.lat, point.lng])) {
            newSelectedIds.add(point.id);
          }
        });
        
        // Manter seleções anteriores se Shift ainda estiver pressionado
        const finalSelection = new Set(selectedPointIds);
        newSelectedIds.forEach(id => finalSelection.add(id));
        setSelectedPointIds(finalSelection);
      }
    };

    const handleMouseUp = (e: L.LeafletMouseEvent) => {
      if (isSelectingRef.current && startPointRef.current && selectionBoxRef.current) {
        e.originalEvent.preventDefault();
        e.originalEvent.stopPropagation();
        
        // Finalizar seleção
        const bounds = selectionBoxRef.current.getBounds();
        const newSelectedIds = new Set(selectedPointIds);
        
        points.forEach(point => {
          if (bounds.contains([point.lat, point.lng])) {
            newSelectedIds.add(point.id);
          }
        });
        
        setSelectedPointIds(newSelectedIds);
        
        // Limpar e resetar
        map.removeLayer(selectionBoxRef.current);
        selectionBoxRef.current = null;
        selectionBox = null;
        isSelecting = false;
        isSelectingRef.current = false;
        startPoint = null;
        startPointRef.current = null;
        setShowHelper(false);
        
        // Garantir que os controles sejam reabilitados
        setTimeout(() => {
          map.dragging.enable();
          map.scrollWheelZoom.enable();
        }, 100);
      }
    };

    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Shift') {
        setIsShiftPressed(true);
        const mapElement = map.getContainer();
        mapElement.style.cursor = 'crosshair';
      }
    };

    const handleKeyUp = (e: KeyboardEvent) => {
      if (e.key === 'Shift') {
        setIsShiftPressed(false);
        const mapElement = map.getContainer();
        mapElement.style.cursor = '';
        
        // Se Shift for solto durante a seleção, cancelar e limpar tudo
        if (isSelectingRef.current && selectionBoxRef.current) {
          map.removeLayer(selectionBoxRef.current);
          selectionBoxRef.current = null;
          selectionBox = null;
          isSelecting = false;
          isSelectingRef.current = false;
          startPoint = null;
          startPointRef.current = null;
          setShowHelper(false);
          
          // Garantir que os controles sejam reabilitados
          setTimeout(() => {
            map.dragging.enable();
            map.scrollWheelZoom.enable();
          }, 100);
        }
      }
    };

    // Adicionar event listeners
    map.on('mousedown', handleMouseDown);
    map.on('mousemove', handleMouseMove);
    map.on('mouseup', handleMouseUp);
    document.addEventListener('keydown', handleKeyDown);
    document.addEventListener('keyup', handleKeyUp);

    return () => {
      map.removeControl(drawControl);
      map.off('draw:created');
      map.off('mousedown', handleMouseDown);
      map.off('mousemove', handleMouseMove);
      map.off('mouseup', handleMouseUp);
      document.removeEventListener('keydown', handleKeyDown);
      document.removeEventListener('keyup', handleKeyUp);
      
      // Limpar qualquer seleção em andamento
      if (selectionBoxRef.current) {
        map.removeLayer(selectionBoxRef.current);
        selectionBoxRef.current = null;
      }
      
      // Garantir que os controles estejam sempre habilitados ao limpar
      map.dragging.enable();
      map.scrollWheelZoom.enable();
      
      // Reset dos refs
      isSelectingRef.current = false;
      startPointRef.current = null;
      
      // Restaurar cursor
      const mapElement = map.getContainer();
      mapElement.style.cursor = '';
    };
  }, [map, points, selectedPointIds, setSelectedPointIds, onCreatePoint]);

  // Effect para centralizar/destacar instrução atual quando o índice mudar
  useEffect(() => {
    if (!points || points.length === 0) return;
    const idx = Math.max(0, Math.min(currentInstructionIndex, points.length - 1));
    const pt = points[idx];
    if (!pt) return;

    // Centralizar
    map.setView([pt.lat, pt.lng], Math.max(map.getZoom(), 16), { animate: true });

    // Remover destaque anterior
    if (highlightRef.current) {
      try { map.removeLayer(highlightRef.current); } catch (e) {}
      highlightRef.current = null;
    }

    // Adicionar círculo de destaque temporário
    const circle = L.circleMarker([pt.lat, pt.lng], {
      radius: 12,
      color: '#f59e0b',
      fillColor: '#fbbf24',
      weight: 3,
      opacity: 0.95,
      fillOpacity: 0.9,
    }).addTo(map);
    highlightRef.current = circle;

    // Remover após 3s
    const t = setTimeout(() => {
      if (highlightRef.current) {
        try { map.removeLayer(highlightRef.current); } catch (e) {}
        highlightRef.current = null;
      }
    }, 3000);

    return () => { clearTimeout(t); };
  }, [currentInstructionIndex, points, map]);

  // Keyboard navigation for instructions
  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if (!setCurrentInstructionIndex) return;
      if (points.length === 0) return;

      switch (e.key) {
        case 'ArrowLeft':
        case 'ArrowUp':
          e.preventDefault();
          setCurrentInstructionIndex(prev => Math.max(0, prev - 1));
          break;
        case 'ArrowRight':
        case 'ArrowDown':
          e.preventDefault();
          setCurrentInstructionIndex(prev => Math.min(points.length - 1, prev + 1));
          break;
        case 'Home':
          e.preventDefault();
          setCurrentInstructionIndex(0);
          break;
        case 'End':
          e.preventDefault();
          setCurrentInstructionIndex(points.length - 1);
          break;
        case ' ': // space
          e.preventDefault();
          // recenter on current
          const idx = Math.max(0, Math.min(currentInstructionIndex, points.length - 1));
          const pt = points[idx];
          if (pt) map.setView([pt.lat, pt.lng], Math.max(map.getZoom(), 16), { animate: true });
          break;
      }
    };

    document.addEventListener('keydown', handler);
    return () => document.removeEventListener('keydown', handler);
  }, [points, setCurrentInstructionIndex, currentInstructionIndex, map]);

  // Effect adicional para garantir que os controles estejam sempre habilitados
  useEffect(() => {
    // Verificar periodicamente se os controles estão habilitados
    const interval = setInterval(() => {
      if (!isSelectingRef.current) {
        if (!map.dragging.enabled()) {
          map.dragging.enable();
        }
        if (!map.scrollWheelZoom.enabled()) {
          map.scrollWheelZoom.enable();
        }
      }
    }, 1000);

    return () => clearInterval(interval);
  }, [map]);

  useEffect(() => {
    // If suppression flag is set (e.g. user dragged a marker), skip this automatic fit
    if (suppressFitRef.current) {
      suppressFitRef.current = false;
      return;
    }

    if (points.length > 0) {
      const bounds = new LatLngBounds(points.map(p => [p.lat, p.lng]));
      if (bounds.isValid()) {
        map.fitBounds(bounds, { padding: [50, 50] });
      }
    } else {
      map.setView([ -27.07, -52.61 ], 5);
    }
  }, [points, map]);

  return (
    <>
      <SelectionHelper 
        visible={showHelper} 
        selectedCount={selectedPointIds.size}
        isShiftPressed={isShiftPressed}
      />
      {routeGeometry ? <GeoJSON data={routeGeometry} style={{ color: '#2563eb', weight: 5, opacity: 0.7 }} /> : null}
    </>
  );
};


interface MapComponentProps {
  points: KMLPoint[];
  selectedPointIds: Set<string>;
  setSelectedPointIds: React.Dispatch<React.SetStateAction<Set<string>>>;
  onPointUpdate: (id: string, latlng: LatLng) => void;
  onPointDelete: (id: string) => void;
  onCreatePoint: (latlng: LatLng) => void;
  routeGeometry: GeoJsonObject | null;
  onDeleteSelected: () => void;
  tspMode?: boolean;
  startPointId?: string | null;
  endPointId?: string | null;
  onSetStartPoint?: (pointId: string) => void;
  onSetEndPoint?: (pointId: string) => void;
}


const MapComponent: React.FC<MapComponentProps> = (props) => {
  const { 
    points, 
    selectedPointIds, 
    setSelectedPointIds, 
    onPointUpdate, 
    onPointDelete, 
    onDeleteSelected,
    tspMode,
    startPointId,
    endPointId,
    onSetStartPoint,
    onSetEndPoint
  } = props;
  const [currentInstructionIndex, setCurrentInstructionIndex] = React.useState<number>(0);

  const handleSelect = (id: string, shiftKey: boolean) => {
    setSelectedPointIds(prev => {
      const newSelection = new Set(prev);
      if (shiftKey) {
        if (newSelection.has(id)) {
          newSelection.delete(id);
        } else {
          newSelection.add(id);
        }
      } else {
        if (newSelection.has(id) && newSelection.size === 1) {
          return new Set();
        }
        return new Set([id]);
      }
      return newSelection;
    });
  };

  React.useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Delete' && selectedPointIds.size > 0) {
        e.preventDefault();
        onDeleteSelected();
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => {
      window.removeEventListener('keydown', handleKeyDown);
    };
  }, [onDeleteSelected, selectedPointIds]);

  return (
    <MapContainer center={[-27.0721, -52.6183]} zoom={13} scrollWheelZoom={true}>
      <TileLayer
        attribution='&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors'
        url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png"
      />
      {points.map((point, idx) => (
        <CustomMarker
          key={point.id}
          point={point}
          index={idx}
          currentInstructionIndex={currentInstructionIndex}
          isSelected={selectedPointIds.has(point.id)}
          onSelect={handleSelect}
          onUpdate={onPointUpdate}
          onDelete={onPointDelete}
          onNavigate={(i: number) => setCurrentInstructionIndex(i)}
          tspMode={tspMode}
          startPointId={startPointId}
          endPointId={endPointId}
          onSetStartPoint={onSetStartPoint}
          onSetEndPoint={onSetEndPoint}
        />
      ))}
      {/* Linha conectando os pontos originais (atualiza automaticamente quando points mudar) */}
      {points.length > 1 && (
        <Polyline
          positions={points.map(p => [p.lat, p.lng])}
          pathOptions={{ color: '#10b981', weight: 3, opacity: 0.8 }}
        />
      )}
  <MapManager {...props} currentInstructionIndex={currentInstructionIndex} setCurrentInstructionIndex={setCurrentInstructionIndex} />
    </MapContainer>
  );
};

export default MapComponent;
