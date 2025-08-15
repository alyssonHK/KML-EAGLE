

import { KMLPoint, Direction, OSRMResponse, ProcessRouteResult } from '../types';
import { GeoJsonObject } from 'geojson';

const OSRM_BASE_URL = 'https://router.project-osrm.org';
const MAX_COORDINATES_MATCH = 100; // Para match API
const MAX_COORDINATES_ROUTE = 25; // Para route API (limite menor)

// Validar se uma coordenada é válida
const isValidCoordinate = (coord: KMLPoint): boolean => {
  return (
    typeof coord.lat === 'number' &&
    typeof coord.lng === 'number' &&
    coord.lat >= -90 && coord.lat <= 90 &&
    coord.lng >= -180 && coord.lng <= 180 &&
    !isNaN(coord.lat) && !isNaN(coord.lng)
  );
};

// Calcular distância entre duas coordenadas em metros usando fórmula haversine
const getDistance = (coord1: KMLPoint, coord2: KMLPoint): number => {
  const R = 6371e3; // Raio da Terra em metros
  const φ1 = coord1.lat * Math.PI / 180;
  const φ2 = coord2.lat * Math.PI / 180;
  const Δφ = (coord2.lat - coord1.lat) * Math.PI / 180;
  const Δλ = (coord2.lng - coord1.lng) * Math.PI / 180;

  const a = Math.sin(Δφ/2) * Math.sin(Δφ/2) +
          Math.cos(φ1) * Math.cos(φ2) *
          Math.sin(Δλ/2) * Math.sin(Δλ/2);
  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1-a));

  return R * c; // Distância em metros
};

// Ordenar pontos usando algoritmo do vizinho mais próximo APENAS quando há lacunas grandes
const optimizePointOrderConservative = (points: KMLPoint[]): KMLPoint[] => {
  if (points.length <= 2) return points;
  
  // Primeiro verificar se realmente há problema de lacunas grandes
  const maxGapDistance = 50000; // 50km
  let hasLargeGap = false;
  
  for (let i = 1; i < points.length; i++) {
    const distance = getDistance(points[i-1], points[i]);
    if (distance > maxGapDistance) {
      hasLargeGap = true;
      break;
    }
  }
  
  // Se não há lacunas grandes, manter ordem original
  if (!hasLargeGap) {
    console.log('Mantendo ordem original - sem lacunas grandes detectadas');
    return points;
  }
  
  console.log('Lacunas grandes detectadas - otimizando ordem conservativamente');
  
  // Fazer otimização mais conservativa - apenas para pontos problemáticos
  const optimized: KMLPoint[] = [points[0]]; // Sempre começar com o primeiro
  const remaining = [...points.slice(1)];
  
  for (let i = 0; i < points.length - 1 && remaining.length > 0; i++) {
    const current = optimized[optimized.length - 1];
    
    // Encontrar o próximo ponto mais próximo, mas dar preferência à ordem original
    let bestIndex = 0;
    let bestDistance = getDistance(current, remaining[0]);
    
    // Se o primeiro ponto da sequência original está razoavelmente próximo, usá-lo
    if (bestDistance < maxGapDistance * 0.5) { // Se está dentro de 25km, manter ordem
      optimized.push(remaining.shift()!);
      continue;
    }
    
    // Caso contrário, procurar o mais próximo
    for (let j = 1; j < remaining.length; j++) {
      const distance = getDistance(current, remaining[j]);
      if (distance < bestDistance) {
        bestDistance = distance;
        bestIndex = j;
      }
    }
    
    optimized.push(remaining.splice(bestIndex, 1)[0]);
  }
  
  return optimized;
};

