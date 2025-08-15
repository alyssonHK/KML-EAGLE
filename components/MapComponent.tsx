
import React, { useEffect, useRef } from 'react';
import { MapContainer, TileLayer, Marker, Popup, useMap, GeoJSON } from 'react-leaflet';
import L, { LatLng, LatLngBounds } from 'leaflet';
import 'leaflet-draw';
import { KMLPoint } from '../types';
import { Trash2, MapPin } from 'lucide-react';
import { GeoJsonObject } from 'geojson';

// Fix for default icon issue with webpack
delete (L.Icon.Default.prototype as any)._getIconUrl;
L.Icon.Default.mergeOptions({
  iconRetinaUrl: 'https://unpkg.com/leaflet@1.9.4/dist/images/marker-icon-2x.png',
  iconUrl: 'https://unpkg.com/leaflet@1.9.4/dist/images/marker-icon.png',
  shadowUrl: 'https://unpkg.com/leaflet@1.9.4/dist/images/marker-shadow.png',
});

const getMarkerIcon = (isSelected: boolean) => {
    const iconHtml = `<div class="relative flex items-center justify-center w-8 h-8">
        <svg viewBox="0 0 384 512" class="${isSelected ? 'text-yellow-400' : 'text-blue-500'}" style="width: 2rem; height: 2rem; filter: drop-shadow(2px 2px 2px rgba(0,0,0,0.5));">
            <path fill="currentColor" d="M172.268 501.67C26.97 291.031 0 269.413 0 192 0 85.961 85.961 0 192 0s192 85.961 192 192c0 77.413-26.97 99.031-172.268 309.67a24 24 0 01-35.464 0zM192 256a64 64 0 100-128 64 64 0 000 128z"/>
        </svg>
    </div>`;

    return L.divIcon({
        html: iconHtml,
        className: 'bg-transparent border-0',
        iconSize: [32, 32],
        iconAnchor: [16, 32],
        popupAnchor: [0, -32]
    });
};

interface CustomMarkerProps {
  point: KMLPoint;
  isSelected: boolean;
  onSelect: (id: string, shiftKey: boolean) => void;
  onUpdate: (id: string, latlng: LatLng) => void;
  onDelete: (id: string) => void;
}

const CustomMarker: React.FC<CustomMarkerProps> = ({ point, isSelected, onSelect, onUpdate, onDelete }) => {
  const markerRef = useRef<L.Marker>(null);

  return (
    <Marker
      ref={markerRef}
      position={[point.lat, point.lng]}
      draggable={true}
      icon={getMarkerIcon(isSelected)}
      eventHandlers={{
        dragend: () => {
          if (markerRef.current) {
            onUpdate(point.id, markerRef.current.getLatLng());
          }
        },
        click: (e) => {
          L.DomEvent.stopPropagation(e);
          onSelect(point.id, e.originalEvent.shiftKey);
        },
      }}
    >
      <Popup>
        <div className="flex flex-col space-y-2">
          <div className="font-bold">{point.name}</div>
          <div className="text-xs text-gray-500">
            {point.lat.toFixed(6)}, {point.lng.toFixed(6)}
          </div>
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

const MapManager: React.FC<MapManagerProps> = ({ points, selectedPointIds, setSelectedPointIds, onCreatePoint, routeGeometry }) => {
  const map = useMap();
  const drawLayerRef = useRef<L.FeatureGroup>(new L.FeatureGroup());
  const selectionBoxRef = useRef<L.Rectangle | null>(null);
  const isSelectingRef = useRef(false);
  const startPointRef = useRef<LatLng | null>(null);
  const [showHelper, setShowHelper] = React.useState(false);
  const [isShiftPressed, setIsShiftPressed] = React.useState(false);

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
}


const MapComponent: React.FC<MapComponentProps> = (props) => {
  const { points, selectedPointIds, setSelectedPointIds, onPointUpdate, onPointDelete, onDeleteSelected } = props;

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
      {points.map(point => (
        <CustomMarker
          key={point.id}
          point={point}
          isSelected={selectedPointIds.has(point.id)}
          onSelect={handleSelect}
          onUpdate={onPointUpdate}
          onDelete={onPointDelete}
        />
      ))}
      <MapManager {...props} />
    </MapContainer>
  );
};

export default MapComponent;
