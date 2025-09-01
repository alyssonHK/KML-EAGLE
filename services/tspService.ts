import { KMLPoint, TSPSolution, TSPConfig } from '../types';

// Interface para grupo de pontos próximos
interface CollectionArea {
  id: string;
  representative: KMLPoint; // Ponto representativo do grupo
  members: KMLPoint[]; // Todos os pontos neste grupo
  centerLat: number;
  centerLng: number;
  radius: number; // Raio máximo do grupo em metros
}

// Agrupar pontos próximos em áreas de coleta
const createCollectionAreas = (points: KMLPoint[], maxRadius: number = 20): CollectionArea[] => {
  const areas: CollectionArea[] = [];
  const processedPoints = new Set<string>();
  
  console.log(`Agrupando pontos em áreas de coleta (raio máximo: ${maxRadius}m)...`);
  
  for (let i = 0; i < points.length; i++) {
    const point = points[i];
    
    // Se o ponto já foi processado, pular
    if (processedPoints.has(point.id)) continue;
    
    // Criar nova área de coleta
    const area: CollectionArea = {
      id: `area-${areas.length + 1}`,
      representative: { ...point }, // Inicialmente, o próprio ponto é o representativo
      members: [point],
      centerLat: point.lat,
      centerLng: point.lng,
      radius: 0
    };
    
    processedPoints.add(point.id);
    
    // Procurar pontos próximos para adicionar a esta área
    for (let j = i + 1; j < points.length; j++) {
      const candidatePoint = points[j];
      
      // Se já foi processado, pular
      if (processedPoints.has(candidatePoint.id)) continue;
      
      const distanceToCenter = calculateDistance(
        { ...candidatePoint, id: '', name: '' },
        { lat: area.centerLat, lng: area.centerLng, id: '', name: '' }
      );
      
      // Se está dentro do raio, adicionar à área
      if (distanceToCenter <= maxRadius) {
        area.members.push(candidatePoint);
        processedPoints.add(candidatePoint.id);
        
        // Recalcular centro da área (média ponderada)
        const totalLat = area.members.reduce((sum, p) => sum + p.lat, 0);
        const totalLng = area.members.reduce((sum, p) => sum + p.lng, 0);
        area.centerLat = totalLat / area.members.length;
        area.centerLng = totalLng / area.members.length;
        
        // Atualizar raio máximo da área
        area.radius = Math.max(area.radius, distanceToCenter);
      }
    }
    
    // Escolher melhor ponto representativo (mais próximo do centro)
    let bestRepresentative = area.members[0];
    let bestDistance = calculateDistance(
      bestRepresentative,
      { lat: area.centerLat, lng: area.centerLng, id: '', name: '' }
    );
    
    for (const member of area.members) {
      const distanceToCenter = calculateDistance(
        member,
        { lat: area.centerLat, lng: area.centerLng, id: '', name: '' }
      );
      
      if (distanceToCenter < bestDistance) {
        bestDistance = distanceToCenter;
        bestRepresentative = member;
      }
    }
    
    // Atualizar representativo com informações da área
    area.representative = {
      ...bestRepresentative,
      name: area.members.length > 1 
        ? `Área ${areas.length + 1} (${area.members.length} pontos)`
        : bestRepresentative.name
    };
    
    areas.push(area);
  }
  
  const totalPoints = points.length;
  const totalAreas = areas.length;
  const reduction = totalPoints - totalAreas;
  
  console.log(`Criadas ${totalAreas} áreas de coleta a partir de ${totalPoints} pontos (redução: ${reduction} pontos)`);
  
  // Log detalhado das áreas criadas
  areas.forEach((area, index) => {
    if (area.members.length > 1) {
      console.log(`  Área ${index + 1}: ${area.members.length} pontos, raio ${area.radius.toFixed(1)}m`);
    }
  });
  
  return areas;
};

