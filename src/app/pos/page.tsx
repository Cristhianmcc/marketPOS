'use client';

import { useState, useEffect } from 'react';
import { Search, Plus, Minus, Trash2, ShoppingCart, X, AlertCircle, Tag, Package as PackageIcon, Clock, Milk } from 'lucide-react';
import AuthLayout from '@/components/AuthLayout';
import { toast, Toaster } from 'sonner';
import { formatMoney } from '@/lib/money';
import { Shift } from '@/domain/types';

interface StoreProduct {
  id: string;
  price: number;
  stock: number | null;
  active: boolean;
  product: {
    id: string;
    name: string;
    brand: string | null;
    content: string | null;
    category: string;
    unitType: 'UNIT' | 'KG';
    barcode: string | null;
    internalSku: string;
  };
}

interface CartItem {
  storeProduct: StoreProduct;
  quantity: number;
  discountType?: 'PERCENT' | 'AMOUNT';
  discountValue?: number;
  // Promociones automáticas
  promotionType?: 'TWO_FOR_ONE' | 'PACK_PRICE' | 'HAPPY_HOUR' | null;
  promotionName?: string | null;
  promotionDiscount?: number;
  // Promociones por categoría (Módulo 14.2-B)
  categoryPromoName?: string | null;
  categoryPromoType?: 'PERCENT' | 'AMOUNT' | null;
  categoryPromoDiscount?: number;
  // Promociones por volumen (Módulo 14.2-C1)
  volumePromoName?: string | null;
  volumePromoQty?: number | null;
  volumePromoDiscount?: number;
}

interface Customer {
  id: string;
  name: string;
  phone: string | null;
  totalBalance: number;
}

