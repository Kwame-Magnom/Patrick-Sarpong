import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { onAuthStateChanged, signOut } from 'firebase/auth';
import { Toaster, toast } from 'sonner';
import {
  ArrowRight,
  Heart,
  LayoutDashboard,
  MapPin,
  MessageCircle,
  Phone,
  Search,
  ShieldCheck,
  ShoppingBag,
  Star,
  Truck,
  User as UserIcon,
} from 'lucide-react';
import { auth } from '@/src/lib/firebase';
import { apiFetch, getStoredSessionToken, setSessionToken, supabase } from '@/src/lib/api';
import { fetchCatalogFromSupabase } from '@/src/lib/supabase-catalog';
import { CATEGORY_GROUP_LABELS, formatGhs } from '@/src/lib/utils';
import {
  BrandItem,
  CartEntry,
  CategoryItem,
  OrderRecord,
  ProductItem,
  ReviewItem,
  UserProfile,
} from '@/src/types';
import { Button } from '@/src/components/ui/button';
import { Input } from '@/src/components/ui/input';
import { ProductImage } from '@/src/components/ProductImage';
import { AuthModal } from '@/src/components/AuthModal';
import { ProductDetailModal } from '@/src/components/ProductDetailModal';
import { CartCheckoutSheet } from '@/src/components/CartCheckoutSheet';
import { CustomerDashboard } from '@/src/components/CustomerDashboard';
import { AdminDashboard } from '@/src/components/AdminDashboard';
import { OrderTrackerModal } from '@/src/components/OrderTrackerModal';
import heroShowcaseImg from '@/src/assets/images/hero_electronics_showcase_1795168475559.jpg';

const HERO_IMAGE = heroShowcaseImg;