// Reconstruir rota completa a partir da rota das áreas
const expandRouteWithAllPoints = (
  areasRoute: CollectionArea[],
  originalPoints: KMLPoint[]
): KMLPoint[] => {
  const expandedRoute: KMLPoint[] = [];
  
  console.log('Expandindo rota para incluir todos os pontos...');
  
  for (const area of areasRoute) {
    if (area.members.length === 1) {
      // Área com apenas um ponto
      expandedRoute.push(area.members[0]);
    } else {
      // Área com múltiplos pontos - ordenar por proximidade ao ponto anterior
      const lastPoint = expandedRoute.length > 0 
        ? expandedRoute[expandedRoute.length - 1]
        : area.members[0];
      
      // Ordenar membros da área por distância ao último ponto adicionado
      const sortedMembers = [...area.members].sort((a, b) => {
        const distA = calculateDistance(lastPoint, a);
        const distB = calculateDistance(lastPoint, b);
        return distA - distB;
      });
      
      expandedRoute.push(...sortedMembers);
    }
  }
  
  console.log(`Rota expandida: ${expandedRoute.length} pontos`);
  return expandedRoute;
};

// Calcular distância entre duas coordenadas usando fórmula haversine
const calculateDistance = (point1: KMLPoint, point2: KMLPoint): number => {
  const R = 6371e3; // Raio da Terra em metros
  const φ1 = point1.lat * Math.PI / 180;
  const φ2 = point2.lat * Math.PI / 180;
  const Δφ = (point2.lat - point1.lat) * Math.PI / 180;
  const Δλ = (point2.lng - point1.lng) * Math.PI / 180;

  const a = Math.sin(Δφ/2) * Math.sin(Δφ/2) +
          Math.cos(φ1) * Math.cos(φ2) *
          Math.sin(Δλ/2) * Math.sin(Δλ/2);
  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1-a));

  return R * c; // Distância em metros
};

// Criar matriz de distâncias entre todos os pontos
const createDistanceMatrix = (points: KMLPoint[]): number[][] => {
  const n = points.length;
  const matrix: number[][] = Array(n).fill(null).map(() => Array(n).fill(0));
  
  console.log(`Criando matriz de distâncias para ${n} pontos (${n*n} cálculos)...`);
  
  for (let i = 0; i < n; i++) {
    for (let j = 0; j < n; j++) {
      if (i !== j) {
        matrix[i][j] = calculateDistance(points[i], points[j]);
      }
    }
    
    // Log de progresso para grandes datasets
    if (i % 100 === 0 && n > 500) {
      console.log(`Progresso matriz distâncias: ${i}/${n} (${((i/n)*100).toFixed(1)}%)`);
    }
  }
  
  console.log('Matriz de distâncias criada com sucesso');
  return matrix;
};

// Algoritmo do vizinho mais próximo
const nearestNeighborTSP = (
  points: KMLPoint[], 
  distanceMatrix: number[][], 
  startIndex: number = 0,
  endIndex?: number
): { route: number[], totalDistance: number } => {
  const n = points.length;
  const visited = new Array(n).fill(false);
  const route: number[] = [];
  let totalDistance = 0;
  let currentIndex = startIndex;
  
  visited[currentIndex] = true;
  route.push(currentIndex);
  
  // Visitar todos os pontos exceto o final (se especificado)
  const pointsToVisit = endIndex !== undefined ? n - 1 : n;
  
  for (let step = 1; step < pointsToVisit; step++) {
    let nearestIndex = -1;
    let nearestDistance = Infinity;
    
    for (let i = 0; i < n; i++) {
      if (!visited[i] && (endIndex === undefined || i !== endIndex)) {
        if (distanceMatrix[currentIndex][i] < nearestDistance) {
          nearestDistance = distanceMatrix[currentIndex][i];
          nearestIndex = i;
        }
      }
    }
    
    if (nearestIndex !== -1) {
      visited[nearestIndex] = true;
      route.push(nearestIndex);
      totalDistance += nearestDistance;
      currentIndex = nearestIndex;
    }
  }
  
  // Se há ponto final especificado, ir para ele
  if (endIndex !== undefined && !visited[endIndex]) {
    totalDistance += distanceMatrix[currentIndex][endIndex];
    route.push(endIndex);
  }
  
  return { route, totalDistance };
};