// Detectar e corrigir grandes lacunas na rota (versão mais conservativa)
const detectAndFixGapsConservative = (points: KMLPoint[]): KMLPoint[] => {
  if (points.length <= 2) return points;
  
  const maxGapDistance = 100000; // 100km - apenas para lacunas muito grandes
  const corrected: KMLPoint[] = [];
  
  for (let i = 0; i < points.length; i++) {
    corrected.push(points[i]);
    
    // Verificar se há uma lacuna muito grande para o próximo ponto
    if (i < points.length - 1) {
      const distance = getDistance(points[i], points[i + 1]);
      
      if (distance > maxGapDistance) {
        console.warn(`Lacuna muito grande detectada: ${(distance/1000).toFixed(2)}km entre pontos ${i} e ${i+1}`);
        // Por enquanto, apenas logar. Não fazer alterações drásticas na ordem
      }
    }
  }
  
  return corrected;
};

// Simplificar coordenadas removendo pontos muito próximos (mais conservativo)
const simplifyCoordinates = (coordinates: KMLPoint[], minDistance: number = 5): KMLPoint[] => {
  if (coordinates.length <= 2) return coordinates;
  
  // Primeiro, filtrar coordenadas inválidas
  const validCoords = coordinates.filter(isValidCoordinate);
  if (validCoords.length <= 2) return validCoords;
  
  const simplified: KMLPoint[] = [validCoords[0]]; // Sempre manter o primeiro ponto
  
  for (let i = 1; i < validCoords.length - 1; i++) {
    const lastKept = simplified[simplified.length - 1];
    const current = validCoords[i];
    
    // Usar distância menor (5m) para ser mais conservativo
    if (getDistance(lastKept, current) >= minDistance) {
      simplified.push(current);
    }
  }
  
  // Sempre manter o último ponto
  simplified.push(validCoords[validCoords.length - 1]);
  
  return simplified;
};

// Dividir coordenadas em chunks com sobreposição
const splitCoordinates = (coordinates: KMLPoint[], maxPoints: number): KMLPoint[][] => {
  if (coordinates.length <= maxPoints) return [coordinates];
  
  const chunks: KMLPoint[][] = [];
  let startIndex = 0;
  
  while (startIndex < coordinates.length) {
    const endIndex = Math.min(startIndex + maxPoints, coordinates.length);
    const chunk = coordinates.slice(startIndex, endIndex);
    chunks.push(chunk);
    
    // Mover índice inicial, mas sobrepor 1 ponto para continuidade
    startIndex = endIndex - 1;
    
    // Se estamos no final, sair para evitar loop infinito
    if (endIndex === coordinates.length) break;
  }
  
  return chunks;
};

// Processar usando Route API para criar rota contínua
const processRouteAPI = async (coordinates: KMLPoint[]): Promise<any> => {
  const validCoords = coordinates.filter(isValidCoordinate);
  if (validCoords.length < 2) {
    throw new Error('Route não possui coordenadas válidas suficientes');
  }
  
  // Route API usa longitude,latitude
  const coords = validCoords.map(c => `${c.lng},${c.lat}`).join(';');
  const url = `${OSRM_BASE_URL}/route/v1/driving/${coords}?steps=true&geometries=geojson&overview=full&continue_straight=false`;
  
  console.log(`Route URL length: ${url.length}, Coordinates: ${validCoords.length}`);
  
  const response = await fetch(url);
  if (!response.ok) {
    const errorText = await response.text().catch(() => 'Erro desconhecido');
    console.error(`OSRM Route Error ${response.status}:`, errorText);
    throw new Error(`Falha ao conectar ao serviço OSRM Route. Status: ${response.status}`);
  }
  
  const data = await response.json();
  if (data.code !== 'Ok') {
    console.error('OSRM Route Response:', data);
    throw new Error(`O OSRM Route não conseguiu processar a rota: ${data.code} - ${data.message || 'Erro desconhecido'}`);
  }
  
  if (!data.routes || data.routes.length === 0) {
    throw new Error('OSRM Route API retornou OK mas nenhuma rota foi encontrada.');
  }
  
  // Converter resposta de route para formato compatível com match
  const route = data.routes[0];
  return {
    code: 'Ok',
    matchings: [{
      confidence: 1.0,
      distance: route.distance,
      duration: route.duration,
      geometry: route.geometry,
      legs: route.legs,
      weight: route.duration,
      weight_name: 'duration'
    }],
    tracepoints: []
  };
};

