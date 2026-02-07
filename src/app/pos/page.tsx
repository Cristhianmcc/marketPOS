'use client';

import { useState, useEffect, useRef, useCallback } from 'react';
import { Search, Plus, Minus, Trash2, ShoppingCart, X, AlertCircle, AlertTriangle, Tag, Package as PackageIcon, Clock, Milk, Scale, Wrench } from 'lucide-react';
import AuthLayout from '@/components/AuthLayout';
import OnboardingBanner from '@/components/onboarding/OnboardingBanner';
import QuickSellGrid from '@/components/pos/QuickSellGrid';
import CartPanel from '@/components/pos/CartPanel';
import MobileCartDrawer from '@/components/pos/MobileCartDrawer';
import SunatComprobanteSelector from '@/components/pos/SunatComprobanteSelector'; // ✅ MÓDULO 18.5
import AdvancedUnitSelector from '@/components/pos/AdvancedUnitSelector'; // ✅ MÓDULO F1
import { toast, Toaster } from 'sonner';
import { usePosShortcuts } from '@/hooks/usePosShortcuts';
import { usePosHotkeys } from '@/hooks/usePosHotkeys';
import { useFlags } from '@/hooks/useFlags'; // ✅ MÓDULO F1
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
    imageUrl?: string | null;
  };
}

// ✅ MÓDULO F3: Servicio (sin stock)
interface Service {
  id: string;
  name: string;
  price: number;
  taxable: boolean;
  active: boolean;
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
  // Promociones n-ésimo con descuento (Módulo 14.2-C2)
  nthPromoName?: string | null;
  nthPromoQty?: number | null;
  nthPromoPercent?: number | null;
  nthPromoDiscount?: number;
  // ✅ MÓDULO F1: Unidades avanzadas (ferretería)
  unitIdUsed?: string;           // ID de la unidad usada (default: baseUnitId)
  unitCodeUsed?: string;         // Código de unidad (para display)
  quantityOriginal?: number;     // Cantidad en unidad seleccionada
  quantityBase?: number;         // Cantidad convertida a unidad base
  conversionFactorUsed?: number; // Factor de conversión aplicado
  // ✅ MÓDULO F2.3: Precio por unidad de venta
  sellUnitPriceApplied?: number; // Precio especial de la presentación si existe
  // ✅ MÓDULO F3: Servicios
  isService?: boolean;           // true si es servicio
  service?: Service;             // Datos del servicio
}

interface Customer {
  id: string;
  name: string;
  phone: string | null;
  totalBalance: number;
}

interface OperationalLimits {
  maxDiscountPercent: number | null;
  maxManualDiscountAmount: number | null;
  maxSaleTotal: number | null;
  maxItemsPerSale: number | null;
  maxReceivableBalance: number | null;
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
  
  // ✅ OPTIMIZACIÓN: useRef para barcode scanner (evita re-renders en cada tecla)
  const barcodeBufferRef = useRef('');
  const lastKeyTimeRef = useRef(0);
  
  // ✅ OPTIMIZACIÓN: AudioContext reutilizable
  const audioContextRef = useRef<AudioContext | null>(null);
  
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

  // Función para reproducir sonido de beep tipo supermercado (optimizada)
  const playBeep = useCallback(() => {
    try {
      // Reutilizar AudioContext existente o crear uno nuevo
      if (!audioContextRef.current || audioContextRef.current.state === 'closed') {
        audioContextRef.current = new (window.AudioContext || (window as any).webkitAudioContext)();
      }
      const audioContext = audioContextRef.current;
      
      // Resume si está suspendido (política de autoplay)
      if (audioContext.state === 'suspended') {
        audioContext.resume();
      }
      
      const oscillator = audioContext.createOscillator();
      const gainNode = audioContext.createGain();

      oscillator.connect(gainNode);
      gainNode.connect(audioContext.destination);

      // Beep positivo y agudo: frecuencia alta con pequeño slide hacia arriba (sonido de confirmación)
      oscillator.frequency.setValueAtTime(1200, audioContext.currentTime);
      oscillator.frequency.exponentialRampToValueAtTime(1400, audioContext.currentTime + 0.04);
      oscillator.type = 'sine'; // Onda suave para sonido más agradable

      // Envelope corto y suave
      gainNode.gain.setValueAtTime(0, audioContext.currentTime);
      gainNode.gain.linearRampToValueAtTime(0.15, audioContext.currentTime + 0.01);
      gainNode.gain.exponentialRampToValueAtTime(0.01, audioContext.currentTime + 0.04);

      oscillator.start(audioContext.currentTime);
      oscillator.stop(audioContext.currentTime + 0.04);
    } catch (error) {
      // Silenciar errores de audio para no interrumpir la funcionalidad
      console.warn('No se pudo reproducir el sonido:', error);
    }
  }, []);
  const [operationalLimits, setOperationalLimits] = useState<OperationalLimits | null>(null);

  // ✅ MÓDULO 17.4: Estado de Demo Mode
  const [is_demo_store, setis_demo_store] = useState(false);

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

  // Estados para SUNAT (Módulo 18.5)
  const [sunatData, setSunatData] = useState<{
    enabled: boolean;
    docType: 'BOLETA' | 'FACTURA' | null;
    customerDocType: string;
    customerDocNumber: string;
    customerName: string;
    customerAddress?: string;
    customerEmail?: string;
  } | null>(null);
  const [userRole, setUserRole] = useState<'CASHIER' | 'OWNER' | 'SUPERADMIN'>('CASHIER');
  
  // Estados para cupones (Módulo 14.2-A)
  const [couponCode, setCouponCode] = useState('');
  const [appliedCoupon, setAppliedCoupon] = useState<{
    code: string;
    discount: number;
    type: string;
    value: number;
  } | null>(null);
  const [validatingCoupon, setValidatingCoupon] = useState(false);

  // ✅ MÓDULO 17.1: Refs para atajos de teclado
  const searchInputRef = useRef<HTMLInputElement>(null);
  const [selectedCartItemIndex, setSelectedCartItemIndex] = useState<number>(0);

  // ✅ MÓDULO 17.3: Estado para drawer móvil
  const [mobileCartOpen, setMobileCartOpen] = useState(false);