// Algoritmo 2-opt para melhorar a rota
const twoOptImprove = (
  points: KMLPoint[], 
  distanceMatrix: number[][], 
  initialRoute: number[]
): { route: number[], totalDistance: number, iterations: number } => {
  let route = [...initialRoute];
  let bestDistance = calculateRouteDistance(distanceMatrix, route);
  let improved = true;
  let iterations = 0;
  
  // Adaptar número máximo de iterações baseado no tamanho do problema
  const maxIterations = Math.min(1000, points.length * 2);
  
  // Se há pontos fixos (início e fim), não os mover
  const hasFixedStart = points[route[0]].isStartPoint;
  const hasFixedEnd = points[route[route.length - 1]].isEndPoint;
  const startIdx = hasFixedStart ? 1 : 0;
  const endIdx = hasFixedEnd ? route.length - 1 : route.length;
  
  console.log(`Iniciando 2-opt com ${route.length} pontos (máx ${maxIterations} iterações)`);
  
  while (improved && iterations < maxIterations) {
    improved = false;
    iterations++;
    
    // Para grandes datasets, usar sampling para acelerar
    const sampleFactor = points.length > 1000 ? 2 : 1;
    
    for (let i = startIdx; i < endIdx - 1; i += sampleFactor) {
      for (let j = i + 1; j < endIdx; j += sampleFactor) {
        // Não trocar se quebrar restrições de início/fim
        if ((hasFixedStart && (i === 0 || j === 0)) || 
            (hasFixedEnd && (i === route.length - 1 || j === route.length - 1))) {
          continue;
        }
        
        const newRoute = twoOptSwap(route, i, j);
        const newDistance = calculateRouteDistance(distanceMatrix, newRoute);
        
        if (newDistance < bestDistance) {
          route = newRoute;
          bestDistance = newDistance;
          improved = true;
        }
      }
    }
    
    // Log de progresso para grandes datasets
    if (iterations % 100 === 0 && points.length > 500) {
      console.log(`2-opt iteração ${iterations}, distância atual: ${(bestDistance/1000).toFixed(2)}km`);
    }
  }
  
  console.log(`2-opt concluído: ${iterations} iterações, distância final: ${(bestDistance/1000).toFixed(2)}km`);
  return { route, totalDistance: bestDistance, iterations };
};

// Realizar troca 2-opt
const twoOptSwap = (route: number[], i: number, j: number): number[] => {
  const newRoute = [...route];
  // Inverter a ordem dos elementos entre i e j
  while (i < j) {
    [newRoute[i], newRoute[j]] = [newRoute[j], newRoute[i]];
    i++;
    j--;
  }
  return newRoute;
};

// Calcular distância total da rota
const calculateRouteDistance = (distanceMatrix: number[][], route: number[]): number => {
  let totalDistance = 0;
  for (let i = 0; i < route.length - 1; i++) {
    totalDistance += distanceMatrix[route[i]][route[i + 1]];
  }
  return totalDistance;
};