// Processar um único chunk de coordenadas usando match
const processChunk = async (coordinates: KMLPoint[]): Promise<any> => {
  // Validar todas as coordenadas antes de enviar
  const validCoords = coordinates.filter(isValidCoordinate);
  if (validCoords.length < 2) {
    throw new Error('Chunk não possui coordenadas válidas suficientes');
  }
  
  // OSRM match espera longitude,latitude (igual ao projeto de referência)
  const coords = validCoords.map(c => `${c.lng},${c.lat}`).join(';');
  const url = `${OSRM_BASE_URL}/match/v1/driving/${coords}?steps=true&geometries=geojson&overview=full&annotations=true&gaps=ignore`;
  
  console.log(`Match URL length: ${url.length}, Coordinates: ${validCoords.length}`);
  
  const response = await fetch(url);
  if (!response.ok) {
    const errorText = await response.text().catch(() => 'Erro desconhecido');
    console.error(`OSRM Match Error ${response.status}:`, errorText);
    throw new Error(`Falha ao conectar ao serviço OSRM Match. Status: ${response.status}`);
  }
  
  const data = await response.json();
  if (data.code !== 'Ok') {
    console.error('OSRM Match Response:', data);
    throw new Error(`O OSRM Match não conseguiu processar a rota: ${data.code} - ${data.message || 'Erro desconhecido'}`);
  }
  
  if (!data.matchings || data.matchings.length === 0) {
    throw new Error('OSRM Match API retornou OK mas nenhuma correspondência de rota foi encontrada.');
  }
  
  return data;
};

// Combinar múltiplas respostas OSRM match em uma
const combineOSRMResponses = (responses: any[]): any => {
  if (responses.length === 1) return responses[0];
  
  const combined: any = {
    code: 'Ok',
    matchings: [],
    tracepoints: []
  };
  
  let totalDistance = 0;
  let totalDuration = 0;
  const allCoordinates: [number, number][] = [];
  const allSteps: any[] = [];
  
  responses.forEach((response, index) => {
    const matching = response.matchings[0];
    totalDistance += matching.distance;
    totalDuration += matching.duration;
    
    // Combinar coordenadas (evitando duplicatas nas fronteiras dos chunks)
    const coords = matching.geometry.coordinates;
    if (index === 0) {
      allCoordinates.push(...coords);
    } else {
      // Pular primeira coordenada para evitar duplicação
      allCoordinates.push(...coords.slice(1));
    }
    
    // Combinar steps de todas as legs
    if (matching.legs) {
      matching.legs.forEach((leg: any) => {
        if (leg.steps) {
          allSteps.push(...leg.steps);
        }
      });
    }
    
    // Adicionar tracepoints
    if (response.tracepoints) {
      combined.tracepoints.push(...response.tracepoints);
    }
  });
  
  // Criar uma leg combinada com todos os steps
  const combinedLeg = {
    steps: allSteps,
    summary: '',
    weight: totalDuration,
    duration: totalDuration,
    distance: totalDistance
  };
  
  // Criar matching combinado
  const combinedMatching = {
    confidence: responses[0].matchings[0].confidence,
    distance: totalDistance,
    duration: totalDuration,
    geometry: {
      coordinates: allCoordinates,
      type: 'LineString'
    },
    legs: [combinedLeg],
    weight: totalDuration,
    weight_name: 'duration'
  };
  
  combined.matchings = [combinedMatching];
  
  return combined;
};

