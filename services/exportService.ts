import { OSRMResponse, KMLPoint, RouteInfo } from '../types';
import jsPDF from 'jspdf';
import html2canvas from 'html2canvas';
import { Document, Packer, Paragraph, ImageRun, TextRun, HeadingLevel, Table, TableRow, TableCell, WidthType } from 'docx';

// Mapeamento de tipos de manobra do OSRM para instruções em português (CÓPIA EXATA DO SIDEBAR)
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

// Função auxiliar para consolidar direções (igual ao Sidebar)
const consolidateConsecutiveStreets = (steps: any[]) => {
  if (steps.length === 0) return [];
  
  const consolidated: any[] = [];
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

// Função auxiliar para formatar distância
const formatDistance = (distance: number): string => {
  if (distance >= 1000) {
    return `${(distance / 1000).toFixed(1)} km`;
  }
  return `${Math.round(distance)} m`;
};

// Função auxiliar para formatar duração
const formatDuration = (seconds: number): string => {
  const minutes = Math.round(seconds / 60);
  if (minutes >= 60) {
    const hours = Math.floor(minutes / 60);
    const remainingMinutes = minutes % 60;
    return remainingMinutes > 0 ? `${hours}h ${remainingMinutes}min` : `${hours}h`;
  }
  return `${minutes} min`;
};

// Função auxiliar para obter ícone de manobra
const getManeuverIcon = (type: string, modifier?: string): string => {
  const iconMap: { [key: string]: string } = {
    'turn-straight': '↑',
    'turn-right': '→',
    'turn-left': '←',
    'turn-slight-right': '↗',
    'turn-slight-left': '↖',
    'turn-sharp-right': '↳',
    'turn-sharp-left': '↰',
    'uturn': '↺',
    'depart': '↑',
    'arrive': '🏁',
    'merge': '↗',
    'on-ramp': '↗',
    'off-ramp': '↘',
    'fork': '↗',
    'end-of-road': '↑',
    'continue': '↑',
    'roundabout': '↻',
    'rotary': '↻',
    'roundabout-turn': '↻'
  };

  if (modifier) {
    const key = `${type}-${modifier}`;
    if (iconMap[key]) return iconMap[key];
  }

  return iconMap[type] || '↑';
};

// Função para gerar KML do resultado processado
export const generateProcessedKML = (optimizedRouteData: OSRMResponse, originalPoints: KMLPoint[], routeInfo?: RouteInfo | null): string => {
  const kmlHeader = `<?xml version="1.0" encoding="UTF-8"?>
<kml xmlns="http://www.opengis.net/kml/2.2">
  <Document>
    <name>KML Processado - Rota Otimizada</name>
    <description>Rota processada via OSRM com snap-to-road</description>
    
    <!-- Estilo para a linha da rota -->
    <Style id="routeStyle">
      <LineStyle>
        <color>ff2563eb</color>
        <width>4</width>
      </LineStyle>
    </Style>
    
    <!-- Estilo para pontos originais -->
    <Style id="originalPointStyle">
      <IconStyle>
        <Icon>
          <href>http://maps.google.com/mapfiles/kml/pushpin/red-pushpin.png</href>
        </Icon>
      </IconStyle>
    </Style>
    
    <!-- Estilo para pontos processados -->
    <Style id="processedPointStyle">
      <IconStyle>
        <Icon>
          <href>http://maps.google.com/mapfiles/kml/pushpin/grn-pushpin.png</href>
        </Icon>
      </IconStyle>
    </Style>`;

  let kmlContent = kmlHeader;

  // Adicionar pontos originais
  kmlContent += '\n    <Folder>\n      <name>Pontos Originais</name>\n';
  originalPoints.forEach((point, index) => {
    kmlContent += `      <Placemark>
        <name>${point.name || `Ponto ${index + 1}`}</name>
        <description>Coordenadas originais: ${point.lat.toFixed(6)}, ${point.lng.toFixed(6)}</description>
        <styleUrl>#originalPointStyle</styleUrl>
        <Point>
          <coordinates>${point.lng},${point.lat},0</coordinates>
        </Point>
      </Placemark>
`;
  });
  kmlContent += '    </Folder>\n';

  // Adicionar rotas processadas
  if (optimizedRouteData.matchings && optimizedRouteData.matchings.length > 0) {
    kmlContent += '\n    <Folder>\n      <name>Rotas Processadas</name>\n';
    
    optimizedRouteData.matchings.forEach((matching, index) => {
      const geometry = matching.geometry as any;
      if (geometry && geometry.coordinates) {
        const coordinates = geometry.coordinates
          .map((coord: number[]) => `${coord[0]},${coord[1]},0`)
          .join(' ');
        
        kmlContent += `      <Placemark>
        <name>Rota ${index + 1}</name>
        <description>
          Distância: ${(matching.distance / 1000).toFixed(2)} km
          Duração: ${Math.round(matching.duration / 60)} minutos
          Confiança: ${(matching.confidence * 100).toFixed(1)}%
        </description>
        <styleUrl>#routeStyle</styleUrl>
        <LineString>
          <tessellate>1</tessellate>
          <coordinates>${coordinates}</coordinates>
        </LineString>
      </Placemark>
`;
      }
    });
    kmlContent += '    </Folder>\n';
  }

  kmlContent += `  </Document>
</kml>`;

  return kmlContent;
};

// Função para gerar HTML com mapa e direções
export const generateMapAndDirectionsHTML = (optimizedRouteData: OSRMResponse, originalPoints: KMLPoint[], routeInfo?: RouteInfo | null): string => {
  const centerLat = originalPoints.length > 0 ? 
    originalPoints.reduce((sum, p) => sum + p.lat, 0) / originalPoints.length : -27.0721;
  const centerLng = originalPoints.length > 0 ? 
    originalPoints.reduce((sum, p) => sum + p.lng, 0) / originalPoints.length : -52.6183;

  // Gerar coordenadas da rota para o mapa
  let routeCoordinates = '';
  if (optimizedRouteData.matchings && optimizedRouteData.matchings.length > 0) {
    const allCoords: number[][] = [];
    optimizedRouteData.matchings.forEach(matching => {
      const geometry = matching.geometry as any;
      if (geometry && geometry.coordinates) {
        allCoords.push(...geometry.coordinates);
      }
    });
    routeCoordinates = JSON.stringify(allCoords.map(coord => [coord[1], coord[0]])); // Leaflet usa lat,lng
  }

  // Processar direções da mesma forma que o Sidebar
  let directionsHTML = '';
  let totalSteps = 0;
  let processedInstructions = []; // Array para armazenar as instruções processadas
  
  if (optimizedRouteData.matchings && optimizedRouteData.matchings.length > 0) {
    const matching = optimizedRouteData.matchings[0];
    const legs = matching.legs || [];
    const allSteps = legs.flatMap(leg => leg.steps || []);
    
    // Filtrar steps da mesma forma que o Sidebar
    const filteredSteps = allSteps.filter(step => 
      step.distance >= 5 && step.name && step.name.trim() !== ''
    );
    
    // Consolidar ruas consecutivas
    const consolidatedSteps = consolidateConsecutiveStreets(filteredSteps);
    totalSteps = consolidatedSteps.length;
    
    consolidatedSteps.forEach((step, index) => {
      const maneuverIcon = getManeuverIcon(step.maneuver.type, step.maneuver.modifier);
      const distance = formatDistance(step.distance);
      
      // Construir instrução exatamente como no Sidebar
      let fullInstruction = getManeuverInstruction(step.maneuver);
      if (step.name && step.name !== step.maneuver?.modifier) {
        fullInstruction += ` em direção à ${step.name}`;
      }
      
      // Extrair coordenada da manobra para o marcador
      let instructionLocation = null;
      if (step.maneuver && step.maneuver.location) {
        instructionLocation = {
          lat: step.maneuver.location[1],
          lng: step.maneuver.location[0]
        };
      }
      
      // Armazenar dados da instrução para navegação
      processedInstructions.push({
        index: index,
        instruction: fullInstruction,
        distance: distance,
        location: instructionLocation,
        maneuverIcon: maneuverIcon,
        street: step.name,
        maneuverType: step.maneuver.type
      });
      
      let consolidationInfo = '';
      if (step.originalSteps.length > 1) {
        // consolidationInfo = `<div style="font-size: 0.75rem; color: #2563eb; margin-top: 2px;">${step.originalSteps.length} segmentos consolidados</div>`;
        consolidationInfo = ``;
      }
      
      directionsHTML += `
        <tr class="direction-row" data-step="${index}">
          <td class="step-number">${index + 1}</td>
          <td class="maneuver-icon">${maneuverIcon}</td>
          <td class="instruction">
            <div class="instruction-text">${fullInstruction}</div>
            ${consolidationInfo}
          </td>
          <td class="distance">${distance}</td>
        </tr>`;
    });
  }

  const html = `<!DOCTYPE html>
<html lang="pt-BR">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>Mapa e Direções - KML Eagle</title>
    <link rel="stylesheet" href="https://unpkg.com/leaflet@1.9.4/dist/leaflet.css" />
    <style>
        body { 
            margin: 0; 
            font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', 'Roboto', sans-serif;
            background: #f5f5f5;
        }
        .container { 
            display: flex; 
            height: 100vh; 
        }
        #map { 
            flex: 1; 
            height: 100%; 
        }
        .sidebar { 
            width: 450px; 
            background: white; 
            padding: 20px; 
            overflow-y: auto; 
            box-shadow: -2px 0 10px rgba(0,0,0,0.1);
        }
        .header { 
            margin-bottom: 20px; 
            border-bottom: 2px solid #e5e7eb; 
            padding-bottom: 15px;
        }
        h1 { 
            margin: 0; 
            color: #1f2937; 
            font-size: 1.5rem;
            font-weight: bold;
        }
        .subtitle { 
            color: #6b7280; 
            margin-top: 5px;
            font-size: 0.9rem;
        }
        .stats { 
            background: #f8fafc; 
            padding: 15px; 
            border-radius: 8px; 
            margin-bottom: 20px;
            border: 1px solid #e2e8f0;
        }
        .stat-item { 
            display: flex; 
            justify-content: space-between; 
            margin-bottom: 8px;
            align-items: center;
        }
        .stat-item:last-child {
            margin-bottom: 0;
        }
        .stat-label { 
            font-weight: 500; 
            color: #374151;
            font-size: 0.9rem;
        }
        .stat-value { 
            color: #1f2937; 
            font-weight: 600;
            font-size: 0.9rem;
        }
        .directions-section {
            margin-top: 20px;
        }
        .directions-title { 
            font-size: 1.1rem; 
            font-weight: 600; 
            margin-bottom: 15px; 
            color: #1f2937;
        }
        .directions-table {
            width: 100%;
            border-collapse: collapse;
            font-size: 0.85rem;
        }
        .directions-table th {
            background: #f8fafc;
            color: #374151;
            font-weight: 600;
            padding: 8px;
            text-align: left;
            border-bottom: 2px solid #e2e8f0;
            font-size: 0.8rem;
            text-transform: uppercase;
            letter-spacing: 0.05em;
        }
        .direction-row {
            border-bottom: 1px solid #e5e7eb;
        }
        .direction-row:hover {
            background: #f9fafb;
        }
        .direction-row td {
            padding: 10px 8px;
            vertical-align: top;
        }
        .step-number {
            background: #2563eb;
            color: white;
            width: 20px;
            height: 20px;
            border-radius: 50%;
            display: flex;
            align-items: center;
            justify-content: center;
            font-size: 0.7rem;
            font-weight: bold;
            margin: 0 auto;
        }
        .maneuver-icon {
            font-size: 1.2rem;
            text-align: center;
            color: #2563eb;
            font-weight: bold;
        }
        .instruction {
            width: 100%;
        }
        .instruction-text {
            font-weight: 500;
            color: #1f2937;
            margin-bottom: 2px;
            line-height: 1.3;
        }
        .street-name {
            color: #6b7280;
            font-size: 0.8rem;
            font-style: italic;
        }
        .consolidation-info {
            font-size: 0.75rem;
            color: #2563eb;
            margin-top: 2px;
        }
        .distance {
            color: #2563eb;
            font-weight: 600;
            text-align: right;
            white-space: nowrap;
        }
        
        /* Estilos para navegação por teclado */
        .keyboard-help {
            position: fixed;
            top: 10px;
            left: 10px;
            background: rgba(0,0,0,0.8);
            color: white;
            padding: 10px;
            border-radius: 8px;
            font-size: 0.8rem;
            z-index: 1000;
        }
        .current-point-info {
            position: fixed;
            bottom: 10px;
            left: 10px;
            background: rgba(0,0,0,0.8);
            color: white;
            padding: 10px;
            border-radius: 8px;
            font-size: 0.9rem;
            z-index: 1000;
            min-width: 200px;
            max-width: 300px;
        }
        .direction-row.highlighted {
            background-color: #dbeafe !important;
            border-left: 4px solid #2563eb;
        }
        
        /* Animação para marcador destacado */
        @keyframes pulse {
            0% { transform: scale(1); }
            50% { transform: scale(1.1); }
            100% { transform: scale(1); }
        }
        
        @media print {
            .container { 
                height: auto; 
                flex-direction: column; 
            }
            #map { 
                height: 400px; 
                width: 100%;
            }
            .sidebar { 
                width: 100%; 
                box-shadow: none;
                border-top: 1px solid #e5e7eb;
            }
            .directions-table {
                font-size: 0.75rem;
            }
        }
        @media (max-width: 768px) {
            .container {
                flex-direction: column;
            }
            .sidebar {
                width: 100%;
                height: 50vh;
            }
            #map {
                height: 50vh;
            }
        }
    </style>
</head>
<body>
    <div class="container">
        <div id="map"></div>
        <div class="sidebar">
            <div class="header">
                <h1>Resumo da Rota</h1>
                <div class="subtitle">Gerado pelo KML Eagle em ${new Date().toLocaleString('pt-BR')}</div>
            </div>
            
            <div class="keyboard-help">
                <div><strong>📌 Navegação por Instruções:</strong></div>
                <div>🔼🔽 ← → Navegar instruções</div>
                <div>Home/End Primeira/Última instrução</div>
                <div>Space Centralizar no mapa</div>
                <div>H Ocultar/Mostrar ajuda</div>
                <div>Esc Sair da navegação</div>
            </div>
            
            <div class="current-point-info" id="current-point-info" style="display: none;">
                <div id="point-details"></div>
            </div>
            
            <div class="stats">
                <div class="stat-item">
                    <span class="stat-label">�️ Distância Total:</span>
                    <span class="stat-value">${optimizedRouteData.matchings ? 
                      formatDistance(optimizedRouteData.matchings.reduce((sum, m) => sum + m.distance, 0)) : '0'}</span>
                </div>
                <div class="stat-item">
                    <span class="stat-label">⏱️ Tempo de Coleta:</span>
                    <span class="stat-value">${optimizedRouteData.matchings ? 
                      formatDuration(optimizedRouteData.matchings.reduce((sum, m) => sum + m.distance, 0) / 1000 * 3.6) : '0'}</span>
                </div>
                ${routeInfo ? `
                <div class="stat-item">
                    <span class="stat-label">� Nome:</span>
                    <span class="stat-value">${routeInfo.nome}</span>
                </div>
                <div class="stat-item">
                    <span class="stat-label">📅 Frequência:</span>
                    <span class="stat-value">${routeInfo.frequencia}</span>
                </div>
                <div class="stat-item">
                    <span class="stat-label">🕐 Turno:</span>
                    <span class="stat-value">${routeInfo.turno}</span>
                </div>
                ` : `
                <div class="stat-item">
                    <span class="stat-label">📍 Pontos Originais:</span>
                    <span class="stat-value">${originalPoints.length}</span>
                </div>
                `}
            </div>
            
            <div class="directions-section">
                <div class="directions-title">Direções Passo a Passo</div>
                <table class="directions-table">
                    <thead>
                        <tr>
                            <th style="width: 40px;">#</th>
                            <th style="width: 30px;">↻</th>
                            <th>Instrução</th>
                            <th style="width: 70px;">Distância</th>
                        </tr>
                    </thead>
                    <tbody>
                        ${directionsHTML}
                    </tbody>
                </table>
            </div>
        </div>
    </div>

    <script src="https://unpkg.com/leaflet@1.9.4/dist/leaflet.js"></script>
    <script>
        // Inicializar mapa
        const map = L.map('map').setView([${centerLat}, ${centerLng}], 13);
        
        // Adicionar tiles
        L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
            attribution: '© OpenStreetMap contributors'
        }).addTo(map);
        
        // Obter pontos originais e instruções processadas
        const originalPoints = ${JSON.stringify(originalPoints)};
        const processedInstructions = ${JSON.stringify(processedInstructions || [])};
        
        // Criar marcadores para as instruções processadas
        const instructionMarkers = [];
        
        // Adicionar marcadores apenas para início e fim dos pontos originais
        if (originalPoints.length > 0) {
            // Ponto de início (verde)
            const startPoint = originalPoints[0];
            const startMarker = L.marker([startPoint.lat, startPoint.lng], {
                icon: L.divIcon({
                    html: '<div style="background: #10b981; color: white; border-radius: 50%; width: 30px; height: 30px; display: flex; align-items: center; justify-content: center; font-weight: bold; font-size: 14px; border: 3px solid white; box-shadow: 0 2px 4px rgba(0,0,0,0.3);">S</div>',
                    className: 'start-marker',
                    iconSize: [30, 30],
                    iconAnchor: [15, 15]
                })
            }).addTo(map);
            startMarker.bindPopup(\`<b>🟢 Início</b><br>\${startPoint.name || 'Ponto de partida'}<br>\${startPoint.lat.toFixed(6)}, \${startPoint.lng.toFixed(6)}\`);
            
            // Ponto de fim (vermelho) - apenas se houver mais de um ponto
            if (originalPoints.length > 1) {
                const endPoint = originalPoints[originalPoints.length - 1];
                const endMarker = L.marker([endPoint.lat, endPoint.lng], {
                    icon: L.divIcon({
                        html: '<div style="background: #ef4444; color: white; border-radius: 50%; width: 30px; height: 30px; display: flex; align-items: center; justify-content: center; font-weight: bold; font-size: 14px; border: 3px solid white; box-shadow: 0 2px 4px rgba(0,0,0,0.3);">F</div>',
                        className: 'end-marker',
                        iconSize: [30, 30],
                        iconAnchor: [15, 15]
                    })
                }).addTo(map);
                endMarker.bindPopup(\`<b>🔴 Fim</b><br>\${endPoint.name || 'Ponto de chegada'}<br>\${endPoint.lat.toFixed(6)}, \${endPoint.lng.toFixed(6)}\`);
            }
        }
        
        // Criar marcadores para as instruções/manobras
        processedInstructions.forEach((instruction, index) => {
            if (instruction.location) {
                const marker = L.marker([instruction.location.lat, instruction.location.lng], {
                    icon: L.divIcon({
                        html: \`<div style="background: #2563eb; color: white; border-radius: 50%; width: 25px; height: 25px; display: flex; align-items: center; justify-content: center; font-weight: bold; font-size: 12px; border: 2px solid white; box-shadow: 0 2px 4px rgba(0,0,0,0.3);">\${index + 1}</div>\`,
                        className: 'instruction-marker',
                        iconSize: [25, 25],
                        iconAnchor: [12, 12]
                    })
                }).addTo(map);
                
                marker.bindPopup(\`<b>📍 Passo \${index + 1}</b><br>\${instruction.instruction}<br><small>\${instruction.distance}</small>\`);
                instructionMarkers.push({ marker, instruction, index });
            }
        });
        
        // Variáveis para navegação por instruções
        let currentInstructionIndex = 0;
        let currentInstructionMarker = null;
        
        // Função para destacar instrução atual
        function highlightInstruction(index) {
            // Remover destaque anterior
            if (currentInstructionMarker) {
                const prevInstruction = instructionMarkers[currentInstructionIndex];
                if (prevInstruction) {
                    prevInstruction.marker.setIcon(L.divIcon({
                        html: \`<div style="background: #2563eb; color: white; border-radius: 50%; width: 25px; height: 25px; display: flex; align-items: center; justify-content: center; font-weight: bold; font-size: 12px; border: 2px solid white; box-shadow: 0 2px 4px rgba(0,0,0,0.3);">\${prevInstruction.index + 1}</div>\`,
                        className: 'instruction-marker',
                        iconSize: [25, 25],
                        iconAnchor: [12, 12]
                    }));
                }
            }
            
            // Validar índice
            currentInstructionIndex = Math.max(0, Math.min(index, instructionMarkers.length - 1));
            
            if (instructionMarkers[currentInstructionIndex]) {
                currentInstructionMarker = instructionMarkers[currentInstructionIndex].marker;
                const instruction = instructionMarkers[currentInstructionIndex].instruction;
                
                // Criar ícone destacado
                currentInstructionMarker.setIcon(L.divIcon({
                    html: \`<div style="background: #fbbf24; color: black; border-radius: 50%; width: 30px; height: 30px; display: flex; align-items: center; justify-content: center; font-weight: bold; font-size: 14px; border: 3px solid white; box-shadow: 0 3px 6px rgba(0,0,0,0.4); animation: pulse 1.5s infinite;">\${instruction.index + 1}</div>\`,
                    className: 'highlighted-instruction-marker',
                    iconSize: [30, 30],
                    iconAnchor: [15, 15]
                }));
                
                // Centralizar na instrução
                map.setView([instruction.location.lat, instruction.location.lng], Math.max(map.getZoom(), 16), { animate: true });
                
                // Mostrar informações da instrução
                const pointInfo = document.getElementById('current-point-info');
                const pointDetails = document.getElementById('point-details');
                pointDetails.innerHTML = \`
                    <div><strong>Passo \${instruction.index + 1} de \${processedInstructions.length}</strong></div>
                    <div>\${instruction.maneuverIcon} \${instruction.instruction}</div>
                    <div style="font-size: 0.8rem; color: #ccc;">Distância: \${instruction.distance}</div>
                    \${instruction.street ? \`<div style="font-size: 0.8rem; color: #ccc;">Rua: \${instruction.street}</div>\` : ''}
                \`;
                pointInfo.style.display = 'block';
                
                // Destacar linha correspondente na tabela
                document.querySelectorAll('.direction-row').forEach(row => row.classList.remove('highlighted'));
                const targetRow = document.querySelector(\`[data-step="\${instruction.index}"]\`);
                if (targetRow) {
                    targetRow.classList.add('highlighted');
                    targetRow.scrollIntoView({ behavior: 'smooth', block: 'center' });
                }
            }
        }
        
        // Event listeners para teclado
        document.addEventListener('keydown', function(e) {
            if (e.target.tagName === 'INPUT' || e.target.tagName === 'TEXTAREA') return;
            
            switch(e.key) {
                case 'ArrowLeft':
                case 'ArrowUp':
                    e.preventDefault();
                    highlightInstruction(currentInstructionIndex - 1);
                    break;
                case 'ArrowRight':
                case 'ArrowDown':
                    e.preventDefault();
                    highlightInstruction(currentInstructionIndex + 1);
                    break;
                case 'Home':
                    e.preventDefault();
                    highlightInstruction(0);
                    break;
                case 'End':
                    e.preventDefault();
                    highlightInstruction(instructionMarkers.length - 1);
                    break;
                case ' ': // Spacebar
                    e.preventDefault();
                    if (currentInstructionMarker) {
                        const instruction = instructionMarkers[currentInstructionIndex];
                        map.setView([instruction.location.lat, instruction.location.lng], 16, { animate: true });
                    }
                    break;
                case 'h':
                case 'H':
                    e.preventDefault();
                    const helpBox = document.querySelector('.keyboard-help');
                    helpBox.style.display = helpBox.style.display === 'none' ? 'block' : 'none';
                    break;
                case 'Escape':
                    e.preventDefault();
                    // Esconder informações da instrução
                    document.getElementById('current-point-info').style.display = 'none';
                    // Remover destaque
                    if (currentInstructionMarker) {
                        const currentInstruction = instructionMarkers[currentInstructionIndex];
                        if (currentInstruction) {
                            currentInstruction.marker.setIcon(L.divIcon({
                                html: \`<div style="background: #2563eb; color: white; border-radius: 50%; width: 25px; height: 25px; display: flex; align-items: center; justify-content: center; font-weight: bold; font-size: 12px; border: 2px solid white; box-shadow: 0 2px 4px rgba(0,0,0,0.3);">\${currentInstruction.index + 1}</div>\`,
                                className: 'instruction-marker',
                                iconSize: [25, 25],
                                iconAnchor: [12, 12]
                            }));
                        }
                        currentInstructionMarker = null;
                    }
                    document.querySelectorAll('.direction-row').forEach(row => row.classList.remove('highlighted'));
                    break;
            }
        });
        
        // Inicializar com a primeira instrução destacada
        if (instructionMarkers.length > 0) {
            setTimeout(() => highlightInstruction(0), 500);
        }
        
        // Adicionar rota
        const routeCoords = ${routeCoordinates || '[]'};
        if (routeCoords.length > 0) {
            const routePolyline = L.polyline(routeCoords, {
                color: '#2563eb',
                weight: 4,
                opacity: 0.8
            }).addTo(map);
            
            // Ajustar visualização para incluir toda a rota e todos os marcadores
            const allElements = [routePolyline, ...pointMarkers.map(pm => pm.marker)];
            const group = new L.featureGroup(allElements);
            map.fitBounds(group.getBounds().pad(0.1));
        } else {
            // Se não há rota, ajustar para incluir todos os pontos
            if (pointMarkers.length > 0) {
                const group = new L.featureGroup(pointMarkers.map(pm => pm.marker));
                map.fitBounds(group.getBounds().pad(0.1));
            } else {
                map.setView([${centerLat}, ${centerLng}], 13);
            }
        }
    </script>
</body>
</html>`;

  return html;
};

// Função para fazer download de arquivo
export const downloadFile = (content: string, filename: string, contentType: string) => {
  const blob = new Blob([content], { type: contentType });
  const url = window.URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = url;
  link.download = filename;
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
  window.URL.revokeObjectURL(url);
};

// Função para fazer download de blob (para PDF e Word)
export const downloadBlob = (blob: Blob, filename: string) => {
  const url = window.URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = url;
  link.download = filename;
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
  window.URL.revokeObjectURL(url);
};

// Função para criar mapa temporário para captura
const createTempMapElement = (optimizedRouteData: OSRMResponse, originalPoints: KMLPoint[]): Promise<HTMLElement> => {
  return new Promise((resolve) => {
    // Criar elemento temporário para o mapa
    const tempContainer = document.createElement('div');
    tempContainer.style.width = '800px';
    tempContainer.style.height = '600px';
    tempContainer.style.position = 'absolute';
    tempContainer.style.top = '-9999px';
    tempContainer.style.left = '-9999px';
    document.body.appendChild(tempContainer);

    const mapDiv = document.createElement('div');
    mapDiv.style.width = '100%';
    mapDiv.style.height = '100%';
    tempContainer.appendChild(mapDiv);

    // Criar mapa temporário
    const L = (window as any).L;
    if (!L) {
      console.error('Leaflet não está carregado');
      resolve(tempContainer);
      return;
    }

    const centerLat = originalPoints.length > 0 ? 
      originalPoints.reduce((sum, p) => sum + p.lat, 0) / originalPoints.length : -27.0721;
    const centerLng = originalPoints.length > 0 ? 
      originalPoints.reduce((sum, p) => sum + p.lng, 0) / originalPoints.length : -52.6183;

    const tempMap = L.map(mapDiv).setView([centerLat, centerLng], 13);
    
    L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
      attribution: '© OpenStreetMap contributors'
    }).addTo(tempMap);

    // Adicionar pontos de início e fim
    if (originalPoints.length > 0) {
      const startPoint = originalPoints[0];
      L.marker([startPoint.lat, startPoint.lng], {
        icon: L.divIcon({
          html: '<div style="background: #10b981; color: white; border-radius: 50%; width: 30px; height: 30px; display: flex; align-items: center; justify-content: center; font-weight: bold; font-size: 14px; border: 3px solid white; box-shadow: 0 2px 4px rgba(0,0,0,0.3);">S</div>',
          className: 'start-marker',
          iconSize: [30, 30],
          iconAnchor: [15, 15]
        })
      }).addTo(tempMap);
      
      if (originalPoints.length > 1) {
        const endPoint = originalPoints[originalPoints.length - 1];
        L.marker([endPoint.lat, endPoint.lng], {
          icon: L.divIcon({
            html: '<div style="background: #ef4444; color: white; border-radius: 50%; width: 30px; height: 30px; display: flex; align-items: center; justify-content: center; font-weight: bold; font-size: 14px; border: 3px solid white; box-shadow: 0 2px 4px rgba(0,0,0,0.3);">F</div>',
            className: 'end-marker',
            iconSize: [30, 30],
            iconAnchor: [15, 15]
          })
        }).addTo(tempMap);
      }
    }

    // Adicionar rota
    if (optimizedRouteData.matchings && optimizedRouteData.matchings.length > 0) {
      const allCoords: number[][] = [];
      optimizedRouteData.matchings.forEach(matching => {
        const geometry = matching.geometry as any;
        if (geometry && geometry.coordinates) {
          allCoords.push(...geometry.coordinates);
        }
      });
      
      if (allCoords.length > 0) {
        const routeCoords = allCoords.map(coord => [coord[1], coord[0]]);
        const routePolyline = L.polyline(routeCoords, {
          color: '#2563eb',
          weight: 4,
          opacity: 0.8
        }).addTo(tempMap);
        
        tempMap.fitBounds(routePolyline.getBounds().pad(0.1));
      }
    }

    // Aguardar renderização do mapa
    setTimeout(() => {
      resolve(tempContainer);
    }, 2000);
  });
};

