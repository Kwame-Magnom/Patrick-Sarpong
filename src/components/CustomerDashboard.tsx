import React, { useEffect, useState } from 'react';
import {
  ArrowLeft,
  CheckCircle2,
  Heart,
  MapPin,
  Package,
  ShieldCheck,
  Trash2,
  User as UserIcon,
} from 'lucide-react';
import { toast } from 'sonner';
import { apiFetch } from '@/src/lib/api';
import { formatGhs, GHANA_REGIONS } from '@/src/lib/utils';
import { AddressItem, OrderRecord, ProductItem, UserProfile } from '@/src/types';
import { Button } from './ui/button';
import { Input } from './ui/input';
import { Label } from './ui/label';
import { Tabs, TabsContent, TabsList, TabsTrigger } from './ui/tabs';
import { ProductImage } from './ProductImage';

interface CustomerDashboardProps {
  user: UserProfile;
  wishlistProducts: ProductItem[];
  onBackToStore: () => void;
  onUserUpdated: (user: UserProfile) => void;
  onAddToCart: (product: ProductItem) => void;
  onToggleWishlist: (product: ProductItem) => void;
  onLogout: () => void;
}

export const CustomerDashboard: React.FC<CustomerDashboardProps> = ({
  user,
  wishlistProducts,
  onBackToStore,
  onUserUpdated,
  onAddToCart,
  onToggleWishlist,
  onLogout,
}) => {
  const [orders, setOrders] = useState<OrderRecord[]>([]);
  const [addresses, setAddresses] = useState<AddressItem[]>([]);
  const [loading, setLoading] = useState(true);

  // Profile form
  const [fullName, setFullName] = useState(user.fullName);
  const [phone, setPhone] = useState(user.phone || '');
  const [savingProfile, setSavingProfile] = useState(false);

  // Change password form
  const [currentPassword, setCurrentPassword] = useState('');
  const [newPassword, setNewPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [savingPass, setSavingPass] = useState(false);

  // Add address form
  const [addrLabel, setAddrLabel] = useState('Home');
  const [addrRecipient, setAddrRecipient] = useState(user.fullName);
  const [addrPhone, setAddrPhone] = useState(user.phone || '');
  const [addrRegion, setAddrRegion] = useState('Greater Accra');
  const [addrCity, setAddrCity] = useState('Accra');
  const [addrStreet, setAddrStreet] = useState('');
  const [addrGps, setAddrGps] = useState('');
  const [savingAddr, setSavingAddr] = useState(false);

  useEffect(() => {
    setLoading(true);
    Promise.all([
      apiFetch<{ orders: OrderRecord[] }>('/api/orders'),
      apiFetch<{ addresses: AddressItem[] }>('/api/addresses'),
    ])
      .then(([ordRes, addrRes]) => {
        setOrders(ordRes.orders || []);
        setAddresses(addrRes.addresses || []);
      })
      .catch(() => {})
      .finally(() => setLoading(false));
  }, []);

  const handleSaveProfile = async (e: React.FormEvent) => {
    e.preventDefault();
    setSavingProfile(true);
    try {
      const res = await apiFetch<{ user: UserProfile }>('/api/auth/profile', {
        method: 'PUT',
        body: JSON.stringify({ fullName, phone }),
      });
      onUserUpdated(res.user);
      toast.success('Profile updated successfully.');
    } catch (err: any) {
      toast.error(err?.message || 'Failed to update profile.');
    } finally {
      setSavingProfile(false);
    }
  };

  const handleChangePassword = async (e: React.FormEvent) => {
    e.preventDefault();
    setSavingPass(true);
    try {
      await apiFetch('/api/auth/change-password', {
        method: 'POST',
        body: JSON.stringify({ currentPassword, newPassword, confirmPassword }),
      });
      setCurrentPassword('');
      setNewPassword('');
      setConfirmPassword('');
      toast.success('Password updated.');
    } catch (err: any) {
      toast.error(err?.message || 'Failed to change password.');
    } finally {
      setSavingPass(false);
    }
  };

  const handleAddAddress = async (e: React.FormEvent) => {
    e.preventDefault();
    setSavingAddr(true);
    try {
      const res = await apiFetch<{ address: AddressItem }>('/api/addresses', {
        method: 'POST',
        body: JSON.stringify({
          label: addrLabel,
          recipientName: addrRecipient,
          phone: addrPhone,
          region: addrRegion,
          city: addrCity,
          streetAddress: addrStreet,
          digitalAddress: addrGps,
          isDefault: addresses.length === 0,
        }),
      });
      setAddresses((prev) => [res.address, ...prev]);
      setAddrStreet('');
      setAddrGps('');
      toast.success('Delivery address saved.');
    } catch (err: any) {
      toast.error(err?.message || 'Failed to save address.');
    } finally {
      setSavingAddr(false);
    }
  };

  const handleDeleteAddress = async (id: number) => {
    try {
      await apiFetch(`/api/addresses/${id}`, { method: 'DELETE' });
      setAddresses((prev) => prev.filter((a) => a.id !== id));
      toast.success('Address removed.');
    } catch {
      toast.error('Failed to remove address.');
    }
  };

  return (
    <section className="max-w-6xl mx-auto px-4 sm:px-6 py-10 space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-4 border-b border-slate-200 pb-5">
        <div>
          <button
            type="button"
            onClick={onBackToStore}
            className="inline-flex items-center gap-1.5 text-xs font-semibold text-[#DC0000] hover:underline mb-2 cursor-pointer"
          >
            <ArrowLeft className="h-3.5 w-3.5" />
            Back to Storefront
          </button>
          <h1 className="text-2xl font-bold text-[#001B5E] font-display">
            Welcome, {user.fullName}
          </h1>
          <p className="text-xs text-slate-500 mt-0.5">
            {user.email} · {user.phone || 'No Ghana phone added'} · Role:{' '}
            <span className="capitalize font-semibold text-[#001B5E]">{user.role}</span> ·{' '}
            <span className="text-emerald-700 font-semibold">
              {user.emailVerified ? 'Verified Account' : 'Unverified Email'}
            </span>
          </p>
        </div>

        <Button variant="outline" size="sm" onClick={onLogout}>
          Sign Out
        </Button>
      </div>

      <Tabs defaultValue="orders" className="w-full">
        <TabsList className="flex-wrap h-auto">
          <TabsTrigger value="orders">
            <Package className="h-3.5 w-3.5 mr-1.5" />
            Orders ({orders.length})
          </TabsTrigger>
          <TabsTrigger value="profile">
            <UserIcon className="h-3.5 w-3.5 mr-1.5" />
            Profile &amp; Password
          </TabsTrigger>
          <TabsTrigger value="addresses">
            <MapPin className="h-3.5 w-3.5 mr-1.5" />
            Addresses ({addresses.length})
          </TabsTrigger>
          <TabsTrigger value="wishlist">
            <Heart className="h-3.5 w-3.5 mr-1.5" />
            Wishlist ({wishlistProducts.length})
          </TabsTrigger>
        </TabsList>

        <TabsContent value="orders" className="space-y-4">
          {loading ? (
            <p className="text-sm text-slate-500 py-8">Loading your order history...</p>
          ) : orders.length === 0 ? (
            <div className="rounded-xl border border-slate-200 bg-white p-8 text-center">
              <Package className="h-9 w-9 text-slate-300 mx-auto mb-2" />
              <p className="text-sm font-semibold text-slate-900">No orders placed yet</p>
              <p className="text-xs text-slate-500 mt-1 mb-4">
                Your confirmed Paystack and Cash on Delivery orders will appear here.
              </p>
              <Button variant="accent" size="sm" onClick={onBackToStore}>
                Browse Electronics
              </Button>
            </div>
          ) : (
            <div className="space-y-4">
              {orders.map((order) => (
                <div
                  key={order.id}
                  className="rounded-xl border border-slate-200 bg-white p-5 space-y-4"
                >
                  <div className="flex flex-wrap items-center justify-between gap-3 border-b border-slate-100 pb-3">
                    <div>
                      <p className="text-sm font-bold text-[#001B5E] font-mono-nums">
                        {order.orderNumber}
                      </p>
                      <p className="text-xs text-slate-500">
                        {new Date(order.createdAt).toLocaleDateString('en-GH', {
                          year: 'numeric',
                          month: 'short',
                          day: 'numeric',
                        })}{' '}
                        · {order.deliveryMethod} · {order.shippingCity}, {order.shippingRegion}
                      </p>
                    </div>
                    <div className="text-right">
                      <p className="text-base font-bold text-[#001B5E] font-mono-nums">
                        {formatGhs(order.totalGhs)}
                      </p>
                      <p className="text-xs text-slate-600 capitalize">
                        Order: <span className="font-semibold text-[#001B5E]">{order.orderStatus}</span>{' '}
                        · Payment:{' '}
                        <span className="font-semibold text-emerald-700">
                          {order.paymentStatus.replace('_', ' ')}
                        </span>
                      </p>
                    </div>
                  </div>

                  <div className="space-y-2">
                    {order.items?.map((item) => (
                      <div key={item.id} className="flex items-center justify-between text-xs">
                        <div className="flex items-center gap-3">
                          <ProductImage
                            src={item.productImage}
                            alt={item.productName}
                            className="h-11 w-11 rounded-md bg-slate-100"
                          />
                          <div>
                            <p className="font-semibold text-slate-900">{item.productName}</p>
                            <p className="text-slate-500 font-mono-nums">
                              Qty: {item.quantity} × {formatGhs(item.unitPriceGhs)}
                            </p>
                          </div>
                        </div>
                        <span className="font-semibold font-mono-nums text-slate-900">
                          {formatGhs(item.unitPriceGhs * item.quantity)}
                        </span>
                      </div>
                    ))}
                  </div>

                  <div className="rounded-lg bg-slate-50 border border-slate-200 px-3.5 py-2.5 text-xs text-slate-600 flex items-center gap-2">
                    <CheckCircle2 className="h-4 w-4 text-[#DC0000] shrink-0" />
                    <span>{order.trackingNote}</span>
                  </div>
                </div>
              ))}
            </div>
          )}
        </TabsContent>

        <TabsContent value="profile">
          <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
            <form
              onSubmit={handleSaveProfile}
              className="rounded-xl border border-slate-200 bg-white p-6 space-y-4"
            >
              <h3 className="text-base font-bold text-[#001B5E]">Personal Details</h3>
              <div className="space-y-1.5">
                <Label htmlFor="prof-name">Full Name</Label>
                <Input
                  id="prof-name"
                  required
                  value={fullName}
                  onChange={(e) => setFullName(e.target.value)}
                />
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="prof-email">Email Address</Label>
                <Input id="prof-email" disabled value={user.email} className="bg-slate-50" />
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="prof-phone">Ghana Phone Number</Label>
                <Input
                  id="prof-phone"
                  value={phone}
                  onChange={(e) => setPhone(e.target.value)}
                  placeholder="+233241234567"
                />
              </div>
              <Button type="submit" variant="accent" disabled={savingProfile}>
                {savingProfile ? 'Saving...' : 'Save Profile'}
              </Button>
            </form>

            <form
              onSubmit={handleChangePassword}
              className="rounded-xl border border-slate-200 bg-white p-6 space-y-4"
            >
              <div className="flex items-center gap-2">
                <ShieldCheck className="h-4 w-4 text-[#DC0000]" />
                <h3 className="text-base font-bold text-[#001B5E]">Change Password</h3>
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="cur-pass">Current Password (if set)</Label>
                <Input
                  id="cur-pass"
                  type="password"
                  value={currentPassword}
                  onChange={(e) => setCurrentPassword(e.target.value)}
                  placeholder="••••••••"
                />
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="new-pass">New Password (8+ chars)</Label>
                <Input
                  id="new-pass"
                  type="password"
                  required
                  minLength={8}
                  value={newPassword}
                  onChange={(e) => setNewPassword(e.target.value)}
                  placeholder="••••••••"
                />
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="conf-pass">Confirm New Password</Label>
                <Input
                  id="conf-pass"
                  type="password"
                  required
                  minLength={8}
                  value={confirmPassword}
                  onChange={(e) => setConfirmPassword(e.target.value)}
                  placeholder="••••••••"
                />
              </div>
              <Button type="submit" disabled={savingPass}>
                {savingPass ? 'Updating...' : 'Update Password'}
              </Button>
            </form>
          </div>
        </TabsContent>

        <TabsContent value="addresses">
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
            <div className="space-y-3">
              <h3 className="text-base font-bold text-[#001B5E]">Saved Ghana Delivery Addresses</h3>
              {addresses.length === 0 ? (
                <p className="text-xs text-slate-500">No saved addresses yet.</p>
              ) : (
                addresses.map((addr) => (
                  <div
                    key={addr.id}
                    className="rounded-xl border border-slate-200 bg-white p-4 flex items-start justify-between gap-3"
                  >
                    <div className="text-xs space-y-1">
                      <p className="font-bold text-[#001B5E]">
                        {addr.label} · {addr.recipientName}
                      </p>
                      <p className="text-slate-600">{addr.streetAddress}</p>
                      <p className="text-slate-500">
                        {addr.city}, {addr.region}{' '}
                        {addr.digitalAddress ? `· GPS: ${addr.digitalAddress}` : ''}
                      </p>
                      <p className="text-slate-500 font-mono-nums">{addr.phone}</p>
                    </div>
                    <button
                      type="button"
                      onClick={() => handleDeleteAddress(addr.id)}
                      className="text-slate-400 hover:text-red-600 p-1 cursor-pointer"
                      aria-label="Delete address"
                    >
                      <Trash2 className="h-4 w-4" />
                    </button>
                  </div>
                ))
              )}
            </div>

            <form
              onSubmit={handleAddAddress}
              className="rounded-xl border border-slate-200 bg-white p-6 space-y-3.5"
            >
              <h3 className="text-base font-bold text-[#001B5E]">Add Delivery Address</h3>
              <div className="grid grid-cols-2 gap-3">
                <div className="space-y-1">
                  <Label>Label</Label>
                  <Input
                    value={addrLabel}
                    onChange={(e) => setAddrLabel(e.target.value)}
                    placeholder="Home / Office"
                  />
                </div>
                <div className="space-y-1">
                  <Label>Recipient Name</Label>
                  <Input
                    required
                    value={addrRecipient}
                    onChange={(e) => setAddrRecipient(e.target.value)}
                  />
                </div>
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div className="space-y-1">
                  <Label>Ghana Phone</Label>
                  <Input
                    required
                    value={addrPhone}
                    onChange={(e) => setAddrPhone(e.target.value)}
                    placeholder="0241234567"
                  />
                </div>
                <div className="space-y-1">
                  <Label>Region</Label>
                  <select
                    value={addrRegion}
                    onChange={(e) => setAddrRegion(e.target.value)}
                    className="flex h-10 w-full rounded-lg border border-slate-200 bg-white px-3 text-sm"
                  >
                    {GHANA_REGIONS.map((r) => (
                      <option key={r} value={r}>
                        {r}
                      </option>
                    ))}
                  </select>
                </div>
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div className="space-y-1">
                  <Label>City / Area</Label>
                  <Input
                    required
                    value={addrCity}
                    onChange={(e) => setAddrCity(e.target.value)}
                    placeholder="East Legon, Accra"
                  />
                </div>
                <div className="space-y-1">
                  <Label>GhanaPost GPS</Label>
                  <Input
                    value={addrGps}
                    onChange={(e) => setAddrGps(e.target.value.toUpperCase())}
                    placeholder="GA-183-8164"
                    className="font-mono-nums"
                  />
                </div>
              </div>
              <div className="space-y-1">
                <Label>Street / Landmark</Label>
                <Input
                  required
                  value={addrStreet}
                  onChange={(e) => setAddrStreet(e.target.value)}
                  placeholder="Near Accra Mall / Plot 22"
                />
              </div>
              <Button type="submit" variant="accent" disabled={savingAddr}>
                {savingAddr ? 'Saving...' : 'Save Address'}
              </Button>
            </form>
          </div>
        </TabsContent>

        <TabsContent value="wishlist">
          {wishlistProducts.length === 0 ? (
            <div className="rounded-xl border border-slate-200 bg-white p-8 text-center">
              <Heart className="h-9 w-9 text-slate-300 mx-auto mb-2" />
              <p className="text-sm font-semibold text-slate-900">Your wishlist is empty</p>
              <p className="text-xs text-slate-500 mt-1">
                Save iPhones, laptops, or accessories to compare and buy later.
              </p>
            </div>
          ) : (
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-6">
              {wishlistProducts.map((p) => (
                <div
                  key={p.id}
                  className="rounded-xl border border-slate-200 bg-white overflow-hidden flex flex-col"
                >
                  <ProductImage
                    src={p.imageUrl}
                    alt={p.name}
                    categoryGroup={p.categoryGroup}
                    className="w-full aspect-[4/3] bg-slate-100"
                  />
                  <div className="p-4 flex-1 flex flex-col justify-between space-y-3">
                    <div>
                      <p className="text-xs text-slate-500">
                        {p.brandName} · {p.subcategory}
                      </p>
                      <h4 className="text-sm font-bold text-[#001B5E] mt-0.5">{p.name}</h4>
                      <p className="text-sm font-bold text-[#001B5E] font-mono-nums mt-1">
                        {formatGhs(p.priceGhs)}
                      </p>
                    </div>
                    <div className="flex gap-2">
                      <Button
                        variant="accent"
                        size="sm"
                        className="flex-1"
                        onClick={() => onAddToCart(p)}
                      >
                        Add to Cart
                      </Button>
                      <Button
                        variant="outline"
                        size="sm"
                        onClick={() => onToggleWishlist(p)}
                      >
                        Remove
                      </Button>
                    </div>
                  </div>
                </div>
              ))}
            </div>
          )}
        </TabsContent>
      </Tabs>
    </section>
  );
};
