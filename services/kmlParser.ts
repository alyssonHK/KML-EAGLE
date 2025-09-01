
import { KMLPoint } from '../types';

export const parseKML = (kmlText: string): KMLPoint[] => {
  const parser = new DOMParser();
  const xmlDoc = parser.parseFromString(kmlText, 'text/xml');
  
  const errorNode = xmlDoc.querySelector('parsererror');
  if (errorNode) {
    throw new Error('Falha ao analisar KML: ' + errorNode.textContent);
  }

  const points: KMLPoint[] = [];
  let pointCounter = 1;

  // Primeiro, processar placemarks com pontos individuais (comportamento original)
  const placemarks = xmlDoc.getElementsByTagName('Placemark');
  for (let i = 0; i < placemarks.length; i++) {
    const placemark = placemarks[i];
    const nameTag = placemark.getElementsByTagName('name')[0];
    
    // Verificar se é um ponto individual
    const pointCoordinatesTag = placemark.querySelector('Point coordinates');
    if (pointCoordinatesTag) {
      const name = nameTag ? nameTag.textContent || `Ponto ${pointCounter}` : `Ponto ${pointCounter}`;
      const [lng, lat] = (pointCoordinatesTag.textContent || '')
        .trim()
        .split(',')
        .map(Number);

      if (!isNaN(lat) && !isNaN(lng)) {
        points.push({
          id: `point-${pointCounter}`,
          name,
          lat,
          lng
        });
        pointCounter++;
      }
    }
    
    // Processar LineStrings e extrair todas as coordenadas como pontos de coleta
    const lineStrings = placemark.getElementsByTagName('LineString');
    for (let j = 0; j < lineStrings.length; j++) {
      const coordinatesTag = lineStrings[j].getElementsByTagName('coordinates')[0];
      if (coordinatesTag) {
        const coordinatesText = coordinatesTag.textContent || '';
        const coordLines = coordinatesText.trim().split(/[\s\n]+/);
        
        for (let k = 0; k < coordLines.length; k++) {
          const coordLine = coordLines[k].trim();
          if (coordLine) {
            const [lng, lat, alt] = coordLine.split(',').map(Number);
            
            if (!isNaN(lat) && !isNaN(lng)) {
              // Verificar se já existe um ponto muito próximo (evitar duplicatas)
              const isDuplicate = points.some(existingPoint => {
                const distance = Math.sqrt(
                  Math.pow(existingPoint.lat - lat, 2) + 
                  Math.pow(existingPoint.lng - lng, 2)
                );
                return distance < 0.00001; // ~1 metro de tolerância
              });
              
              if (!isDuplicate) {
                const routeName = nameTag ? nameTag.textContent || 'Rota' : 'Rota';
                points.push({
                  id: `point-${pointCounter}`,
                  name: `${routeName} - Coleta ${pointCounter}`,
                  lat,
                  lng
                });
                pointCounter++;
              }
            }
          }
        }
      }
    }
  }

  console.log(`Extraídos ${points.length} pontos de coleta do arquivo KML`);
  return points;
};
