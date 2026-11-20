import React, { useState } from 'react';
import { PackageCheck, Search, Truck } from 'lucide-react';
import { apiFetch } from '@/src/lib/api';
import { formatGhs } from '@/src/lib/utils';
import { Button } from './ui/button';
import { Input } from './ui/input';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from './ui/dialog';

interface OrderTrackerModalProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  initialOrderNumber?: string;
}

const STEPS = ['pending', 'confirmed', 'processing', 'shipped', 'delivered'];

export const OrderTrackerModal: React.FC<OrderTrackerModalProps> = ({
  open,
  onOpenChange,
  initialOrderNumber = '',
}) => {
  const [orderNumber, setOrderNumber] = useState(initialOrderNumber);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [result, setResult] = useState<any>(null);

  const handleTrack = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!orderNumber.trim()) return;
    setLoading(true);
    setError('');
    try {
      const data = await apiFetch<{ order: any }>(
        `/api/orders/track/${encodeURIComponent(orderNumber.trim())}`
      );
      setResult(data.order);
    } catch (err: any) {
      setResult(null);
      setError(err?.message || 'Order not found.');
    } finally {
      setLoading(false);
    }
  };

  const activeIdx = result ? STEPS.indexOf(result.orderStatus) : -1;

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-lg">
        <DialogHeader>
          <DialogTitle>Track Your MAGNOM PHONES HUB Order</DialogTitle>
          <DialogDescription>
            Enter your receipt order number (e.g. GCT-2026-4812) to view live dispatch status across Ghana.
          </DialogDescription>
        </DialogHeader>

        <form onSubmit={handleTrack} className="flex gap-2">
          <Input
            value={orderNumber}
            onChange={(e) => setOrderNumber(e.target.value.toUpperCase())}
            placeholder="GCT-2026-XXXX"
            className="font-mono-nums"
          />
          <Button type="submit" variant="accent" disabled={loading}>
            <Search className="h-4 w-4" />
            {loading ? 'Checking' : 'Track'}
          </Button>
        </form>

        {error && (
          <div className="rounded-lg border border-red-200 bg-red-50 px-3.5 py-2.5 text-xs text-red-700 mt-3">
            {error}
          </div>
        )}

        {result && (
          <div className="mt-4 space-y-4 border-t border-slate-100 pt-4">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-xs text-slate-500">Order Reference</p>
                <p className="text-base font-bold text-[#001B5E] font-mono-nums">
                  {result.orderNumber}
                </p>
              </div>
              <div className="text-right">
                <p className="text-xs text-slate-500">Total</p>
                <p className="text-base font-bold text-[#001B5E] font-mono-nums">
                  {formatGhs(result.totalGhs)}
                </p>
              </div>
            </div>

            <div className="grid grid-cols-5 gap-1.5 pt-2">
              {STEPS.map((step, i) => {
                const done = activeIdx >= i;
                return (
                  <div key={step} className="text-center">
                    <div
                      className={`h-1.5 rounded-full mb-1.5 ${
                        done ? 'bg-[#DC0000]' : 'bg-slate-200'
                      }`}
                    />
                    <span
                      className={`text-[11px] capitalize ${
                        done ? 'font-semibold text-[#001B5E]' : 'text-slate-400'
                      }`}
                    >
                      {step}
                    </span>
                  </div>
                );
              })}
            </div>

            <div className="rounded-lg bg-slate-50 border border-slate-200 p-3.5 space-y-1 text-xs">
              <div className="flex items-center gap-2 font-semibold text-[#001B5E]">
                {result.orderStatus === 'delivered' ? (
                  <PackageCheck className="h-4 w-4 text-emerald-600" />
                ) : (
                  <Truck className="h-4 w-4 text-[#DC0000]" />
                )}
                <span className="capitalize">
                  Status: {result.orderStatus} · Payment: {result.paymentStatus.replace('_', ' ')}
                </span>
              </div>
              <p className="text-slate-600">{result.trackingNote}</p>
              <p className="text-slate-500 pt-1">
                Destination: {result.shippingCity}, {result.shippingRegion} ({result.deliveryMethod})
              </p>
            </div>
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
};
