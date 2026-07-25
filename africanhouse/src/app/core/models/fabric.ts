export interface Fabric {
  id: string;
  name: string;
  description: string;
  category: 'everyday' | 'funeral' | 'kente';
  colourPairing: 'white-black' | 'all-black' | 'red-black' | 'multicolour' | 'custom';
  material: 'gtp' | 'holland' | 'printex' | 'soso' | 'kente' | 'small-material';
  pricePerYard: number;
  imageUrl: string;
  inStock: boolean;
  minYards: number;
  yardStep: number;
}

export function getYardRules(material: Fabric['material']): { minYards: number; yardStep: number } {
  if (['gtp', 'holland', 'printex'].includes(material)) {
    return { minYards: 6, yardStep: 6 };
  }
  return { minYards: 2, yardStep: 2 };
}
