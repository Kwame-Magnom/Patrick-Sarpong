import type { SupabaseClient } from '@supabase/supabase-js';
import type { BrandItem, CategoryItem, ProductItem, ReviewItem } from '../types';

export interface CatalogQueryFilters {
  category?: string;
  subcategory?: string;
  brand?: string;
  collection?: string;
  q?: string;
  sort?: string;
}

export async function fetchCatalogFromSupabase(
  client: SupabaseClient,
  filters: CatalogQueryFilters = {}
): Promise<{
  categories: CategoryItem[];
  brands: BrandItem[];
  products: ProductItem[];
  recentReviews: ReviewItem[];
}> {
  const [catRes, brandRes, prodRes, revRes] = await Promise.all([
    client
      .from('categories')
      .select('id, name, slug, parent_group, description, sort_order')
      .order('sort_order', { ascending: true })
      .order('name', { ascending: true }),
    client
      .from('brands')
      .select('id, name, slug, category_group, is_popular')
      .order('name', { ascending: true }),
    client
      .from('products')
      .select(
        'id, sku, name, slug, category_group, subcategory, brand_slug, brand_name, price_ghs, compare_at_ghs, stock_qty, condition, warranty, storage_or_variant, specs_json, description, image_url, is_featured, is_best_seller, is_new_arrival, is_special_offer, rating_avg, review_count'
      )
      .order('id', { ascending: false }),
    client
      .from('reviews')
      .select('id, product_id, user_id, reviewer_name, reviewer_city, rating, title, comment, verified_purchase, created_at')
      .order('created_at', { ascending: false })
      .limit(8),
  ]);

  if (catRes.error) throw new Error(catRes.error.message);
  if (brandRes.error) throw new Error(brandRes.error.message);
  if (prodRes.error) throw new Error(prodRes.error.message);
  if (revRes.error) throw new Error(revRes.error.message);

  const categories: CategoryItem[] = (catRes.data || []).map((c: any) => ({
    id: Number(c.id),
    name: String(c.name || ''),
    slug: String(c.slug || ''),
    parentGroup: String(c.parent_group || ''),
    description: String(c.description || ''),
    sortOrder: Number(c.sort_order ?? 0),
  }));

  const brands: BrandItem[] = (brandRes.data || []).map((b: any) => ({
    id: Number(b.id),
    name: String(b.name || ''),
    slug: String(b.slug || ''),
    categoryGroup: String(b.category_group || ''),
    isPopular: Boolean(b.is_popular),
  }));

  let products: ProductItem[] = (prodRes.data || []).map((p: any) => ({
    id: Number(p.id),
    sku: String(p.sku || ''),
    name: String(p.name || ''),
    slug: String(p.slug || ''),
    categoryGroup: String(p.category_group || 'iphones'),
    subcategory: String(p.subcategory || ''),
    brandSlug: String(p.brand_slug || ''),
    brandName: String(p.brand_name || ''),
    priceGhs: Number(p.price_ghs ?? 0),
    compareAtGhs: p.compare_at_ghs !== null && p.compare_at_ghs !== undefined ? Number(p.compare_at_ghs) : null,
    stockQty: Number(p.stock_qty ?? 0),
    condition: String(p.condition || 'Brand New Sealed'),
    warranty: String(p.warranty || '12 Months MAGNOM PHONES HUB Warranty'),
    storageOrVariant: String(p.storage_or_variant || ''),
    specsJson: String(p.specs_json || '{}'),
    description: String(p.description || ''),
    imageUrl: String(p.image_url || ''),
    isFeatured: Boolean(p.is_featured),
    isBestSeller: Boolean(p.is_best_seller),
    isNewArrival: Boolean(p.is_new_arrival),
    isSpecialOffer: Boolean(p.is_special_offer),
    ratingAvg: String(p.rating_avg || '4.8'),
    reviewCount: Number(p.review_count ?? 0),
  }));

  if (filters.category && filters.category !== 'all') {
    products = products.filter((p) => p.categoryGroup === filters.category);
  }
  if (filters.subcategory && filters.subcategory !== 'all') {
    products = products.filter((p) => p.subcategory === filters.subcategory);
  }
  if (filters.brand && filters.brand !== 'all') {
    products = products.filter((p) => p.brandSlug === filters.brand);
  }
  if (filters.collection === 'featured') products = products.filter((p) => p.isFeatured);
  if (filters.collection === 'bestseller') products = products.filter((p) => p.isBestSeller);
  if (filters.collection === 'new') products = products.filter((p) => p.isNewArrival);
  if (filters.collection === 'offer') products = products.filter((p) => p.isSpecialOffer);
  if (filters.q && filters.q.trim()) {
    const q = filters.q.trim().toLowerCase();
    products = products.filter(
      (p) =>
        p.name.toLowerCase().includes(q) ||
        p.brandName.toLowerCase().includes(q) ||
        p.subcategory.toLowerCase().includes(q) ||
        p.description.toLowerCase().includes(q)
    );
  }
  if (filters.sort === 'price_asc') products.sort((a, b) => a.priceGhs - b.priceGhs);
  else if (filters.sort === 'price_desc') products.sort((a, b) => b.priceGhs - a.priceGhs);

  const recentReviews: ReviewItem[] = (revRes.data || []).map((r: any) => ({
    id: Number(r.id),
    productId: Number(r.product_id),
    userId: r.user_id !== null && r.user_id !== undefined ? Number(r.user_id) : null,
    reviewerName: String(r.reviewer_name || ''),
    reviewerCity: String(r.reviewer_city || ''),
    rating: Number(r.rating ?? 5),
    title: String(r.title || ''),
    comment: String(r.comment || ''),
    verifiedPurchase: Boolean(r.verified_purchase),
    createdAt: String(r.created_at || ''),
  }));

  return { categories, brands, products, recentReviews };
}