  // ✅ MÓDULO F1: Feature flags para unidades avanzadas
  const { isOn: isFlagOn, isLoading: flagsLoading } = useFlags();
  const advancedUnitsEnabled = isFlagOn('ENABLE_ADVANCED_UNITS');
  const conversionsEnabled = isFlagOn('ENABLE_CONVERSIONS');
  // ✅ MÓDULO F3: Servicios
  const servicesEnabled = isFlagOn('ENABLE_SERVICES');
  const [services, setServices] = useState<Service[]>([]);
  const [loadingServices, setLoadingServices] = useState(false);
  const [posTab, setPosTab] = useState<'products' | 'services'>('products');

  // ✅ MÓDULO F3: Cargar servicios
  const loadServices = useCallback(async () => {
    if (!servicesEnabled) return;
    try {
      setLoadingServices(true);
      const res = await fetch('/api/services?active=true');
      if (res.ok) {
        const data = await res.json();
        setServices(data.services || []);
      }
    } catch (error) {
      console.error('Error loading services:', error);
    } finally {
      setLoadingServices(false);
    }
  }, [servicesEnabled]);

  // ✅ MÓDULO F3: Agregar servicio al carrito
  const addServiceToCart = useCallback((service: Service) => {
    // Crear un "fake" storeProduct para compatibilidad con el carrito
    const fakeStoreProduct: StoreProduct = {
      id: `service-${service.id}`, // Prefijo para diferenciar
      price: Number(service.price),
      stock: null, // Servicios no tienen stock
      active: true,
      product: {
        id: service.id,
        name: service.name,
        brand: null,
        content: '(Servicio)',
        category: 'Servicio',
        unitType: 'UNIT',
        barcode: null,
        internalSku: `SRV-${service.id.slice(-6)}`,
        imageUrl: null,
      },
    };

    setCart(prev => {
      const existingIndex = prev.findIndex(item => 
        item.isService && item.service?.id === service.id
      );

      if (existingIndex >= 0) {
        // Incrementar cantidad
        return prev.map((item, i) => 
          i === existingIndex 
            ? { ...item, quantity: item.quantity + 1 }
            : item
        );
      }

      // Agregar nuevo
      return [...prev, {
        storeProduct: fakeStoreProduct,
        quantity: 1,
        isService: true,
        service,
      }];
    });

    toast.success(`Servicio "${service.name}" agregado`);
  }, []);

  // ✅ MÓDULO F1: Actualizar unidad de un item del carrito
  const updateItemUnit = useCallback((
    storeProductId: string,
    newQuantity: number,
    unitId: string,
    quantityBase: number,
    factor: number,
    unitCode?: string
  ) => {
    setCart(prev => prev.map(item => {
      if (item.storeProduct.id !== storeProductId) return item;
      
      return {
        ...item,
        quantity: quantityBase, // Para cálculos de precio usamos quantityBase
        quantityOriginal: newQuantity,
        quantityBase,
        unitIdUsed: unitId,
        unitCodeUsed: unitCode,
        conversionFactorUsed: factor,
      };
    }));
  }, []);

  // ✅ MÓDULO 17.1: Handlers para atajos de teclado
  const shortcutHandlers = {
    focusSearch: () => {
      searchInputRef.current?.focus();
    },
    addFirstSearchResult: () => {
      if (products.length > 0) {
        addToCart(products[0]);
        setProducts([]);
        setQuery('');
      }
    },
    incrementSelectedItem: () => {
      if (cart.length > 0 && cart[selectedCartItemIndex]) {
        const item = cart[selectedCartItemIndex];
        updateQuantity(item.storeProduct.id, item.quantity + 1);
      }
    },
    decrementSelectedItem: () => {
      if (cart.length > 0 && cart[selectedCartItemIndex]) {
        const item = cart[selectedCartItemIndex];
        updateQuantity(item.storeProduct.id, Math.max(0, item.quantity - 1));
      }
    },
    removeSelectedItem: () => {
      if (cart.length > 0 && cart[selectedCartItemIndex]) {
        const item = cart[selectedCartItemIndex];
        removeFromCart(item.storeProduct.id);
        // Ajustar índice si es necesario
        if (selectedCartItemIndex >= cart.length - 1) {
          setSelectedCartItemIndex(Math.max(0, cart.length - 2));
        }
      }
    },
    focusCart: () => {
      // Seleccionar el primer ítem del carrito
      if (cart.length > 0) {
        setSelectedCartItemIndex(0);
        toast.info(`Ítem seleccionado: ${cart[0].storeProduct.product.name}`);
      }
    },
    openCheckout: () => {
      if (cart.length > 0 && currentShift) {
        handleCheckout();
      }
    },
    closeModal: () => {
      setShowPaymentModal(false);
      setShowCustomerModal(false);
      setShowDiscountModal(false);
      setShowGlobalDiscountModal(false);
      setShowCreateCustomerModal(false);
    },
    selectCash: () => {
      setPaymentMethod('CASH');
    },
    selectYape: () => {
      setPaymentMethod('YAPE');
    },
    selectPlin: () => {
      setPaymentMethod('PLIN');
    },
    selectCard: () => {
      setPaymentMethod('CARD');
    },
  };

  // ✅ MÓDULO 17.1: Activar atajos de teclado
  usePosShortcuts(shortcutHandlers, {
    enabled: true,
    isCheckoutModalOpen: showPaymentModal,
    hasOpenShift: !!currentShift,
  });

  // ✅ MÓDULO 17.3: Activar hotkeys (desktop only)
  usePosHotkeys({
    onFocusSearch: () => searchInputRef.current?.focus(),
    onFinalizeSale: () => {
      if (cart.length > 0 && currentShift) {
        handleCheckout();
      }
    },
    onClearCart: () => {
      if (cart.length > 0) {
        clearCart();
      }
    },
    onEscape: () => {
      setShowPaymentModal(false);
      setShowCustomerModal(false);
      setShowDiscountModal(false);
      setShowGlobalDiscountModal(false);
      setShowCreateCustomerModal(false);
      setMobileCartOpen(false);
    },
    enabled: true,
  });

  // Cargar turno actual al montar
  useEffect(() => {
    fetchCurrentShift();
    checkSuperAdmin();
    fetchUserRole(); // ✅ MÓDULO 18.5: Cargar rol
    fetchOperationalLimits();
    checkDemoMode(); // ✅ MÓDULO 17.4: Verificar demo mode
  }, []);

  // ✅ MÓDULO F3: Cargar servicios cuando flag está habilitado
  useEffect(() => {
    if (servicesEnabled && !flagsLoading) {
      loadServices();
    }
  }, [servicesEnabled, flagsLoading, loadServices]);

