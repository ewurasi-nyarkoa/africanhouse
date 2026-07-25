import { Injectable } from '@angular/core';
import { Observable, of } from 'rxjs';
import { Fabric, getYardRules } from '../models/fabric';

@Injectable({ providedIn: 'root' })
export class FabricService {
  private fabrics: Fabric[] = [
    // GTP — Everyday
    { id: '1', name: 'GTP Classic', description: 'Authentic Ghana Textile Print in bold traditional patterns. A staple for everyday Ghanaian wear.', category: 'everyday', colourPairing: 'multicolour', material: 'gtp', pricePerYard: 30, imageUrl: 'assets/images/gtp-classic.jpg', inStock: true, ...getYardRules('gtp') },
    { id: '2', name: 'GTP Vibrant', description: 'Bright GTP print perfect for church, work and family outings.', category: 'everyday', colourPairing: 'multicolour', material: 'gtp', pricePerYard: 35, imageUrl: 'assets/images/gtp-vibrant.jpg', inStock: true, ...getYardRules('gtp') },

    // HOLLAND — Everyday
    { id: '3', name: 'Holland Classic', description: 'Premium Holland fabric known for its rich colour and smooth feel. A favourite for all occasions.', category: 'everyday', colourPairing: 'multicolour', material: 'holland', pricePerYard: 55, imageUrl: 'assets/images/holland-classic.jpg', inStock: true, ...getYardRules('holland') },
    { id: '4', name: 'Holland Wedding', description: 'Luxurious Holland fabric chosen for weddings and high celebrations.', category: 'everyday', colourPairing: 'multicolour', material: 'holland', pricePerYard: 65, imageUrl: 'assets/images/holland-wedding.jpg', inStock: true, ...getYardRules('holland') },

    // SOSO — Everyday
    { id: '5', name: 'Soso Everyday', description: 'Light and comfortable soso fabric for casual and everyday wear.', category: 'everyday', colourPairing: 'multicolour', material: 'soso', pricePerYard: 20, imageUrl: 'assets/images/soso-everyday.jpg', inStock: true, ...getYardRules('soso') },
    { id: '6', name: 'Soso Church', description: 'Neat soso fabric in clean tones, great for church and work.', category: 'everyday', colourPairing: 'white-black', material: 'soso', pricePerYard: 22, imageUrl: 'assets/images/soso-church.jpg', inStock: true, ...getYardRules('soso') },

    // SMALL MATERIAL — Everyday
    { id: '7', name: 'Small Material Mix', description: 'Versatile small material fabric available in various prints for everyday styling.', category: 'everyday', colourPairing: 'multicolour', material: 'small-material', pricePerYard: 15, imageUrl: 'assets/images/small-material.jpg', inStock: true, ...getYardRules('small-material') },

    // FUNERAL — Printex
    { id: '8', name: 'Printex Black', description: 'Classic all-black Printex, the standard choice for funeral wear across Ghana.', category: 'funeral', colourPairing: 'all-black', material: 'printex', pricePerYard: 28, imageUrl: 'assets/images/printex-black.jpg', inStock: true, ...getYardRules('printex') },
    { id: '9', name: 'Printex Red & Black', description: 'Red and black Printex for one-week celebrations and funeral outdoorings.', category: 'funeral', colourPairing: 'red-black', material: 'printex', pricePerYard: 30, imageUrl: 'assets/images/printex-red-black.jpg', inStock: true, ...getYardRules('printex') },
    { id: '10', name: 'Printex White & Black', description: 'White and black Printex, dignified and respectful for funeral gatherings.', category: 'funeral', colourPairing: 'white-black', material: 'printex', pricePerYard: 28, imageUrl: 'assets/images/printex-white-black.jpg', inStock: true, ...getYardRules('printex') },

    // FUNERAL — Holland
    { id: '11', name: 'Holland Funeral', description: 'Premium all-black Holland fabric for those who want quality at a funeral.', category: 'funeral', colourPairing: 'all-black', material: 'holland', pricePerYard: 60, imageUrl: 'assets/images/holland-funeral.jpg', inStock: true, ...getYardRules('holland') },

    // FUNERAL — GTP
    { id: '12', name: 'GTP Funeral', description: 'All-black GTP print for funeral wear, durable and widely worn.', category: 'funeral', colourPairing: 'all-black', material: 'gtp', pricePerYard: 32, imageUrl: 'assets/images/gtp-funeral.jpg', inStock: true, ...getYardRules('gtp') },

    // KENTE (Abrokyiri)
    { id: '13', name: 'Abrokyiri Kente Gold', description: 'Foreign-woven kente in classic gold and green. The diaspora favourite — same pride, accessible price.', category: 'kente', colourPairing: 'multicolour', material: 'kente', pricePerYard: 55, imageUrl: 'assets/images/kente-gold.jpg', inStock: true, ...getYardRules('kente') },
    { id: '14', name: 'Abrokyiri Kente Royal', description: 'Deep blue and gold kente strip fabric, machine-woven outside Ghana. Great for graduation and weddings.', category: 'kente', colourPairing: 'multicolour', material: 'kente', pricePerYard: 50, imageUrl: 'assets/images/kente-royal.jpg', inStock: true, ...getYardRules('kente') },
    { id: '15', name: 'Abrokyiri Kente Red', description: 'Bold red and black kente, machine-woven for celebrations and outdoorings.', category: 'kente', colourPairing: 'red-black', material: 'kente', pricePerYard: 52, imageUrl: 'assets/images/kente-red.jpg', inStock: false, ...getYardRules('kente') },
  ];

  getAll(): Observable<Fabric[]> {
    return of(this.fabrics);
  }

  getById(id: string): Observable<Fabric | undefined> {
    return of(this.fabrics.find(f => f.id === id));
  }

  getByCategory(category: Fabric['category']): Observable<Fabric[]> {
    return of(this.fabrics.filter(f => f.category === category));
  }

  getByMaterial(material: Fabric['material']): Observable<Fabric[]> {
    return of(this.fabrics.filter(f => f.material === material));
  }
}
