import React, { useEffect, useState } from 'react';
import {
  ArrowLeft,
  DatabaseBackup,
  Download,
  Plus,
  RotateCcw,
  ShieldCheck,
  Trash2,
  UserPlus,
} from 'lucide-react';
import { toast } from 'sonner';
import { apiFetch, getStoredSessionToken } from '@/src/lib/api';
import { auth } from '@/src/lib/firebase';
import { formatGhs, GHANA_REGIONS } from '@/src/lib/utils';
import {
  BackupRecord,
  BackupSettings,
  BrandItem,
  CategoryItem,
  OrderRecord,
  ProductItem,
  UserProfile,
} from '@/src/types';
import { Button } from './ui/button';
import { Input } from './ui/input';
import { Label } from './ui/label';
import { Tabs, TabsContent, TabsList, TabsTrigger } from './ui/tabs';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from './ui/dialog';

interface AdminDashboardProps {
  currentUser: UserProfile;
  onBackToStore: () => void;
  onCatalogMutated: () => void;
}

export const AdminDashboard: React.FC<AdminDashboardProps> = ({
  currentUser,
  onBackToStore,
  onCatalogMutated,
}) => {
  const isSuperAdmin = currentUser.role === 'admin';
  const [loading, setLoading] = useState(true);
  const [stats, setStats] = useState({
    totalRevenueGhs: 0,
    totalOrders: 0,
    pendingOrders: 0,
    lowStockCount: 0,
    totalProducts: 0,
    totalCustomers: 0,
  });
  const [products, setProducts] = useState<ProductItem[]>([]);
  const [orders, setOrders] = useState<OrderRecord[]>([]);
  const [categories, setCategories] = useState<CategoryItem[]>([]);
  const [brands, setBrands] = useState<BrandItem[]>([]);
  const [customers, setCustomers] = useState<UserProfile[]>([]);

  // Add/Edit Product dialog
  const [prodDialogOpen, setProdDialogOpen] = useState(false);
  const [editingProd, setEditingProd] = useState<ProductItem | null>(null);
  const [pName, setPName] = useState('');
  const [pCategoryGroup, setPCategoryGroup] = useState('iphones');
  const [pSubcategory, setPSubcategory] = useState('');
  const [pBrandName, setPBrandName] = useState('Apple');
  const [pPrice, setPPrice] = useState('');
  const [pCompareAt, setPCompareAt] = useState('');
  const [pStock, setPStock] = useState('10');
  const [pVariant, setPVariant] = useState('');
  const [pCondition, setPCondition] = useState('Brand New Sealed');
  const [pWarranty, setPWarranty] = useState('12 Months MAGNOM Warranty');
  const [pDesc, setPDesc] = useState('');
  const [pFeatured, setPFeatured] = useState(false);
  const [pBestSeller, setPBestSeller] = useState(false);
  const [pNewArrival, setPNewArrival] = useState(true);
  const [pSpecialOffer, setPSpecialOffer] = useState(false);

  // Add Order dialog
  const [orderDialogOpen, setOrderDialogOpen] = useState(false);
  const [oProductId, setOProductId] = useState('');
  const [oQuantity, setOQuantity] = useState('1');
  const [oCustomerName, setOCustomerName] = useState('');
  const [oCustomerEmail, setOCustomerEmail] = useState('');
  const [oCustomerPhone, setOCustomerPhone] = useState('');
  const [oRegion, setORegion] = useState('Greater Accra');
  const [oCity, setOCity] = useState('Accra');
  const [oStreet, setOStreet] = useState('');
  const [oDeliveryMethod, setODeliveryMethod] = useState('Accra Same-Day Dispatch');
  const [oPaymentMethod, setOPaymentMethod] = useState('momo_manual');
  const [oPaymentStatus, setOPaymentStatus] = useState('paid');
  const [oOrderStatus, setOOrderStatus] = useState('confirmed');
  const [oTrackingNote, setOTrackingNote] = useState('');

  // Add Category / Brand
  const [newCatName, setNewCatName] = useState('');
  const [newCatGroup, setNewCatGroup] = useState('accessories');
  const [newBrandName, setNewBrandName] = useState('');
  const [newBrandGroup, setNewBrandGroup] = useState('android');

  // User Role Management
  const [userSearch, setUserSearch] = useState('');
  const [addUserOpen, setAddUserOpen] = useState(false);
  const [uFullName, setUFullName] = useState('');
  const [uEmail, setUEmail] = useState('');
  const [uPhone, setUPhone] = useState('');
  const [uPassword, setUPassword] = useState('');
  const [uRole, setURole] = useState<'customer' | 'staff' | 'admin'>('staff');

  // Automated Backups
  const [backupsList, setBackupsList] = useState<BackupRecord[]>([]);
  const [backupSettings, setBackupSettings] = useState<BackupSettings>({
    settingKey: 'auto_backup',
    enabled: true,
    intervalHours: 24,
    retentionCount: 14,
    lastRunAt: null,
  });
  const [backupBusy, setBackupBusy] = useState(false);
  const [restoreTarget, setRestoreTarget] = useState<BackupRecord | null>(null);

  const loadBackups = async () => {
    if (!isSuperAdmin) return;
    try {
      const bData = await apiFetch<{ settings: BackupSettings; backups: BackupRecord[] }>(
        '/api/admin/backups'
      );
      if (bData.settings) setBackupSettings(bData.settings);
      setBackupsList(bData.backups || []);
    } catch {
      // ignore if non-admin
    }
  };

  const loadOverview = async () => {
    setLoading(true);
    try {
      const data = await apiFetch<any>('/api/admin/overview');
      setStats(data.stats);
      setProducts(data.products || []);
      setOrders(data.orders || []);
      setCategories(data.categories || []);
      setBrands(data.brands || []);
      setCustomers(data.customers || []);
      if (isSuperAdmin) {
        await loadBackups();
      }
    } catch (err: any) {
      toast.error(err?.message || 'Unable to load admin console.');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadOverview();
  }, []);

  const openNewProduct = () => {
    setEditingProd(null);
    setPName('');
    setPCategoryGroup('iphones');
    setPSubcategory('iPhone 16 Series');
    setPBrandName('Apple');
    setPPrice('');
    setPCompareAt('');
    setPStock('10');
    setPVariant('');
    setPCondition('Brand New Sealed');
    setPWarranty('12 Months MAGNOM PHONES HUB Warranty');
    setPDesc('');
    setPFeatured(false);
    setPBestSeller(false);
    setPNewArrival(true);
    setPSpecialOffer(false);
    setProdDialogOpen(true);
  };

  const openEditProduct = (p: ProductItem) => {
    setEditingProd(p);
    setPName(p.name);
    setPCategoryGroup(p.categoryGroup);
    setPSubcategory(p.subcategory);
    setPBrandName(p.brandName);
    setPPrice(String(p.priceGhs));
    setPCompareAt(p.compareAtGhs ? String(p.compareAtGhs) : '');
    setPStock(String(p.stockQty));
    setPVariant(p.storageOrVariant || '');
    setPCondition(p.condition);
    setPWarranty(p.warranty);
    setPDesc(p.description);
    setPFeatured(p.isFeatured);
    setPBestSeller(p.isBestSeller);
    setPNewArrival(p.isNewArrival);
    setPSpecialOffer(p.isSpecialOffer);
    setProdDialogOpen(true);
  };

  const handleSaveProduct = async (e: React.FormEvent) => {
    e.preventDefault();
    try {
      const body = {
        name: pName,
        categoryGroup: pCategoryGroup,
        subcategory: pSubcategory,
        brandName: pBrandName,
        priceGhs: Number(pPrice),
        compareAtGhs: pCompareAt ? Number(pCompareAt) : null,
        stockQty: Number(pStock),
        storageOrVariant: pVariant,
        condition: pCondition,
        warranty: pWarranty,
        description: pDesc,
        isFeatured: pFeatured,
        isBestSeller: pBestSeller,
        isNewArrival: pNewArrival,
        isSpecialOffer: pSpecialOffer,
      };
      if (editingProd) {
        await apiFetch(`/api/admin/products/${editingProd.id}`, {
          method: 'PUT',
          body: JSON.stringify(body),
        });
        toast.success('Product updated.');
      } else {
        await apiFetch('/api/admin/products', {
          method: 'POST',
          body: JSON.stringify(body),
        });
        toast.success('New product added to store.');
      }
      setProdDialogOpen(false);
      await loadOverview();
      onCatalogMutated();
    } catch (err: any) {
      toast.error(err?.message || 'Failed to save product.');
    }
  };

  const handleDeleteProduct = async (id: number) => {
    try {
      await apiFetch(`/api/admin/products/${id}`, { method: 'DELETE' });
      toast.success('Product removed.');
      await loadOverview();
      onCatalogMutated();
    } catch {
      toast.error('Failed to delete product.');
    }
  };

  const handleAddCategory = async (e: React.FormEvent) => {
    e.preventDefault();
    try {
      await apiFetch('/api/admin/categories', {
        method: 'POST',
        body: JSON.stringify({ name: newCatName, parentGroup: newCatGroup }),
      });
      setNewCatName('');
      toast.success('Category added.');
      await loadOverview();
      onCatalogMutated();
    } catch (err: any) {
      toast.error(err?.message || 'Failed to add category.');
    }
  };

  const handleAddBrand = async (e: React.FormEvent) => {
    e.preventDefault();
    try {
      await apiFetch('/api/admin/brands', {
        method: 'POST',
        body: JSON.stringify({ name: newBrandName, categoryGroup: newBrandGroup }),
      });
      setNewBrandName('');
      toast.success('Brand added.');
      await loadOverview();
      onCatalogMutated();
    } catch (err: any) {
      toast.error(err?.message || 'Failed to add brand.');
    }
  };

  const handleUpdateOrder = async (
    orderId: number,
    payload: { orderStatus?: string; paymentStatus?: string; trackingNote?: string }
  ) => {
    try {
      await apiFetch(`/api/admin/orders/${orderId}`, {
        method: 'PATCH',
        body: JSON.stringify(payload),
      });
      toast.success('Order updated.');
      await loadOverview();
    } catch {
      toast.error('Failed to update order.');
    }
  };

  const handleDeleteOrder = async (orderId: number) => {
    try {
      await apiFetch(`/api/admin/orders/${orderId}`, { method: 'DELETE' });
      toast.success('Order deleted.');
      await loadOverview();
    } catch {
      toast.error('Failed to delete order.');
    }
  };

  const openNewOrder = () => {
    if (products.length > 0 && !oProductId) {
      setOProductId(String(products[0].id));
    }
    setOQuantity('1');
    setOCustomerName('');
    setOCustomerEmail('');
    setOCustomerPhone('');
    setORegion('Greater Accra');
    setOCity('Accra');
    setOStreet('');
    setODeliveryMethod('Accra Same-Day Dispatch');
    setOPaymentMethod('momo_manual');
    setOPaymentStatus('paid');
    setOOrderStatus('confirmed');
    setOTrackingNote('Order logged by MAGNOM PHONES HUB Admin.');
    setOrderDialogOpen(true);
  };

  const handleCreateOrder = async (e: React.FormEvent) => {
    e.preventDefault();
    try {
      await apiFetch('/api/admin/orders', {
        method: 'POST',
        body: JSON.stringify({
          productId: Number(oProductId),
          quantity: Number(oQuantity),
          customerName: oCustomerName,
          customerEmail: oCustomerEmail,
          customerPhone: oCustomerPhone,
          shippingRegion: oRegion,
          shippingCity: oCity,
          shippingStreet: oStreet,
          deliveryMethod: oDeliveryMethod,
          paymentMethod: oPaymentMethod,
          paymentStatus: oPaymentStatus,
          orderStatus: oOrderStatus,
          trackingNote: oTrackingNote,
        }),
      });
      setOrderDialogOpen(false);
      toast.success('Order added successfully.');
      await loadOverview();
      onCatalogMutated();
    } catch (err: any) {
      toast.error(err?.message || 'Failed to add order.');
    }
  };

  const handleUpdateUserRole = async (
    targetUserId: number,
    payload: { role?: string; emailVerified?: boolean }
  ) => {
    try {
      const res = await apiFetch<{ user: UserProfile }>(`/api/admin/users/${targetUserId}/role`, {
        method: 'PATCH',
        body: JSON.stringify(payload),
      });
      setCustomers((prev) => prev.map((u) => (u.id === targetUserId ? res.user : u)));
      toast.success('User role & permissions updated.');
    } catch (err: any) {
      toast.error(err?.message || 'Failed to update user role.');
    }
  };

  const handleCreateUser = async (e: React.FormEvent) => {
    e.preventDefault();
    try {
      const res = await apiFetch<{ user: UserProfile }>('/api/admin/users', {
        method: 'POST',
        body: JSON.stringify({
          fullName: uFullName,
          email: uEmail,
          phone: uPhone,
          password: uPassword,
          role: uRole,
        }),
      });
      setCustomers((prev) => [res.user, ...prev]);
      setAddUserOpen(false);
      setUFullName('');
      setUEmail('');
      setUPhone('');
      setUPassword('');
      setURole('staff');
      toast.success(`Account created with ${res.user.role} role.`);
    } catch (err: any) {
      toast.error(err?.message || 'Failed to create account.');
    }
  };

  const handleSaveBackupSettings = async () => {
    setBackupBusy(true);
    try {
      const res = await apiFetch<{ settings: BackupSettings }>('/api/admin/backups/settings', {
        method: 'PUT',
        body: JSON.stringify({
          enabled: backupSettings.enabled,
          intervalHours: Number(backupSettings.intervalHours),
          retentionCount: Number(backupSettings.retentionCount),
        }),
      });
      setBackupSettings(res.settings);
      toast.success('Auto-backup schedule saved.');
    } catch (err: any) {
      toast.error(err?.message || 'Failed to save schedule.');
    } finally {
      setBackupBusy(false);
    }
  };

  const handleRunManualBackup = async () => {
    setBackupBusy(true);
    try {
      await apiFetch('/api/admin/backups/run', { method: 'POST' });
      toast.success('Database backup snapshot created.');
      await loadBackups();
    } catch (err: any) {
      toast.error(err?.message || 'Failed to create backup.');
    } finally {
      setBackupBusy(false);
    }
  };

  const handleDownloadBackup = async (b: BackupRecord) => {
    try {
      const token =
        getStoredSessionToken() || (auth.currentUser ? await auth.currentUser.getIdToken() : '');
      const resp = await fetch(`/api/admin/backups/${b.id}/download`, {
        headers: token ? { Authorization: `Bearer ${token}` } : {},
      });
      if (!resp.ok) throw new Error('Download failed.');
      const blob = await resp.blob();
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `${b.backupCode}.json`;
      document.body.appendChild(a);
      a.click();
      a.remove();
      URL.revokeObjectURL(url);
      toast.success(`Downloaded ${b.backupCode}.json`);
    } catch {
      toast.error('Unable to download backup file.');
    }
  };

  const handleConfirmRestore = async () => {
    if (!restoreTarget) return;
    setBackupBusy(true);
    try {
      await apiFetch(`/api/admin/backups/${restoreTarget.id}/restore`, { method: 'POST' });
      toast.success(`Catalog restored from ${restoreTarget.backupCode} (pre-restore backup saved).`);
      setRestoreTarget(null);
      await loadOverview();
      onCatalogMutated();
    } catch (err: any) {
      toast.error(err?.message || 'Restore failed.');
    } finally {
      setBackupBusy(false);
    }
  };

  const handleDeleteBackup = async (backupId: number) => {
    try {
      await apiFetch(`/api/admin/backups/${backupId}`, { method: 'DELETE' });
      toast.success('Backup deleted.');
      await loadBackups();
    } catch {
      toast.error('Failed to delete backup.');
    }
  };

  return (
    <section className="max-w-7xl mx-auto px-4 sm:px-6 py-10 space-y-8">
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
            MAGNOM PHONES HUB Admin Console
          </h1>
          <p className="text-xs text-slate-500 mt-0.5">
            Manage electronics inventory, brands, categories, and Ghana customer orders.
          </p>
        </div>

        <div className="flex flex-wrap items-center gap-2.5">
          <Button variant="outline" onClick={openNewOrder}>
            <Plus className="h-4 w-4" />
            Add Order
          </Button>
          <Button variant="accent" onClick={openNewProduct}>
            <Plus className="h-4 w-4" />
            Add Product
          </Button>
        </div>
      </div>

      {/* KPI Strip */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        {[
          { label: 'Verified Revenue', value: formatGhs(stats.totalRevenueGhs) },
          { label: 'Total Orders', value: String(stats.totalOrders) },
          { label: 'Pending Fulfillment', value: String(stats.pendingOrders) },
          { label: 'Catalog SKUs / Low Stock', value: `${stats.totalProducts} / ${stats.lowStockCount}` },
        ].map((kpi) => (
          <div key={kpi.label} className="rounded-xl border border-slate-200 bg-white p-5">
            <p className="text-xs text-slate-500">{kpi.label}</p>
            <p className="text-2xl font-bold text-[#001B5E] font-mono-nums mt-1">{kpi.value}</p>
          </div>
        ))}
      </div>

      {loading ? (
        <p className="text-sm text-slate-500 py-8">Loading store database...</p>
      ) : (
        <Tabs defaultValue="products">
          <TabsList className="flex-wrap h-auto">
            <TabsTrigger value="products">Products ({products.length})</TabsTrigger>
            <TabsTrigger value="orders">Orders ({orders.length})</TabsTrigger>
            <TabsTrigger value="taxonomy">Categories &amp; Brands</TabsTrigger>
            <TabsTrigger value="customers">Users &amp; Roles ({customers.length})</TabsTrigger>
            {isSuperAdmin && (
              <TabsTrigger value="backups">Auto Backups ({backupsList.length})</TabsTrigger>
            )}
          </TabsList>

          <TabsContent value="products">
            <div className="rounded-xl border border-slate-200 bg-white overflow-x-auto">
              <table className="w-full text-left border-collapse text-xs">
                <thead>
                  <tr className="border-b border-slate-200 bg-slate-50 text-slate-500">
                    <th className="py-3 px-4 font-semibold">SKU &amp; Product</th>
                    <th className="py-3 px-4 font-semibold">Category</th>
                    <th className="py-3 px-4 font-semibold">Brand</th>
                    <th className="py-3 px-4 font-semibold">Price (GHS)</th>
                    <th className="py-3 px-4 font-semibold">Stock</th>
                    <th className="py-3 px-4 font-semibold text-right">Actions</th>
                  </tr>
                </thead>
                <tbody>
                  {products.map((p) => (
                    <tr key={p.id} className="border-b border-slate-100 hover:bg-slate-50/70">
                      <td className="py-3 px-4">
                        <p className="font-semibold text-slate-900">{p.name}</p>
                        <p className="text-slate-400 font-mono-nums">{p.sku}</p>
                      </td>
                      <td className="py-3 px-4 text-slate-600">
                        {p.categoryGroup} · {p.subcategory}
                      </td>
                      <td className="py-3 px-4 text-slate-700">{p.brandName}</td>
                      <td className="py-3 px-4 font-mono-nums font-semibold text-[#001B5E]">
                        {formatGhs(p.priceGhs)}
                      </td>
                      <td className="py-3 px-4 font-mono-nums">
                        <span className={p.stockQty <= 5 ? 'text-amber-700 font-semibold' : 'text-slate-700'}>
                          {p.stockQty}
                        </span>
                      </td>
                      <td className="py-3 px-4 text-right space-x-2">
                        <Button size="sm" variant="outline" onClick={() => openEditProduct(p)}>
                          Edit
                        </Button>
                        <Button
                          size="sm"
                          variant="ghost"
                          className="text-red-600 hover:text-red-700"
                          onClick={() => handleDeleteProduct(p.id)}
                        >
                          Delete
                        </Button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </TabsContent>

          <TabsContent value="orders" className="space-y-4">
            <div className="flex items-center justify-between">
              <p className="text-xs text-slate-500">
                Add walk-in, WhatsApp (0532779339), or phone (0207581098) orders and manage fulfillment.
              </p>
              <Button size="sm" variant="accent" onClick={openNewOrder}>
                <Plus className="h-3.5 w-3.5" />
                Add Order
              </Button>
            </div>

            {orders.length === 0 ? (
              <div className="rounded-xl border border-slate-200 bg-white p-8 text-center text-xs text-slate-500">
                No customer orders recorded yet. Click Add Order to log a new order.
              </div>
            ) : (
              orders.map((order) => (
                <div
                  key={order.id}
                  className="rounded-xl border border-slate-200 bg-white p-5 space-y-3"
                >
                  <div className="flex flex-wrap items-start justify-between gap-4">
                    <div className="space-y-1">
                      <p className="text-sm font-bold text-[#001B5E] font-mono-nums">
                        {order.orderNumber} · {formatGhs(order.totalGhs)}
                      </p>
                      <p className="text-xs text-slate-600">
                        {order.customerName} ({order.customerPhone}) · {order.shippingCity},{' '}
                        {order.shippingRegion} · {order.deliveryMethod}
                      </p>
                      {order.items && order.items.length > 0 && (
                        <p className="text-xs text-slate-500">
                          Items:{' '}
                          {order.items
                            .map((i) => `${i.productName} ×${i.quantity}`)
                            .join(', ')}
                        </p>
                      )}
                      <p className="text-[11px] text-slate-400">{order.trackingNote}</p>
                    </div>
                    <div className="flex flex-wrap items-center gap-2">
                      <select
                        aria-label="Order Status"
                        value={order.orderStatus}
                        onChange={(e) =>
                          handleUpdateOrder(order.id, {
                            orderStatus: e.target.value,
                            trackingNote: order.trackingNote,
                          })
                        }
                        className="h-9 rounded-lg border border-slate-200 bg-white px-2.5 text-xs font-semibold text-slate-900"
                      >
                        {['pending', 'confirmed', 'processing', 'shipped', 'delivered', 'cancelled'].map(
                          (st) => (
                            <option key={st} value={st}>
                              Order: {st.toUpperCase()}
                            </option>
                          )
                        )}
                      </select>

                      <select
                        aria-label="Payment Status"
                        value={order.paymentStatus}
                        onChange={(e) =>
                          handleUpdateOrder(order.id, {
                            paymentStatus: e.target.value,
                          })
                        }
                        className="h-9 rounded-lg border border-slate-200 bg-white px-2.5 text-xs font-semibold text-slate-900"
                      >
                        {[
                          { val: 'pending', label: 'Pay: PENDING' },
                          { val: 'paid', label: 'Pay: PAID' },
                          { val: 'cod_pending', label: 'Pay: COD PENDING' },
                          { val: 'failed', label: 'Pay: FAILED' },
                        ].map((pst) => (
                          <option key={pst.val} value={pst.val}>
                            {pst.label}
                          </option>
                        ))}
                      </select>

                      <Button
                        size="sm"
                        variant="ghost"
                        className="text-red-600 hover:text-red-700"
                        onClick={() => handleDeleteOrder(order.id)}
                      >
                        Delete
                      </Button>
                    </div>
                  </div>
                </div>
              ))
            )}
          </TabsContent>

          <TabsContent value="taxonomy">
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
              <div className="rounded-xl border border-slate-200 bg-white p-6 space-y-4">
                <h3 className="text-base font-bold text-[#001B5E]">Add Subcategory</h3>
                <form onSubmit={handleAddCategory} className="flex flex-wrap gap-2">
                  <Input
                    required
                    value={newCatName}
                    onChange={(e) => setNewCatName(e.target.value)}
                    placeholder="e.g., Gaming Laptops"
                    className="flex-1 min-w-[160px]"
                  />
                  <select
                    value={newCatGroup}
                    onChange={(e) => setNewCatGroup(e.target.value)}
                    className="h-10 rounded-lg border border-slate-200 bg-white px-3 text-sm"
                  >
                    <option value="iphones">iPhones</option>
                    <option value="android">Android</option>
                    <option value="laptops">Laptops</option>
                    <option value="accessories">Accessories</option>
                  </select>
                  <Button type="submit" variant="accent">
                    Add
                  </Button>
                </form>

                <div className="max-h-72 overflow-y-auto divide-y divide-slate-100">
                  {categories.map((c) => (
                    <div key={c.id} className="py-2 flex items-center justify-between text-xs">
                      <span>
                        <strong className="text-slate-900">{c.name}</strong>{' '}
                        <span className="text-slate-400">({c.parentGroup})</span>
                      </span>
                      <button
                        type="button"
                        onClick={async () => {
                          await apiFetch(`/api/admin/categories/${c.id}`, { method: 'DELETE' });
                          await loadOverview();
                          onCatalogMutated();
                        }}
                        className="text-slate-400 hover:text-red-600 cursor-pointer"
                        aria-label="Delete category"
                      >
                        <Trash2 className="h-3.5 w-3.5" />
                      </button>
                    </div>
                  ))}
                </div>
              </div>

              <div className="rounded-xl border border-slate-200 bg-white p-6 space-y-4">
                <h3 className="text-base font-bold text-[#001B5E]">Add Brand</h3>
                <form onSubmit={handleAddBrand} className="flex flex-wrap gap-2">
                  <Input
                    required
                    value={newBrandName}
                    onChange={(e) => setNewBrandName(e.target.value)}
                    placeholder="e.g., OnePlus"
                    className="flex-1 min-w-[160px]"
                  />
                  <select
                    value={newBrandGroup}
                    onChange={(e) => setNewBrandGroup(e.target.value)}
                    className="h-10 rounded-lg border border-slate-200 bg-white px-3 text-sm"
                  >
                    <option value="iphones">iPhones</option>
                    <option value="android">Android</option>
                    <option value="laptops">Laptops</option>
                    <option value="accessories">Accessories</option>
                  </select>
                  <Button type="submit" variant="accent">
                    Add
                  </Button>
                </form>

                <div className="max-h-72 overflow-y-auto divide-y divide-slate-100">
                  {brands.map((b) => (
                    <div key={b.id} className="py-2 flex items-center justify-between text-xs">
                      <span>
                        <strong className="text-slate-900">{b.name}</strong>{' '}
                        <span className="text-slate-400">({b.categoryGroup})</span>
                      </span>
                      <button
                        type="button"
                        onClick={async () => {
                          await apiFetch(`/api/admin/brands/${b.id}`, { method: 'DELETE' });
                          await loadOverview();
                          onCatalogMutated();
                        }}
                        className="text-slate-400 hover:text-red-600 cursor-pointer"
                        aria-label="Delete brand"
                      >
                        <Trash2 className="h-3.5 w-3.5" />
                      </button>
                    </div>
                  ))}
                </div>
              </div>
            </div>
          </TabsContent>

          <TabsContent value="customers" className="space-y-4">
            <div className="flex flex-wrap items-center justify-between gap-3">
              <Input
                value={userSearch}
                onChange={(e) => setUserSearch(e.target.value)}
                placeholder="Search users by name, email, or role..."
                className="max-w-xs"
              />
              {isSuperAdmin && (
                <Button size="sm" variant="accent" onClick={() => setAddUserOpen(true)}>
                  <UserPlus className="h-3.5 w-3.5" />
                  Add Staff / User
                </Button>
              )}
            </div>

            <div className="rounded-xl border border-slate-200 bg-white overflow-x-auto">
              <table className="w-full text-left border-collapse text-xs">
                <thead>
                  <tr className="border-b border-slate-200 bg-slate-50 text-slate-500">
                    <th className="py-3 px-4 font-semibold">Name</th>
                    <th className="py-3 px-4 font-semibold">Email</th>
                    <th className="py-3 px-4 font-semibold">Ghana Phone</th>
                    <th className="py-3 px-4 font-semibold">Verification</th>
                    <th className="py-3 px-4 font-semibold">Role</th>
                  </tr>
                </thead>
                <tbody>
                  {customers
                    .filter((c) => {
                      if (!userSearch.trim()) return true;
                      const q = userSearch.toLowerCase();
                      return (
                        c.fullName.toLowerCase().includes(q) ||
                        c.email.toLowerCase().includes(q) ||
                        c.role.toLowerCase().includes(q)
                      );
                    })
                    .map((c) => {
                      const isLockedAdmin =
                        c.id === currentUser.id ||
                        c.email.toLowerCase() === 'sarpongpatrick2915@gmail.com';
                      return (
                        <tr key={c.id} className="border-b border-slate-100 hover:bg-slate-50/70">
                          <td className="py-3 px-4 font-semibold text-slate-900">
                            {c.fullName}
                            {c.id === currentUser.id && (
                              <span className="ml-1.5 text-[10px] text-[#DC0000]">(You)</span>
                            )}
                          </td>
                          <td className="py-3 px-4 text-slate-600">{c.email}</td>
                          <td className="py-3 px-4 font-mono-nums text-slate-600">
                            {c.phone || '—'}
                          </td>
                          <td className="py-3 px-4">
                            {isSuperAdmin ? (
                              <button
                                type="button"
                                onClick={() =>
                                  handleUpdateUserRole(c.id, { emailVerified: !c.emailVerified })
                                }
                                className={`px-2 py-0.5 rounded font-semibold cursor-pointer ${
                                  c.emailVerified
                                    ? 'bg-emerald-50 text-emerald-700'
                                    : 'bg-amber-50 text-amber-700'
                                }`}
                              >
                                {c.emailVerified ? 'Verified' : 'Pending OTP'}
                              </button>
                            ) : (
                              <span>{c.emailVerified ? 'Verified' : 'Pending OTP'}</span>
                            )}
                          </td>
                          <td className="py-3 px-4">
                            {isSuperAdmin ? (
                              <select
                                aria-label={`Role for ${c.email}`}
                                disabled={isLockedAdmin}
                                value={c.role}
                                onChange={(e) =>
                                  handleUpdateUserRole(c.id, { role: e.target.value })
                                }
                                className="h-8 rounded-lg border border-slate-200 bg-white px-2.5 text-xs font-semibold text-[#001B5E] disabled:opacity-60"
                              >
                                <option value="customer">Customer</option>
                                <option value="staff">Staff (Inventory &amp; Orders)</option>
                                <option value="admin">Admin (Full Access)</option>
                              </select>
                            ) : (
                              <span className="capitalize font-semibold text-[#001B5E]">
                                {c.role}
                              </span>
                            )}
                          </td>
                        </tr>
                      );
                    })}
                </tbody>
              </table>
            </div>
          </TabsContent>

          {isSuperAdmin && (
            <TabsContent value="backups" className="space-y-6">
              <div className="rounded-xl border border-slate-200 bg-white p-6 space-y-5">
                <div className="flex flex-wrap items-start justify-between gap-4">
                  <div>
                    <h3 className="text-base font-bold text-[#001B5E] flex items-center gap-2">
                      <DatabaseBackup className="h-4 w-4 text-[#DC0000]" />
                      Automated Store Backup Schedule
                    </h3>
                    <p className="text-xs text-slate-500 mt-1">
                      Automatically snapshots products, categories, brands, orders, reviews, and user metadata.
                      Last automated/manual run:{' '}
                      <strong className="text-[#001B5E]">
                        {backupSettings.lastRunAt
                          ? new Date(backupSettings.lastRunAt).toLocaleString()
                          : 'Never'}
                      </strong>
                    </p>
                  </div>
                  <Button
                    variant="accent"
                    size="sm"
                    disabled={backupBusy}
                    onClick={handleRunManualBackup}
                  >
                    <DatabaseBackup className="h-3.5 w-3.5" />
                    {backupBusy ? 'Working...' : 'Run Backup Now'}
                  </Button>
                </div>

                <div className="grid grid-cols-1 sm:grid-cols-4 gap-4 items-end border-t border-slate-100 pt-4">
                  <label className="flex items-center gap-2.5 h-10 px-3 rounded-lg border border-slate-200 bg-slate-50 cursor-pointer text-xs font-semibold text-slate-800">
                    <input
                      type="checkbox"
                      checked={backupSettings.enabled}
                      onChange={(e) =>
                        setBackupSettings((s) => ({ ...s, enabled: e.target.checked }))
                      }
                    />
                    Auto-Backup Enabled
                  </label>

                  <div className="space-y-1">
                    <Label>Backup Frequency</Label>
                    <select
                      value={backupSettings.intervalHours}
                      onChange={(e) =>
                        setBackupSettings((s) => ({
                          ...s,
                          intervalHours: Number(e.target.value),
                        }))
                      }
                      className="flex h-10 w-full rounded-lg border border-slate-200 bg-white px-3 text-xs font-semibold text-slate-900"
                    >
                      <option value={6}>Every 6 Hours</option>
                      <option value={12}>Every 12 Hours</option>
                      <option value={24}>Every 24 Hours (Daily)</option>
                      <option value={168}>Every 7 Days (Weekly)</option>
                    </select>
                  </div>

                  <div className="space-y-1">
                    <Label>Keep Auto Snapshots</Label>
                    <select
                      value={backupSettings.retentionCount}
                      onChange={(e) =>
                        setBackupSettings((s) => ({
                          ...s,
                          retentionCount: Number(e.target.value),
                        }))
                      }
                      className="flex h-10 w-full rounded-lg border border-slate-200 bg-white px-3 text-xs font-semibold text-slate-900"
                    >
                      <option value={7}>Last 7 Auto Backups</option>
                      <option value={14}>Last 14 Auto Backups</option>
                      <option value={30}>Last 30 Auto Backups</option>
                      <option value={60}>Last 60 Auto Backups</option>
                    </select>
                  </div>

                  <Button variant="outline" disabled={backupBusy} onClick={handleSaveBackupSettings}>
                    Save Schedule
                  </Button>
                </div>
              </div>

              <div className="rounded-xl border border-slate-200 bg-white overflow-x-auto">
                <table className="w-full text-left border-collapse text-xs">
                  <thead>
                    <tr className="border-b border-slate-200 bg-slate-50 text-slate-500">
                      <th className="py-3 px-4 font-semibold">Snapshot Code</th>
                      <th className="py-3 px-4 font-semibold">Trigger</th>
                      <th className="py-3 px-4 font-semibold">Records</th>
                      <th className="py-3 px-4 font-semibold">Size</th>
                      <th className="py-3 px-4 font-semibold">Created</th>
                      <th className="py-3 px-4 font-semibold text-right">Actions</th>
                    </tr>
                  </thead>
                  <tbody>
                    {backupsList.length === 0 ? (
                      <tr>
                        <td colSpan={6} className="py-8 text-center text-slate-500">
                          No backup snapshots stored yet. Click Run Backup Now to create your first snapshot.
                        </td>
                      </tr>
                    ) : (
                      backupsList.map((b) => (
                        <tr key={b.id} className="border-b border-slate-100 hover:bg-slate-50/70">
                          <td className="py-3 px-4">
                            <p className="font-mono-nums font-bold text-[#001B5E]">{b.backupCode}</p>
                            <p className="text-[11px] text-slate-400">{b.createdByEmail}</p>
                          </td>
                          <td className="py-3 px-4 uppercase font-semibold text-[11px]">
                            <span
                              className={`px-2 py-0.5 rounded ${
                                b.triggerType === 'auto'
                                  ? 'bg-[#001B5E]/10 text-[#001B5E]'
                                  : b.triggerType === 'pre_restore'
                                  ? 'bg-amber-50 text-amber-700'
                                  : 'bg-red-50 text-[#DC0000]'
                              }`}
                            >
                              {b.triggerType}
                            </span>
                          </td>
                          <td className="py-3 px-4 text-slate-600 font-mono-nums">
                            {b.summary.products} SKUs · {b.summary.orders} orders · {b.summary.users}{' '}
                            users
                          </td>
                          <td className="py-3 px-4 font-mono-nums text-slate-700">
                            {(b.sizeBytes / 1024).toFixed(1)} KB
                          </td>
                          <td className="py-3 px-4 text-slate-600">
                            {new Date(b.createdAt).toLocaleString()}
                          </td>
                          <td className="py-3 px-4 text-right space-x-1.5 whitespace-nowrap">
                            <Button
                              size="sm"
                              variant="outline"
                              onClick={() => handleDownloadBackup(b)}
                            >
                              <Download className="h-3.5 w-3.5" />
                              JSON
                            </Button>
                            <Button
                              size="sm"
                              variant="outline"
                              onClick={() => setRestoreTarget(b)}
                            >
                              <RotateCcw className="h-3.5 w-3.5" />
                              Restore
                            </Button>
                            <Button
                              size="sm"
                              variant="ghost"
                              className="text-red-600 hover:text-red-700"
                              onClick={() => handleDeleteBackup(b.id)}
                            >
                              Delete
                            </Button>
                          </td>
                        </tr>
                      ))
                    )}
                  </tbody>
                </table>
              </div>
            </TabsContent>
          )}
        </Tabs>
      )}

      {/* Add / Edit Product Dialog */}
      <Dialog open={prodDialogOpen} onOpenChange={setProdDialogOpen}>
        <DialogContent className="max-w-xl">
          <DialogHeader>
            <DialogTitle>{editingProd ? 'Edit Product' : 'Add New Electronics Product'}</DialogTitle>
          </DialogHeader>
          <form onSubmit={handleSaveProduct} className="space-y-3.5">
            <div className="space-y-1">
              <Label>Product Name</Label>
              <Input
                required
                value={pName}
                onChange={(e) => setPName(e.target.value)}
                placeholder="iPhone 16 Pro Max 512GB"
              />
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
              <div className="space-y-1">
                <Label>Category Group</Label>
                <select
                  value={pCategoryGroup}
                  onChange={(e) => setPCategoryGroup(e.target.value)}
                  className="flex h-10 w-full rounded-lg border border-slate-200 bg-white px-3 text-sm"
                >
                  <option value="iphones">iPhones</option>
                  <option value="android">Android</option>
                  <option value="laptops">Laptops</option>
                  <option value="accessories">Accessories</option>
                </select>
              </div>
              <div className="space-y-1">
                <Label>Subcategory / Series</Label>
                <Input
                  required
                  value={pSubcategory}
                  onChange={(e) => setPSubcategory(e.target.value)}
                  placeholder="iPhone 16 Series"
                />
              </div>
              <div className="space-y-1">
                <Label>Brand</Label>
                <Input
                  required
                  value={pBrandName}
                  onChange={(e) => setPBrandName(e.target.value)}
                  placeholder="Apple"
                />
              </div>
            </div>

            <div className="grid grid-cols-3 gap-3">
              <div className="space-y-1">
                <Label>Price (GH₵)</Label>
                <Input
                  type="number"
                  required
                  min={1}
                  value={pPrice}
                  onChange={(e) => setPPrice(e.target.value)}
                />
              </div>
              <div className="space-y-1">
                <Label>Compare-At (GH₵)</Label>
                <Input
                  type="number"
                  value={pCompareAt}
                  onChange={(e) => setPCompareAt(e.target.value)}
                />
              </div>
              <div className="space-y-1">
                <Label>Stock Qty</Label>
                <Input
                  type="number"
                  required
                  min={0}
                  value={pStock}
                  onChange={(e) => setPStock(e.target.value)}
                />
              </div>
            </div>

            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1">
                <Label>Storage / Variant</Label>
                <Input
                  value={pVariant}
                  onChange={(e) => setPVariant(e.target.value)}
                  placeholder="256GB · Titanium"
                />
              </div>
              <div className="space-y-1">
                <Label>Condition</Label>
                <Input
                  value={pCondition}
                  onChange={(e) => setPCondition(e.target.value)}
                />
              </div>
            </div>

            <div className="space-y-1">
              <Label>Warranty</Label>
              <Input value={pWarranty} onChange={(e) => setPWarranty(e.target.value)} />
            </div>

            <div className="space-y-1">
              <Label>Description</Label>
              <Input
                required
                value={pDesc}
                onChange={(e) => setPDesc(e.target.value)}
                placeholder="Key highlights for Ghanaian buyers..."
              />
            </div>

            <div className="flex flex-wrap gap-4 pt-1 text-xs">
              <label className="flex items-center gap-1.5 cursor-pointer">
                <input
                  type="checkbox"
                  checked={pFeatured}
                  onChange={(e) => setPFeatured(e.target.checked)}
                />
                Featured
              </label>
              <label className="flex items-center gap-1.5 cursor-pointer">
                <input
                  type="checkbox"
                  checked={pBestSeller}
                  onChange={(e) => setPBestSeller(e.target.checked)}
                />
                Best Seller
              </label>
              <label className="flex items-center gap-1.5 cursor-pointer">
                <input
                  type="checkbox"
                  checked={pNewArrival}
                  onChange={(e) => setPNewArrival(e.target.checked)}
                />
                New Arrival
              </label>
              <label className="flex items-center gap-1.5 cursor-pointer">
                <input
                  type="checkbox"
                  checked={pSpecialOffer}
                  onChange={(e) => setPSpecialOffer(e.target.checked)}
                />
                Special Offer
              </label>
            </div>

            <Button type="submit" variant="accent" className="w-full">
              {editingProd ? 'Save Changes' : 'Publish Product'}
            </Button>
          </form>
        </DialogContent>
      </Dialog>

      {/* Add Order Dialog */}
      <Dialog open={orderDialogOpen} onOpenChange={setOrderDialogOpen}>
        <DialogContent className="max-w-xl">
          <DialogHeader>
            <DialogTitle>Create Customer Order</DialogTitle>
          </DialogHeader>
          <form onSubmit={handleCreateOrder} className="space-y-3.5">
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
              <div className="sm:col-span-2 space-y-1">
                <Label>Select Product</Label>
                <select
                  required
                  value={oProductId}
                  onChange={(e) => setOProductId(e.target.value)}
                  className="flex h-10 w-full rounded-lg border border-slate-200 bg-white px-3 text-sm"
                >
                  {products.map((p) => (
                    <option key={p.id} value={p.id}>
                      {p.name} — {formatGhs(p.priceGhs)} ({p.stockQty} left)
                    </option>
                  ))}
                </select>
              </div>
              <div className="space-y-1">
                <Label>Quantity</Label>
                <Input
                  type="number"
                  required
                  min={1}
                  value={oQuantity}
                  onChange={(e) => setOQuantity(e.target.value)}
                />
              </div>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <div className="space-y-1">
                <Label>Customer Full Name</Label>
                <Input
                  required
                  value={oCustomerName}
                  onChange={(e) => setOCustomerName(e.target.value)}
                  placeholder="Kwame Mensah"
                />
              </div>
              <div className="space-y-1">
                <Label>Ghana Phone</Label>
                <Input
                  required
                  value={oCustomerPhone}
                  onChange={(e) => setOCustomerPhone(e.target.value)}
                  placeholder="0241234567"
                />
              </div>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
              <div className="space-y-1">
                <Label>Region</Label>
                <select
                  value={oRegion}
                  onChange={(e) => setORegion(e.target.value)}
                  className="flex h-10 w-full rounded-lg border border-slate-200 bg-white px-3 text-sm"
                >
                  {GHANA_REGIONS.map((r) => (
                    <option key={r} value={r}>
                      {r}
                    </option>
                  ))}
                </select>
              </div>
              <div className="space-y-1">
                <Label>City / Area</Label>
                <Input
                  required
                  value={oCity}
                  onChange={(e) => setOCity(e.target.value)}
                  placeholder="Accra - Osu"
                />
              </div>
              <div className="space-y-1">
                <Label>Customer Email (Optional)</Label>
                <Input
                  type="email"
                  value={oCustomerEmail}
                  onChange={(e) => setOCustomerEmail(e.target.value)}
                  placeholder="client@example.com"
                />
              </div>
            </div>

            <div className="space-y-1">
              <Label>Street / Landmark</Label>
              <Input
                value={oStreet}
                onChange={(e) => setOStreet(e.target.value)}
                placeholder="WhatsApp order / Osu Showroom Pickup"
              />
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
              <div className="space-y-1">
                <Label>Delivery</Label>
                <select
                  value={oDeliveryMethod}
                  onChange={(e) => setODeliveryMethod(e.target.value)}
                  className="flex h-10 w-full rounded-lg border border-slate-200 bg-white px-3 text-sm"
                >
                  <option value="Accra Same-Day Dispatch">Accra Same-Day Dispatch</option>
                  <option value="Nationwide Courier">Nationwide Courier</option>
                  <option value="Showroom Pickup">Showroom Pickup</option>
                </select>
              </div>
              <div className="space-y-1">
                <Label>Payment Status</Label>
                <select
                  value={oPaymentStatus}
                  onChange={(e) => setOPaymentStatus(e.target.value)}
                  className="flex h-10 w-full rounded-lg border border-slate-200 bg-white px-3 text-sm"
                >
                  <option value="paid">Paid (MoMo / Cash / Paystack)</option>
                  <option value="cod_pending">Cash on Delivery Pending</option>
                  <option value="pending">Pending Payment</option>
                </select>
              </div>
              <div className="space-y-1">
                <Label>Order Status</Label>
                <select
                  value={oOrderStatus}
                  onChange={(e) => setOOrderStatus(e.target.value)}
                  className="flex h-10 w-full rounded-lg border border-slate-200 bg-white px-3 text-sm"
                >
                  <option value="confirmed">Confirmed</option>
                  <option value="processing">Processing</option>
                  <option value="shipped">Shipped</option>
                  <option value="delivered">Delivered</option>
                  <option value="pending">Pending</option>
                </select>
              </div>
            </div>

            <div className="space-y-1">
              <Label>Tracking Note</Label>
              <Input
                value={oTrackingNote}
                onChange={(e) => setOTrackingNote(e.target.value)}
              />
            </div>

            <Button type="submit" variant="accent" className="w-full">
              Create Order
            </Button>
          </form>
        </DialogContent>
      </Dialog>

      {/* Add Staff / User Dialog */}
      <Dialog open={addUserOpen} onOpenChange={setAddUserOpen}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>Create Staff or Customer Account</DialogTitle>
          </DialogHeader>
          <form onSubmit={handleCreateUser} className="space-y-3.5">
            <div className="space-y-1">
              <Label>Full Name</Label>
              <Input
                required
                value={uFullName}
                onChange={(e) => setUFullName(e.target.value)}
                placeholder="Ama Mensah"
              />
            </div>
            <div className="space-y-1">
              <Label>Email Address</Label>
              <Input
                type="email"
                required
                value={uEmail}
                onChange={(e) => setUEmail(e.target.value)}
                placeholder="staff@magnomphones.gh"
              />
            </div>
            <div className="space-y-1">
              <Label>Ghana Phone (Optional)</Label>
              <Input
                value={uPhone}
                onChange={(e) => setUPhone(e.target.value)}
                placeholder="0241234567"
              />
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1">
                <Label>Role</Label>
                <select
                  value={uRole}
                  onChange={(e) => setURole(e.target.value as 'customer' | 'staff' | 'admin')}
                  className="flex h-10 w-full rounded-lg border border-slate-200 bg-white px-3 text-sm"
                >
                  <option value="staff">Staff</option>
                  <option value="admin">Admin</option>
                  <option value="customer">Customer</option>
                </select>
              </div>
              <div className="space-y-1">
                <Label>Temporary Password</Label>
                <Input
                  type="password"
                  required
                  minLength={8}
                  value={uPassword}
                  onChange={(e) => setUPassword(e.target.value)}
                  placeholder="Min 8 chars"
                />
              </div>
            </div>
            <Button type="submit" variant="accent" className="w-full">
              <ShieldCheck className="h-4 w-4" />
              Create Account
            </Button>
          </form>
        </DialogContent>
      </Dialog>

      {/* Restore Backup Confirmation Dialog */}
      <Dialog open={Boolean(restoreTarget)} onOpenChange={(o) => !o && setRestoreTarget(null)}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>Restore Catalog from Snapshot?</DialogTitle>
          </DialogHeader>
          {restoreTarget && (
            <div className="space-y-4 text-xs text-slate-600">
              <p>
                You are about to restore categories, brands, products, and newsletter records from{' '}
                <strong className="text-[#001B5E] font-mono-nums">{restoreTarget.backupCode}</strong>.
              </p>
              <p className="rounded-lg bg-slate-50 border border-slate-200 p-3 text-slate-700">
                A <strong className="text-[#001B5E]">pre-restore safety snapshot</strong> will be
                captured automatically before applying this restore.
              </p>
              <div className="flex items-center justify-end gap-2">
                <Button variant="outline" onClick={() => setRestoreTarget(null)}>
                  Cancel
                </Button>
                <Button variant="accent" disabled={backupBusy} onClick={handleConfirmRestore}>
                  {backupBusy ? 'Restoring...' : 'Confirm Restore'}
                </Button>
              </div>
            </div>
          )}
        </DialogContent>
      </Dialog>
    </section>
  );
};
