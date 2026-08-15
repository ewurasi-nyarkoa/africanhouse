export interface Fabric {
  id: string;
  name: string;
  description: string;
  category: 'everyday' | 'funeral' | 'kente';
  colourPairing: string;
  material: 'gtp' | 'holland' | 'printex' | 'soso' | 'kente' | 'small-material';
  subcategory: string;
  pricePerYard: number;
  imageUrl: string;
  inStock: boolean;
  minYards: number;
  availableYards: number;
}

export function generateYardOptions(minYards: number, availableYards: number): number[] {
  if (minYards <= 0 || availableYards < minYards) return [];
  const options: number[] = [];
  let multiplier = 1;
  while (minYards * multiplier <= availableYards) {
    options.push(minYards * multiplier);
    multiplier++;
  }
  return options;
}

export function isAvailableForPurchase(minYards: number, availableYards: number): boolean {
  return availableYards >= minYards && minYards > 0;
}
