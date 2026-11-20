export interface UserProfile {
  id: number;
  uid: string;
  fullName: string;
  email: string;
  phone: string;
  role: 'customer' | 'staff' | 'admin' | string;
  emailVerified: boolean;
  createdAt?: string;
}

export interface BackupSettings {
  id?: number;
  settingKey: string;
  enabled: boolean;
  intervalHours: number;
  retentionCount: number;
  lastRunAt: string | null;
  updatedAt?: string;
}

export interface BackupSummary {
  categories: number;
  brands: number;
  products: number;
  orders: number;
  reviews: number;
  users: number;
  newsletterSubscribers: number;
}

export interface BackupRecord {
  id: number;
  backupCode: string;
  triggerType: 'auto' | 'manual' | 'pre_restore' | string;
  createdByEmail: string;
  summary: BackupSummary;
  sizeBytes: number;
  createdAt: string;
}

export interface CategoryItem {
  id: number;
  name: string;
  slug: string;
  parentGroup: string;
  description: string;
  sortOrder: number;
}

export interface BrandItem {
  id: number;
  name: string;
  slug: string;
  categoryGroup: string;
  isPopular: boolean;
}

export interface ProductItem {
  id: number;
  sku: string;
  name: string;
  slug: string;
  categoryGroup: 'iphones' | 'android' | 'laptops' | 'accessories' | string;
  subcategory: string;
  brandSlug: string;
  brandName: string;
  priceGhs: number;
  compareAtGhs: number | null;
  stockQty: number;
  condition: string;
  warranty: string;
  storageOrVariant: string;
  specsJson: string;
  description: string;
  imageUrl: string;
  isFeatured: boolean;
  isBestSeller: boolean;
  isNewArrival: boolean;
  isSpecialOffer: boolean;
  ratingAvg: string;
  reviewCount: number;
}

export interface ReviewItem {
  id: number;
  productId: number;
  userId: number | null;
  reviewerName: string;
  reviewerCity: string;
  rating: number;
  title: string;
  comment: string;
  verifiedPurchase: boolean;
  createdAt: string;
}

export interface AddressItem {
  id: number;
  userId: number;
  label: string;
  recipientName: string;
  phone: string;
  region: string;
  city: string;
  streetAddress: string;
  digitalAddress: string;
  isDefault: boolean;
}

export interface CartEntry {
  product: ProductItem;
  quantity: number;
}

export interface OrderLineItem {
  id: number;
  orderId: number;
  productId: number | null;
  productName: string;
  productSku: string;
  productImage: string;
  unitPriceGhs: number;
  quantity: number;
}

export interface OrderRecord {
  id: number;
  orderNumber: string;
  userId: number;
  customerName: string;
  customerEmail: string;
  customerPhone: string;
  shippingRegion: string;
  shippingCity: string;
  shippingStreet: string;
  digitalAddress: string;
  deliveryMethod: string;
  paymentMethod: string;
  paymentStatus: string;
  paystackReference: string;
  orderStatus: string;
  trackingNote: string;
  subtotalGhs: number;
  deliveryFeeGhs: number;
  totalGhs: number;
  createdAt: string;
  updatedAt: string;
  items: OrderLineItem[];
}
