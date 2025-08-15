
import { KMLPoint } from '../types';

export const parseKML = (kmlText: string): KMLPoint[] => {
  const parser = new DOMParser();
  const xmlDoc = parser.parseFromString(kmlText, 'text/xml');
  
  const errorNode = xmlDoc.querySelector('parsererror');
  if (errorNode) {
    throw new Error('Falha ao analisar KML: ' + errorNode.textContent);
  }

  const placemarks = xmlDoc.getElementsByTagName('Placemark');
  const points: KMLPoint[] = [];

  for (let i = 0; i < placemarks.length; i++) {
    const placemark = placemarks[i];
    const nameTag = placemark.getElementsByTagName('name')[0];
    const coordinatesTag = placemark.getElementsByTagName('coordinates')[0];

    if (coordinatesTag) {
      const name = nameTag ? nameTag.textContent || `Ponto ${i + 1}` : `Ponto ${i + 1}`;
      // Coordinates are in order: lon,lat,alt
      const [lng, lat] = (coordinatesTag.textContent || '')
        .trim()
        .split(',')
        .map(Number);
        
      if (!isNaN(lat) && !isNaN(lng)) {
        points.push({
          id: `kml-${i}-${Date.now()}`,
          name,
          lat,
          lng,
        });
      }
    }
  }

  return points;
};