// Função principal para resolver TSP
export const solveTSP = async (points: KMLPoint[], config: TSPConfig): Promise<TSPSolution> => {
  if (points.length < 2) {
    throw new Error('É necessário pelo menos 2 pontos para resolver o TSP');
  }
  
  const startTime = performance.now();
  
  // Etapa 1: Agrupar pontos próximos em áreas de coleta
  const collectionRadius = config.collectionRadius || 20; // Padrão: 20 metros
  const areas = createCollectionAreas(points, collectionRadius);
  
  // Trabalhar com pontos representativos das áreas
  const representativePoints = areas.map(area => area.representative);
  
  // Encontrar índices dos pontos de início e fim nas áreas
  let startIndex = 0;
  let endIndex: number | undefined;
  
  if (config.startPointId) {
    const startIdx = areas.findIndex(area => 
      area.members.some(member => member.id === config.startPointId)
    );
    if (startIdx !== -1) {
      startIndex = startIdx;
      // Marcar como ponto de início
      representativePoints[startIndex].isStartPoint = true;
    }
  }
  
  if (config.endPointId) {
    const endIdx = areas.findIndex(area => 
      area.members.some(member => member.id === config.endPointId)
    );
    if (endIdx !== -1) {
      endIndex = endIdx;
      // Marcar como ponto final
      representativePoints[endIndex].isEndPoint = true;
    }
  }
  
  // Criar matriz de distâncias para pontos representativos
  console.log('Criando matriz de distâncias para áreas de coleta...');
  const distanceMatrix = createDistanceMatrix(representativePoints);
  
  let solution: { route: number[], totalDistance: number, iterations: number };
  
  // Aplicar algoritmo escolhido nos pontos representativos
  switch (config.algorithm) {
    case 'nearest_neighbor':
      console.log('Aplicando algoritmo do vizinho mais próximo nas áreas...');
      const nnResult = nearestNeighborTSP(representativePoints, distanceMatrix, startIndex, endIndex);
      solution = { ...nnResult, iterations: 1 };
      break;
      
    case '2opt':
      console.log('Aplicando algoritmo 2-opt nas áreas...');
      const initialResult = nearestNeighborTSP(representativePoints, distanceMatrix, startIndex, endIndex);
      solution = twoOptImprove(representativePoints, distanceMatrix, initialResult.route);
      break;
      
    case 'genetic':
      // Implementação futura - por enquanto usar 2-opt
      console.log('Algoritmo genético não implementado, usando 2-opt nas áreas...');
      const geneticInitial = nearestNeighborTSP(representativePoints, distanceMatrix, startIndex, endIndex);
      solution = twoOptImprove(representativePoints, distanceMatrix, geneticInitial.route);
      break;
      
    default:
      throw new Error(`Algoritmo ${config.algorithm} não reconhecido`);
  }
  
  // Reconstruir rota com todas as áreas na ordem otimizada
  const optimizedAreas = solution.route.map(index => areas[index]);
  
  // Expandir rota para incluir todos os pontos originais
  const expandedRoute = expandRouteWithAllPoints(optimizedAreas, points);
  
  // Calcular distância real da rota expandida
  let totalRealDistance = 0;
  for (let i = 0; i < expandedRoute.length - 1; i++) {
    totalRealDistance += calculateDistance(expandedRoute[i], expandedRoute[i + 1]);
  }
  
  // Criar rota otimizada final
  const optimizedRoute = expandedRoute.map((point, order) => ({
    ...point,
    visitOrder: order + 1
  }));
  
  const executionTime = performance.now() - startTime;
  
  console.log(`TSP resolvido em ${executionTime.toFixed(2)}ms com ${solution.iterations} iterações`);
  console.log(`Áreas processadas: ${areas.length}, Pontos originais: ${points.length}`);
  console.log(`Distância total estimada: ${(totalRealDistance / 1000).toFixed(2)}km`);
  
  return {
    route: optimizedRoute,
    totalDistance: totalRealDistance,
    totalDuration: Math.round(totalRealDistance / 50 * 3.6), // Estimativa: 50 km/h
    iterations: solution.iterations,
    executionTime
  };
};

// Validar configuração TSP com auto-correção
export const validateTSPConfig = (points: KMLPoint[], config: TSPConfig): { errors: string[], correctedConfig: TSPConfig } => {
  const errors: string[] = [];
  let correctedConfig = { ...config };
  
  if (config.startPointId && !points.find(p => p.id === config.startPointId)) {
    // Auto-corrigir: usar primeiro ponto se início não existir
    correctedConfig.startPointId = points[0]?.id || null;
    console.warn('Ponto de início não encontrado, usando primeiro ponto disponível');
  }
  
  if (config.endPointId && !points.find(p => p.id === config.endPointId)) {
    // Auto-corrigir: usar último ponto se fim não existir
    correctedConfig.endPointId = points[points.length - 1]?.id || null;
    console.warn('Ponto final não encontrado, usando último ponto disponível');
  }
  
  if (correctedConfig.startPointId === correctedConfig.endPointId && points.length > 1) {
    // Se início e fim são iguais, usar primeiro e último
    correctedConfig.startPointId = points[0]?.id || null;
    correctedConfig.endPointId = points[points.length - 1]?.id || null;
    console.warn('Ponto de início e fim eram iguais, ajustados para primeiro e último');
  }
  
  // Apenas erro crítico se não há pontos suficientes
  if (points.length < 2) {
    errors.push('São necessários pelo menos 2 pontos para resolver o TSP');
  }
  
  // Removido o limite de pontos - agora aceita qualquer quantidade
  // Para muitos pontos, o algoritmo pode demorar mais, mas ainda funcionará
  if (points.length > 2000) {
    console.warn(`Processando ${points.length} pontos - isso pode demorar alguns minutos`);
  }
  
  return { errors, correctedConfig };
};