export default function App() {
  const [viewMode, setViewMode] = useState<'store' | 'customer' | 'admin'>('store');

  // Auth state
  const [user, setUser] = useState<UserProfile | null>(null);
  const [authModalOpen, setAuthModalOpen] = useState(false);
  const [authInitialMode, setAuthInitialMode] = useState<'login' | 'register'>('login');

  // Catalog state
  const [loadingCatalog, setLoadingCatalog] = useState(true);
  const [catalogError, setCatalogError] = useState('');
  const [categories, setCategories] = useState<CategoryItem[]>([]);
  const [brands, setBrands] = useState<BrandItem[]>([]);
  const [products, setProducts] = useState<ProductItem[]>([]);
  const [recentReviews, setRecentReviews] = useState<ReviewItem[]>([]);

  // Filters
  const [activeCategory, setActiveCategory] = useState<string>('all');
  const [activeSubcategory, setActiveSubcategory] = useState<string>('all');
  const [activeBrand, setActiveBrand] = useState<string>('all');
  const [activeCollection, setActiveCollection] = useState<
    'all' | 'featured' | 'bestseller' | 'new' | 'offer'
  >('all');
  const [searchQuery, setSearchQuery] = useState('');
  const [sortOrder, setSortOrder] = useState<'default' | 'price_asc' | 'price_desc'>('default');

  // Cart & Wishlist
  const [cart, setCart] = useState<CartEntry[]>(() => {
    try {
      const saved = localStorage.getItem('gct_guest_cart');
      return saved ? JSON.parse(saved) : [];
    } catch {
      return [];
    }
  });
  const [wishlistIds, setWishlistIds] = useState<number[]>([]);
  const [cartOpen, setCartOpen] = useState(false);

  // Modals
  const [selectedProduct, setSelectedProduct] = useState<ProductItem | null>(null);
  const [trackerOpen, setTrackerOpen] = useState(false);
  const [newsletterEmail, setNewsletterEmail] = useState('');
  const [subscribing, setSubscribing] = useState(false);

  const loadCatalog = useCallback(async () => {
    setLoadingCatalog(true);
    setCatalogError('');
    try {
      const data = await apiFetch<{
        categories: CategoryItem[];
        brands: BrandItem[];
        products: ProductItem[];
        recentReviews: ReviewItem[];
      }>('/api/catalog');
      setCategories(data.categories || []);
      setBrands(data.brands || []);
      setProducts(data.products || []);
      setRecentReviews(data.recentReviews || []);
    } catch (err: any) {
      try {
        const fallback = await fetchCatalogFromSupabase(supabase);
        setCategories(fallback.categories || []);
        setBrands(fallback.brands || []);
        setProducts(fallback.products || []);
        setRecentReviews(fallback.recentReviews || []);
      } catch {
        setCatalogError(err?.message || 'Unable to load storefront catalog.');
      }
    } finally {
      setLoadingCatalog(false);
    }
  }, []);

  const syncUserCollections = useCallback(async () => {
    try {
      const [cartRes, wishRes] = await Promise.all([
        apiFetch<{ items: Array<{ quantity: number; product: ProductItem }> }>('/api/cart'),
        apiFetch<{ items: Array<{ product: ProductItem }> }>('/api/wishlist'),
      ]);
      if (cartRes.items && cartRes.items.length > 0) {
        setCart(cartRes.items.map((i) => ({ product: i.product, quantity: i.quantity })));
      }
      setWishlistIds((wishRes.items || []).map((w) => w.product.id));
    } catch {
      // Ignore if unauthenticated
    }
  }, []);

  // Restore session (either custom JWT or Firebase Google Sign-In)
  useEffect(() => {
    loadCatalog();

    const storedToken = getStoredSessionToken();
    if (storedToken) {
      apiFetch<{ user: UserProfile }>('/api/auth/me')
        .then((res) => {
          setUser(res.user);
          syncUserCollections();
        })
        .catch(() => setSessionToken(null));
    }

    const unsub = onAuthStateChanged(auth, async (fbUser) => {
      if (fbUser && !getStoredSessionToken()) {
        try {
          const idToken = await fbUser.getIdToken();
          const res = await fetch('/api/auth/firebase-sync', {
            method: 'POST',
            headers: {
              'Content-Type': 'application/json',
              Authorization: `Bearer ${idToken}`,
            },
          });
          if (res.ok) {
            const data = await res.json();
            setUser(data.user);
            syncUserCollections();
          }
        } catch {
          // Ignore silent sync errors
        }
      }
    });

    // Check Paystack redirect callback
    const params = new URLSearchParams(window.location.search);
    const psRef = params.get('paystack_ref') || params.get('reference');
    if (psRef && storedToken) {
      apiFetch('/api/payments/paystack/verify', {
        method: 'POST',
        body: JSON.stringify({ reference: psRef }),
      })
        .then(() => {
          toast.success('Paystack payment verified! Your order is confirmed.');
          window.history.replaceState({}, '', '/');
        })
        .catch(() => {});
    }

    return () => unsub();
  }, [loadCatalog, syncUserCollections]);

  useEffect(() => {
    try {
      localStorage.setItem('gct_guest_cart', JSON.stringify(cart));
    } catch {
      // Ignore storage quota errors
    }
  }, [cart]);

  const handleAuthenticated = async (authedUser: UserProfile) => {
    setUser(authedUser);
    if (authedUser.role === 'admin' || authedUser.role === 'staff') {
      setViewMode('admin');
    }
    // Push any guest cart items into DB cart
    if (cart.length > 0) {
      for (const entry of cart) {
        await apiFetch('/api/cart', {
          method: 'POST',
          body: JSON.stringify({ productId: entry.product.id, quantity: entry.quantity }),
        }).catch(() => {});
      }
    }
    await syncUserCollections();
  };

  const handleLogout = async () => {
    setSessionToken(null);
    await signOut(auth).catch(() => {});
    setUser(null);
    setWishlistIds([]);
    setViewMode('store');
    toast.success('Signed out.');
  };

  const handleAddToCart = async (product: ProductItem, qty = 1) => {
    setCart((prev) => {
      const existing = prev.find((i) => i.product.id === product.id);
      if (existing) {
        return prev.map((i) =>
          i.product.id === product.id
            ? { ...i, quantity: Math.min(product.stockQty, i.quantity + qty) }
            : i
        );
      }
      return [...prev, { product, quantity: qty }];
    });
    toast.success(`${product.name} added to cart`);
    if (user) {
      await apiFetch('/api/cart', {
        method: 'POST',
        body: JSON.stringify({ productId: product.id, quantity: qty }),
      }).catch(() => {});
    }
  };

  const handleUpdateQty = async (productId: number, qty: number) => {
    if (qty <= 0) {
      handleRemoveItem(productId);
      return;
    }
    setCart((prev) =>
      prev.map((i) => (i.product.id === productId ? { ...i, quantity: qty } : i))
    );
    if (user) {
      await apiFetch(`/api/cart/${productId}`, {
        method: 'PUT',
        body: JSON.stringify({ quantity: qty }),
      }).catch(() => {});
    }
  };

  const handleRemoveItem = async (productId: number) => {
    setCart((prev) => prev.filter((i) => i.product.id !== productId));
    if (user) {
      await apiFetch(`/api/cart/${productId}`, { method: 'DELETE' }).catch(() => {});
    }
  };

  const handleToggleWishlist = async (product: ProductItem) => {
    if (!user) {
      setAuthInitialMode('login');
      setAuthModalOpen(true);
      toast.info('Please sign in to save items to your wishlist.');
      return;
    }
    try {
      const res = await apiFetch<{ wishlisted: boolean }>('/api/wishlist/toggle', {
        method: 'POST',
        body: JSON.stringify({ productId: product.id }),
      });
      setWishlistIds((prev) =>
        res.wishlisted ? [...new Set([...prev, product.id])] : prev.filter((id) => id !== product.id)
      );
      toast.success(res.wishlisted ? 'Saved to wishlist' : 'Removed from wishlist');
    } catch (err: any) {
      toast.error(err?.message || 'Wishlist update failed.');
    }
  };

  const handleNewsletterSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!newsletterEmail.trim()) return;
    setSubscribing(true);
    try {
      const res = await apiFetch<{ message: string }>('/api/newsletter', {
        method: 'POST',
        body: JSON.stringify({ email: newsletterEmail }),
      });
      setNewsletterEmail('');
      toast.success(res.message);
    } catch (err: any) {
      toast.error(err?.message || 'Could not subscribe.');
    } finally {
      setSubscribing(false);
    }
  };

  // Derived filtered catalog
  const subcategoriesForGroup = useMemo(() => {
    return categories.filter(
      (c) => activeCategory === 'all' || c.parentGroup === activeCategory
    );
  }, [categories, activeCategory]);

  const filteredProducts = useMemo(() => {
    const q = searchQuery.trim().toLowerCase();
    const list = products.filter((p) => {
      if (activeCategory !== 'all' && p.categoryGroup !== activeCategory) return false;
      if (activeSubcategory !== 'all' && p.subcategory !== activeSubcategory) return false;
      if (activeBrand !== 'all' && p.brandSlug !== activeBrand) return false;
      if (activeCollection === 'featured' && !p.isFeatured) return false;
      if (activeCollection === 'bestseller' && !p.isBestSeller) return false;
      if (activeCollection === 'new' && !p.isNewArrival) return false;
      if (activeCollection === 'offer' && !p.isSpecialOffer) return false;
      if (q) {
        const hay = `${p.name} ${p.brandName} ${p.subcategory} ${p.description} ${p.storageOrVariant}`.toLowerCase();
        if (!hay.includes(q)) return false;
      }
      return true;
    });
    if (sortOrder === 'price_asc') return [...list].sort((a, b) => a.priceGhs - b.priceGhs);
    if (sortOrder === 'price_desc') return [...list].sort((a, b) => b.priceGhs - a.priceGhs);
    return list;
  }, [
    products,
    activeCategory,
    activeSubcategory,
    activeBrand,
    activeCollection,
    searchQuery,
    sortOrder,
  ]);

  const wishlistProducts = useMemo(
    () => products.filter((p) => wishlistIds.includes(p.id)),
    [products, wishlistIds]
  );

  const totalCartCount = cart.reduce((sum, c) => sum + c.quantity, 0);

  const selectCategoryNav = (cat: string) => {
    setViewMode('store');
    setActiveCategory(cat);
    setActiveSubcategory('all');
    setActiveBrand('all');
    document.getElementById('catalog-section')?.scrollIntoView({ behavior: 'smooth' });
  };

  return (
    <div className="min-h-screen flex flex-col bg-white text-slate-900">
      <Toaster position="bottom-right" richColors />

      {/* Top Navigation Bar — Clean 3-Zone Header */}
      <header className="sticky top-0 z-40 bg-white/95 backdrop-blur-md border-b border-slate-200">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 h-16 flex items-center justify-between gap-4 lg:gap-8">
          {/* Zone 1: Single-line Brand Wordmark */}
          <button
            type="button"
            onClick={() => {
              setViewMode('store');
              window.scrollTo({ top: 0, behavior: 'smooth' });
            }}
            className="text-base sm:text-lg font-extrabold tracking-tight text-[#001B5E] whitespace-nowrap shrink-0 font-display cursor-pointer"
          >
            MAGNOM PHONES HUB
          </button>

          {/* Zone 2: 5 Concise Single-Line Nav Links */}
          <nav className="hidden lg:flex items-center gap-6 text-sm font-medium text-slate-600">
            {[
              { key: 'all', label: 'All Devices' },
              { key: 'iphones', label: 'iPhones' },
              { key: 'android', label: 'Android' },
              { key: 'laptops', label: 'Laptops' },
              { key: 'accessories', label: 'Accessories' },
            ].map((item) => (
              <button
                key={item.key}
                type="button"
                onClick={() => selectCategoryNav(item.key)}
                className={`whitespace-nowrap shrink-0 py-1 border-b-2 transition-colors cursor-pointer ${
                  viewMode === 'store' && activeCategory === item.key
                    ? 'border-[#DC0000] text-[#001B5E] font-semibold'
                    : 'border-transparent hover:text-[#001B5E]'
                }`}
              >
                {item.label}
              </button>
            ))}
          </nav>

          {/* Zone 3: Search + Wishlist + Account + Cart */}
          <div className="flex items-center gap-2 sm:gap-3 shrink-0">
            <div className="hidden md:flex items-center relative w-48 lg:w-56">
              <Search className="h-3.5 w-3.5 text-slate-400 absolute left-3 pointer-events-none" />
              <input
                type="search"
                value={searchQuery}
                onChange={(e) => {
                  setSearchQuery(e.target.value);
                  if (viewMode !== 'store') setViewMode('store');
                }}
                placeholder="Search phones, laptops..."
                className="h-9 w-full rounded-lg border border-slate-200 bg-slate-50 pl-8 pr-3 text-xs text-slate-900 placeholder:text-slate-400 focus:bg-white focus:outline-none focus:ring-2 focus:ring-[#001B5E]"
              />
            </div>

            <button
              type="button"
              onClick={() => {
                if (!user) {
                  setAuthInitialMode('login');
                  setAuthModalOpen(true);
                } else {
                  setViewMode('customer');
                }
              }}
              className="relative h-9 w-9 inline-flex items-center justify-center rounded-lg border border-slate-200 text-slate-700 hover:bg-slate-100 cursor-pointer shrink-0"
              aria-label="Wishlist"
            >
              <Heart className="h-4 w-4" />
              {wishlistIds.length > 0 && (
                <span className="absolute -top-1 -right-1 h-4 min-w-4 px-1 rounded-full bg-[#DC0000] text-white text-[10px] font-bold flex items-center justify-center font-mono-nums">
                  {wishlistIds.length}
                </span>
              )}
            </button>

            {user ? (
              <div className="flex items-center gap-2 shrink-0">
                {(user.role === 'admin' || user.role === 'staff') && (
                  <Button
                    size="sm"
                    variant={viewMode === 'admin' ? 'accent' : 'outline'}
                    onClick={() => setViewMode(viewMode === 'admin' ? 'store' : 'admin')}
                  >
                    <LayoutDashboard className="h-3.5 w-3.5" />
                    <span className="hidden sm:inline">
                      {user.role === 'admin' ? 'Admin' : 'Staff'}
                    </span>
                  </Button>
                )}
                <Button
                  size="sm"
                  variant={viewMode === 'customer' ? 'accent' : 'outline'}
                  onClick={() => setViewMode(viewMode === 'customer' ? 'store' : 'customer')}
                >
                  <UserIcon className="h-3.5 w-3.5" />
                  <span className="hidden sm:inline max-w-[90px] truncate">
                    {user.fullName.split(' ')[0]}
                  </span>
                </Button>
              </div>
            ) : (
              <div className="flex items-center gap-1.5 shrink-0">
                <Button
                  size="sm"
                  variant="outline"
                  onClick={() => {
                    setAuthInitialMode('login');
                    setAuthModalOpen(true);
                  }}
                >
                  Sign In
                </Button>
                <Button
                  size="sm"
                  variant="ghost"
                  className="hidden sm:inline-flex"
                  onClick={() => {
                    setAuthInitialMode('register');
                    setAuthModalOpen(true);
                  }}
                >
                  Register
                </Button>
              </div>
            )}

            <Button
              size="sm"
              variant="default"
              onClick={() => setCartOpen(true)}
              className="relative"
            >
              <ShoppingBag className="h-4 w-4" />
              <span className="font-mono-nums">{totalCartCount}</span>
            </Button>
          </div>
        </div>
      </header>

      {/* Main Content Switch */}
      <main className="flex-1">
        {viewMode === 'customer' && user ? (
          <CustomerDashboard
            user={user}
            wishlistProducts={wishlistProducts}
            onBackToStore={() => setViewMode('store')}
            onUserUpdated={setUser}
            onAddToCart={(p) => handleAddToCart(p, 1)}
            onToggleWishlist={handleToggleWishlist}
            onLogout={handleLogout}
          />
        ) : viewMode === 'admin' && user && (user.role === 'admin' || user.role === 'staff') ? (
          <AdminDashboard
            currentUser={user}
            onBackToStore={() => setViewMode('store')}
            onCatalogMutated={loadCatalog}
          />
        ) : (
          <>
            {/* Hero Section */}
            <section className="bg-[#001B5E] text-white">
              <div className="max-w-7xl mx-auto px-4 sm:px-6 py-12 lg:py-16 grid grid-cols-1 lg:grid-cols-12 gap-8 lg:gap-12 items-stretch">
                <div className="lg:col-span-6 flex flex-col justify-center space-y-6">
                  <p className="text-xs font-semibold tracking-wide text-red-400">
                    Osu, Accra · Nationwide Ghana Delivery
                  </p>
                  <h1
                    className="font-display font-bold tracking-tight text-white leading-[1.08]"
                    style={{ fontSize: 'clamp(2.25rem, 4vw, 3.5rem)', textWrap: 'balance' }}
                  >
                    MAGNOM PHONES HUB
                  </h1>
                  <p className="text-base text-slate-300 max-w-xl leading-relaxed">
                    Authentic iPhones, Android smartphones, business laptops, and genuine accessories across Ghana. Priced transparently in Ghana Cedis with Paystack MoMo and same-day Accra dispatch.
                  </p>
                  <div className="flex flex-wrap items-center gap-3 pt-1">
                    <Button
                      variant="accent"
                      size="lg"
                      onClick={() =>
                        document
                          .getElementById('catalog-section')
                          ?.scrollIntoView({ behavior: 'smooth' })
                      }
                    >
                      Explore Catalog
                      <ArrowRight className="h-4 w-4" />
                    </Button>
                    <Button
                      variant="outline"
                      size="lg"
                      className="border-white/25 bg-transparent text-white hover:bg-white/10 hover:text-white"
                      onClick={() => setTrackerOpen(true)}
                    >
                      Track Order
                    </Button>
                  </div>
                </div>

                <div className="lg:col-span-6">
                  <div className="h-full min-h-[260px] rounded-2xl overflow-hidden border border-white/10 bg-[#0A2975]">
                    <img
                      src={HERO_IMAGE}
                      alt="Flagship smartphone, ultrabook laptop, and wireless headphones"
                      referrerPolicy="no-referrer"
                      className="w-full h-full object-cover"
                    />
                  </div>
                </div>
              </div>

              {/* 4-Column Trust & Delivery Strip */}
              <div className="border-t border-white/10 bg-[#001242]">
                <div className="max-w-7xl mx-auto px-4 sm:px-6 py-5 grid grid-cols-2 lg:grid-cols-4 gap-6 text-xs">
                  <div>
                    <p className="font-semibold text-white">Paystack MoMo &amp; Cards</p>
                    <p className="text-slate-400 mt-0.5">MTN MoMo, Telecel Cash &amp; Visa in GH₵</p>
                  </div>
                  <div>
                    <p className="font-semibold text-white">Same-Day Accra Delivery</p>
                    <p className="text-slate-400 mt-0.5">Free in Greater Accra on orders GH₵ 5,000+</p>
                  </div>
                  <div>
                    <p className="font-semibold text-white">Verified 12-Month Warranty</p>
                    <p className="text-slate-400 mt-0.5">Serial-checked sealed &amp; certified units</p>
                  </div>
                  <div>
                    <p className="font-semibold text-white">All 16 Ghana Regions</p>
                    <p className="text-slate-400 mt-0.5">Insured courier to Kumasi, Takoradi &amp; Tamale</p>
                  </div>
                </div>
              </div>
            </section>

            {/* Mobile Search Input */}
            <div className="md:hidden bg-white border-b border-slate-200 px-4 py-3">
              <div className="relative">
                <Search className="h-4 w-4 text-slate-400 absolute left-3 top-3" />
                <Input
                  type="search"
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                  placeholder="Search iPhone 16, Tecno, MacBook, Anker..."
                  className="pl-9"
                />
              </div>
            </div>

            {/* Catalog & Shop by Category */}
            <section id="catalog-section" className="max-w-7xl mx-auto px-4 sm:px-6 py-12 space-y-8">
              <div className="flex flex-col md:flex-row md:items-end justify-between gap-4">
                <div>
                  <h2 className="text-2xl sm:text-3xl font-bold text-[#001B5E] font-display">
                    {CATEGORY_GROUP_LABELS[activeCategory] || 'Electronics Catalog'}
                  </h2>
                  <p className="text-sm text-slate-500 mt-1">
                    Browse by category, series, or brand. Click any device for full specs and reviews.
                  </p>
                </div>

                {/* Collection Filter Buttons */}
                <div className="flex flex-wrap items-center gap-1 p-1 bg-slate-200/70 rounded-lg self-start">
                  {[
                    { id: 'all', label: 'All' },
                    { id: 'featured', label: 'Featured' },
                    { id: 'bestseller', label: 'Best Sellers' },
                    { id: 'new', label: 'New Arrivals' },
                    { id: 'offer', label: 'Special Offers' },
                  ].map((tab) => (
                    <button
                      key={tab.id}
                      type="button"
                      onClick={() => setActiveCollection(tab.id as any)}
                      className={`px-3 py-1.5 text-xs font-semibold rounded-md transition-colors whitespace-nowrap shrink-0 cursor-pointer ${
                        activeCollection === tab.id
                          ? 'bg-white text-[#001B5E] shadow-xs'
                          : 'text-slate-600 hover:text-slate-950'
                      }`}
                    >
                      {tab.label}
                    </button>
                  ))}
                </div>
              </div>

              {/* Category + Subcategory + Brand + Sort Toolbar */}
              <div className="bg-white border border-slate-200 rounded-xl p-4 flex flex-wrap items-center justify-between gap-3">
                <div className="flex flex-wrap items-center gap-1.5">
                  {[
                    { id: 'all', label: 'All Categories' },
                    { id: 'iphones', label: 'iPhones' },
                    { id: 'android', label: 'Android Phones' },
                    { id: 'laptops', label: 'Laptops' },
                    { id: 'accessories', label: 'Accessories' },
                  ].map((cat) => (
                    <button
                      key={cat.id}
                      type="button"
                      onClick={() => {
                        setActiveCategory(cat.id);
                        setActiveSubcategory('all');
                      }}
                      className={`px-3.5 py-2 rounded-lg text-xs font-semibold transition-colors whitespace-nowrap shrink-0 cursor-pointer ${
                        activeCategory === cat.id
                          ? 'bg-[#001B5E] text-white'
                          : 'bg-slate-100 text-slate-700 hover:bg-slate-200'
                      }`}
                    >
                      {cat.label}
                    </button>
                  ))}
                </div>

                <div className="flex flex-wrap items-center gap-2.5">
                  <select
                    aria-label="Filter by series or subcategory"
                    value={activeSubcategory}
                    onChange={(e) => setActiveSubcategory(e.target.value)}
                    className="h-9 rounded-lg border border-slate-200 bg-white px-3 text-xs font-medium text-slate-700"
                  >
                    <option value="all">All Series &amp; Types</option>
                    {subcategoriesForGroup.map((c) => (
                      <option key={c.id} value={c.name}>
                        {c.name}
                      </option>
                    ))}
                  </select>

                  <select
                    aria-label="Filter by brand"
                    value={activeBrand}
                    onChange={(e) => setActiveBrand(e.target.value)}
                    className="h-9 rounded-lg border border-slate-200 bg-white px-3 text-xs font-medium text-slate-700"
                  >
                    <option value="all">All Brands</option>
                    {brands.map((b) => (
                      <option key={b.id} value={b.slug}>
                        {b.name}
                      </option>
                    ))}
                  </select>

                  <select
                    aria-label="Sort products"
                    value={sortOrder}
                    onChange={(e) => setSortOrder(e.target.value as any)}
                    className="h-9 rounded-lg border border-slate-200 bg-white px-3 text-xs font-medium text-slate-700"
                  >
                    <option value="default">Sort: Recommended</option>
                    <option value="price_asc">Price: Low to High</option>
                    <option value="price_desc">Price: High to Low</option>
                  </select>
                </div>
              </div>

              {/* Product Grid */}
              {loadingCatalog ? (
                <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-6">
                  {[1, 2, 3, 4, 5, 6].map((n) => (
                    <div
                      key={n}
                      className="h-96 rounded-xl border border-slate-200 bg-white animate-pulse"
                    />
                  ))}
                </div>
              ) : catalogError ? (
                <div className="rounded-xl border border-red-200 bg-red-50 p-8 text-center space-y-3">
                  <p className="text-sm font-semibold text-red-800">{catalogError}</p>
                  <Button variant="outline" size="sm" onClick={loadCatalog}>
                    Retry Loading Store
                  </Button>
                </div>
              ) : filteredProducts.length === 0 ? (
                <div className="rounded-xl border border-slate-200 bg-white p-12 text-center space-y-3">
                  <p className="text-base font-bold text-[#001B5E]">
                    No matching devices found
                  </p>
                  <p className="text-xs text-slate-500">
                    Try clearing your search or switching category filters.
                  </p>
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={() => {
                      setActiveCategory('all');
                      setActiveSubcategory('all');
                      setActiveBrand('all');
                      setActiveCollection('all');
                      setSearchQuery('');
                    }}
                  >
                    Reset All Filters
                  </Button>
                </div>
              ) : (
                <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-6">
                  {filteredProducts.map((product) => {
                    const isWishlisted = wishlistIds.includes(product.id);
                    return (
                      <article
                        key={product.id}
                        className="group rounded-xl border border-slate-200 bg-white overflow-hidden flex flex-col transition-all duration-150 hover:-translate-y-0.5 hover:shadow-md"
                      >
                        <button
                          type="button"
                          onClick={() => setSelectedProduct(product)}
                          className="relative aspect-[4/3] w-full bg-slate-100 overflow-hidden cursor-pointer block text-left"
                        >
                          <ProductImage
                            src={product.imageUrl}
                            alt={product.name}
                            categoryGroup={product.categoryGroup}
                            className="w-full h-full object-cover transition-transform duration-300 group-hover:scale-[1.02]"
                          />
                        </button>

                        <div className="p-5 flex-1 flex flex-col justify-between space-y-4">
                          <div>
                            <div className="flex items-center justify-between gap-2 text-xs text-slate-500">
                              <span className="truncate">
                                {product.brandName} · {product.subcategory}
                              </span>
                              <span className="inline-flex items-center gap-1 shrink-0 text-slate-700 font-medium">
                                <Star className="h-3 w-3 fill-amber-400 text-amber-400" />
                                <span className="font-mono-nums">{product.ratingAvg}</span>
                              </span>
                            </div>

                            <button
                              type="button"
                              onClick={() => setSelectedProduct(product)}
                              className="text-left block w-full mt-1.5 cursor-pointer"
                            >
                              <h3 className="text-base font-bold text-[#001B5E] group-hover:text-[#DC0000] transition-colors line-clamp-1">
                                {product.name}
                              </h3>
                            </button>

                            <p className="text-xs text-slate-500 mt-1 line-clamp-1">
                              {product.storageOrVariant || product.condition}
                            </p>
                          </div>

                          <div className="space-y-3 pt-2 border-t border-slate-100">
                            <div className="flex items-baseline justify-between gap-2">
                              <div className="flex items-baseline gap-2">
                                <span className="text-base font-bold text-[#001B5E] font-mono-nums">
                                  {formatGhs(product.priceGhs)}
                                </span>
                                {product.compareAtGhs &&
                                  product.compareAtGhs > product.priceGhs && (
                                    <span className="text-xs text-slate-400 line-through font-mono-nums">
                                      {formatGhs(product.compareAtGhs)}
                                    </span>
                                  )}
                              </div>
                              <span
                                className={`text-[11px] font-medium ${
                                  product.stockQty > 0 ? 'text-emerald-700' : 'text-red-600'
                                }`}
                              >
                                {product.stockQty > 0 ? 'In Stock' : 'Sold Out'}
                              </span>
                            </div>

                            <div className="flex items-center gap-2">
                              <Button
                                variant="accent"
                                size="sm"
                                className="flex-1"
                                disabled={product.stockQty <= 0}
                                onClick={() => handleAddToCart(product, 1)}
                              >
                                Add to Cart
                              </Button>
                              <Button
                                variant="outline"
                                size="icon"
                                className="h-9 w-9"
                                onClick={() => handleToggleWishlist(product)}
                                aria-label="Save to wishlist"
                              >
                                <Heart
                                  className={`h-4 w-4 ${
                                    isWishlisted
                                      ? 'fill-red-500 text-red-500'
                                      : 'text-slate-500'
                                  }`}
                                />
                              </Button>
                            </div>
                          </div>
                        </div>
                      </article>
                    );
                  })}
                </div>
              )}
            </section>

            {/* Popular Brands & Verified Ghanaian Reviews */}
            <section className="bg-white border-t border-b border-slate-200">
              <div className="max-w-7xl mx-auto px-4 sm:px-6 py-12 space-y-12">
                {/* Popular Brands */}
                <div className="space-y-4">
                  <div className="flex items-center justify-between">
                    <h2 className="text-lg font-bold text-[#001B5E] font-display">
                      Popular Brands in Ghana
                    </h2>
                    {activeBrand !== 'all' && (
                      <button
                        type="button"
                        onClick={() => setActiveBrand('all')}
                        className="text-xs font-semibold text-[#DC0000] hover:underline cursor-pointer"
                      >
                        Show All Brands
                      </button>
                    )}
                  </div>
                  <div className="flex flex-wrap gap-2">
                    {brands.map((brand) => (
                      <button
                        key={brand.id}
                        type="button"
                        onClick={() => {
                          setActiveBrand(brand.slug);
                          setActiveCategory('all');
                          setActiveSubcategory('all');
                          document
                            .getElementById('catalog-section')
                            ?.scrollIntoView({ behavior: 'smooth' });
                        }}
                        className={`px-4 py-2 rounded-lg border text-xs font-semibold transition-colors cursor-pointer whitespace-nowrap shrink-0 ${
                          activeBrand === brand.slug
                            ? 'border-[#DC0000] bg-[#FFF1F1] text-[#DC0000]'
                            : 'border-slate-200 bg-slate-50 text-[#001B5E] hover:border-[#001B5E]/30 hover:bg-white'
                        }`}
                      >
                        {brand.name}
                      </button>
                    ))}
                  </div>
                </div>

                {/* Verified Customer Reviews */}
                <div className="space-y-5">
                  <div>
                    <h2 className="text-xl font-bold text-[#001B5E] font-display">
                      Verified Buyer Reviews Across Ghana
                    </h2>
                    <p className="text-xs text-slate-500 mt-1">
                      Real feedback from customers in Accra, Kumasi, Tema, and Takoradi.
                    </p>
                  </div>

                  <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
                    {recentReviews.slice(0, 6).map((rev) => (
                      <div
                        key={rev.id}
                        className="rounded-xl border border-slate-200 bg-slate-50/70 p-5 space-y-2.5"
                      >
                        <div className="flex items-center justify-between">
                          <div className="flex items-center gap-0.5">
                            {Array.from({ length: rev.rating }).map((_, idx) => (
                              <Star
                                key={idx}
                                className="h-3.5 w-3.5 fill-amber-400 text-amber-400"
                              />
                            ))}
                          </div>
                          <span className="text-[11px] text-emerald-700 font-semibold">
                            Verified Buyer
                          </span>
                        </div>
                        <p className="text-sm font-bold text-[#001B5E]">{rev.title}</p>
                        <p className="text-xs text-slate-600 leading-relaxed">{rev.comment}</p>
                        <p className="text-xs text-slate-400 pt-1">
                          {rev.reviewerName} · {rev.reviewerCity}
                        </p>
                      </div>
                    ))}
                  </div>
                </div>
              </div>
            </section>

            {/* Newsletter Subscription */}
            <section className="max-w-7xl mx-auto px-4 sm:px-6 py-12">
              <div className="rounded-2xl bg-[#0A2975] text-white p-8 md:p-10 flex flex-col md:flex-row items-start md:items-center justify-between gap-6">
                <div className="space-y-1.5 max-w-lg">
                  <h2 className="text-xl font-bold font-display">
                    Get Weekly Ghana Price Drops &amp; Restock Alerts
                  </h2>
                  <p className="text-xs text-slate-200 leading-relaxed">
                    Receive direct updates when new iPhone series, MacBooks, and Tecno/Samsung deals land at our Osu warehouse.
                  </p>
                </div>

                <form
                  onSubmit={handleNewsletterSubmit}
                  className="flex w-full md:w-auto gap-2 min-w-[280px] sm:min-w-[360px]"
                >
                  <Input
                    type="email"
                    required
                    value={newsletterEmail}
                    onChange={(e) => setNewsletterEmail(e.target.value)}
                    placeholder="you@example.com"
                    className="bg-white text-slate-900 border-0"
                  />
                  <Button type="submit" variant="accent" disabled={subscribing}>
                    {subscribing ? 'Joining...' : 'Subscribe'}
                  </Button>
                </form>
              </div>
            </section>
          </>
        )}
      </main>

      {/* Navy Footer */}
      <footer className="bg-[#001B5E] text-slate-300 border-t border-white/10">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 py-12 grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-8 text-xs">
          <div className="space-y-3">
            <p className="text-base font-extrabold text-white font-display">MAGNOM PHONES HUB</p>
            <p className="text-slate-400 leading-relaxed">
              Authentic smartphones, laptops, and accessories in Ghana with verified warranties and transparent GH₵ pricing.
            </p>
            <p className="inline-flex items-center gap-1.5 text-slate-300">
              <MapPin className="h-3.5 w-3.5 text-[#DC0000] shrink-0" />
              Oxford Street, Osu, Accra · GA-054-2291
            </p>
            <div className="pt-1 space-y-1">
              <a
                href="https://wa.me/233532779339?text=Hello%20MAGNOM%20PHONES%20HUB%2C%20I%20would%20like%20to%20inquire%20about%20a%20device."
                target="_blank"
                rel="noopener noreferrer"
                className="flex items-center gap-1.5 text-slate-300 hover:text-white"
              >
                <MessageCircle className="h-3.5 w-3.5 text-[#DC0000] shrink-0" />
                WhatsApp: 0532 779 339
              </a>
              <a
                href="tel:+233207581098"
                className="flex items-center gap-1.5 text-slate-300 hover:text-white"
              >
                <Phone className="h-3.5 w-3.5 text-[#DC0000] shrink-0" />
                Calls: 0207 581 098
              </a>
            </div>
          </div>

          <div className="space-y-2.5">
            <p className="font-bold text-white">Shop Categories</p>
            <ul className="space-y-1.5">
              <li>
                <button
                  type="button"
                  onClick={() => selectCategoryNav('iphones')}
                  className="hover:text-white cursor-pointer"
                >
                  iPhones (11 – 17 Series)
                </button>
              </li>
              <li>
                <button
                  type="button"
                  onClick={() => selectCategoryNav('android')}
                  className="hover:text-white cursor-pointer"
                >
                  Android (Samsung, Tecno, Infinix, Pixel)
                </button>
              </li>
              <li>
                <button
                  type="button"
                  onClick={() => selectCategoryNav('laptops')}
                  className="hover:text-white cursor-pointer"
                >
                  Laptops (MacBook, HP, Dell, Lenovo)
                </button>
              </li>
              <li>
                <button
                  type="button"
                  onClick={() => selectCategoryNav('accessories')}
                  className="hover:text-white cursor-pointer"
                >
                  Accessories &amp; Audio
                </button>
              </li>
            </ul>
          </div>

          <div className="space-y-2.5">
            <p className="font-bold text-white">Customer Service</p>
            <ul className="space-y-1.5">
              <li>
                <button
                  type="button"
                  onClick={() => setTrackerOpen(true)}
                  className="hover:text-white cursor-pointer"
                >
                  Track Your Order
                </button>
              </li>
              <li>
                <button
                  type="button"
                  onClick={() => {
                    if (user) setViewMode('customer');
                    else setAuthModalOpen(true);
                  }}
                  className="hover:text-white cursor-pointer"
                >
                  Customer Dashboard
                </button>
              </li>
              <li>
                <button
                  type="button"
                  onClick={() => {
                    if (user?.role === 'admin' || user?.role === 'staff') setViewMode('admin');
                    else {
                      setAuthInitialMode('login');
                      setAuthModalOpen(true);
                    }
                  }}
                  className="hover:text-white cursor-pointer"
                >
                  Admin Dashboard
                </button>
              </li>
              <li className="flex items-center gap-1.5 text-slate-400">
                <Truck className="h-3.5 w-3.5 text-[#DC0000]" />
                Same-Day Accra &amp; Next-Day Regional
              </li>
              <li className="flex items-center gap-1.5 text-slate-400">
                <ShieldCheck className="h-3.5 w-3.5 text-[#DC0000]" />
                12-Month Hardware Warranty
              </li>
            </ul>
          </div>

          <div className="space-y-2.5">
            <p className="font-bold text-white">Accepted Payments (GH₵)</p>
            <p className="text-slate-400 leading-relaxed">
              Paystack Checkout supporting MTN Mobile Money, Telecel Cash, AT Money, Visa, Mastercard, and Cash on Delivery in Accra &amp; Kumasi.
            </p>
          </div>
        </div>

        <div className="border-t border-white/10">
          <div className="max-w-7xl mx-auto px-4 sm:px-6 py-4 flex flex-wrap items-center justify-between gap-3 text-xs text-slate-400">
            <span>© {new Date().getFullYear()} MAGNOM PHONES HUB Ghana. All rights reserved.</span>
            <span>Accra · Kumasi · Takoradi · Tamale</span>
          </div>
        </div>
      </footer>

      {/* Floating Hover Contact Button (WhatsApp 0532779339 & Calls 0207581098) */}
      <div className="fixed bottom-5 right-5 z-40 group flex flex-col items-end gap-2">
        <div className="opacity-0 translate-y-2 pointer-events-none group-hover:opacity-100 group-hover:translate-y-0 group-hover:pointer-events-auto group-focus-within:opacity-100 group-focus-within:translate-y-0 group-focus-within:pointer-events-auto transition-all duration-150 flex flex-col items-end gap-2">
          <a
            href="tel:+233207581098"
            className="inline-flex items-center gap-2 rounded-lg bg-[#001B5E] text-white px-3.5 py-2.5 text-xs font-semibold shadow-lg border border-white/15 hover:bg-[#0A2975] whitespace-nowrap"
          >
            <Phone className="h-3.5 w-3.5 text-[#DC0000]" />
            Call 0207 581 098
          </a>
          <a
            href="https://wa.me/233532779339?text=Hello%20MAGNOM%20PHONES%20HUB%2C%20I%20would%20like%20to%20inquire%20about%20a%20device."
            target="_blank"
            rel="noopener noreferrer"
            className="inline-flex items-center gap-2 rounded-lg bg-white text-[#001B5E] px-3.5 py-2.5 text-xs font-semibold shadow-lg border border-slate-200 hover:border-[#DC0000] whitespace-nowrap"
          >
            <MessageCircle className="h-3.5 w-3.5 text-[#DC0000]" />
            WhatsApp 0532 779 339
          </a>
        </div>

        <a
          href="https://wa.me/233532779339?text=Hello%20MAGNOM%20PHONES%20HUB%2C%20I%20would%20like%20to%20inquire%20about%20a%20device."
          target="_blank"
          rel="noopener noreferrer"
          aria-label="Chat on WhatsApp 0532779339 or hover to call 0207581098"
          className="inline-flex items-center gap-2 rounded-lg bg-[#DC0000] text-white px-4 py-3 text-xs font-bold shadow-xl hover:bg-[#B80000] transition-colors whitespace-nowrap"
        >
          <MessageCircle className="h-4 w-4" />
          <span>Chat WhatsApp</span>
        </a>
      </div>

      {/* Modals & Drawers */}
      <AuthModal
        open={authModalOpen}
        onOpenChange={setAuthModalOpen}
        initialMode={authInitialMode}
        onAuthenticated={handleAuthenticated}
      />

      <ProductDetailModal
        product={selectedProduct}
        open={Boolean(selectedProduct)}
        onOpenChange={(o) => !o && setSelectedProduct(null)}
        user={user}
        isWishlisted={selectedProduct ? wishlistIds.includes(selectedProduct.id) : false}
        onAddToCart={handleAddToCart}
        onToggleWishlist={handleToggleWishlist}
        onOpenAuth={() => {
          setSelectedProduct(null);
          setAuthInitialMode('login');
          setAuthModalOpen(true);
        }}
      />

      <CartCheckoutSheet
        open={cartOpen}
        onOpenChange={setCartOpen}
        cart={cart}
        user={user}
        onUpdateQty={handleUpdateQty}
        onRemoveItem={handleRemoveItem}
        onClearCart={() => setCart([])}
        onOpenAuth={() => {
          setCartOpen(false);
          setAuthInitialMode('login');
          setAuthModalOpen(true);
        }}
        onOrderCompleted={(_order: OrderRecord) => {
          loadCatalog();
        }}
      />

      <OrderTrackerModal open={trackerOpen} onOpenChange={setTrackerOpen} />
    </div>
  );
}