  // ✅ MÓDULO 18.1: Listener para escaneo de código de barras con pistola (optimizado con refs)
  useEffect(() => {
    const handleBarcodeScan = async (e: KeyboardEvent) => {
      // Ignorar si está escribiendo en un input/textarea
      const target = e.target as HTMLElement;
      if (target.tagName === 'INPUT' || target.tagName === 'TEXTAREA') {
        return;
      }

      // Ignorar teclas especiales de navegación/modificadores
      if (['Shift', 'Control', 'Alt', 'Tab', 'Escape', 'ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight'].includes(e.key)) {
        return;
      }

      if (e.key === 'Enter' && barcodeBufferRef.current.length >= 8) {
        // Buscar producto por código de barras
        const barcodeToSearch = barcodeBufferRef.current;
        try {
          const res = await fetch(`/api/store-products?barcode=${encodeURIComponent(barcodeToSearch)}`);
          if (res.ok) {
            const data = await res.json();
            if (data.products && data.products.length > 0) {
              addToCart(data.products[0]);
              toast.success(`Producto escaneado: ${data.products[0].product.name}`);
            } else {
              toast.error(`Código no encontrado: ${barcodeToSearch}`);
            }
          }
        } catch (error) {
          console.error('Error searching barcode:', error);
          toast.error('Error al buscar producto');
        }
        barcodeBufferRef.current = '';
        return;
      }

      // Acumular dígitos numéricos
      if (/^\d$/.test(e.key)) {
        const currentTime = Date.now();
        
        // Si pasan más de 100ms desde la última tecla, reiniciar buffer
        if (currentTime - lastKeyTimeRef.current > 100) {
          barcodeBufferRef.current = e.key;
        } else {
          barcodeBufferRef.current += e.key;
        }
        
        lastKeyTimeRef.current = currentTime;
      }
    };

    window.addEventListener('keydown', handleBarcodeScan);
    return () => window.removeEventListener('keydown', handleBarcodeScan);
  }, []);

  const checkDemoMode = async () => {
    try {
      const res = await fetch('/api/store');
      if (res.ok) {
        const data = await res.json();
        setis_demo_store(data.store?.is_demo_store || false);
      }
    } catch (error) {
      console.error('Error checking demo mode:', error);
    }
  };

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

  // ✅ MÓDULO 18.5: Cargar rol del usuario para permisos SUNAT
  const fetchUserRole = async () => {
    try {
      const res = await fetch('/api/auth/me');
      if (res.ok) {
        const data = await res.json();
        setUserRole(data.user.role as 'CASHIER' | 'OWNER' | 'SUPERADMIN');
      }
    } catch (error) {
      console.error('Error fetching user role:', error);
    }
  };