// Função para gerar PDF
export const generatePDF = async (optimizedRouteData: OSRMResponse, originalPoints: KMLPoint[], routeInfo?: RouteInfo | null): Promise<void> => {
  try {
    const pdf = new jsPDF('p', 'mm', 'a4');
    const pageWidth = pdf.internal.pageSize.getWidth();
    const pageHeight = pdf.internal.pageSize.getHeight();
    const margin = 20;
    
    // Título
    pdf.setFontSize(20);
    pdf.setFont('helvetica', 'bold');
    pdf.text('Relatório de Rota - KML Eagle', margin, 30);
    
    // Data/hora
    pdf.setFontSize(10);
    pdf.setFont('helvetica', 'normal');
    pdf.text(`Gerado em: ${new Date().toLocaleString('pt-BR')}`, margin, 40);
    
    // Estatísticas
    pdf.setFontSize(14);
    pdf.setFont('helvetica', 'bold');
    pdf.text('Resumo da Rota', margin, 55);
    
    pdf.setFontSize(11);
    pdf.setFont('helvetica', 'normal');
    let yPos = 65;
    
    const stats = [];
    
    // Adicionar distância primeiro
    stats.push(`Distância Total: ${optimizedRouteData.matchings ? 
      formatDistance(optimizedRouteData.matchings.reduce((sum, m) => sum + m.distance, 0)) : '0'}`);
    
    // Adicionar tempo de coleta
    stats.push(`Tempo de Coleta: ${optimizedRouteData.matchings ? 
      formatDuration(optimizedRouteData.matchings.reduce((sum, m) => sum + m.distance, 0) / 1000 * 3.6) : '0'}`);
    
    // Adicionar informações da rota se disponíveis
    if (routeInfo) {
      stats.push(`Nome: ${routeInfo.nome}`);
      stats.push(`Frequência: ${routeInfo.frequencia}`);
      stats.push(`Turno: ${routeInfo.turno}`);
    } else {
      stats.push(`Pontos Originais: ${originalPoints.length}`);
    }
    
    stats.forEach(stat => {
      pdf.text(stat, margin, yPos);
      yPos += 8;
    });
    
    // Capturar mapa
    try {
      const tempContainer = await createTempMapElement(optimizedRouteData, originalPoints);
      const canvas = await html2canvas(tempContainer.querySelector('div')!);
      document.body.removeChild(tempContainer);
      
      const imgData = canvas.toDataURL('image/png');
      const imgWidth = pageWidth - (margin * 2);
      const imgHeight = (canvas.height * imgWidth) / canvas.width;
      
      if (yPos + imgHeight > pageHeight - margin) {
        pdf.addPage();
        yPos = margin;
      }
      
      pdf.addImage(imgData, 'PNG', margin, yPos, imgWidth, imgHeight);
      yPos += imgHeight + 10;
    } catch (error) {
      console.error('Erro ao capturar mapa:', error);
      pdf.text('Erro ao gerar mapa', margin, yPos);
      yPos += 10;
    }
    
    // Direções
    if (yPos > pageHeight - 50) {
      pdf.addPage();
      yPos = margin;
    }
    
    pdf.setFontSize(14);
    pdf.setFont('helvetica', 'bold');
    pdf.text('Direções Passo a Passo', margin, yPos);
    yPos += 15;
    
    if (optimizedRouteData.matchings && optimizedRouteData.matchings.length > 0) {
      const matching = optimizedRouteData.matchings[0];
      const legs = matching.legs || [];
      const allSteps = legs.flatMap(leg => leg.steps || []);
      const filteredSteps = allSteps.filter(step => 
        step.distance >= 5 && step.name && step.name.trim() !== ''
      );
      const consolidatedSteps = consolidateConsecutiveStreets(filteredSteps);
      
      pdf.setFontSize(10);
      pdf.setFont('helvetica', 'normal');
      
      consolidatedSteps.forEach((step, index) => {
        if (yPos > pageHeight - 30) {
          pdf.addPage();
          yPos = margin;
        }
        
        let instruction = getManeuverInstruction(step.maneuver);
        if (step.name && step.name !== step.maneuver?.modifier) {
          instruction += ` em direção à ${step.name}`;
        }
        
        const distance = formatDistance(step.distance);
        const text = `${index + 1}. ${instruction} - ${distance}`;
        
        const lines = pdf.splitTextToSize(text, pageWidth - (margin * 2));
        pdf.text(lines, margin, yPos);
        yPos += lines.length * 5 + 3;
        
        if (step.originalSteps.length > 1) {
          pdf.setFontSize(8);
          pdf.setTextColor(100, 100, 100);
          // pdf.text(`   (${step.originalSteps.length} segmentos consolidados)`, margin, yPos);
          yPos += 5;
          pdf.setFontSize(10);
          pdf.setTextColor(0, 0, 0);
        }
      });
    }
    
    // Download do PDF
    const fileName = routeInfo?.nome ? 
      `${routeInfo.nome.replace(/[<>:"/\\|?*]/g, '_')}_relatorio.pdf` : 
      `relatorio_rota_${new Date().toISOString().slice(0, 16).replace('T', '_').replace(':', '-')}.pdf`;
    pdf.save(fileName);
    
  } catch (error) {
    console.error('Erro ao gerar PDF:', error);
    throw new Error('Falha ao gerar arquivo PDF');
  }
};

