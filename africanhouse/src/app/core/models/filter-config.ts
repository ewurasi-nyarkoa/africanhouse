import { Fabric } from './fabric';

export type MainCategory = Fabric['category'] | 'all';

export interface SubcategoryOption {
  value: string;
  label: string;
}

export interface CategoryFilterConfig {
  category: MainCategory;
  label: string;
  subcategories: SubcategoryOption[];
}

export const CATEGORY_FILTER_CONFIG: CategoryFilterConfig[] = [
  {
    category: 'everyday',
    label: 'Everyday',
    subcategories: [
      { value: 'Hitarget', label: 'Hitarget' },
      { value: 'Ordain', label: 'Ordain' },
      { value: 'Hollantex', label: 'Hollantex' },
      { value: 'GTP', label: 'GTP' },
      { value: 'ABC', label: 'ABC' },
      { value: 'Holland', label: 'Holland' },
    ],
  },
  {
    category: 'funeral',
    label: 'Funeral',
    subcategories: [
      { value: 'All Black', label: 'All Black' },
      { value: 'All Red', label: 'All Red' },
      { value: 'Red and Black', label: 'Red and Black' },
      { value: 'Black and Red', label: 'Black and Red' },
      { value: 'Black and Brown', label: 'Black and Brown' },
      { value: 'Black and Mauve', label: 'Black and Mauve' },
      { value: 'White and Black', label: 'White and Black' },
      { value: 'Black and Green', label: 'Black and Green' },
      { value: 'Black and Yellow', label: 'Black and Yellow' },
      { value: 'White and Yellow', label: 'White and Yellow' },
      { value: 'White and Green', label: 'White and Green' },
      // { value: 'White and other colours', label: 'White and other colours' },
      // { value: 'Black and other colours', label: 'Black and other colours' },
    ],
  },
  {
    category: 'kente',
    label: 'Kente',
    subcategories: [
      { value: 'Meba Wɔ Abrokyire', label: 'Meba Wɔ Abrokyire' },
      { value: 'Ghana Kente', label: 'Ghana Kente' },
    ],
  },
];

export function getSubcategoriesForCategory(category: MainCategory): SubcategoryOption[] {
  if (category === 'all') return [];
  const config = CATEGORY_FILTER_CONFIG.find(c => c.category === category);
  return config ? config.subcategories : [];
}

export const MAIN_CATEGORIES: { value: MainCategory; label: string }[] = [
  { value: 'all', label: 'All' },
  { value: 'everyday', label: 'Everyday' },
  { value: 'funeral', label: 'Funeral' },
  { value: 'kente', label: 'Kente' },
];