  const fetchOperationalLimits = async () => {
    try {
      const res = await fetch('/api/admin/operational-limits');
      if (res.ok) {
        const data = await res.json();
        setOperationalLimits(data.limits);
      }
    } catch (error) {
      console.error('Error fetching operational limits:', error);
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

  // ✅ Verificar y aplicar MEJOR promoción: VOLUMEN vs N-ÉSIMO (anti-stacking)
  // Solo se aplica UNA de estas dos (la que dé mayor descuento)
  const checkAndApplyBestExclusivePromo = async (item: CartItem): Promise<CartItem> => {
    try {
      // ⚠️ NO aplicar si ya hay promoción de producto
      const productPromoDiscount = item.promotionDiscount ?? 0;
      if (productPromoDiscount > 0) {
        return {
          ...item,
          volumePromoName: null,
          volumePromoQty: null,
          volumePromoDiscount: 0,
          nthPromoName: null,
          nthPromoQty: null,
          nthPromoPercent: null,
          nthPromoDiscount: 0,
        };
      }
      
      // Calcular base después de categoría
      const subtotal = item.quantity * item.storeProduct.price;
      const categoryPromoDiscount = item.categoryPromoDiscount ?? 0;
      const baseAfterCategoryPromo = subtotal - productPromoDiscount - categoryPromoDiscount;

      // Calcular VOLUMEN
      const volumeRes = await fetch('/api/volume-promotions/check', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          productId: item.storeProduct.product.id,
          quantity: item.quantity,
          unitPrice: item.storeProduct.price,
          unitType: item.storeProduct.product.unitType,
          subtotalAfterCategoryPromo: baseAfterCategoryPromo,
        }),
      });

      // Calcular NTH
      const nthRes = await fetch('/api/nth-promotions/check', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          productId: item.storeProduct.product.id,
          quantity: item.quantity,
          unitPrice: item.storeProduct.price,
          unitType: item.storeProduct.product.unitType,
          baseAfterPreviousPromos: baseAfterCategoryPromo,
        }),
      });

      const volumeData = volumeRes.ok ? await volumeRes.json() : null;
      const nthData = nthRes.ok ? await nthRes.json() : null;

      const volumeDiscount = volumeData?.volumePromotion?.volumePromoDiscount ?? 0;
      const nthDiscount = nthData?.nthPromotion?.nthPromoDiscount ?? 0;

      // REGLA ANTI-STACKING: aplicar SOLO la de mayor descuento
      if (volumeDiscount > 0 && nthDiscount > 0) {
        if (volumeDiscount >= nthDiscount) {
          // VOLUMEN gana
          return {
            ...item,
            volumePromoName: volumeData.volumePromotion.volumePromoName,
            volumePromoQty: volumeData.volumePromotion.volumePromoQty,
            volumePromoDiscount: volumeDiscount,
            nthPromoName: null,
            nthPromoQty: null,
            nthPromoPercent: null,
            nthPromoDiscount: 0,
          };
        } else {
          // NTH gana
          return {
            ...item,
            volumePromoName: null,
            volumePromoQty: null,
            volumePromoDiscount: 0,
            nthPromoName: nthData.nthPromotion.nthPromoName,
            nthPromoQty: nthData.nthPromotion.nthPromoQty,
            nthPromoPercent: nthData.nthPromotion.nthPromoPercent,
            nthPromoDiscount: nthDiscount,
          };
        }
      } else if (volumeDiscount > 0) {
        // Solo VOLUMEN
        return {
          ...item,
          volumePromoName: volumeData.volumePromotion.volumePromoName,
          volumePromoQty: volumeData.volumePromotion.volumePromoQty,
          volumePromoDiscount: volumeDiscount,
          nthPromoName: null,
          nthPromoQty: null,
          nthPromoPercent: null,
          nthPromoDiscount: 0,
        };
      } else if (nthDiscount > 0) {
        // Solo NTH
        return {
          ...item,
          volumePromoName: null,
          volumePromoQty: null,
          volumePromoDiscount: 0,
          nthPromoName: nthData.nthPromotion.nthPromoName,
          nthPromoQty: nthData.nthPromotion.nthPromoQty,
          nthPromoPercent: nthData.nthPromotion.nthPromoPercent,
          nthPromoDiscount: nthDiscount,
        };
      }

      // Ninguna promo
      return {
        ...item,
        volumePromoName: null,
        volumePromoQty: null,
        volumePromoDiscount: 0,
        nthPromoName: null,
        nthPromoQty: null,
        nthPromoPercent: null,
        nthPromoDiscount: 0,
      };
    } catch (error) {
      console.error('Error checking exclusive promos:', error);
      return item;
    }
  };

  // ✅ MÓDULO 18.2: Función optimizada que usa endpoint unificado (4 verificaciones en 1 llamada)
  // Reduce latencia de ~400ms a ~100ms
  const checkAllPromotionsUnified = async (item: CartItem): Promise<CartItem> => {
    try {
      const res = await fetch('/api/promotions/check-all', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          productId: item.storeProduct.product.id,
          productCategory: item.storeProduct.product.category,
          quantity: item.quantity,
          unitPrice: item.storeProduct.price,
          unitType: item.storeProduct.product.unitType,
        }),
      });

      if (!res.ok) return item;

      const data = await res.json();
      
      return {
        ...item,
        // Promoción de producto
        promotionType: data.promotion?.promotionType ?? null,
        promotionName: data.promotion?.promotionName ?? null,
        promotionDiscount: data.promotion?.promotionDiscount ?? 0,
        // Promoción por categoría
        categoryPromoName: data.categoryPromotion?.categoryPromoName ?? null,
        categoryPromoType: data.categoryPromotion?.categoryPromoType ?? null,
        categoryPromoDiscount: data.categoryPromotion?.categoryPromoDiscount ?? 0,
        // Promoción por volumen
        volumePromoName: data.volumePromotion?.volumePromoName ?? null,
        volumePromoQty: data.volumePromotion?.volumePromoQty ?? null,
        volumePromoDiscount: data.volumePromotion?.volumePromoDiscount ?? 0,
        // Promoción n-ésimo
        nthPromoName: data.nthPromotion?.nthPromoName ?? null,
        nthPromoQty: data.nthPromotion?.nthPromoQty ?? null,
        nthPromoPercent: data.nthPromotion?.nthPromoPercent ?? null,
        nthPromoDiscount: data.nthPromotion?.nthPromoDiscount ?? 0,
      };
    } catch (error) {
      console.error('Error checking all promotions:', error);
      return item;
    }
  };

  // ✅ MÓDULO 17.2: Handler para agregar desde Quick Sell
  const handleAddFromQuickSell = async (productId: string) => {
    // Buscar el producto en los productos actuales o hacer fetch
    const existing = products.find(p => p.product.id === productId);
    if (existing) {
      await addToCart(existing);
      return;
    }

    // Si no está en productos actuales, hacer fetch individual
    try {
      const response = await fetch(`/api/inventory?productId=${productId}`);
      if (!response.ok) throw new Error('Error al cargar producto');
      
      const data = await response.json();
      if (data.length > 0) {
        await addToCart(data[0]);
      }
    } catch (error) {
      toast.error('Error al agregar producto');
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
      // 🔊 Reproducir sonido al agregar más cantidad
      playBeep();
      await updateQuantity(sp.id, existing.quantity + 1);
    } else {
      // ✅ Validar límite de items por venta
      if (operationalLimits?.maxItemsPerSale !== null && 
          operationalLimits?.maxItemsPerSale !== undefined) {
        const currentTotalItems = cart.reduce((sum, item) => sum + item.quantity, 0);
        if (currentTotalItems >= operationalLimits.maxItemsPerSale) {
          toast.error(`No puedes agregar más items. Límite máximo: ${operationalLimits.maxItemsPerSale} items por venta`);
          return;
        }
      }
      
      const newItem: CartItem = { storeProduct: sp, quantity: 1 };
      
      // ✅ MÓDULO 18.2: OPTIMISTIC UI - Mostrar item inmediatamente
      setCart(prev => [...prev, newItem]);
      
      // 🔊 Reproducir sonido de beep inmediatamente
      playBeep();
      toast.success(`${sp.product.name} agregado al carrito`);
      
      // Advertencia si el stock es bajo (inmediato)
      if (sp.stock !== null && sp.stock <= 5) {
        toast.warning(`Advertencia: Solo quedan ${sp.stock} unidades`, { duration: 3000 });
      }
      
      // ✅ Verificar promociones en background y actualizar
      checkAllPromotionsUnified(newItem).then(itemWithPromo => {
        setCart(prev => prev.map(item => 
          item.storeProduct.id === sp.id ? itemWithPromo : item
        ));
        
        // Notificar promociones aplicadas
        const messages = [];
        if (itemWithPromo.promotionName) messages.push(`Promo: ${itemWithPromo.promotionName}`);
        if (itemWithPromo.categoryPromoName) messages.push(`Cat: ${itemWithPromo.categoryPromoName}`);
        if (itemWithPromo.volumePromoName) messages.push(`Pack: ${itemWithPromo.volumePromoName}`);
        if (itemWithPromo.nthPromoName) messages.push(`Nth: ${itemWithPromo.nthPromoName}`);
        
        if (messages.length > 0) {
          toast.success(`🎉 ${messages.join(' + ')} aplicado!`, { duration: 2000 });
        }
      }).catch(err => {
        console.error('Error checking promotions:', err);
      });
    }
  };

  // ✅ MÓDULO 18.2: Ref para debounce de promociones en updateQuantity
  const promoDebounceRef = useRef<NodeJS.Timeout | null>(null);

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
    
    // ✅ Validar límite de items por venta (al aumentar cantidad)
    if (operationalLimits?.maxItemsPerSale !== null && 
        operationalLimits?.maxItemsPerSale !== undefined) {
      const currentTotalItems = cart.reduce((sum, i) => 
        i.storeProduct.id === storeProductId ? sum : sum + i.quantity, 0);
      const newTotalItems = currentTotalItems + newQuantity;
      
      if (newTotalItems > operationalLimits.maxItemsPerSale) {
        toast.error(`No puedes agregar más items. Límite máximo: ${operationalLimits.maxItemsPerSale} items por venta`);
        return;
      }
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

    // ✅ OPTIMISTIC UI: Actualizar cantidad inmediatamente
    setCart(prev => prev.map((i) =>
      i.storeProduct.id === storeProductId ? { ...i, quantity: newQuantity } : i
    ));

    // ✅ DEBOUNCE: Esperar 300ms antes de recalcular promociones
    if (promoDebounceRef.current) {
      clearTimeout(promoDebounceRef.current);
    }

    promoDebounceRef.current = setTimeout(async () => {
      const updatedItem = { ...item, quantity: newQuantity };
      const itemWithPromo = await checkAllPromotionsUnified(updatedItem);
      
      setCart(prev => prev.map((i) =>
        i.storeProduct.id === storeProductId ? itemWithPromo : i
      ));
    }, 300);
  };

  const removeFromCart = (storeProductId: string) => {
    setCart(cart.filter((i) => i.storeProduct.id !== storeProductId));
  };

  const clearCart = () => {
    setCart([]);
    setGlobalDiscount(0);
    setAppliedCoupon(null); // ✅ Limpiar cupón
    setCouponCode('');
    setProcessing(false); // ✅ MÓDULO 16.1: Reactivar botón después de venta exitosa
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
    const nthPromotion = item.nthPromoDiscount ?? 0;
    // Base para descuento manual = subtotal - promo producto - promo categoría - promo volumen - nth promo
    const subtotalAfterPromos = subtotal - productPromotion - categoryPromotion - volumePromotion - nthPromotion;
    
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
    const nthPromotion = item.nthPromoDiscount ?? 0;
    const manualDiscount = calculateItemDiscount(item);
    return subtotal - productPromotion - categoryPromotion - volumePromotion - nthPromotion - manualDiscount;
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

  const getTotalNthPromotions = () => {
    return cart.reduce((sum, item) => sum + (item.nthPromoDiscount ?? 0), 0);
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
      
      // ✅ Validar límite operativo
      if (operationalLimits?.maxDiscountPercent !== null && 
          operationalLimits?.maxDiscountPercent !== undefined) {
        if (value > operationalLimits.maxDiscountPercent) {
          toast.error(`El descuento porcentual (${value}%) excede el límite permitido (${operationalLimits.maxDiscountPercent}%)`);
          return;
        }
      }
    } else if (discountType === 'AMOUNT') {
      if (value > subtotal) {
        toast.error('El descuento no puede ser mayor al subtotal del ítem');
        return;
      }
      
      // ✅ Validar límite de descuento manual total (AMOUNT)
      if (operationalLimits?.maxManualDiscountAmount !== null && 
          operationalLimits?.maxManualDiscountAmount !== undefined) {
        // Calcular descuentos manuales actuales (excluyendo el ítem que estamos editando)
        const currentManualDiscounts = cart.reduce((sum, i) => {
          if (i.storeProduct.id === discountItemId) return sum; // Excluir ítem actual
          if (!i.discountType || !i.discountValue) return sum;
          
          if (i.discountType === 'AMOUNT') {
            return sum + i.discountValue;
          } else if (i.discountType === 'PERCENT') {
            const itemSubtotal = calculateItemSubtotal(i);
            return sum + Math.round((itemSubtotal * i.discountValue) / 100 * 100) / 100;
          }
          return sum;
        }, 0);
        
        const totalManualDiscounts = currentManualDiscounts + globalDiscount + value;
        
        if (totalManualDiscounts > operationalLimits.maxManualDiscountAmount) {
          toast.error(
            `Descuentos manuales totales (S/ ${totalManualDiscounts.toFixed(2)}) excederían el límite permitido (S/ ${operationalLimits.maxManualDiscountAmount.toFixed(2)})`
          );
          return;
        }
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

    // ✅ MÓDULO 16.1: Prevención de doble submit - deshabilitar botón inmediatamente
    setProcessing(true);
    setShowPaymentModal(false);

    try {
      // ✅ MÓDULO 16.1: Generar idempotency key único
      const idempotencyKey = `checkout-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;

      const checkoutData: any = {
        items: cart.map((item) => {
          // ✅ MÓDULO F3: Diferenciar productos de servicios
          if (item.isService && item.service) {
            return {
              isService: true,
              serviceId: item.service.id,
              serviceName: item.service.name,
              quantity: item.quantity,
              unitPrice: Number(item.service.price),
            };
          }
          // Producto normal
          return {
            storeProductId: item.storeProduct.id,
            quantity: item.quantityBase ?? item.quantity, // ✅ F1: Usar quantityBase si hay conversión
            unitPrice: item.storeProduct.price,
            discountType: item.discountType,
            discountValue: item.discountValue,
            // ✅ MÓDULO F1: Campos de unidades avanzadas
            saleUnitId: item.unitIdUsed,
          };
        }),
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
        headers: { 
          'Content-Type': 'application/json',
          'Idempotency-Key': idempotencyKey, // ✅ MÓDULO 16.1: Header de idempotencia
        },
        body: JSON.stringify(checkoutData),
      });

      const data = await res.json();

      // ✅ MÓDULO 16.1: Manejar códigos específicos de hardening
      if (res.status === 429) {
        // Rate limit exceeded
        toast.error('Demasiadas solicitudes', {
          description: 'Espera unos segundos antes de intentar nuevamente',
          duration: 5000,
        });
        setProcessing(false);
        return;
      }

      if (res.status === 409 && data.code === 'CHECKOUT_IN_PROGRESS') {
        // Checkout lock
        toast.error('Operación en proceso', {
          description: 'Ya tienes una venta en proceso. Espera a que termine.',
          duration: 5000,
        });
        setProcessing(false);
        return;
      }

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

      // ✅ Manejar respuesta idempotente (replay)
      if (data.code === 'IDEMPOTENT_REPLAY') {
        toast.warning('Venta ya procesada', {
          description: `Esta venta ya fue registrada (Total: S/ ${data.total.toFixed(2)})`,
          duration: 5000,
        });
      } else {
        // Mensaje diferente para FIADO
        if (paymentMethod === 'FIADO') {
          toast.success(`¡Venta FIADO registrada!`, {
            description: `Cliente: ${selectedCustomer!.name} - Total: S/ ${data.total.toFixed(2)}`,
            duration: 5000,
          });
        } else {
          toast.success(`¡Venta completada! Total: S/ ${data.total.toFixed(2)}`);
        }
      }

      // ✅ MÓDULO 18.5: Emitir comprobante SUNAT si está habilitado
      // IMPORTANTE: Solo después de venta exitosa, NO bloquea checkout
      if (sunatData && sunatData.enabled && sunatData.docType) {
        try {
          const sunatRes = await fetch('/api/sunat/emit', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
              saleId: data.saleId,
              docType: sunatData.docType,
              customerDocType: sunatData.customerDocType,
              customerDocNumber: sunatData.customerDocNumber,
              customerName: sunatData.customerName,
              customerAddress: sunatData.customerAddress,
              customerEmail: sunatData.customerEmail,
            }),
          });

          const sunatResult = await sunatRes.json();

          if (sunatRes.ok) {
            toast.success(`Comprobante ${sunatData.docType} encolado para SUNAT`, {
              description: `Número: ${sunatResult.document.fullNumber}`,
              duration: 4000,
            });
          } else {
            // Error al emitir comprobante - venta ya está guardada
            toast.warning('Venta guardada, pero error al emitir comprobante', {
              description: sunatResult.error || 'Puedes emitirlo desde el historial',
              duration: 5000,
            });
          }
        } catch (error) {
          console.error('Error emitting SUNAT:', error);
          toast.warning('Venta guardada, pero no se pudo emitir comprobante', {
            description: 'Emite el comprobante desde el historial de ventas',
            duration: 5000,
          });
        }
      }
      
      // Show sale complete modal
      setCompletedSale({ id: data.saleId, total: data.total });
      setShowSaleCompleteModal(true);
      
      // ✅ MÓDULO 18.2: Prefetch del ticket para carga instantánea
      // Precargar datos del ticket mientras el usuario ve el modal
      fetch(`/api/sales/${data.saleId}`).catch(() => {});
      
      clearCart();
      setProducts([]);
      setQuery('');
      setSelectedCustomer(null);
      setSunatData(null); // ✅ Limpiar datos SUNAT
    } catch (error) {
      console.error('Checkout error:', error);
      toast.error('Error de conexión');
      setProcessing(false); // ✅ Reactivar botón solo en error de conexión
    } finally {
      // ✅ MÓDULO 16.1: No reactivar el botón aquí - solo en clearCart
    }
  };

  return (
    <AuthLayout storeName="Punto de Venta">
      <OnboardingBanner />
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

          {/* ✅ MÓDULO 17.4: Badge DEMO MODE */}
          {is_demo_store && (
            <div className="mb-6 bg-yellow-100 border-2 border-yellow-500 rounded-lg p-4 flex items-center justify-center gap-3 shadow-lg">
              <AlertTriangle className="w-6 h-6 text-yellow-700" />
              <div className="text-center">
                <p className="text-xl font-extrabold text-yellow-900 tracking-wider">
                  DEMO MODE ACTIVO
                </p>
                <p className="text-sm text-yellow-700 font-medium mt-1">
                  Datos ficticios para demostración
                </p>
              </div>
              <AlertTriangle className="w-6 h-6 text-yellow-700" />
            </div>
          )}
          
          <div className="grid grid-cols-1 lg:grid-cols-3 gap-6 min-h-[calc(100vh-200px)]">
            {/* Columna Izquierda: Búsqueda y Productos */}
            <div className="lg:col-span-2 space-y-6">
              {/* Search - Optimizado para táctil */}
              <div className="bg-white border border-gray-200 rounded-lg p-4">
                {/* ✅ MÓDULO 17.1: Hints de atajos */}
                <div className="mb-3 hidden lg:flex items-center gap-3 text-xs text-gray-500">
                  <span className="px-2 py-1 bg-gray-100 rounded border border-gray-200 font-mono">F2</span>
                  <span>Buscar</span>
                  <span className="px-2 py-1 bg-gray-100 rounded border border-gray-200 font-mono">Ctrl+Enter</span>
                  <span>Finalizar</span>
                </div>
                
                {/* Campo de búsqueda normal */}
                <div className="flex gap-2">
                  <div className="flex-1 relative">
                    <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400 w-5 h-5" />
                    <input
                      ref={searchInputRef}
                      id="product-search"
                      type="text"
                      placeholder="Buscar producto por nombre, código..."
                      value={query}
                      onChange={(e) => setQuery(e.target.value)}
                      onKeyDown={(e) => e.key === 'Enter' && handleSearch()}
                      className="w-full h-12 md:h-14 pl-10 pr-4 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-[#16A34A] text-base md:text-sm"
                      style={{ fontSize: '16px' }}
                    />
                  </div>
                  <button
                    onClick={handleSearch}
                    disabled={loading}
                    className="h-12 md:h-14 px-4 md:px-6 bg-[#16A34A] text-white rounded-md font-medium hover:bg-[#15803d] disabled:opacity-50 disabled:cursor-not-allowed transition-colors touch-manipulation"
                  >
                    {loading ? 'Buscando...' : 'Buscar'}
                  </button>
                </div>
              </div>

              {/* ✅ MÓDULO F3: Tabs Productos/Servicios */}
              {servicesEnabled && currentShift && !query.trim() && (
                <div className="flex gap-2 bg-white border border-gray-200 rounded-lg p-2">
                  <button
                    onClick={() => setPosTab('products')}
                    className={`flex-1 flex items-center justify-center gap-2 py-2 px-4 rounded-md font-medium transition-colors ${
                      posTab === 'products'
                        ? 'bg-emerald-100 text-emerald-700'
                        : 'text-gray-600 hover:bg-gray-100'
                    }`}
                  >
                    <ShoppingCart className="w-4 h-4" />
                    Productos
                  </button>
                  <button
                    onClick={() => setPosTab('services')}
                    className={`flex-1 flex items-center justify-center gap-2 py-2 px-4 rounded-md font-medium transition-colors ${
                      posTab === 'services'
                        ? 'bg-indigo-100 text-indigo-700'
                        : 'text-gray-600 hover:bg-gray-100'
                    }`}
                  >
                    <Wrench className="w-4 h-4" />
                    Servicios
                    {services.length > 0 && (
                      <span className="text-xs bg-indigo-600 text-white px-1.5 py-0.5 rounded-full">
                        {services.length}
                      </span>
                    )}
                  </button>
                </div>
              )}

              {/* ✅ MÓDULO 17.2: Quick Sell Grid - Oculto cuando hay búsqueda activa */}
              {currentShift && !query.trim() && posTab === 'products' && (
                <QuickSellGrid 
                  onAddProduct={handleAddFromQuickSell}
                  disabled={!currentShift}
                />
              )}

              {/* ✅ MÓDULO F3: Services Grid */}
              {servicesEnabled && currentShift && !query.trim() && posTab === 'services' && (
                <div className="bg-white border border-gray-200 rounded-lg overflow-hidden">
                  <div className="px-4 py-3 bg-indigo-50 border-b border-indigo-200">
                    <div className="flex items-center justify-between">
                      <h3 className="text-sm font-medium text-indigo-900 flex items-center gap-2">
                        <Wrench className="w-4 h-4" />
                        Servicios disponibles ({services.length})
                      </h3>
                      <button
                        onClick={loadServices}
                        disabled={loadingServices}
                        className="text-xs text-indigo-600 hover:text-indigo-800"
                      >
                        {loadingServices ? 'Cargando...' : 'Actualizar'}
                      </button>
                    </div>
                  </div>
                  {services.length === 0 ? (
                    <div className="p-8 text-center text-gray-500">
                      <Wrench className="w-12 h-12 mx-auto mb-3 text-gray-300" />
                      <p>No hay servicios configurados</p>
                      <p className="text-xs mt-1">Crea servicios en Inventario &gt; Servicios</p>
                    </div>
                  ) : (
                    <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 gap-3 p-4">
                      {services.map((service) => (
                        <button
                          key={service.id}
                          onClick={() => addServiceToCart(service)}
                          className="flex flex-col items-center justify-center p-4 bg-indigo-50 hover:bg-indigo-100 border border-indigo-200 rounded-lg transition-colors group"
                        >
                          <Wrench className="w-8 h-8 text-indigo-600 mb-2 group-hover:scale-110 transition-transform" />
                          <span className="text-sm font-medium text-indigo-900 text-center line-clamp-2">
                            {service.name}
                          </span>
                          <span className="text-lg font-bold text-indigo-700 mt-1">
                            {formatMoney(Number(service.price))}
                          </span>
                        </button>
                      ))}
                    </div>
                  )}
                </div>
              )}

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
                        className="p-4 hover:bg-gray-50 transition-colors flex items-center gap-3"
                      >
                        {/* Imagen del producto */}
                        {sp.product.imageUrl ? (
                          <img
                            src={sp.product.imageUrl}
                            alt={sp.product.name}
                            className="w-16 h-16 object-cover rounded border border-gray-200 flex-shrink-0"
                          />
                        ) : (
                          <div className="w-16 h-16 bg-gray-100 rounded border border-gray-200 flex items-center justify-center flex-shrink-0">
                            <ShoppingCart className="w-6 h-6 text-gray-400" />
                          </div>
                        )}
                        
                        <div className="flex-1 min-w-0">
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

            {/* Columna Derecha: Carrito Desktop/Tablet */}
            <div className="lg:col-span-1 h-full">
              <CartPanel
                cart={cart}
                onUpdateQuantity={(id, delta) => {
                  const item = cart.find(i => i.storeProduct.id === id);
                  if (item) {
                    updateQuantity(id, item.quantity + delta);
                  }
                }}
                onRemoveItem={removeFromCart}
                onClearCart={clearCart}
                onApplyDiscount={handleOpenDiscountModal}
                onFinalizeSale={handleCheckout}
                appliedCoupon={appliedCoupon ? { code: appliedCoupon.code, discount: appliedCoupon.discount } : null}
                onRemoveCoupon={handleRemoveCoupon}
                processing={processing}
                advancedUnitsEnabled={advancedUnitsEnabled}
                onUpdateItemUnit={updateItemUnit}
              />
            </div>
          </div>

          {/* ✅ MÓDULO 17.3: Botón flotante mobile para abrir carrito */}
          {cart.length > 0 && (
            <button
              onClick={() => setMobileCartOpen(true)}
              className="md:hidden fixed bottom-6 right-6 z-30 bg-emerald-600 hover:bg-emerald-700 text-white px-6 py-4 rounded-full shadow-2xl flex items-center gap-3 font-semibold transition-all active:scale-95"
            >
              <ShoppingCart className="w-6 h-6" />
              <span>Carrito ({cart.length})</span>
              <span className="text-emerald-100">• {formatMoney(getCartTotal())}</span>
            </button>
          )}

          {/* ✅ MÓDULO 17.3: Mobile Cart Drawer */}
          <MobileCartDrawer
            isOpen={mobileCartOpen}
            onClose={() => setMobileCartOpen(false)}
            cart={cart}
            onUpdateQuantity={(id, delta) => {
              const item = cart.find(i => i.storeProduct.id === id);
              if (item) {
                updateQuantity(id, item.quantity + delta);
              }
            }}
            onRemoveItem={removeFromCart}
            onClearCart={() => {
              clearCart();
              setMobileCartOpen(false);
            }}
            onApplyDiscount={(id) => {
              handleOpenDiscountModal(id);
              setMobileCartOpen(false);
            }}
            onFinalizeSale={() => {
              setMobileCartOpen(false);
              handleCheckout();
            }}
            appliedCoupon={appliedCoupon ? { code: appliedCoupon.code, discount: appliedCoupon.discount } : null}
            onRemoveCoupon={() => {
              handleRemoveCoupon();
              setMobileCartOpen(false);
            }}
            processing={processing}
            advancedUnitsEnabled={advancedUnitsEnabled}
          />
        </div>
      </main>

      {/* Modal de Pago */}
      {showPaymentModal && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50 p-2 sm:p-4">
          <div className="bg-white rounded-lg w-full max-w-md max-h-[95vh] flex flex-col">
            {/* Header fijo */}
            <div className="flex items-center justify-between p-4 border-b flex-shrink-0">
              <h3 className="text-lg font-semibold text-gray-900">Método de Pago</h3>
              <button
                onClick={() => setShowPaymentModal(false)}
                className="text-gray-400 hover:text-gray-600 p-1"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            {/* Contenido con scroll */}
            <div className="flex-1 overflow-y-auto p-4 space-y-4">
              {/* Total */}
              <div className="bg-gradient-to-r from-green-50 to-emerald-50 rounded-lg p-3 border border-green-200">
                <div className="text-xs text-green-700 mb-0.5">Total a pagar</div>
                <div className="text-2xl font-bold text-green-800">
                  {formatMoney(getCartTotal())}
                </div>
              </div>

              {/* Selector de método - más compacto */}
              <div>
                <div className="flex items-center justify-between mb-2">
                  <label className="text-sm font-medium text-gray-700">Método</label>
                  <div className="flex items-center gap-1 text-[10px] text-gray-400">
                    <span className="px-1.5 py-0.5 bg-gray-100 rounded font-mono">F5-F8</span>
                    <span>atajos</span>
                  </div>
                </div>
                <div className="grid grid-cols-3 gap-2">
                  {[
                    { value: 'CASH', label: 'Efectivo', icon: '💵' },
                    { value: 'YAPE', label: 'Yape', icon: '📱' },
                    { value: 'PLIN', label: 'Plin', icon: '📲' },
                    { value: 'CARD', label: 'Tarjeta', icon: '💳' },
                    { value: 'FIADO', label: 'Fiado', icon: '📝' },
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
                      className={`py-2 px-2 rounded-lg border-2 text-sm font-medium transition-colors disabled:opacity-50 disabled:cursor-not-allowed ${
                        paymentMethod === method.value
                          ? 'border-blue-600 bg-blue-50 text-blue-700'
                          : 'border-gray-200 bg-white text-gray-700 hover:border-gray-300'
                      }`}
                    >
                      <span className="text-base">{method.icon}</span>
                      <div className="text-xs mt-0.5">{method.label}</div>
                    </button>
                  ))}
                </div>
              </div>

              {/* Input para efectivo - más compacto */}
              {paymentMethod === 'CASH' && (
                <div className="bg-gray-50 rounded-lg p-3">
                  <label className="block text-sm font-medium text-gray-700 mb-1.5">
                    Pagó con (S/)
                  </label>
                  <input
                    type="number"
                    step="0.01"
                    value={amountPaid}
                    onChange={(e) => setAmountPaid(e.target.value)}
                    className="w-full px-3 py-2 border border-gray-300 rounded-lg text-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
                    placeholder="0.00"
                    autoFocus
                    onKeyDown={(e) => e.key === 'Enter' && handleConfirmPayment()}
                  />
                  
                  {/* Vuelto */}
                  {amountPaid && parseFloat(amountPaid) >= getCartTotal() && (
                    <div className="mt-2 p-2 bg-green-100 border border-green-300 rounded-lg flex items-center justify-between">
                      <span className="text-sm text-green-700">Vuelto:</span>
                      <span className="text-xl font-bold text-green-700">
                        {formatMoney(parseFloat(amountPaid) - getCartTotal())}
                      </span>
                    </div>
                  )}

                  {amountPaid && (() => {
                    const totalRounded = Math.round(getCartTotal() * 100) / 100;
                    const paidRounded = Math.round(parseFloat(amountPaid) * 100) / 100;
                    return paidRounded < totalRounded && paidRounded > 0;
                  })() && (
                    <div className="mt-2 text-xs text-red-600">
                      ⚠️ Monto insuficiente
                    </div>
                  )}
                </div>
              )}

              {/* Mensaje para otros métodos */}
              {paymentMethod !== 'CASH' && paymentMethod !== 'FIADO' && (
                <div className="p-3 bg-blue-50 border border-blue-200 rounded-lg">
                  <p className="text-sm text-blue-800">
                    ✓ Pago con <strong>{paymentMethod}</strong>
                  </p>
                </div>
              )}

              {/* Selector de cliente para FIADO */}
              {paymentMethod === 'FIADO' && (
                <div className="bg-orange-50 rounded-lg p-3 border border-orange-200">
                  <label className="block text-sm font-medium text-gray-700 mb-2">
                    Cliente <span className="text-red-500">*</span>
                  </label>
                  {selectedCustomer ? (
                    <div className="flex justify-between items-center bg-white p-2 rounded border">
                      <div>
                        <div className="font-medium text-gray-900 text-sm">{selectedCustomer.name}</div>
                        {selectedCustomer.totalBalance > 0 && (
                          <div className="text-xs text-red-600">
                            Deuda: S/ {selectedCustomer.totalBalance.toFixed(2)}
                          </div>
                        )}
                      </div>
                      <button
                        onClick={() => setSelectedCustomer(null)}
                        className="text-red-600 hover:text-red-700 text-xs"
                      >
                        Cambiar
                      </button>
                    </div>
                  ) : (
                    <button
                      onClick={() => {
                        setCustomerSearch('');
                        setCustomers([]);
                        setShowCustomerModal(true);
                      }}
                      className="w-full py-2 px-3 border-2 border-dashed border-orange-300 rounded-lg text-orange-600 hover:border-orange-400 text-sm"
                    >
                      + Seleccionar Cliente
                    </button>
                  )}
                </div>
              )}

              {/* ✅ MÓDULO 18.5: Selector de Comprobante SUNAT */}
              <SunatComprobanteSelector
                userRole={userRole}
                paymentMethod={paymentMethod}
                onChange={(data) => setSunatData(data)}
              />
            </div>

            {/* Botones fijos en la parte inferior */}
            <div className="flex gap-3 p-4 border-t flex-shrink-0 bg-gray-50">
              <button
                onClick={() => setShowPaymentModal(false)}
                className="flex-1 px-4 py-2.5 border border-gray-300 rounded-lg font-medium text-gray-700 hover:bg-gray-100 text-sm"
              >
                Cancelar
              </button>
              <button
                onClick={handleConfirmPayment}
                disabled={processing}
                className="flex-1 px-4 py-2.5 bg-green-600 text-white rounded-lg font-medium hover:bg-green-700 disabled:opacity-50 disabled:cursor-not-allowed text-sm"
              >
                {processing ? 'Procesando...' : '✓ Confirmar'}
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
                        // ✅ Validar límite de balance de FIADO
                        if (operationalLimits?.maxReceivableBalance !== null && 
                            operationalLimits?.maxReceivableBalance !== undefined) {
                          const saleTotal = getCartTotal();
                          const newBalance = customer.totalBalance + saleTotal;
                          
                          if (newBalance > operationalLimits.maxReceivableBalance) {
                            toast.error(
                              `No se puede procesar. Balance resultante (S/ ${newBalance.toFixed(2)}) excedería el límite permitido (S/ ${operationalLimits.maxReceivableBalance.toFixed(2)})`
                            );
                            return;
                          }
                        }
                        
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
          
          // ✅ Validar límite de descuento manual total
          if (operationalLimits?.maxManualDiscountAmount !== null && 
              operationalLimits?.maxManualDiscountAmount !== undefined) {
            // Calcular descuentos manuales de items
            const itemDiscounts = getTotalItemDiscounts();
            const totalManualDiscounts = itemDiscounts + discount;
            
            if (totalManualDiscounts > operationalLimits.maxManualDiscountAmount) {
              toast.error(
                `Descuentos manuales totales (S/ ${totalManualDiscounts.toFixed(2)}) excederían el límite permitido (S/ ${operationalLimits.maxManualDiscountAmount.toFixed(2)})`
              );
              return;
            }
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
