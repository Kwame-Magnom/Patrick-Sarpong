import { clsx, type ClassValue } from 'clsx';
import { twMerge } from 'tailwind-merge';

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}

export function formatGhs(amount: number): string {
  return `GH₵ ${Number(amount || 0).toLocaleString('en-GH')}`;
}

export const GHANA_REGIONS = [
  'Greater Accra',
  'Ashanti',
  'Western',
  'Central',
  'Eastern',
  'Volta',
  'Northern',
  'Bono',
  'Bono East',
  'Ahafo',
  'Upper East',
  'Upper West',
  'Western North',
  'Oti',
  'Savannah',
  'North East',
];

export const CATEGORY_GROUP_LABELS: Record<string, string> = {
  all: 'All Devices',
  iphones: 'iPhones',
  android: 'Android Phones',
  laptops: 'Laptops',
  accessories: 'Accessories',
};