export const processRoute = async (points: KMLPoint[]): Promise<ProcessRouteResult> => {
  if (points.length < 2) {
    throw new Error('Não é possível processar uma rota com menos de 2 pontos.');
  }

  const originalCount = points.length;
  console.log(`Iniciando processamento com ${originalCount} pontos originais`);
  
  // Etapa 1: Otimizar ordem dos pontos APENAS se necessário
  console.log('Verificando necessidade de otimização...');
  let processedCoords = optimizePointOrderConservative(points);
  
  // Etapa 2: Detectar grandes lacunas (modo conservativo)
  console.log('Verificando lacunas...');
  processedCoords = detectAndFixGapsConservative(processedCoords);
  
  // Etapa 3: Simplificar coordenadas removendo pontos muito próximos (mais conservativo)
  console.log('Simplificando coordenadas...');
  processedCoords = simplifyCoordinates(processedCoords, 5);
  
  const processedCount = processedCoords.length;
  console.log(`Coordenadas originais: ${originalCount}, Processadas: ${processedCount}`);

  if (processedCoords.length < 2) {
    throw new Error('Após simplificação, restaram menos de 2 pontos únicos.');
  }

  try {
    // Decidir qual API usar baseado no número de pontos
    let routeResponse: any;
    
    if (processedCoords.length <= MAX_COORDINATES_ROUTE) {
      // Para poucos pontos, usar Route API que cria rota contínua
      console.log(`Usando Route API para ${processedCoords.length} pontos`);
      routeResponse = await processRouteAPI(processedCoords);
    } else if (processedCoords.length <= MAX_COORDINATES_MATCH) {
      // Para pontos moderados, usar Match API
      console.log(`Usando Match API para ${processedCoords.length} pontos`);
      routeResponse = await processChunk(processedCoords);
    } else {
      // Para muitos pontos, dividir em chunks menores usando Route API
      const chunks = splitCoordinates(processedCoords, MAX_COORDINATES_ROUTE);
      console.log(`Dividindo em ${chunks.length} segmentos para route (rota contínua)`);
      
      const chunkResponses: any[] = [];
      for (let i = 0; i < chunks.length; i++) {
        console.log(`Processando segmento ${i + 1}/${chunks.length} com ${chunks[i].length} coordenadas`);
        
        try {
          const chunkResponse = await processRouteAPI(chunks[i]);
          chunkResponses.push(chunkResponse);
        } catch (error) {
          console.error(`Erro no chunk ${i + 1}:`, error);
          // Pular chunks que falham e continuar com os outros
          continue;
        }
      }
      
      if (chunkResponses.length === 0) {
        throw new Error('Nenhum chunk foi processado com sucesso');
      }
      
      routeResponse = combineOSRMResponses(chunkResponses);
    }

    if (!routeResponse.matchings || routeResponse.matchings.length === 0) {
      throw new Error('O OSRM não retornou uma correspondência de rota.');
    }

    // Extrair geometria e instruções do resultado
    const routeGeometry: GeoJsonObject = routeResponse.matchings[0].geometry;
    const steps = routeResponse.matchings[0].legs.flatMap((leg: any) => leg.steps);
    const directions: Direction[] = steps.map((step: any) => ({
      text: step.maneuver.instruction,
      distance: `${(step.distance / 1000).toFixed(2)} km`,
      duration: `${Math.round(step.duration / 60)} min`,
    }));
    
    // Adicionar instrução final
    if (directions.length > 0) {
      directions.push({
        text: 'Você chegou ao seu destino',
        distance: '0 m',
        duration: '0 min',
      });
    }

    console.log(`Rota processada com sucesso: ${directions.length} direções`);

    return {
      response: routeResponse,
      routeGeometry,
      directions,
      info: `${processedCount} pontos processados (${originalCount - processedCount} pontos removidos) - Rota contínua`
    };

  } catch (error) {
    if (error instanceof Error) {
      throw new Error(`Falha ao processar rota: ${error.message}`);
    }
    throw new Error('Erro desconhecido ao processar rota.');
  }
};