export default function POSPage() {
  const [query, setQuery] = useState('');
  const [products, setProducts] = useState<StoreProduct[]>([]);
  const [cart, setCart] = useState<CartItem[]>([]);
  const [loading, setLoading] = useState(false);
  const [processing, setProcessing] = useState(false);
  const [currentShift, setCurrentShift] = useState<Shift | null>(null);
  const [showOpenShiftModal, setShowOpenShiftModal] = useState(false);
  const [openingCash, setOpeningCash] = useState('');
  const [showSaleCompleteModal, setShowSaleCompleteModal] = useState(false);
  const [completedSale, setCompletedSale] = useState<{ id: string; total: number } | null>(null);
  const [showPaymentModal, setShowPaymentModal] = useState(false);
  const [paymentMethod, setPaymentMethod] = useState<'CASH' | 'YAPE' | 'PLIN' | 'CARD' | 'FIADO'>('CASH');
  const [amountPaid, setAmountPaid] = useState('');
  
  // Estados para FIADO
  const [selectedCustomer, setSelectedCustomer] = useState<Customer | null>(null);
  const [showCustomerModal, setShowCustomerModal] = useState(false);
  const [customerSearch, setCustomerSearch] = useState('');
  const [customers, setCustomers] = useState<Customer[]>([]);
  const [loadingCustomers, setLoadingCustomers] = useState(false);
  const [showCreateCustomerModal, setShowCreateCustomerModal] = useState(false);
  const [newCustomerName, setNewCustomerName] = useState('');
  const [newCustomerPhone, setNewCustomerPhone] = useState('');
  const [creatingCustomer, setCreatingCustomer] = useState(false);
  const [isSuperAdmin, setIsSuperAdmin] = useState(false);

  // Estados para descuentos
  const [showDiscountModal, setShowDiscountModal] = useState(false);
  const [discountItemId, setDiscountItemId] = useState<string | null>(null);
  const [discountType, setDiscountType] = useState<'PERCENT' | 'AMOUNT'>('PERCENT');
  const [discountValue, setDiscountValue] = useState('');
  const [globalDiscount, setGlobalDiscount] = useState(0);
  
  // Estados para modal de descuento global
  const [showGlobalDiscountModal, setShowGlobalDiscountModal] = useState(false);
  const [globalDiscountType, setGlobalDiscountType] = useState<'PERCENT' | 'AMOUNT'>('PERCENT');
  const [globalDiscountValue, setGlobalDiscountValue] = useState('');

  // Estados para cupones (Módulo 14.2-A)
  const [couponCode, setCouponCode] = useState('');
  const [appliedCoupon, setAppliedCoupon] = useState<{
    code: string;
    discount: number;
    type: string;
    value: number;
  } | null>(null);
  const [validatingCoupon, setValidatingCoupon] = useState(false);

  // Cargar turno actual al montar
  useEffect(() => {
    fetchCurrentShift();
    checkSuperAdmin();
  }, []);

  const checkSuperAdmin = async () => {
    try {
      const res = await fetch('/api/auth/is-superadmin');
      if (res.ok) {
        const data = await res.json();
        setIsSuperAdmin(data.isSuperAdmin);
      }
    } catch (error) {
      console.error('Error checking superadmin:', error);
    }
  };

  const fetchCurrentShift = async () => {
    try {
      const res = await fetch('/api/shifts/current');
      const data = await res.json();
      setCurrentShift(data.shift);
    } catch (error) {
      console.error('Error fetching shift:', error);
    }
  };

  const handleOpenShift = async () => {
    const amount = parseFloat(openingCash);
    if (isNaN(amount) || amount < 0) {
      toast.error('Ingresa un monto válido');
      return;
    }

    try {
      const res = await fetch('/api/shifts/open', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ openingCash: amount }),
      });

      if (!res.ok) {
        const error = await res.json();
        toast.error(error.message);
        return;
      }

      toast.success('Turno abierto correctamente');
      setShowOpenShiftModal(false);
      setOpeningCash('');
      fetchCurrentShift();
    } catch (error) {
      toast.error('Error al abrir turno');
    }
  };

  // Búsqueda automática con debounce
  useEffect(() => {
    const delaySearch = setTimeout(() => {
      if (query.trim().length >= 2) {
        performSearch();
      } else if (query.trim().length === 0) {
        setProducts([]);
      }
    }, 300); // Esperar 300ms después de que el usuario deje de escribir

    return () => clearTimeout(delaySearch);
  }, [query]);

  const performSearch = async () => {
    if (!query.trim()) {
      setProducts([]);
      return;
    }

    setLoading(true);
    try {
      const res = await fetch(`/api/inventory?query=${encodeURIComponent(query)}&active=true`);
      const data = await res.json();
      setProducts(data.products || []);
    } catch (error) {
      console.error('Error searching products:', error);
      toast.error('Error al buscar productos');
    } finally {
      setLoading(false);
    }
  };

  const handleSearch = () => {
    performSearch();
  };

  // Verificar y aplicar promoción automática
  const checkAndApplyPromotion = async (item: CartItem): Promise<CartItem> => {
    try {
      const res = await fetch('/api/promotions/check', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          productId: item.storeProduct.product.id,
          quantity: item.quantity,
          unitPrice: item.storeProduct.price,
        }),
      });

      if (!res.ok) return item;

      const data = await res.json();
      
      if (data.promotion) {
        return {
          ...item,
          promotionType: data.promotion.promotionType,
          promotionName: data.promotion.promotionName,
          promotionDiscount: data.promotion.promotionDiscount,
        };
      }

      // Sin promoción
      return {
        ...item,
        promotionType: null,
        promotionName: null,
        promotionDiscount: 0,
      };
    } catch (error) {
      console.error('Error checking promotion:', error);
      return item;
    }
  };

  // ✅ Verificar y aplicar promoción por categoría (Módulo 14.2-B)
  const checkAndApplyCategoryPromotion = async (item: CartItem): Promise<CartItem> => {
    try {
      // Calcular subtotal después de promo de producto
      const subtotal = item.quantity * item.storeProduct.price;
      const productPromoDiscount = item.promotionDiscount ?? 0;
      const subtotalAfterProductPromo = subtotal - productPromoDiscount;

      const res = await fetch('/api/category-promotions/check', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          productCategory: item.storeProduct.product.category,
          quantity: item.quantity,
          unitPrice: item.storeProduct.price,
          subtotalAfterProductPromo,
        }),
      });

      if (!res.ok) return item;

      const data = await res.json();
      
      if (data.categoryPromotion) {
        return {
          ...item,
          categoryPromoName: data.categoryPromotion.categoryPromoName,
          categoryPromoType: data.categoryPromotion.categoryPromoType,
          categoryPromoDiscount: data.categoryPromotion.categoryPromoDiscount,
        };
      }

      // Sin promoción por categoría
      return {
        ...item,
        categoryPromoName: null,
        categoryPromoType: null,
        categoryPromoDiscount: 0,
      };
    } catch (error) {
      console.error('Error checking category promotion:', error);
      return item;
    }
  };

  // ✅ Verificar y aplicar promoción por volumen (Módulo 14.2-C1)
  const checkAndApplyVolumePromotion = async (item: CartItem): Promise<CartItem> => {
    try {
      // ⚠️ NO aplicar si ya hay promoción de producto (prioridad: producto > categoría > volumen)
      const productPromoDiscount = item.promotionDiscount ?? 0;
      if (productPromoDiscount > 0) {
        // Si hay promo de producto, NO evaluar promo por volumen
        return {
          ...item,
          volumePromoName: null,
          volumePromoQty: null,
          volumePromoDiscount: 0,
        };
      }
      
      // Calcular subtotal después de promos automáticas previas
      const subtotal = item.quantity * item.storeProduct.price;
      const categoryPromoDiscount = item.categoryPromoDiscount ?? 0;
      const subtotalAfterCategoryPromo = subtotal - productPromoDiscount - categoryPromoDiscount;

      const res = await fetch('/api/volume-promotions/check', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          productId: item.storeProduct.product.id,
          quantity: item.quantity,
          unitPrice: item.storeProduct.price,
          unitType: item.storeProduct.product.unitType,
          subtotalAfterCategoryPromo,
        }),
      });

      if (!res.ok) return item;

      const data = await res.json();
      
      if (data.volumePromotion) {
        return {
          ...item,
          volumePromoName: data.volumePromotion.volumePromoName,
          volumePromoQty: data.volumePromotion.volumePromoQty,
          volumePromoDiscount: data.volumePromotion.volumePromoDiscount,
        };
      }

      // Sin promoción por volumen
      return {
        ...item,
        volumePromoName: null,
        volumePromoQty: null,
        volumePromoDiscount: 0,
      };
    } catch (error) {
      console.error('Error checking volume promotion:', error);
      return item;
    }
  };

  const addToCart = async (sp: StoreProduct) => {
    // Validar stock antes de agregar
    if (sp.stock !== null && sp.stock <= 0) {
      toast.error(`${sp.product.name}: sin stock disponible`);
      return;
    }
    
    const existing = cart.find((item) => item.storeProduct.id === sp.id);
    
    if (existing) {
      await updateQuantity(sp.id, existing.quantity + 1);
    } else {
      const newItem: CartItem = { storeProduct: sp, quantity: 1 };
      
      // ✅ Aplicar promoción de producto
      let itemWithPromo = await checkAndApplyPromotion(newItem);
      
      // ✅ Aplicar promoción por categoría (después de promo de producto)
      itemWithPromo = await checkAndApplyCategoryPromotion(itemWithPromo);
      
      // ✅ Aplicar promoción por volumen (después de promo de categoría)
      itemWithPromo = await checkAndApplyVolumePromotion(itemWithPromo);
      
      setCart([...cart, itemWithPromo]);
      
      // Toast con info de promociones
      const messages = [];
      if (itemWithPromo.promotionName) {
        messages.push(`Promo: ${itemWithPromo.promotionName}`);
      }
      if (itemWithPromo.categoryPromoName) {
        messages.push(`Cat: ${itemWithPromo.categoryPromoName}`);
      }
      if (itemWithPromo.volumePromoName) {
        messages.push(`Pack: ${itemWithPromo.volumePromoName}`);
      }
      
      if (messages.length > 0) {
        toast.success(`${sp.product.name} agregado con ${messages.join(' + ')}`);
      } else {
        toast.success(`${sp.product.name} agregado al carrito`);
      }
      
      // Advertencia si el stock es bajo
      if (sp.stock !== null && sp.stock <= 5) {
        toast.warning(`Advertencia: Solo quedan ${sp.stock} unidades`, { duration: 3000 });
      }
    }
  };

  const updateQuantity = async (storeProductId: string, newQuantity: number) => {
    const item = cart.find((i) => i.storeProduct.id === storeProductId);
    if (!item) return;

    // Validar cantidad según tipo
    if (item.storeProduct.product.unitType === 'UNIT' && !Number.isInteger(newQuantity)) {
      toast.error('Cantidad debe ser entera para productos por unidad');
      return;
    }

    if (newQuantity <= 0) {
      removeFromCart(storeProductId);
      return;
    }

    // Validar stock disponible (incluyendo stock negativo o cero)
    if (item.storeProduct.stock !== null) {
      if (item.storeProduct.stock <= 0) {
        toast.error(`${item.storeProduct.product.name}: sin stock disponible`);
        return;
      }
      
      if (newQuantity > item.storeProduct.stock) {
        toast.error(`Stock insuficiente (disponible: ${item.storeProduct.stock})`);
        return;
      }
    }

    // Recalcular promociones con nueva cantidad
    const updatedItem = { ...item, quantity: newQuantity };
    
    // ✅ Recalcular promo de producto
    let itemWithPromo = await checkAndApplyPromotion(updatedItem);
    
    // ✅ Recalcular promo por categoría (después de promo de producto)
    itemWithPromo = await checkAndApplyCategoryPromotion(itemWithPromo);
    
    // ✅ Recalcular promo por volumen (después de promo de categoría)
    itemWithPromo = await checkAndApplyVolumePromotion(itemWithPromo);
    
    setCart(prev => prev.map((i) => 
      i.storeProduct.id === storeProductId ? itemWithPromo : i
    ));
  };

  const removeFromCart = (storeProductId: string) => {
    setCart(cart.filter((i) => i.storeProduct.id !== storeProductId));
  };

  const clearCart = () => {
    setCart([]);
    setGlobalDiscount(0);
    setAppliedCoupon(null); // ✅ Limpiar cupón
    setCouponCode('');
  };

  const getTotalItems = () => {
    return cart.reduce((sum, item) => sum + item.quantity, 0);
  };

  const calculateItemSubtotal = (item: CartItem) => {
    return item.quantity * item.storeProduct.price;
  };

  const calculateItemPromotion = (item: CartItem) => {
    return item.promotionDiscount ?? 0;
  };

  const calculateItemCategoryPromo = (item: CartItem) => {
    return item.categoryPromoDiscount ?? 0;
  };

  const calculateItemDiscount = (item: CartItem) => {
    if (!item.discountType || !item.discountValue) return 0;
    
    const subtotal = calculateItemSubtotal(item);
    const productPromotion = calculateItemPromotion(item);
    const categoryPromotion = calculateItemCategoryPromo(item);
    const volumePromotion = item.volumePromoDiscount ?? 0;
    // Base para descuento manual = subtotal - promo producto - promo categoría - promo volumen
    const subtotalAfterPromos = subtotal - productPromotion - categoryPromotion - volumePromotion;
    
    if (item.discountType === 'PERCENT') {
      return Math.round((subtotalAfterPromos * item.discountValue) / 100 * 100) / 100;
    } else {
      return item.discountValue;
    }
  };

  const calculateItemTotal = (item: CartItem) => {
    const subtotal = calculateItemSubtotal(item);
    const productPromotion = calculateItemPromotion(item);
    const categoryPromotion = calculateItemCategoryPromo(item);
    const volumePromotion = item.volumePromoDiscount ?? 0;
    const manualDiscount = calculateItemDiscount(item);
    return subtotal - productPromotion - categoryPromotion - volumePromotion - manualDiscount;
  };

  const getSubtotalBeforeDiscounts = () => {
    return cart.reduce((sum, item) => sum + calculateItemSubtotal(item), 0);
  };

  const getTotalPromotions = () => {
    return cart.reduce((sum, item) => sum + calculateItemPromotion(item), 0);
  };

  const getTotalCategoryPromotions = () => {
    return cart.reduce((sum, item) => sum + (item.categoryPromoDiscount ?? 0), 0);
  };

  const getTotalVolumePromotions = () => {
    return cart.reduce((sum, item) => sum + (item.volumePromoDiscount ?? 0), 0);
  };

  const getTotalItemDiscounts = () => {
    return cart.reduce((sum, item) => sum + calculateItemDiscount(item), 0);
  };

  const getCartTotal = () => {
    const subtotalAfterItemDiscounts = cart.reduce((sum, item) => sum + calculateItemTotal(item), 0);
    const totalBeforeCoupon = subtotalAfterItemDiscounts - globalDiscount;
    const couponDiscount = appliedCoupon?.discount ?? 0;
    return totalBeforeCoupon - couponDiscount;
  };

  const getTotalBeforeCoupon = () => {
    const subtotalAfterItemDiscounts = cart.reduce((sum, item) => sum + calculateItemTotal(item), 0);
    return subtotalAfterItemDiscounts - globalDiscount;
  };

  // ✅ Validar y aplicar cupón (Módulo 14.2-A)
  const handleApplyCoupon = async () => {
    if (!couponCode.trim()) {
      toast.error('Ingresa un código de cupón');
      return;
    }

    const totalBeforeCoupon = getTotalBeforeCoupon();
    if (totalBeforeCoupon <= 0) {
      toast.error('No hay monto disponible para aplicar cupón');
      return;
    }

    setValidatingCoupon(true);

    try {
      const res = await fetch('/api/coupons/validate', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          code: couponCode,
          totalBeforeCoupon,
        }),
      });

      const data = await res.json();

      if (!res.ok) {
        toast.error(data.message || 'Cupón inválido');
        return;
      }

      if (data.valid) {
        setAppliedCoupon({
          code: data.couponCode,
          discount: data.discountAmount,
          type: data.couponType,
          value: data.couponValue,
        });
        toast.success(`Cupón ${data.couponCode} aplicado: -S/ ${data.discountAmount.toFixed(2)}`);
      }
    } catch (error) {
      console.error('Error validating coupon:', error);
      toast.error('Error al validar cupón');
    } finally {
      setValidatingCoupon(false);
    }
  };

  const handleRemoveCoupon = () => {
    setAppliedCoupon(null);
    setCouponCode('');
    toast.success('Cupón eliminado');
  };

  const handleCheckout = async () => {
    if (cart.length === 0) {
      toast.error('El carrito está vacío');
      return;
    }

    // Validar que hay turno abierto solo si NO es FIADO
    if (!currentShift) {
      // Permitir FIADO sin turno abierto, pero mostrar advertencia
      toast.warning('No hay turno abierto. Solo puedes vender FIADO.');
    }

    // Abrir modal de pago
    setPaymentMethod(currentShift ? 'CASH' : 'FIADO');
    setAmountPaid('');
    setSelectedCustomer(null);
    setShowPaymentModal(true);
  };

  const handleOpenDiscountModal = (storeProductId: string) => {
    const item = cart.find((i) => i.storeProduct.id === storeProductId);
    if (!item) return;

    setDiscountItemId(storeProductId);
    setDiscountType(item.discountType || 'PERCENT');
    setDiscountValue(item.discountValue?.toString() || '');
    setShowDiscountModal(true);
  };

  const handleApplyDiscount = () => {
    if (!discountItemId) return;

    const value = parseFloat(discountValue);
    
    // Validar valor
    if (isNaN(value) || value <= 0) {
      toast.error('Ingresa un valor válido');
      return;
    }

    const item = cart.find((i) => i.storeProduct.id === discountItemId);
    if (!item) return;

    const subtotal = calculateItemSubtotal(item);

    // Validar según tipo
    if (discountType === 'PERCENT') {
      if (value > 100) {
        toast.error('El porcentaje no puede ser mayor a 100%');
        return;
      }
    } else if (discountType === 'AMOUNT') {
      if (value > subtotal) {
        toast.error('El descuento no puede ser mayor al subtotal del ítem');
        return;
      }
    }

    // Aplicar descuento
    setCart(cart.map((i) =>
      i.storeProduct.id === discountItemId
        ? { ...i, discountType, discountValue: value }
        : i
    ));

    toast.success('Descuento aplicado');
    setShowDiscountModal(false);
    setDiscountItemId(null);
    setDiscountValue('');
  };

  const handleRemoveItemDiscount = (storeProductId: string) => {
    setCart(cart.map((i) =>
      i.storeProduct.id === storeProductId
        ? { ...i, discountType: undefined, discountValue: undefined }
        : i
    ));
    toast.success('Descuento eliminado');
  };

  const searchCustomers = async (query: string) => {
    if (!query.trim()) {
      setCustomers([]);
      return;
    }

    try {
      setLoadingCustomers(true);
      const res = await fetch(`/api/customers?search=${encodeURIComponent(query)}&activeOnly=true`);
      if (!res.ok) throw new Error('Error al buscar clientes');
      const data = await res.json();
      setCustomers(data.customers);
    } catch (error) {
      console.error('Error searching customers:', error);
      toast.error('Error al buscar clientes');
    } finally {
      setLoadingCustomers(false);
    }
  };

  const handleCreateCustomer = async () => {
    if (!newCustomerName.trim()) {
      toast.error('El nombre es obligatorio');
      return;
    }

    try {
      setCreatingCustomer(true);
      const res = await fetch('/api/customers', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          name: newCustomerName,
          phone: newCustomerPhone || null,
        }),
      });

      if (!res.ok) {
        const error = await res.json();
        throw new Error(error.message);
      }

      const data = await res.json();
      toast.success('Cliente creado exitosamente');
      
      // Seleccionar el cliente recién creado
      setSelectedCustomer({
        id: data.customer.id,
        name: data.customer.name,
        phone: data.customer.phone,
        totalBalance: 0,
      });
      
      setShowCreateCustomerModal(false);
      setShowCustomerModal(false);
      setNewCustomerName('');
      setNewCustomerPhone('');
    } catch (error: any) {
      console.error('Error creating customer:', error);
      toast.error(error.message || 'Error al crear cliente');
    } finally {
      setCreatingCustomer(false);
    }
  };

  const handleConfirmPayment = async () => {
    const total = getCartTotal();

    // Validaciones según método de pago
    if (paymentMethod === 'CASH') {
      const paid = parseFloat(amountPaid);
      if (isNaN(paid) || paid <= 0) {
        toast.error('Ingresa un monto válido');
        return;
      }
      // ✅ Redondear ambos valores para evitar problemas de precisión decimal
      const totalRounded = Math.round(total * 100) / 100;
      const paidRounded = Math.round(paid * 100) / 100;
      
      if (paidRounded < totalRounded) {
        toast.error('El monto pagado es menor al total');
        return;
      }
    } else if (paymentMethod === 'FIADO') {
      if (!selectedCustomer) {
        toast.error('Debes seleccionar un cliente para ventas FIADO');
        return;
      }
    } else {
      // Validar que hay turno para YAPE, PLIN, CARD
      if (!currentShift) {
        toast.error('Debes abrir un turno para este método de pago');
        return;
      }
    }

    setProcessing(true);
    setShowPaymentModal(false);

    try {
      const checkoutData: any = {
        items: cart.map((item) => ({
          storeProductId: item.storeProduct.id,
          quantity: item.quantity,
          unitPrice: item.storeProduct.price,
          discountType: item.discountType,
          discountValue: item.discountValue,
        })),
        paymentMethod,
        discountTotal: globalDiscount > 0 ? globalDiscount : undefined,
        couponCode: appliedCoupon?.code, // ✅ Cupón (Módulo 14.2-A)
      };

      // Solo enviar amountPaid si es CASH
      if (paymentMethod === 'CASH') {
        checkoutData.amountPaid = parseFloat(amountPaid);
      }

      // Para FIADO, enviar customerId
      if (paymentMethod === 'FIADO') {
        checkoutData.customerId = selectedCustomer!.id;
      }

      const res = await fetch('/api/sales/checkout', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(checkoutData),
      });

      const data = await res.json();

      if (!res.ok) {
        // Mostrar mensaje de error con detalles si es conflicto de stock
        if (data.code === 'INSUFFICIENT_STOCK' && data.details) {
          const { productName, available, requested } = data.details;
          toast.error(`${productName}: stock insuficiente`, {
            description: `Disponible: ${available} | Solicitado: ${requested}`,
            duration: 5000,
          });
        } else if (data.code === 'INVALID_QUANTITY' && data.details) {
          toast.error(data.message, {
            description: data.details.productName,
            duration: 4000,
          });
        } else {
          toast.error(data.message || 'Error al procesar venta');
        }
        setProcessing(false);
        return;
      }

      // Mensaje diferente para FIADO
      if (paymentMethod === 'FIADO') {
        toast.success(`¡Venta FIADO registrada!`, {
          description: `Cliente: ${selectedCustomer!.name} - Total: S/ ${data.total.toFixed(2)}`,
          duration: 5000,
        });
      } else {
        toast.success(`¡Venta completada! Total: S/ ${data.total.toFixed(2)}`);
      }
      
      // Show sale complete modal
      setCompletedSale({ id: data.saleId, total: data.total });
      setShowSaleCompleteModal(true);
      
      clearCart();
      setProducts([]);
      setQuery('');
      setSelectedCustomer(null);
    } catch (error) {
      console.error('Checkout error:', error);
      toast.error('Error de conexión');
    } finally {
      setProcessing(false);
    }
  };

  return (
    <AuthLayout storeName="Punto de Venta">
      <Toaster position="top-right" richColors />
      {/* Botón flotante para SUPERADMIN */}
      {isSuperAdmin && (
        <a
          href="/admin/backups"
          className="fixed bottom-6 right-6 z-50 bg-purple-600 text-white px-4 py-3 rounded-full shadow-lg hover:bg-purple-700 transition-colors flex items-center gap-2 font-medium"
        >
          <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 7v10c0 2.21 3.582 4 8 4s8-1.79 8-4V7M4 7c0 2.21 3.582 4 8 4s8-1.79 8-4M4 7c0-2.21 3.582-4 8-4s8 1.79 8 4" />
          </svg>
          Admin Backups
        </a>
      )}
      <main className="container mx-auto px-4 py-8">
        <div className="max-w-7xl mx-auto">          {/* Banner de turno */}
          {!currentShift && (
            <div className="mb-6 bg-yellow-50 border border-yellow-200 rounded-lg p-4 flex items-center justify-between">
              <div className="flex items-center gap-3">
                <AlertCircle className="w-5 h-5 text-yellow-600" />
                <div>
                  <p className="font-medium text-yellow-800">Debes abrir turno para vender</p>
                  <p className="text-sm text-yellow-700">Las ventas requieren un turno activo</p>
                </div>
              </div>
              <button
                onClick={() => setShowOpenShiftModal(true)}
                className="px-4 py-2 bg-yellow-600 text-white rounded-lg hover:bg-yellow-700 font-medium"
              >
                Abrir Turno
              </button>
            </div>
          )}

          {/* Mini estado de turno */}
          {currentShift && (
            <div className="mb-6 bg-green-50 border border-green-200 rounded-lg p-3 flex items-center gap-3">
              <div className="w-2 h-2 bg-green-600 rounded-full animate-pulse"></div>
              <p className="text-sm text-green-800">
                <span className="font-medium">Turno abierto</span>
                {' • '}
                Caja inicial {formatMoney(currentShift.openingCash)}
              </p>
            </div>
          )}
          <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
            {/* Columna Izquierda: Búsqueda y Productos */}
            <div className="lg:col-span-2 space-y-6">
              {/* Search */}
              <div className="bg-white border border-gray-200 rounded-lg p-4">
                <div className="flex gap-2">
                  <div className="flex-1 relative">
                    <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400 w-5 h-5" />
                    <input
                      type="text"
                      placeholder="Buscar producto por nombre, código..."
                      value={query}
                      onChange={(e) => setQuery(e.target.value)}
                      onKeyDown={(e) => e.key === 'Enter' && handleSearch()}
                      className="w-full h-12 pl-10 pr-4 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-[#16A34A]"
                    />
                  </div>
                  <button
                    onClick={handleSearch}
                    disabled={loading}
                    className="h-12 px-6 bg-[#16A34A] text-white rounded-md font-medium hover:bg-[#15803d] disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
                  >
                    {loading ? 'Buscando...' : 'Buscar'}
                  </button>
                </div>
              </div>

              {/* Results */}
              {products.length > 0 && (
                <div className="bg-white border border-gray-200 rounded-lg overflow-hidden">
                  <div className="px-4 py-3 bg-gray-50 border-b border-gray-200">
                    <h3 className="text-sm font-medium text-[#1F2A37]">
                      Resultados de búsqueda ({products.length})
                    </h3>
                  </div>
                  <div className="divide-y divide-gray-200">
                    {products.map((sp) => (
                      <div
                        key={sp.id}
                        className="p-4 hover:bg-gray-50 transition-colors flex items-center justify-between"
                      >
                        <div className="flex-1">
                          <div className="font-medium text-[#1F2A37]">
                            {sp.product.name}
                            {sp.product.brand && (
                              <span className="ml-2 text-sm text-gray-500">• {sp.product.brand}</span>
                            )}
                            {sp.product.content && (
                              <span className="ml-2 text-sm text-gray-500">• {sp.product.content}</span>
                            )}
                          </div>
                          <div className="mt-1 text-sm text-gray-500">
                            {sp.product.barcode || sp.product.internalSku}
                            {sp.stock !== null && (
                              <span className={`ml-3 font-medium ${
                                sp.stock <= 0 
                                  ? 'text-red-600' 
                                  : sp.stock <= 5 
                                  ? 'text-orange-600' 
                                  : ''
                              }`}>
                                Stock: {sp.stock}
                                {sp.stock <= 0 && ' (Sin stock)'}
                                {sp.stock > 0 && sp.stock <= 5 && ' (Bajo)'}
                              </span>
                            )}
                          </div>
                        </div>
                        <div className="flex items-center gap-4">
                          <div className="text-right">
                            <div className="text-lg font-semibold text-[#16A34A]">
                              S/ {sp.price.toFixed(2)}
                            </div>
                            <div className="text-xs text-gray-500">
                              {sp.product.unitType === 'UNIT' ? 'por unidad' : 'por kg'}
                            </div>
                          </div>
                          <button
                            onClick={() => addToCart(sp)}
                            disabled={sp.stock !== null && sp.stock <= 0}
                            className="h-10 px-4 bg-[#16A34A] text-white rounded-md text-sm font-medium hover:bg-[#15803d] disabled:bg-gray-400 disabled:cursor-not-allowed transition-colors flex items-center gap-2"
                          >
                            <Plus className="w-4 h-4" />
                            {sp.stock !== null && sp.stock <= 0 ? 'Sin stock' : 'Agregar'}
                          </button>
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              )}

              {!loading && query && products.length === 0 && (
                <div className="text-center py-12 text-[#6B7280]">
                  No se encontraron productos
                </div>
              )}
            </div>

            {/* Columna Derecha: Carrito */}
            <div className="lg:col-span-1">
              <div className="bg-white border border-gray-200 rounded-lg sticky top-4">
                <div className="px-4 py-3 bg-[#1F2A37] text-white rounded-t-lg flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    <ShoppingCart className="w-5 h-5" />
                    <h3 className="font-medium">Carrito</h3>
                  </div>
                  {cart.length > 0 && (
                    <button
                      onClick={clearCart}
                      className="text-sm hover:text-red-300 transition-colors"
                    >
                      Limpiar
                    </button>
                  )}
                </div>

                <div className="p-4">
                  {cart.length === 0 ? (
                    <div className="text-center py-8 text-gray-500">
                      <ShoppingCart className="w-12 h-12 mx-auto mb-3 text-gray-300" />
                      <p className="text-sm">Carrito vacío</p>
                    </div>
                  ) : (
                    <>
                      <div className="space-y-3 max-h-96 overflow-y-auto">
                        {cart.map((item) => {
                          const subtotal = calculateItemSubtotal(item);
                          const discount = calculateItemDiscount(item);
                          const itemTotal = calculateItemTotal(item);
                          
                          return (
                          <div
                            key={item.storeProduct.id}
                            className="border border-gray-200 rounded-lg p-3"
                          >
                            <div className="flex justify-between items-start mb-2">
                              <div className="flex-1">
                                <div className="text-sm font-medium text-[#1F2A37]">
                                  {item.storeProduct.product.name}
                                </div>
                                <div className="text-xs text-gray-500 mt-1">
                                  S/ {item.storeProduct.price.toFixed(2)} {item.storeProduct.product.unitType === 'UNIT' ? 'c/u' : '/kg'}
                                </div>
                              </div>
                              <button
                                onClick={() => removeFromCart(item.storeProduct.id)}
                                className="text-red-600 hover:text-red-700 p-1"
                              >
                                <Trash2 className="w-4 h-4" />
                              </button>
                            </div>

                            <div className="flex items-center justify-between mb-2">
                              <div className="flex items-center gap-2">
                                <button
                                  onClick={() =>
                                    updateQuantity(
                                      item.storeProduct.id,
                                      item.quantity - (item.storeProduct.product.unitType === 'UNIT' ? 1 : 0.5)
                                    )
                                  }
                                  className="w-7 h-7 flex items-center justify-center border border-gray-300 rounded hover:bg-gray-50"
                                >
                                  <Minus className="w-3 h-3" />
                                </button>
                                <input
                                  type="number"
                                  value={item.quantity}
                                  onChange={(e) =>
                                    updateQuantity(item.storeProduct.id, parseFloat(e.target.value))
                                  }
                                  step={item.storeProduct.product.unitType === 'UNIT' ? '1' : '0.1'}
                                  min="0.1"
                                  className="w-16 h-7 text-center border border-gray-300 rounded focus:outline-none focus:ring-2 focus:ring-[#16A34A] text-sm"
                                />
                                <button
                                  onClick={() =>
                                    updateQuantity(
                                      item.storeProduct.id,
                                      item.quantity + (item.storeProduct.product.unitType === 'UNIT' ? 1 : 0.5)
                                    )
                                  }
                                  className="w-7 h-7 flex items-center justify-center border border-gray-300 rounded hover:bg-gray-50"
                                >
                                  <Plus className="w-3 h-3" />
                                </button>
                              </div>
                              <div className="text-sm font-semibold text-[#1F2A37]">
                                S/ {subtotal.toFixed(2)}
                              </div>
                            </div>

                            {/* Promoción automática */}
                            {item.promotionName && (
                              <div className="mt-2 p-2 bg-blue-50 border border-blue-200 rounded">
                                <div className="flex justify-between items-center text-xs">
                                  <div className="flex items-center gap-1 text-blue-700 font-medium">
                                    {(() => {
                                      const name = (item.promotionName || '').toLowerCase();
                                      if (name.includes('bebida') || name.includes('coca') || name.includes('cerveza') || name.includes('pilsen') || name.includes('vino')) {
                                        return <Milk className="w-3.5 h-3.5" />;
                                      } else if (item.promotionType === 'PACK_PRICE') {
                                        return <PackageIcon className="w-3.5 h-3.5" />;
                                      } else if (item.promotionType === 'HAPPY_HOUR') {
                                        return <Clock className="w-3.5 h-3.5" />;
                                      } else {
                                        return <Tag className="w-3.5 h-3.5" />;
                                      }
                                    })()}
                                    {item.promotionName}
                                  </div>
                                  <div className="text-blue-900 font-semibold">
                                    -S/ {(item.promotionDiscount ?? 0).toFixed(2)}
                                  </div>
                                </div>
                              </div>
                            )}

                            {/* Promoción por categoría (Módulo 14.2-B) */}
                            {item.categoryPromoName && (
                              <div className="mt-2 p-2 bg-purple-50 border border-purple-200 rounded">
                                <div className="flex justify-between items-center text-xs">
                                  <div className="flex items-center gap-1 text-purple-700 font-medium">
                                    <Tag className="w-3.5 h-3.5" />
                                    CAT: {item.categoryPromoName}
                                  </div>
                                  <div className="text-purple-900 font-semibold">
                                    -S/ {(item.categoryPromoDiscount ?? 0).toFixed(2)}
                                  </div>
                                </div>
                              </div>
                            )}

                            {/* Promoción por volumen (Módulo 14.2-C1) */}
                            {item.volumePromoName && item.volumePromoDiscount > 0 && (
                              <div className="mt-2 p-2 bg-orange-50 border border-orange-200 rounded">
                                <div className="flex justify-between items-center text-xs">
                                  <div className="flex items-center gap-1 text-orange-700 font-medium">
                                    <Tag className="w-3.5 h-3.5" />
                                    PACK {item.volumePromoQty}x: {item.volumePromoName}
                                  </div>
                                  <div className="text-orange-900 font-semibold">
                                    -S/ {(item.volumePromoDiscount ?? 0).toFixed(2)}
                                  </div>
                                </div>
                              </div>
                            )}

                            {/* Descuento del ítem */}
                            {item.discountType && item.discountValue ? (
                              <div className="mt-2 p-2 bg-orange-50 border border-orange-200 rounded">
                                <div className="flex justify-between items-center text-xs">
                                  <div className="text-orange-700">
                                    Desc: {item.discountType === 'PERCENT' ? `${item.discountValue}%` : `S/ ${item.discountValue.toFixed(2)}`}
                                    {' '}(-S/ {discount.toFixed(2)})
                                  </div>
                                  <button
                                    onClick={() => handleRemoveItemDiscount(item.storeProduct.id)}
                                    className="text-orange-600 hover:text-orange-700"
                                  >
                                    <X className="w-3 h-3" />
                                  </button>
                                </div>
                                <div className="text-xs font-semibold text-orange-900 mt-1">
                                  Total: S/ {itemTotal.toFixed(2)}
                                </div>
                              </div>
                            ) : (
                              <button
                                onClick={() => handleOpenDiscountModal(item.storeProduct.id)}
                                className="mt-2 w-full py-1.5 text-xs border border-blue-300 text-blue-600 rounded hover:bg-blue-50 transition-colors"
                              >
                                + Aplicar Descuento
                              </button>
                            )}
                          </div>
                        )})}
                      </div>

                      <div className="mt-4 pt-4 border-t border-gray-200 space-y-2">
                        <div className="flex justify-between text-sm text-gray-600">
                          <span>Items</span>
                          <span>{getTotalItems()}</span>
                        </div>
                        <div className="flex justify-between text-sm text-gray-600">
                          <span>Subtotal</span>
                          <span>S/ {getSubtotalBeforeDiscounts().toFixed(2)}</span>
                        </div>
                        
                        {/* Promociones */}
                        {getTotalPromotions() > 0 && (
                          <div className="flex justify-between text-sm text-blue-600">
                            <span>Promociones</span>
                            <span>-S/ {getTotalPromotions().toFixed(2)}</span>
                          </div>
                        )}
                        
                        {/* Promociones por categoría (Módulo 14.2-B) */}
                        {getTotalCategoryPromotions() > 0 && (
                          <div className="flex justify-between text-sm text-purple-600">
                            <span>Promos Categoría</span>
                            <span>-S/ {getTotalCategoryPromotions().toFixed(2)}</span>
                          </div>
                        )}
                        
                        {/* Promociones por volumen (Módulo 14.2-C1) */}
                        {getTotalVolumePromotions() > 0 && (
                          <div className="flex justify-between text-sm text-orange-600">
                            <span>Promos Pack</span>
                            <span>-S/ {getTotalVolumePromotions().toFixed(2)}</span>
                          </div>
                        )}
                        
                        {/* Descuentos por ítem */}
                        {getTotalItemDiscounts() > 0 && (
                          <div className="flex justify-between text-sm text-orange-600">
                            <span>Desc. ítems</span>
                            <span>-S/ {getTotalItemDiscounts().toFixed(2)}</span>
                          </div>
                        )}

                        {/* Descuento global */}
                        {globalDiscount > 0 ? (
                          <div className="p-2 bg-orange-50 border border-orange-200 rounded">
                            <div className="flex justify-between items-center text-sm">
                              <span className="text-orange-700">Desc. global</span>
                              <div className="flex items-center gap-2">
                                <span className="text-orange-700 font-medium">-S/ {globalDiscount.toFixed(2)}</span>
                                <button
                                  onClick={() => setGlobalDiscount(0)}
                                  className="text-orange-600 hover:text-orange-700"
                                >
                                  <X className="w-4 h-4" />
                                </button>
                              </div>
                            </div>
                          </div>
                        ) : (
                          <button
                            onClick={() => {
                              const maxDiscount = getSubtotalBeforeDiscounts() - getTotalItemDiscounts();
                              if (maxDiscount <= 0) {
                                toast.error('No hay monto disponible para descuento global');
                                return;
                              }
                              setGlobalDiscountValue('');
                              setShowGlobalDiscountModal(true);
                            }}
                            className="w-full py-1.5 text-xs border border-dashed border-blue-300 text-blue-600 rounded hover:bg-blue-50 transition-colors"
                          >
                            + Descuento Global
                          </button>
                        )}

                        {/* ✅ Cupón (Módulo 14.2-A) */}
                        {appliedCoupon ? (
                          <div className="p-2 bg-green-50 border border-green-200 rounded">
                            <div className="flex justify-between items-center text-sm">
                              <span className="text-green-700">Cupón {appliedCoupon.code}</span>
                              <div className="flex items-center gap-2">
                                <span className="text-green-700 font-medium">-S/ {appliedCoupon.discount.toFixed(2)}</span>
                                <button
                                  onClick={handleRemoveCoupon}
                                  className="text-green-600 hover:text-green-700"
                                >
                                  <X className="w-4 h-4" />
                                </button>
                              </div>
                            </div>
                          </div>
                        ) : (
                          <div className="space-y-2">
                            <div className="flex gap-2">
                              <input
                                type="text"
                                value={couponCode}
                                onChange={(e) => setCouponCode(e.target.value.toUpperCase())}
                                onKeyDown={(e) => {
                                  if (e.key === 'Enter') {
                                    e.preventDefault();
                                    handleApplyCoupon();
                                  }
                                }}
                                placeholder="Código de cupón"
                                className="flex-1 px-3 py-1.5 text-sm border border-gray-300 rounded"
                                disabled={validatingCoupon}
                              />
                              <button
                                onClick={handleApplyCoupon}
                                disabled={validatingCoupon || !couponCode.trim()}
                                className="px-3 py-1.5 text-sm bg-green-600 text-white rounded hover:bg-green-700 disabled:opacity-50 disabled:cursor-not-allowed"
                              >
                                {validatingCoupon ? 'Validando...' : 'Aplicar'}
                              </button>
                            </div>
                          </div>
                        )}

                        <div className="flex justify-between text-lg font-bold text-[#1F2A37] pt-2 border-t">
                          <span>Total</span>
                          <span>S/ {getCartTotal().toFixed(2)}</span>
                        </div>
                      </div>

                      <button
                        onClick={handleCheckout}
                        disabled={processing || !currentShift}
                        className="w-full mt-4 h-12 bg-[#16A34A] text-white rounded-md font-medium hover:bg-[#15803d] disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
                      >
                        {processing ? 'Procesando...' : !currentShift ? 'Abrir turno para vender' : 'Finalizar Venta'}
                      </button>
                    </>
                  )}
                </div>
              </div>
            </div>
          </div>
        </div>
      </main>

      {/* Modal de Pago */}
      {showPaymentModal && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-lg w-full max-w-md p-6">
            <div className="flex items-center justify-between mb-6">
              <h3 className="text-xl font-semibold text-gray-900">Método de Pago</h3>
              <button
                onClick={() => setShowPaymentModal(false)}
                className="text-gray-400 hover:text-gray-600"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            {/* Total */}
            <div className="bg-gray-50 rounded-lg p-4 mb-6">
              <div className="text-sm text-gray-600 mb-1">Total a pagar</div>
              <div className="text-3xl font-bold text-gray-900">
                {formatMoney(getCartTotal())}
              </div>
            </div>

            {/* Selector de método */}
            <div className="mb-6">
              <label className="block text-sm font-medium text-gray-700 mb-3">
                Selecciona el método
              </label>
              <div className="grid grid-cols-2 gap-3">
                {[
                  { value: 'CASH', label: 'Efectivo' },
                  { value: 'YAPE', label: 'Yape' },
                  { value: 'PLIN', label: 'Plin' },
                  { value: 'CARD', label: 'Tarjeta' },
                  { value: 'FIADO', label: 'Fiado' },
                ].map((method) => (
                  <button
                    key={method.value}
                    onClick={() => {
                      setPaymentMethod(method.value as any);
                      if (method.value !== 'CASH') {
                        setAmountPaid('');
                      }
                      if (method.value === 'FIADO') {
                        setSelectedCustomer(null);
                      }
                    }}
                    disabled={!currentShift && method.value !== 'FIADO'}
                    className={`py-3 px-4 rounded-lg border-2 font-medium transition-colors disabled:opacity-50 disabled:cursor-not-allowed ${
                      paymentMethod === method.value
                        ? 'border-blue-600 bg-blue-50 text-blue-700'
                        : 'border-gray-200 bg-white text-gray-700 hover:border-gray-300'
                    }`}
                  >
                    {method.label}
                    {!currentShift && method.value !== 'FIADO' && (
                      <div className="text-xs text-red-500 mt-1">Sin turno</div>
                    )}
                  </button>
                ))}
              </div>
            </div>

            {/* Input para efectivo */}
            {paymentMethod === 'CASH' && (
              <div className="mb-6">
                <label className="block text-sm font-medium text-gray-700 mb-2">
                  Pagó con (S/)
                </label>
                <input
                  type="number"
                  step="0.01"
                  value={amountPaid}
                  onChange={(e) => setAmountPaid(e.target.value)}
                  className="w-full px-4 py-3 border border-gray-300 rounded-lg text-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
                  placeholder="0.00"
                  autoFocus
                  onKeyDown={(e) => e.key === 'Enter' && handleConfirmPayment()}
                />
                
                {/* Vuelto */}
                {amountPaid && parseFloat(amountPaid) >= getCartTotal() && (
                  <div className="mt-4 p-3 bg-green-50 border border-green-200 rounded-lg">
                    <div className="text-sm text-green-700 mb-1">Vuelto</div>
                    <div className="text-2xl font-bold text-green-700">
                      {formatMoney(parseFloat(amountPaid) - getCartTotal())}
                    </div>
                  </div>
                )}

                {amountPaid && (() => {
                  const totalRounded = Math.round(getCartTotal() * 100) / 100;
                  const paidRounded = Math.round(parseFloat(amountPaid) * 100) / 100;
                  return paidRounded < totalRounded && paidRounded > 0;
                })() && (
                  <div className="mt-3 text-sm text-red-600">
                    Monto insuficiente
                  </div>
                )}
              </div>
            )}

            {/* Mensaje para otros métodos */}
            {paymentMethod !== 'CASH' && paymentMethod !== 'FIADO' && (
              <div className="mb-6 p-4 bg-blue-50 border border-blue-200 rounded-lg">
                <p className="text-sm text-blue-800">
                  Pago registrado como <strong>{paymentMethod}</strong>
                </p>
              </div>
            )}

            {/* Selector de cliente para FIADO */}
            {paymentMethod === 'FIADO' && (
              <div className="mb-6">
                <label className="block text-sm font-medium text-gray-700 mb-2">
                  Cliente <span className="text-red-500">*</span>
                </label>
                {selectedCustomer ? (
                  <div className="p-4 bg-orange-50 border border-orange-200 rounded-lg">
                    <div className="flex justify-between items-start">
                      <div>
                        <div className="font-medium text-gray-900">{selectedCustomer.name}</div>
                        {selectedCustomer.phone && (
                          <div className="text-sm text-gray-600 mt-1">{selectedCustomer.phone}</div>
                        )}
                        {selectedCustomer.totalBalance > 0 && (
                          <div className="text-sm text-red-600 mt-1">
                            Deuda actual: S/ {selectedCustomer.totalBalance.toFixed(2)}
                          </div>
                        )}
                      </div>
                      <button
                        onClick={() => setSelectedCustomer(null)}
                        className="text-red-600 hover:text-red-700 text-sm"
                      >
                        Cambiar
                      </button>
                    </div>
                  </div>
                ) : (
                  <div className="space-y-2">
                    <button
                      onClick={() => {
                        setCustomerSearch('');
                        setCustomers([]);
                        setShowCustomerModal(true);
                      }}
                      className="w-full py-3 px-4 border-2 border-dashed border-gray-300 rounded-lg text-gray-600 hover:border-blue-500 hover:text-blue-600 transition-colors"
                    >
                      + Seleccionar Cliente
                    </button>
                  </div>
                )}
                
                {/* Advertencia */}
                <div className="mt-3 p-3 bg-yellow-50 border border-yellow-200 rounded-lg">
                  <p className="text-xs text-yellow-800">
                    ⚠️ Venta FIADO: Se registrará como cuenta por cobrar. El cliente deberá pagar posteriormente.
                  </p>
                </div>
              </div>
            )}

            {/* Botones */}
            <div className="flex gap-3">
              <button
                onClick={() => setShowPaymentModal(false)}
                className="flex-1 px-4 py-3 border border-gray-300 rounded-lg font-medium text-gray-700 hover:bg-gray-50"
              >
                Cancelar
              </button>
              <button
                onClick={handleConfirmPayment}
                disabled={processing}
                className="flex-1 px-4 py-3 bg-green-600 text-white rounded-lg font-medium hover:bg-green-700 disabled:opacity-50 disabled:cursor-not-allowed"
              >
                {processing ? 'Procesando...' : 'Confirmar'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Modal abrir turno */}
      {showOpenShiftModal && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50">
          <div className="bg-white rounded-lg p-6 w-full max-w-md">
            <h3 className="text-lg font-semibold mb-4">Abrir Turno</h3>
            <div className="space-y-4">
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  Caja inicial (S/)
                </label>
                <input
                  type="number"
                  step="0.01"
                  value={openingCash}
                  onChange={(e) => setOpeningCash(e.target.value)}
                  className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
                  placeholder="0.00"
                  autoFocus
                  onKeyDown={(e) => e.key === 'Enter' && handleOpenShift()}
                />
              </div>

              <div className="flex gap-2">
                <button
                  onClick={() => {
                    setShowOpenShiftModal(false);
                    setOpeningCash('');
                  }}
                  className="flex-1 px-4 py-2 border border-gray-300 rounded-lg hover:bg-gray-50"
                >
                  Cancelar
                </button>
                <button
                  onClick={handleOpenShift}
                  className="flex-1 px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700"
                >
                  Abrir Turno
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Sale Complete Modal */}
      {showSaleCompleteModal && completedSale && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-lg shadow-xl max-w-md w-full p-6">
            <div className="text-center mb-6">
              <div className="w-16 h-16 bg-green-100 rounded-full flex items-center justify-center mx-auto mb-4">
                <svg className="w-8 h-8 text-green-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
                </svg>
              </div>
              <h3 className="text-2xl font-bold text-gray-900 mb-2">¡Venta Completada!</h3>
              <p className="text-3xl font-bold text-green-600">{formatMoney(completedSale.total)}</p>
            </div>

            <div className="space-y-3">
              <button
                onClick={() => {
                  window.open(`/receipt/${completedSale.id}`, '_blank');
                }}
                className="w-full flex items-center justify-center gap-2 px-4 py-3 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition-colors font-medium"
              >
                <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M17 17h2a2 2 0 002-2v-4a2 2 0 00-2-2H5a2 2 0 00-2 2v4a2 2 0 002 2h2m2 4h6a2 2 0 002-2v-4a2 2 0 00-2-2H9a2 2 0 00-2 2v4a2 2 0 002 2zm8-12V5a2 2 0 00-2-2H9a2 2 0 00-2 2v4h10z" />
                </svg>
                Imprimir Ticket
              </button>

              <button
                onClick={() => {
                  setShowSaleCompleteModal(false);
                  setCompletedSale(null);
                }}
                className="w-full px-4 py-3 bg-gray-200 text-gray-700 rounded-lg hover:bg-gray-300 transition-colors font-medium"
              >
                Nueva Venta
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Modal Buscar Cliente */}
      {showCustomerModal && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-lg w-full max-w-md max-h-[80vh] flex flex-col">
            <div className="p-4 border-b">
              <h3 className="text-lg font-semibold mb-3">Seleccionar Cliente</h3>
              <input
                type="text"
                value={customerSearch}
                onChange={(e) => {
                  setCustomerSearch(e.target.value);
                  searchCustomers(e.target.value);
                }}
                placeholder="Buscar por nombre, teléfono..."
                className="w-full px-3 py-2 border rounded-lg"
                autoFocus
              />
            </div>
            
            <div className="flex-1 overflow-y-auto p-4">
              {loadingCustomers ? (
                <div className="text-center py-8 text-gray-500">Buscando...</div>
              ) : customers.length > 0 ? (
                <div className="space-y-2">
                  {customers.map((customer) => (
                    <button
                      key={customer.id}
                      onClick={() => {
                        setSelectedCustomer(customer);
                        setShowCustomerModal(false);
                      }}
                      className="w-full text-left p-3 border rounded-lg hover:bg-gray-50 transition-colors"
                    >
                      <div className="font-medium">{customer.name}</div>
                      {customer.phone && (
                        <div className="text-sm text-gray-600">{customer.phone}</div>
                      )}
                      {customer.totalBalance > 0 && (
                        <div className="text-sm text-red-600 mt-1">
                          Deuda: S/ {customer.totalBalance.toFixed(2)}
                        </div>
                      )}
                    </button>
                  ))}
                </div>
              ) : customerSearch ? (
                <div className="text-center py-8 text-gray-500">
                  No se encontraron clientes
                </div>
              ) : (
                <div className="text-center py-8 text-gray-500">
                  Escribe para buscar clientes
                </div>
              )}
            </div>

            <div className="p-4 border-t space-y-2">
              <button
                onClick={() => {
                  setShowCustomerModal(false);
                  setShowCreateCustomerModal(true);
                }}
                className="w-full py-2 px-4 bg-green-600 text-white rounded-lg hover:bg-green-700"
              >
                + Crear Nuevo Cliente
              </button>
              <button
                onClick={() => setShowCustomerModal(false)}
                className="w-full py-2 px-4 border border-gray-300 rounded-lg hover:bg-gray-50"
              >
                Cancelar
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Modal Crear Cliente */}
      {showCreateCustomerModal && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-lg w-full max-w-md p-6">
            <h3 className="text-lg font-semibold mb-4">Nuevo Cliente</h3>
            
            <div className="space-y-4">
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  Nombre <span className="text-red-500">*</span>
                </label>
                <input
                  type="text"
                  value={newCustomerName}
                  onChange={(e) => setNewCustomerName(e.target.value)}
                  className="w-full px-3 py-2 border rounded-lg"
                  autoFocus
                />
              </div>
              
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  Teléfono
                </label>
                <input
                  type="text"
                  value={newCustomerPhone}
                  onChange={(e) => setNewCustomerPhone(e.target.value)}
                  className="w-full px-3 py-2 border rounded-lg"
                />
              </div>
            </div>

            <div className="flex gap-3 mt-6">
              <button
                onClick={() => {
                  setShowCreateCustomerModal(false);
                  setShowCustomerModal(true);
                  setNewCustomerName('');
                  setNewCustomerPhone('');
                }}
                className="flex-1 py-2 px-4 border border-gray-300 rounded-lg hover:bg-gray-50"
                disabled={creatingCustomer}
              >
                Cancelar
              </button>
              <button
                onClick={handleCreateCustomer}
                className="flex-1 py-2 px-4 bg-blue-600 text-white rounded-lg hover:bg-blue-700 disabled:opacity-50"
                disabled={creatingCustomer}
              >
                {creatingCustomer ? 'Creando...' : 'Crear'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Modal Aplicar Descuento */}
      {showDiscountModal && discountItemId && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-lg w-full max-w-md p-6">
            <div className="flex items-center justify-between mb-4">
              <h3 className="text-lg font-semibold">Aplicar Descuento</h3>
              <button
                onClick={() => {
                  setShowDiscountModal(false);
                  setDiscountItemId(null);
                  setDiscountValue('');
                }}
                className="text-gray-400 hover:text-gray-600"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            {/* Tipo de descuento */}
            <div className="mb-4">
              <label className="block text-sm font-medium text-gray-700 mb-2">
                Tipo de descuento
              </label>
              <div className="grid grid-cols-2 gap-3">
                <button
                  onClick={() => setDiscountType('PERCENT')}
                  className={`py-2 px-4 rounded-lg border-2 font-medium transition-colors ${
                    discountType === 'PERCENT'
                      ? 'border-blue-600 bg-blue-50 text-blue-700'
                      : 'border-gray-200 bg-white text-gray-700 hover:border-gray-300'
                  }`}
                >
                  Porcentaje (%)
                </button>
                <button
                  onClick={() => setDiscountType('AMOUNT')}
                  className={`py-2 px-4 rounded-lg border-2 font-medium transition-colors ${
                    discountType === 'AMOUNT'
                      ? 'border-blue-600 bg-blue-50 text-blue-700'
                      : 'border-gray-200 bg-white text-gray-700 hover:border-gray-300'
                  }`}
                >
                  Monto fijo (S/)
                </button>
              </div>
            </div>

            {/* Valor del descuento */}
            <div className="mb-4">
              <label className="block text-sm font-medium text-gray-700 mb-2">
                {discountType === 'PERCENT' ? 'Porcentaje (0-100%)' : 'Monto (S/)'}
              </label>
              <input
                type="number"
                step="0.01"
                value={discountValue}
                onChange={(e) => setDiscountValue(e.target.value)}
                className="w-full px-4 py-3 border border-gray-300 rounded-lg text-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
                placeholder="0.00"
                autoFocus
                onKeyDown={(e) => e.key === 'Enter' && handleApplyDiscount()}
              />
            </div>

            {/* Preview */}
            {discountValue && parseFloat(discountValue) > 0 && discountItemId && (() => {
              const item = cart.find((i) => i.storeProduct.id === discountItemId);
              if (!item) return null;
              
              const subtotal = calculateItemSubtotal(item);
              let previewDiscount = 0;
              
              if (discountType === 'PERCENT') {
                previewDiscount = Math.round((subtotal * parseFloat(discountValue)) / 100 * 100) / 100;
              } else {
                previewDiscount = parseFloat(discountValue);
              }
              
              const previewTotal = subtotal - previewDiscount;
              
              return (
                <div className="mb-4 p-3 bg-blue-50 border border-blue-200 rounded-lg">
                  <div className="text-sm text-blue-700 mb-1">Vista previa</div>
                  <div className="text-xs text-blue-600 space-y-1">
                    <div className="flex justify-between">
                      <span>Subtotal:</span>
                      <span>S/ {subtotal.toFixed(2)}</span>
                    </div>
                    <div className="flex justify-between font-medium">
                      <span>Descuento:</span>
                      <span>-S/ {previewDiscount.toFixed(2)}</span>
                    </div>
                    <div className="flex justify-between font-bold text-blue-700 pt-1 border-t border-blue-300">
                      <span>Total:</span>
                      <span>S/ {previewTotal.toFixed(2)}</span>
                    </div>
                  </div>
                </div>
              );
            })()}

            {/* Botones */}
            <div className="flex gap-3">
              <button
                onClick={() => {
                  setShowDiscountModal(false);
                  setDiscountItemId(null);
                  setDiscountValue('');
                }}
                className="flex-1 px-4 py-3 border border-gray-300 rounded-lg font-medium text-gray-700 hover:bg-gray-50"
              >
                Cancelar
              </button>
              <button
                onClick={handleApplyDiscount}
                className="flex-1 px-4 py-3 bg-blue-600 text-white rounded-lg font-medium hover:bg-blue-700"
              >
                Aplicar
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Modal de Descuento Global */}
      {showGlobalDiscountModal && (() => {
        const maxDiscount = getSubtotalBeforeDiscounts() - getTotalItemDiscounts();
        
        const handleApplyGlobalDiscount = () => {
          const value = parseFloat(globalDiscountValue);
          if (isNaN(value) || value <= 0) {
            toast.error('Ingresa un valor válido');
            return;
          }
          
          let discount: number;
          if (globalDiscountType === 'PERCENT') {
            if (value > 100) {
              toast.error('El porcentaje no puede ser mayor a 100%');
              return;
            }
            discount = (maxDiscount * value) / 100;
          } else {
            discount = value;
          }
          
          if (discount > maxDiscount) {
            toast.error('El descuento excede el total disponible');
            return;
          }
          
          setGlobalDiscount(discount);
          setShowGlobalDiscountModal(false);
          setGlobalDiscountValue('');
          toast.success('Descuento global aplicado');
        };

        return (
          <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50">
            <div className="bg-white rounded-lg shadow-xl max-w-md w-full mx-4">
              <div className="p-6">
                {/* Header */}
                <div className="flex items-start justify-between mb-4">
                  <h3 className="text-xl font-semibold text-gray-900">
                    Descuento Global
                  </h3>
                  <button
                    onClick={() => {
                      setShowGlobalDiscountModal(false);
                      setGlobalDiscountValue('');
                    }}
                    className="text-gray-400 hover:text-gray-600 transition-colors"
                  >
                    <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                    </svg>
                  </button>
                </div>

                {/* Content */}
                <div className="space-y-4">
                  <div className="bg-orange-50 border border-orange-200 rounded-lg p-3">
                    <p className="text-sm text-orange-800">
                      <span className="font-medium">Máximo disponible:</span> S/ {maxDiscount.toFixed(2)}
                    </p>
                  </div>

                  {/* Tipo de descuento */}
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-2">
                      Tipo de descuento
                    </label>
                    <div className="flex gap-2">
                      <button
                        onClick={() => {
                          setGlobalDiscountType('PERCENT');
                          setGlobalDiscountValue('');
                        }}
                        className={`flex-1 py-2 px-4 rounded-lg font-medium transition-colors ${
                          globalDiscountType === 'PERCENT'
                            ? 'bg-orange-600 text-white'
                            : 'bg-gray-100 text-gray-700 hover:bg-gray-200'
                        }`}
                      >
                        Porcentaje (%)
                      </button>
                      <button
                        onClick={() => {
                          setGlobalDiscountType('AMOUNT');
                          setGlobalDiscountValue('');
                        }}
                        className={`flex-1 py-2 px-4 rounded-lg font-medium transition-colors ${
                          globalDiscountType === 'AMOUNT'
                            ? 'bg-orange-600 text-white'
                            : 'bg-gray-100 text-gray-700 hover:bg-gray-200'
                        }`}
                      >
                        Monto fijo (S/)
                      </button>
                    </div>
                  </div>

                  {/* Input de valor */}
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-2">
                      {globalDiscountType === 'PERCENT' ? 'Porcentaje (0-100%)' : 'Monto del descuento (S/)'}
                    </label>
                    <input
                      type="number"
                      value={globalDiscountValue}
                      onChange={(e) => setGlobalDiscountValue(e.target.value)}
                      onKeyDown={(e) => {
                        if (e.key === 'Enter') {
                          handleApplyGlobalDiscount();
                        }
                      }}
                      placeholder="0.00"
                      step={globalDiscountType === 'PERCENT' ? '1' : '0.01'}
                      min="0"
                      max={globalDiscountType === 'PERCENT' ? 100 : maxDiscount}
                      className="w-full px-4 py-3 border border-gray-300 rounded-lg focus:ring-2 focus:ring-orange-500 focus:border-transparent text-lg"
                      autoFocus
                    />
                  </div>

                  <p className="text-xs text-gray-500">
                    Este descuento se aplicará al total de la venta después de los descuentos por ítem.
                  </p>
                </div>

                {/* Botones */}
                <div className="flex gap-3 mt-6">
                  <button
                    onClick={() => {
                      setShowGlobalDiscountModal(false);
                      setGlobalDiscountValue('');
                    }}
                    className="flex-1 px-4 py-3 border border-gray-300 rounded-lg font-medium text-gray-700 hover:bg-gray-50"
                  >
                    Cancelar
                  </button>
                  <button
                    onClick={handleApplyGlobalDiscount}
                    className="flex-1 px-4 py-3 bg-orange-600 text-white rounded-lg font-medium hover:bg-orange-700"
                  >
                    Aplicar
                  </button>
                </div>
              </div>
            </div>
          </div>
        );
      })()}
    </AuthLayout>
  );
}
