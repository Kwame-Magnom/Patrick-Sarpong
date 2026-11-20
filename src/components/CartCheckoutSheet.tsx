import React, { useEffect, useState } from 'react';
import {
  CheckCircle2,
  CreditCard,
  Minus,
  Plus,
  ShieldCheck,
  ShoppingBag,
  Smartphone,
  Trash2,
  Truck,
} from 'lucide-react';
import { toast } from 'sonner';
import { apiFetch } from '@/src/lib/api';
import { formatGhs, GHANA_REGIONS } from '@/src/lib/utils';
import { AddressItem, CartEntry, OrderRecord, UserProfile } from '@/src/types';
import { Button } from './ui/button';
import { Input } from './ui/input';
import { Label } from './ui/label';
import { Sheet, SheetContent } from './ui/sheet';
import { ProductImage } from './ProductImage';

interface CartCheckoutSheetProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  cart: CartEntry[];
  user: UserProfile | null;
  onUpdateQty: (productId: number, qty: number) => void;
  onRemoveItem: (productId: number) => void;
  onClearCart: () => void;
  onOpenAuth: () => void;
  onOrderCompleted: (order: OrderRecord) => void;
}

export const CartCheckoutSheet: React.FC<CartCheckoutSheetProps> = ({
  open,
  onOpenChange,
  cart,
  user,
  onUpdateQty,
  onRemoveItem,
  onClearCart,
  onOpenAuth,
  onOrderCompleted,
}) => {
  const [step, setStep] = useState<'cart' | 'checkout' | 'paystack' | 'success'>('cart');
  const [loading, setLoading] = useState(false);

  // Saved addresses
  const [savedAddresses, setSavedAddresses] = useState<AddressItem[]>([]);

  // Checkout fields
  const [customerName, setCustomerName] = useState('');
  const [customerPhone, setCustomerPhone] = useState('');
  const [shippingRegion, setShippingRegion] = useState('Greater Accra');
  const [shippingCity, setShippingCity] = useState('Accra - Osu');
  const [shippingStreet, setShippingStreet] = useState('');
  const [digitalAddress, setDigitalAddress] = useState('');
  const [deliveryMethod, setDeliveryMethod] = useState('Accra Same-Day Dispatch');
  const [paymentMethod, setPaymentMethod] = useState<'paystack' | 'cod'>('paystack');

  // Paystack state
  const [pendingOrder, setPendingOrder] = useState<OrderRecord | null>(null);
  const [paystackRef, setPaystackRef] = useState('');
  const [paystackChannel, setPaystackChannel] = useState<'MTN MoMo' | 'Telecel Cash' | 'Visa / Mastercard'>('MTN MoMo');
  const [momoNumber, setMomoNumber] = useState('');

  useEffect(() => {
    if (open) {
      setStep('cart');
      if (user) {
        setCustomerName((prev) => prev || user.fullName);
        setCustomerPhone((prev) => prev || user.phone || '');
        setMomoNumber((prev) => prev || user.phone || '');
        apiFetch<{ addresses: AddressItem[] }>('/api/addresses')
          .then((res) => {
            setSavedAddresses(res.addresses || []);
            const def = res.addresses.find((a) => a.isDefault) || res.addresses[0];
            if (def) {
              setCustomerName(def.recipientName);
              setCustomerPhone(def.phone);
              setShippingRegion(def.region);
              setShippingCity(def.city);
              setShippingStreet(def.streetAddress);
              setDigitalAddress(def.digitalAddress || '');
            }
          })
          .catch(() => {});
      }
    }
  }, [open, user]);

  const subtotalGhs = cart.reduce((sum, item) => sum + item.product.priceGhs * item.quantity, 0);
  const deliveryFeeGhs =
    deliveryMethod === 'Osu Showroom Pickup'
      ? 0
      : deliveryMethod === 'Accra Same-Day Dispatch'
      ? subtotalGhs >= 5000
        ? 0
        : 45
      : 85;
  const totalGhs = subtotalGhs + deliveryFeeGhs;

  const applySavedAddress = (addr: AddressItem) => {
    setCustomerName(addr.recipientName);
    setCustomerPhone(addr.phone);
    setShippingRegion(addr.region);
    setShippingCity(addr.city);
    setShippingStreet(addr.streetAddress);
    setDigitalAddress(addr.digitalAddress || '');
  };

  const handlePlaceOrder = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!user) {
      onOpenAuth();
      return;
    }
    setLoading(true);
    try {
      const payload = {
        items: cart.map((c) => ({ productId: c.product.id, quantity: c.quantity })),
        customerName,
        customerPhone,
        shippingRegion,
        shippingCity,
        shippingStreet,
        digitalAddress,
        deliveryMethod,
        paymentMethod,
      };
      const res = await apiFetch<{
        order: OrderRecord;
        mode?: string;
        paystack?: {
          mode: 'live' | 'sandbox';
          reference: string;
          authorizationUrl?: string;
        };
      }>('/api/orders/checkout', {
        method: 'POST',
        body: JSON.stringify(payload),
      });

      setPendingOrder(res.order);

      if (paymentMethod === 'cod') {
        onClearCart();
        onOrderCompleted(res.order);
        setStep('success');
        toast.success(`Order ${res.order.orderNumber} confirmed!`);
        return;
      }

      if (res.paystack?.mode === 'live' && res.paystack.authorizationUrl) {
        window.location.href = res.paystack.authorizationUrl;
        return;
      }

      setPaystackRef(res.paystack?.reference || '');
      setStep('paystack');
    } catch (err: any) {
      if (err?.data?.requiresVerification) {
        toast.error('Please verify your email with OTP before checkout.');
        onOpenAuth();
      } else {
        toast.error(err?.message || 'Unable to place order.');
      }
    } finally {
      setLoading(false);
    }
  };

  const handleConfirmPaystackSandbox = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!paystackRef) return;
    setLoading(true);
    try {
      const res = await apiFetch<{ order: OrderRecord; verified: boolean }>(
        '/api/payments/paystack/verify',
        {
          method: 'POST',
          body: JSON.stringify({
            reference: paystackRef,
            channel: paystackChannel,
          }),
        }
      );
      setPendingOrder(res.order);
      onClearCart();
      onOrderCompleted(res.order);
      setStep('success');
      toast.success('Paystack payment verified!');
    } catch (err: any) {
      toast.error(err?.message || 'Payment verification failed.');
    } finally {
      setLoading(false);
    }
  };

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent className="p-0 flex flex-col">
        {/* Header */}
        <div className="px-6 py-4 border-b border-slate-200 bg-white pr-12">
          <h2 className="text-base font-bold text-[#001B5E] font-display">
            {step === 'cart' && `Shopping Cart (${cart.reduce((s, c) => s + c.quantity, 0)})`}
            {step === 'checkout' && 'Ghana Delivery & Payment'}
            {step === 'paystack' && 'Paystack Checkout (GHS)'}
            {step === 'success' && 'Order Confirmed'}
          </h2>
        </div>

        {/* Body */}
        <div className="flex-1 overflow-y-auto p-6">
          {step === 'cart' && (
            <>
              {cart.length === 0 ? (
                <div className="flex flex-col items-center justify-center py-16 text-center">
                  <ShoppingBag className="h-10 w-10 text-slate-300 mb-3" />
                  <p className="text-sm font-semibold text-slate-900 mb-1">Your cart is empty</p>
                  <p className="text-xs text-slate-500 max-w-xs">
                    Browse iPhones, Android smartphones, laptops, and accessories to add items.
                  </p>
                </div>
              ) : (
                <div className="space-y-4">
                  {cart.map(({ product, quantity }) => (
                    <div
                      key={product.id}
                      className="flex gap-3.5 pb-4 border-b border-slate-100 last:border-b-0"
                    >
                      <ProductImage
                        src={product.imageUrl}
                        alt={product.name}
                        categoryGroup={product.categoryGroup}
                        className="h-20 w-20 rounded-lg shrink-0 bg-slate-100"
                      />
                      <div className="flex-1 min-w-0">
                        <p className="text-xs text-slate-500">
                          {product.brandName} · {product.subcategory}
                        </p>
                        <p className="text-sm font-semibold text-slate-900 truncate">
                          {product.name}
                        </p>
                        <p className="text-sm font-bold text-[#001B5E] font-mono-nums mt-0.5">
                          {formatGhs(product.priceGhs * quantity)}
                        </p>
                        <div className="flex items-center justify-between mt-2">
                          <div className="inline-flex items-center border border-slate-200 rounded-md">
                            <button
                              type="button"
                              onClick={() => onUpdateQty(product.id, quantity - 1)}
                              className="h-7 w-7 flex items-center justify-center text-slate-600 hover:bg-slate-50 cursor-pointer"
                              aria-label="Decrease quantity"
                            >
                              <Minus className="h-3 w-3" />
                            </button>
                            <span className="w-7 text-center text-xs font-semibold font-mono-nums">
                              {quantity}
                            </span>
                            <button
                              type="button"
                              onClick={() => onUpdateQty(product.id, quantity + 1)}
                              className="h-7 w-7 flex items-center justify-center text-slate-600 hover:bg-slate-50 cursor-pointer"
                              aria-label="Increase quantity"
                            >
                              <Plus className="h-3 w-3" />
                            </button>
                          </div>
                          <button
                            type="button"
                            onClick={() => onRemoveItem(product.id)}
                            className="text-xs text-slate-400 hover:text-red-600 inline-flex items-center gap-1 cursor-pointer"
                          >
                            <Trash2 className="h-3.5 w-3.5" />
                            Remove
                          </button>
                        </div>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </>
          )}

          {step === 'checkout' && (
            <form id="checkout-form" onSubmit={handlePlaceOrder} className="space-y-4">
              {savedAddresses.length > 0 && (
                <div className="space-y-1.5">
                  <Label>Saved Delivery Addresses</Label>
                  <div className="grid grid-cols-1 gap-2">
                    {savedAddresses.map((addr) => (
                      <button
                        key={addr.id}
                        type="button"
                        onClick={() => applySavedAddress(addr)}
                        className="text-left rounded-lg border border-slate-200 hover:border-[#DC0000] p-2.5 text-xs transition-colors cursor-pointer"
                      >
                        <span className="font-semibold text-[#001B5E]">
                          {addr.label} · {addr.recipientName}
                        </span>
                        <p className="text-slate-500 truncate">
                          {addr.streetAddress}, {addr.city}, {addr.region}
                        </p>
                      </button>
                    ))}
                  </div>
                </div>
              )}

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div className="space-y-1">
                  <Label htmlFor="chk-name">Recipient Full Name</Label>
                  <Input
                    id="chk-name"
                    required
                    value={customerName}
                    onChange={(e) => setCustomerName(e.target.value)}
                  />
                </div>
                <div className="space-y-1">
                  <Label htmlFor="chk-phone">Ghana Phone (Dispatch)</Label>
                  <Input
                    id="chk-phone"
                    required
                    value={customerPhone}
                    onChange={(e) => setCustomerPhone(e.target.value)}
                    placeholder="0241234567"
                  />
                </div>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div className="space-y-1">
                  <Label htmlFor="chk-region">Region</Label>
                  <select
                    id="chk-region"
                    value={shippingRegion}
                    onChange={(e) => setShippingRegion(e.target.value)}
                    className="flex h-10 w-full rounded-lg border border-slate-200 bg-white px-3 text-sm text-slate-900 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#001B5E]"
                  >
                    {GHANA_REGIONS.map((r) => (
                      <option key={r} value={r}>
                        {r}
                      </option>
                    ))}
                  </select>
                </div>
                <div className="space-y-1">
                  <Label htmlFor="chk-city">City / Neighbourhood</Label>
                  <Input
                    id="chk-city"
                    required
                    value={shippingCity}
                    onChange={(e) => setShippingCity(e.target.value)}
                    placeholder="East Legon, Accra"
                  />
                </div>
              </div>

              <div className="space-y-1">
                <Label htmlFor="chk-street">Street Address / Landmark</Label>
                <Input
                  id="chk-street"
                  required
                  value={shippingStreet}
                  onChange={(e) => setShippingStreet(e.target.value)}
                  placeholder="House 14, Near Anc Mall"
                />
              </div>

              <div className="space-y-1">
                <Label htmlFor="chk-gps">GhanaPost GPS Digital Address (Optional)</Label>
                <Input
                  id="chk-gps"
                  value={digitalAddress}
                  onChange={(e) => setDigitalAddress(e.target.value.toUpperCase())}
                  placeholder="GA-183-8164"
                  className="font-mono-nums"
                />
              </div>

              <div className="space-y-1.5 pt-1">
                <Label>Delivery Method</Label>
                <div className="space-y-2">
                  {[
                    {
                      id: 'Accra Same-Day Dispatch',
                      desc: subtotalGhs >= 5000 ? 'Free (Orders GH₵ 5,000+)' : 'GH₵ 45 · 2–5 hrs in Greater Accra',
                    },
                    {
                      id: 'Nationwide Courier',
                      desc: 'GH₵ 85 · Next-day Kumasi, Takoradi, Tamale & all 16 regions',
                    },
                    {
                      id: 'Osu Showroom Pickup',
                      desc: 'Free · Pick up at Oxford Street, Osu, Accra',
                    },
                  ].map((opt) => (
                    <label
                      key={opt.id}
                      className={`flex items-start gap-3 rounded-lg border p-3 cursor-pointer text-xs ${
                        deliveryMethod === opt.id
                          ? 'border-[#DC0000] bg-[#FFF1F1]'
                          : 'border-slate-200'
                      }`}
                    >
                      <input
                        type="radio"
                        name="deliveryMethod"
                        checked={deliveryMethod === opt.id}
                        onChange={() => setDeliveryMethod(opt.id)}
                        className="mt-0.5 accent-[#DC0000]"
                      />
                      <div>
                        <p className="font-semibold text-[#001B5E]">{opt.id}</p>
                        <p className="text-slate-500">{opt.desc}</p>
                      </div>
                    </label>
                  ))}
                </div>
              </div>

              <div className="space-y-1.5 pt-1">
                <Label>Payment Method</Label>
                <div className="grid grid-cols-1 gap-2">
                  <label
                    className={`flex items-start gap-3 rounded-lg border p-3 cursor-pointer text-xs ${
                      paymentMethod === 'paystack'
                        ? 'border-[#DC0000] bg-[#FFF1F1]'
                        : 'border-slate-200'
                    }`}
                  >
                    <input
                      type="radio"
                      name="paymentMethod"
                      checked={paymentMethod === 'paystack'}
                      onChange={() => setPaymentMethod('paystack')}
                      className="mt-0.5 accent-[#DC0000]"
                    />
                    <div>
                      <p className="font-semibold text-[#001B5E]">
                        Paystack (MTN MoMo, Telecel Cash, AT Money, Visa/Mastercard)
                      </p>
                      <p className="text-slate-500">Instant verified payment in Ghana Cedis (GH₵)</p>
                    </div>
                  </label>

                  <label
                    className={`flex items-start gap-3 rounded-lg border p-3 cursor-pointer text-xs ${
                      paymentMethod === 'cod'
                        ? 'border-[#DC0000] bg-[#FFF1F1]'
                        : 'border-slate-200'
                    }`}
                  >
                    <input
                      type="radio"
                      name="paymentMethod"
                      checked={paymentMethod === 'cod'}
                      onChange={() => setPaymentMethod('cod')}
                      className="mt-0.5 accent-[#DC0000]"
                    />
                    <div>
                      <p className="font-semibold text-[#001B5E]">
                        Cash / MoMo on Delivery (Greater Accra &amp; Kumasi)
                      </p>
                      <p className="text-slate-500">Inspect your sealed device before paying rider</p>
                    </div>
                  </label>
                </div>
              </div>
            </form>
          )}

          {step === 'paystack' && pendingOrder && (
            <form onSubmit={handleConfirmPaystackSandbox} className="space-y-4">
              <div className="rounded-xl bg-[#001B5E] text-white p-4 space-y-1">
                <div className="flex items-center justify-between text-xs text-red-200">
                  <span>Paystack Ghana Secure Checkout</span>
                  <span className="font-mono-nums">{paystackRef}</span>
                </div>
                <p className="text-2xl font-bold font-mono-nums">
                  {formatGhs(pendingOrder.totalGhs)}
                </p>
                <p className="text-xs text-slate-300">{pendingOrder.customerEmail}</p>
              </div>

              <div className="space-y-2">
                <Label>Select Paystack Channel</Label>
                <div className="grid grid-cols-1 gap-2">
                  {(['MTN MoMo', 'Telecel Cash', 'Visa / Mastercard'] as const).map((ch) => (
                    <button
                      key={ch}
                      type="button"
                      onClick={() => setPaystackChannel(ch)}
                      className={`flex items-center justify-between rounded-lg border px-3.5 py-2.5 text-xs font-semibold cursor-pointer ${
                        paystackChannel === ch
                          ? 'border-[#DC0000] bg-[#FFF1F1] text-[#001B5E]'
                          : 'border-slate-200 text-slate-700'
                      }`}
                    >
                      <span className="flex items-center gap-2">
                        {ch === 'Visa / Mastercard' ? (
                          <CreditCard className="h-4 w-4 text-[#DC0000]" />
                        ) : (
                          <Smartphone className="h-4 w-4 text-[#DC0000]" />
                        )}
                        {ch}
                      </span>
                      <span className="text-slate-400">{paystackChannel === ch ? 'Selected' : ''}</span>
                    </button>
                  ))}
                </div>
              </div>

              {paystackChannel !== 'Visa / Mastercard' && (
                <div className="space-y-1.5">
                  <Label htmlFor="momo-phone">Mobile Money Number</Label>
                  <Input
                    id="momo-phone"
                    required
                    value={momoNumber}
                    onChange={(e) => setMomoNumber(e.target.value)}
                    placeholder="0241234567"
                  />
                </div>
              )}

              <div className="rounded-lg border border-slate-200 bg-slate-50 p-3 text-xs text-slate-600 flex items-start gap-2">
                <ShieldCheck className="h-4 w-4 text-emerald-600 shrink-0 mt-0.5" />
                <span>
                  Test mode authorization: verifies order payment in PostgreSQL and updates stock immediately. Configure <code className="font-mono">PAYSTACK_SECRET_KEY</code> for live Paystack redirects.
                </span>
              </div>

              <Button type="submit" variant="accent" className="w-full" disabled={loading}>
                {loading
                  ? 'Verifying Paystack Payment...'
                  : `Authorize ${formatGhs(pendingOrder.totalGhs)}`}
              </Button>
            </form>
          )}

          {step === 'success' && pendingOrder && (
            <div className="py-6 space-y-5">
              <div className="flex flex-col items-center text-center space-y-2">
                <CheckCircle2 className="h-12 w-12 text-emerald-600" />
                <h3 className="text-lg font-bold text-[#001B5E]">
                  Order {pendingOrder.orderNumber} Confirmed
                </h3>
                <p className="text-xs text-slate-600 max-w-xs">
                  {pendingOrder.trackingNote}
                </p>
              </div>

              <div className="rounded-xl border border-slate-200 bg-slate-50 p-4 space-y-2 text-xs">
                <div className="flex justify-between">
                  <span className="text-slate-500">Order Reference</span>
                  <span className="font-mono-nums font-bold text-[#001B5E]">
                    {pendingOrder.orderNumber}
                  </span>
                </div>
                <div className="flex justify-between">
                  <span className="text-slate-500">Payment Status</span>
                  <span className="font-semibold capitalize text-emerald-700">
                    {pendingOrder.paymentStatus.replace('_', ' ')}
                  </span>
                </div>
                <div className="flex justify-between">
                  <span className="text-slate-500">Delivery</span>
                  <span className="font-medium text-slate-900">
                    {pendingOrder.shippingCity}, {pendingOrder.shippingRegion}
                  </span>
                </div>
                <div className="flex justify-between border-t border-slate-200 pt-2 text-sm font-bold text-[#001B5E]">
                  <span>Total Paid / Due</span>
                  <span className="font-mono-nums">{formatGhs(pendingOrder.totalGhs)}</span>
                </div>
              </div>

              <Button
                variant="default"
                className="w-full"
                onClick={() => onOpenChange(false)}
              >
                Continue Shopping
              </Button>
            </div>
          )}
        </div>

        {/* Footer */}
        {(step === 'cart' || step === 'checkout') && cart.length > 0 && (
          <div className="border-t border-slate-200 bg-slate-50 p-6 space-y-3">
            <div className="space-y-1.5 text-xs">
              <div className="flex justify-between text-slate-600">
                <span>Subtotal</span>
                <span className="font-mono-nums font-semibold">{formatGhs(subtotalGhs)}</span>
              </div>
              {step === 'checkout' && (
                <div className="flex justify-between text-slate-600">
                  <span className="inline-flex items-center gap-1">
                    <Truck className="h-3.5 w-3.5" />
                    Delivery Fee
                  </span>
                  <span className="font-mono-nums font-semibold">
                    {deliveryFeeGhs === 0 ? 'FREE' : formatGhs(deliveryFeeGhs)}
                  </span>
                </div>
              )}
              <div className="flex justify-between text-sm font-bold text-[#001B5E] pt-1 border-t border-slate-200">
                <span>Total (GHS)</span>
                <span className="font-mono-nums">
                  {formatGhs(step === 'checkout' ? totalGhs : subtotalGhs)}
                </span>
              </div>
            </div>

            {step === 'cart' ? (
              <Button
                variant="accent"
                className="w-full"
                onClick={() => {
                  if (!user) {
                    toast.info('Please sign in or register to continue to checkout.');
                    onOpenAuth();
                    return;
                  }
                  setStep('checkout');
                }}
              >
                Proceed to Checkout
              </Button>
            ) : (
              <div className="flex gap-2">
                <Button
                  type="button"
                  variant="outline"
                  onClick={() => setStep('cart')}
                  disabled={loading}
                >
                  Back
                </Button>
                <Button
                  type="submit"
                  form="checkout-form"
                  variant="accent"
                  className="flex-1"
                  disabled={loading}
                >
                  {loading
                    ? 'Processing...'
                    : paymentMethod === 'cod'
                    ? 'Confirm COD Order'
                    : 'Pay with Paystack'}
                </Button>
              </div>
            )}
          </div>
        )}
      </SheetContent>
    </Sheet>
  );
};
