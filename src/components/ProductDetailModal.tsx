import React, { useEffect, useState } from 'react';
import { Heart, ShieldCheck, ShoppingBag, Star, Truck } from 'lucide-react';
import { toast } from 'sonner';
import { apiFetch } from '@/src/lib/api';
import { formatGhs } from '@/src/lib/utils';
import { ProductItem, ReviewItem, UserProfile } from '@/src/types';
import { Button } from './ui/button';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from './ui/dialog';
import { Input } from './ui/input';
import { Label } from './ui/label';
import { ProductImage } from './ProductImage';

interface ProductDetailModalProps {
  product: ProductItem | null;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  user: UserProfile | null;
  isWishlisted: boolean;
  onAddToCart: (product: ProductItem, qty: number) => void;
  onToggleWishlist: (product: ProductItem) => void;
  onOpenAuth: () => void;
}

export const ProductDetailModal: React.FC<ProductDetailModalProps> = ({
  product,
  open,
  onOpenChange,
  user,
  isWishlisted,
  onAddToCart,
  onToggleWishlist,
  onOpenAuth,
}) => {
  const [qty, setQty] = useState(1);
  const [reviews, setReviews] = useState<ReviewItem[]>([]);
  const [loadingReviews, setLoadingReviews] = useState(false);

  // Review submission
  const [rating, setRating] = useState(5);
  const [title, setTitle] = useState('');
  const [comment, setComment] = useState('');
  const [city, setCity] = useState('Accra');
  const [submittingReview, setSubmittingReview] = useState(false);

  useEffect(() => {
    if (!product || !open) return;
    setQty(1);
    setLoadingReviews(true);
    apiFetch<{ reviews: ReviewItem[] }>(`/api/products/${product.id}`)
      .then((res) => setReviews(res.reviews || []))
      .catch(() => setReviews([]))
      .finally(() => setLoadingReviews(false));
  }, [product, open]);

  if (!product) return null;

  let specs: Record<string, string> = {};
  try {
    specs = JSON.parse(product.specsJson || '{}');
  } catch {
    specs = {};
  }

  const handleReviewSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!user) {
      onOpenAuth();
      return;
    }
    setSubmittingReview(true);
    try {
      const res = await apiFetch<{ review: ReviewItem }>(`/api/products/${product.id}/reviews`, {
        method: 'POST',
        body: JSON.stringify({ rating, title, comment, city }),
      });
      setReviews((prev) => [res.review, ...prev]);
      setTitle('');
      setComment('');
      toast.success('Thank you! Your review has been published.');
    } catch (err: any) {
      toast.error(err?.message || 'Could not submit review.');
    } finally {
      setSubmittingReview(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-4xl p-0 overflow-hidden">
        <div className="grid grid-cols-1 md:grid-cols-2">
          {/* Left Visual */}
          <div className="bg-slate-100 p-6 flex items-center justify-center border-b md:border-b-0 md:border-r border-slate-200">
            <ProductImage
              src={product.imageUrl}
              alt={product.name}
              categoryGroup={product.categoryGroup}
              className="w-full aspect-[4/3] rounded-lg object-cover"
            />
          </div>

          {/* Right Purchase Module */}
          <div className="p-6 flex flex-col justify-between space-y-5">
            <div>
              <DialogHeader className="mb-2">
                <div className="flex items-center gap-2 text-xs text-slate-500">
                  <span className="font-semibold text-[#001B5E]">{product.brandName}</span>
                  <span aria-hidden="true">·</span>
                  <span>{product.subcategory}</span>
                  <span aria-hidden="true">·</span>
                  <span className="font-mono-nums">{product.sku}</span>
                </div>
                <DialogTitle className="text-xl md:text-2xl text-[#001B5E] mt-1">
                  {product.name}
                </DialogTitle>
              </DialogHeader>

              {product.storageOrVariant && (
                <p className="text-xs text-slate-600 mb-3">{product.storageOrVariant}</p>
              )}

              <div className="flex items-baseline gap-3 mb-3">
                <span className="text-2xl font-bold text-[#001B5E] font-mono-nums">
                  {formatGhs(product.priceGhs)}
                </span>
                {product.compareAtGhs && product.compareAtGhs > product.priceGhs && (
                  <span className="text-sm text-slate-400 line-through font-mono-nums">
                    {formatGhs(product.compareAtGhs)}
                  </span>
                )}
              </div>

              <div className="flex items-center gap-4 text-xs text-slate-600 mb-4">
                <span className="inline-flex items-center gap-1 font-medium text-slate-800">
                  <Star className="h-3.5 w-3.5 fill-amber-400 text-amber-400" />
                  <span className="font-mono-nums">{product.ratingAvg}</span>
                  <span className="text-slate-400">({reviews.length || product.reviewCount} reviews)</span>
                </span>
                <span aria-hidden="true">·</span>
                <span className={product.stockQty > 0 ? 'text-emerald-700 font-semibold' : 'text-red-600 font-semibold'}>
                  {product.stockQty > 0 ? `${product.stockQty} in stock (Accra)` : 'Out of Stock'}
                </span>
              </div>

              <p className="text-sm text-slate-600 leading-relaxed mb-4">{product.description}</p>

              <div className="space-y-1.5 border-t border-slate-100 pt-3 text-xs text-slate-600">
                <div className="flex items-center gap-2">
                  <ShieldCheck className="h-4 w-4 text-[#DC0000] shrink-0" />
                  <span>{product.condition} · {product.warranty}</span>
                </div>
                <div className="flex items-center gap-2">
                  <Truck className="h-4 w-4 text-[#DC0000] shrink-0" />
                  <span>Same-day Accra dispatch · Next-day Kumasi, Takoradi &amp; Tamale</span>
                </div>
              </div>
            </div>

            <div className="space-y-3 pt-2 border-t border-slate-100">
              <div className="flex items-center gap-3">
                <div className="flex items-center border border-slate-200 rounded-lg bg-white">
                  <button
                    type="button"
                    onClick={() => setQty((q) => Math.max(1, q - 1))}
                    className="h-10 w-9 text-slate-700 hover:bg-slate-50 font-semibold cursor-pointer"
                    aria-label="Decrease quantity"
                  >
                    -
                  </button>
                  <span className="w-9 text-center text-sm font-semibold font-mono-nums">
                    {qty}
                  </span>
                  <button
                    type="button"
                    onClick={() => setQty((q) => Math.min(Math.max(1, product.stockQty), q + 1))}
                    className="h-10 w-9 text-slate-700 hover:bg-slate-50 font-semibold cursor-pointer"
                    aria-label="Increase quantity"
                  >
                    +
                  </button>
                </div>

                <Button
                  variant="accent"
                  className="flex-1"
                  disabled={product.stockQty <= 0}
                  onClick={() => {
                    onAddToCart(product, qty);
                    onOpenChange(false);
                  }}
                >
                  <ShoppingBag className="h-4 w-4" />
                  {product.stockQty > 0 ? 'Add to Cart' : 'Out of Stock'}
                </Button>

                <Button
                  variant="outline"
                  size="icon"
                  onClick={() => onToggleWishlist(product)}
                  aria-label="Toggle wishlist"
                >
                  <Heart
                    className={`h-4 w-4 ${
                      isWishlisted ? 'fill-red-500 text-red-500' : 'text-slate-600'
                    }`}
                  />
                </Button>
              </div>
            </div>
          </div>
        </div>

        {/* Specifications & Reviews */}
        <div className="border-t border-slate-200 bg-slate-50/70 p-6 space-y-6">
          {Object.keys(specs).length > 0 && (
            <div>
              <h4 className="text-sm font-bold text-[#001B5E] mb-3">Technical Specifications</h4>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-x-8 gap-y-2 bg-white border border-slate-200 rounded-lg p-4">
                {Object.entries(specs).map(([k, v]) => (
                  <div
                    key={k}
                    className="flex items-center justify-between gap-4 py-1.5 border-b border-slate-100 last:border-b-0 text-xs"
                  >
                    <span className="text-slate-500">{k}</span>
                    <span className="font-medium text-slate-900 text-right">{v}</span>
                  </div>
                ))}
              </div>
            </div>
          )}

          <div>
            <h4 className="text-sm font-bold text-[#001B5E] mb-3">
              Customer Reviews ({reviews.length})
            </h4>

            {loadingReviews ? (
              <p className="text-xs text-slate-500">Loading verified reviews...</p>
            ) : reviews.length === 0 ? (
              <p className="text-xs text-slate-500 mb-4">
                No reviews yet for this model. Be the first verified customer to review it.
              </p>
            ) : (
              <div className="grid grid-cols-1 md:grid-cols-2 gap-3 mb-5">
                {reviews.map((r) => (
                  <div
                    key={r.id}
                    className="bg-white border border-slate-200 rounded-lg p-4 space-y-1.5"
                  >
                    <div className="flex items-center justify-between">
                      <div className="flex items-center gap-1">
                        {Array.from({ length: r.rating }).map((_, idx) => (
                          <Star
                            key={idx}
                            className="h-3.5 w-3.5 fill-amber-400 text-amber-400"
                          />
                        ))}
                      </div>
                      <span className="text-[11px] text-slate-500">
                        {r.verifiedPurchase ? 'Verified Buyer' : 'Customer'}
                      </span>
                    </div>
                    <p className="text-sm font-semibold text-slate-900">{r.title}</p>
                    <p className="text-xs text-slate-600 leading-relaxed">{r.comment}</p>
                    <p className="text-[11px] text-slate-400">
                      {r.reviewerName} · {r.reviewerCity}
                    </p>
                  </div>
                ))}
              </div>
            )}

            <form
              onSubmit={handleReviewSubmit}
              className="bg-white border border-slate-200 rounded-lg p-4 space-y-3"
            >
              <div className="flex items-center justify-between">
                <span className="text-xs font-bold text-[#001B5E]">Write a Product Review</span>
                <div className="flex items-center gap-1">
                  {[1, 2, 3, 4, 5].map((n) => (
                    <button
                      key={n}
                      type="button"
                      onClick={() => setRating(n)}
                      className="p-0.5 cursor-pointer"
                      aria-label={`Rate ${n} stars`}
                    >
                      <Star
                        className={`h-4 w-4 ${
                          n <= rating ? 'fill-amber-400 text-amber-400' : 'text-slate-300'
                        }`}
                      />
                    </button>
                  ))}
                </div>
              </div>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div className="space-y-1">
                  <Label htmlFor="rev-title">Headline</Label>
                  <Input
                    id="rev-title"
                    required
                    value={title}
                    onChange={(e) => setTitle(e.target.value)}
                    placeholder="Fast Accra delivery and sealed box"
                  />
                </div>
                <div className="space-y-1">
                  <Label htmlFor="rev-city">Your City / Area</Label>
                  <Input
                    id="rev-city"
                    value={city}
                    onChange={(e) => setCity(e.target.value)}
                    placeholder="Osu, Accra"
                  />
                </div>
              </div>
              <div className="space-y-1">
                <Label htmlFor="rev-comment">Your Experience</Label>
                <Input
                  id="rev-comment"
                  required
                  value={comment}
                  onChange={(e) => setComment(e.target.value)}
                  placeholder="Share battery performance, delivery speed, and condition..."
                />
              </div>
              <Button type="submit" size="sm" disabled={submittingReview}>
                {submittingReview
                  ? 'Publishing...'
                  : user
                  ? 'Publish Review'
                  : 'Sign In to Review'}
              </Button>
            </form>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
};