// Função para gerar Word
export const generateWord = async (optimizedRouteData: OSRMResponse, originalPoints: KMLPoint[], routeInfo?: RouteInfo | null): Promise<void> => {
  try {
    // Coletar direções para a tabela
    let tableRows: TableRow[] = [];
    
    if (optimizedRouteData.matchings && optimizedRouteData.matchings.length > 0) {
      const matching = optimizedRouteData.matchings[0];
      const legs = matching.legs || [];
      const allSteps = legs.flatMap(leg => leg.steps || []);
      const filteredSteps = allSteps.filter(step => 
        step.distance >= 5 && step.name && step.name.trim() !== ''
      );
      const consolidatedSteps = consolidateConsecutiveStreets(filteredSteps);
      
      // Criar cabeçalho da tabela
      const headerRow = new TableRow({
        children: [
          new TableCell({
            children: [new Paragraph({ 
              children: [new TextRun({ text: "Passo", bold: true })],
              alignment: "center"
            })],
            width: { size: 8, type: WidthType.PERCENTAGE },
            shading: { fill: "E5E7EB" },
          }),
          new TableCell({
            children: [new Paragraph({ 
              children: [new TextRun({ text: "Instrução", bold: true })],
              alignment: "center"
            })],
            width: { size: 52, type: WidthType.PERCENTAGE },
            shading: { fill: "E5E7EB" },
          }),
          new TableCell({
            children: [new Paragraph({ 
              children: [new TextRun({ text: "Rua/Estrada", bold: true })],
              alignment: "center"
            })],
            width: { size: 28, type: WidthType.PERCENTAGE },
            shading: { fill: "E5E7EB" },
          }),
          new TableCell({
            children: [new Paragraph({ 
              children: [new TextRun({ text: "Distância (m)", bold: true })],
              alignment: "center"
            })],
            width: { size: 12, type: WidthType.PERCENTAGE },
            shading: { fill: "E5E7EB" },
          }),
        ],
      });
      
      tableRows.push(headerRow);
      
      // Adicionar linhas de dados
      consolidatedSteps.forEach((step, index) => {
        const instruction = getManeuverInstruction(step.maneuver);
        const street = step.name && step.name.trim() !== '' ? step.name : '-';
        const distanceInMeters = Math.round(step.distance);
        
        const dataRow = new TableRow({
          children: [
            new TableCell({
              children: [new Paragraph({ 
                children: [new TextRun({ text: (index + 1).toString() })],
                alignment: "center"
              })],
            }),
            new TableCell({
              children: [new Paragraph({ children: [new TextRun({ text: instruction })] })],
            }),
            new TableCell({
              children: [new Paragraph({ children: [new TextRun({ text: street })] })],
            }),
            new TableCell({
              children: [new Paragraph({ 
                children: [new TextRun({ text: distanceInMeters.toString() })],
                alignment: "center"
              })],
            }),
          ],
        });
        
        tableRows.push(dataRow);
      });
    }

    // Determinar título baseado no nome do setor
    const reportTitle = routeInfo?.nome ? 
      `Relatório de Rota - ${routeInfo.nome}` : 
      'Relatório de Rota - KML Eagle';

    const doc = new Document({
      sections: [{
        properties: {},
        children: [
          // Título personalizado com nome do setor
          new Paragraph({
            text: reportTitle,
            heading: HeadingLevel.TITLE,
          }),
          
          // Data/hora
          new Paragraph({
            children: [
              new TextRun({
                text: `Gerado em: ${new Date().toLocaleString('pt-BR')}`,
                size: 20,
                color: "666666",
              }),
            ],
          }),
          
          new Paragraph({ text: "" }), // Linha em branco
          
          // Resumo da Rota
          new Paragraph({
            text: "Resumo da Rota",
            heading: HeadingLevel.HEADING_1,
          }),
          
          new Paragraph({
            children: [
              new TextRun({ text: `Distância Total: `, bold: true }),
              new TextRun({ 
                text: optimizedRouteData.matchings ? 
                  formatDistance(optimizedRouteData.matchings.reduce((sum, m) => sum + m.distance, 0)) : '0'
              }),
            ],
          }),
          
          new Paragraph({
            children: [
              new TextRun({ text: `Tempo de Coleta: `, bold: true }),
              new TextRun({ 
                text: optimizedRouteData.matchings ? 
                  formatDuration(optimizedRouteData.matchings.reduce((sum, m) => sum + m.distance, 0) / 1000 * 3.6) : '0'
              }),
            ],
          }),
          
          ...(routeInfo ? [
            new Paragraph({
              children: [
                new TextRun({ text: `Nome: `, bold: true }),
                new TextRun({ text: routeInfo.nome }),
              ],
            }),
            
            new Paragraph({
              children: [
                new TextRun({ text: `Frequência: `, bold: true }),
                new TextRun({ text: routeInfo.frequencia }),
              ],
            }),
            
            new Paragraph({
              children: [
                new TextRun({ text: `Turno: `, bold: true }),
                new TextRun({ text: routeInfo.turno }),
              ],
            }),
          ] : [
            new Paragraph({
              children: [
                new TextRun({ text: `Pontos Originais: `, bold: true }),
                new TextRun({ text: `${originalPoints.length}` }),
              ],
            }),
          ]),
          
          new Paragraph({ text: "" }), // Linha em branco
          
          // Direções em formato de tabela
          new Paragraph({
            text: "Direções Passo a Passo",
            heading: HeadingLevel.HEADING_1,
          }),
          
          new Paragraph({ text: "" }), // Linha em branco
          
          // Tabela de direções
          new Table({
            rows: tableRows,
            width: {
              size: 100,
              type: WidthType.PERCENTAGE,
            },
          }),
        ],
      }],
    });
    
    // Gerar e baixar arquivo
    const buffer = await Packer.toBlob(doc);
    const fileName = routeInfo?.nome ? 
      `${routeInfo.nome.replace(/[<>:"/\\|?*]/g, '_')}_relatorio.docx` : 
      `relatorio_rota_${new Date().toISOString().slice(0, 16).replace('T', '_').replace(':', '-')}.docx`;
    downloadBlob(buffer, fileName);
    
  } catch (error) {
    console.error('Erro ao gerar Word:', error);
    throw new Error('Falha ao gerar arquivo Word');
  }
};
