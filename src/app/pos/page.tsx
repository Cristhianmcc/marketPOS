'use client';

import { useState, useEffect, useRef, useCallback } from 'react';
import { Search, Plus, Minus, Trash2, ShoppingCart, X, AlertCircle, AlertTriangle, Tag, Package as PackageIcon, Clock, Milk, Scale, Wrench } from 'lucide-react';
import AuthLayout from '@/components/AuthLayout';
import OnboardingBanner from '@/components/onboarding/OnboardingBanner';
import QuickSellGrid from '@/components/pos/QuickSellGrid';
import CartPanel from '@/components/pos/CartPanel';
import { PosHeader } from '@/components/pos/PosHeader';
import { PosBanner } from '@/components/pos/PosBanner';
import { CategoryChips } from '@/components/pos/CategoryChips';
import MobileCartDrawer from '@/components/pos/MobileCartDrawer';
import SunatComprobanteSelector from '@/components/pos/SunatComprobanteSelector'; // ✅ MÓDULO 18.5
import AdvancedUnitSelector from '@/components/pos/AdvancedUnitSelector'; // ✅ MÓDULO F1
import { toast, Toaster } from 'sonner';
import { usePosShortcuts } from '@/hooks/usePosShortcuts';
import { usePosHotkeys } from '@/hooks/usePosHotkeys';
import { useFlags } from '@/hooks/useFlags'; // ✅ MÓDULO F1
import { formatMoney } from '@/lib/money';
import { Shift } from '@/domain/types';

// ✅ MÓDULO S1: Funciones de cálculo centralizadas
import {
  calculateItemSubtotal,
  calculateItemPromotion,
  calculateItemCategoryPromo,
  calculateItemDiscount,
  calculateItemTotal,
  getTotalItems,
  getSubtotalBeforeDiscounts,
  getTotalPromotions,
  getTotalCategoryPromotions,
  getTotalVolumePromotions,
  getTotalNthPromotions,
  getTotalItemDiscounts,
  getCartTotal,
  getCartIcbper,
  getTotalBeforeCoupon,
  nextBaseQuantityForDelta,
} from '@/modules/pos';

interface StoreProduct {
  id: string;
  price: number;
  costPrice: number | null;
  stock: number | null;
  active: boolean;
  /** Bolsa plástica: suma ICBPER por unidad al total. */
  icbper?: boolean;
  // ✅ MÓDULO PH3: Info de lotes/vencimiento
  batchInfo?: { nearestExpiry: string; hasExpired: boolean } | null;
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
    // ✅ MÓDULO PH5: Campos farmacéuticos
    commercialName?: string | null;
    genericName?: string | null;
    concentration?: string | null;
    pharmaceuticalForm?: string | null;
    presentation?: string | null;
    laboratory?: string | null;
    requiresPrescription?: boolean;
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
  // Venta libre (producto no registrado)
  isFreeItem?: boolean;          // true si es venta libre sin storeProduct
  freeItemName?: string;         // Descripción del producto
  // ✅ MÓDULO PH6: Control Rx
  rxConfirmed?: boolean;         // true si la venta Rx fue confirmada
  rxObservation?: string | null;
  rxPatientName?: string | null;
  rxPrescriptionNumber?: string | null;
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

// ✅ MÓDULO PH4: Paciente / receptor de medicamentos
interface PatientRecord {
  id: string;
  dni: string;
  name: string;
  phone: string | null;
  birthDate: string | null;
  gender: string | null;
}

interface MedicationHistoryEntry {
  id: string;
  productName: string;
  genericName: string | null;
  concentration: string | null;
  quantity: number;
  consultReason: string | null;
  dispensedAt: string;
}

export default function POSPage() {
  const [query, setQuery] = useState('');
  const [products, setProducts] = useState<StoreProduct[]>([]);
  // Filtro por categoría: resultados aparte para no interferir con búsqueda/escáner
  const [selectedCategory, setSelectedCategory] = useState<string | null>(null);
  const [categoryProducts, setCategoryProducts] = useState<StoreProduct[]>([]);
  const [loadingCategory, setLoadingCategory] = useState(false);
  const [cart, setCart] = useState<CartItem[]>([]);
  const [loading, setLoading] = useState(false);
  const [processing, setProcessing] = useState(false);
  const [currentShift, setCurrentShift] = useState<Shift | null>(null);
  const [showOpenShiftModal, setShowOpenShiftModal] = useState(false);
  const [openingCash, setOpeningCash] = useState('');
  const [showSaleCompleteModal, setShowSaleCompleteModal] = useState(false);
  const [completedSale, setCompletedSale] = useState<{ id: string; total: number } | null>(null);
  const [showPaymentModal, setShowPaymentModal] = useState(false);
  const [paymentMethod, setPaymentMethod] = useState<'CASH' | 'YAPE' | 'PLIN' | 'CARD' | 'FIADO' | 'MIXED'>('CASH');
  const [amountPaid, setAmountPaid] = useState('');
  // ✅ Pago Mixto: splits de pago
  const [mixedSplits, setMixedSplits] = useState<{ method: 'CASH' | 'YAPE' | 'PLIN' | 'CARD'; amount: string }[]>([
    { method: 'CASH', amount: '' },
    { method: 'YAPE', amount: '' },
  ]);
  // Venta libre (producto no registrado en inventario)
  const [showFreeItemModal, setShowFreeItemModal] = useState(false);
  const [freeItemName, setFreeItemName] = useState('');
  const [freeItemPrice, setFreeItemPrice] = useState('');
  const [freeItemQty, setFreeItemQty] = useState('1');
  
  // ✅ OPTIMIZACIÓN: useRef para barcode scanner (evita re-renders en cada tecla)
  const barcodeBufferRef = useRef('');
  const lastKeyTimeRef = useRef(0);
  // ✅ Ref para que el barcode scanner siempre use la versión más reciente de addToCart
  const addToCartRef = useRef<((sp: StoreProduct) => Promise<void>) | null>(null);
  // ✅ FIX: Dedup para evitar doble agregado por scanner (debounce + Enter race condition)
  const lastScanAddRef = useRef(0);
  const checkoutAttemptKeyRef = useRef<string | null>(null);
  
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

  // ✅ MÓDULO PH4: Estados para modal de paciente/receptor
  const [selectedPatient, setSelectedPatient] = useState<PatientRecord | null>(null);
  const [showPatientModal, setShowPatientModal] = useState(false);
  const [patientDniSearch, setPatientDniSearch] = useState('');
  const [patientSearchResult, setPatientSearchResult] = useState<PatientRecord | null>(null);
  const [searchingPatient, setSearchingPatient] = useState(false);
  const [patientNotFound, setPatientNotFound] = useState(false);
  const [patientConsultReason, setPatientConsultReason] = useState('');
  const [showNewPatientForm, setShowNewPatientForm] = useState(false);
  const [newPatientName, setNewPatientName] = useState('');
  const [newPatientPhone, setNewPatientPhone] = useState('');
  const [newPatientBirthDate, setNewPatientBirthDate] = useState('');
  const [newPatientGender, setNewPatientGender] = useState('');
  const [creatingPatient, setCreatingPatient] = useState(false);
  const [patientHistory, setPatientHistory] = useState<MedicationHistoryEntry[]>([]);
  const [loadingHistory, setLoadingHistory] = useState(false);

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

  // ✅ MÓDULO PH6: estado modal Rx
  const [showRxModal, setShowRxModal] = useState(false);
  const [rxPendingProduct, setRxPendingProduct] = useState<StoreProduct | null>(null);
  const [rxObservation, setRxObservation] = useState('');
  const [rxPatientName, setRxPatientName] = useState('');
  const [rxPrescriptionNumber, setRxPrescriptionNumber] = useState('');

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

  // Auto-focus en el input de búsqueda al montar la página
  useEffect(() => {
    searchInputRef.current?.focus();
  }, []);

  // ✅ MÓDULO 17.3: Estado para drawer móvil
  const [mobileCartOpen, setMobileCartOpen] = useState(false);

  // ✅ MÓDULO F1: Feature flags para unidades avanzadas
  const { isOn: isFlagOn, isLoading: flagsLoading, isDesktop } = useFlags();
  const advancedUnitsEnabled = isFlagOn('ENABLE_ADVANCED_UNITS');
  const conversionsEnabled = isFlagOn('ENABLE_CONVERSIONS');
  // ✅ MÓDULO F3: Servicios
  const servicesEnabled = isFlagOn('ENABLE_SERVICES');
  // ✅ MÓDULO PH5: Búsqueda farmacéutica avanzada
  const medicineSearchEnabled = isFlagOn('ENABLE_MEDICINE_SEARCH');
  // ✅ MÓDULO PH6: Control de productos Rx / restringidos
  const restrictedProductsEnabled = isFlagOn('ENABLE_RESTRICTED_PRODUCTS');
  // ✅ MÓDULO PH3: Control de lotes / vencimiento
  const batchExpiryEnabled = isFlagOn('ENABLE_BATCH_EXPIRY');
  // ✅ MÓDULO PH4: Paciente / receptor de medicamentos
  const patientsEnabled = isFlagOn('ENABLE_PATIENTS');
  const controlledBookEnabled = isFlagOn('ENABLE_CONTROLLED_BOOK');
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
      costPrice: null,
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

  // Venta libre: agregar producto sin storeProductId
  const addFreeItemToCart = useCallback((name: string, price: number, qty: number) => {
    const freeId = `free-${Date.now()}-${Math.random().toString(36).substr(2, 6)}`;
    const fakeStoreProduct: StoreProduct = {
      id: freeId,
      price,
      costPrice: null,
      stock: null,
      active: true,
      product: {
        id: freeId,
        name,
        brand: null,
        content: '(Venta libre)',
        category: 'Otros',
        unitType: 'UNIT',
        barcode: null,
        internalSku: '',
        imageUrl: null,
      },
    };

    setCart(prev => [...prev, {
      storeProduct: fakeStoreProduct,
      quantity: qty,
      isFreeItem: true,
      freeItemName: name,
    }]);

    toast.success(`"${name}" agregado al carrito`);
  }, []);

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
        // Mantener focus para escaneo continuo
      } else if (query.trim() === '' && cart.length > 0 && currentShift) {
        handleCheckout();
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
    confirmPayment: () => {
      if (showPaymentModal && !processing) {
        handleConfirmPayment();
      }
    },
  };

  // ✅ MÓDULO 17.1: Activar atajos de teclado
  usePosShortcuts(shortcutHandlers, {
    enabled: true,
    isCheckoutModalOpen: showPaymentModal,
    hasOpenShift: !!currentShift,
    barcodeBufferRef,
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
          const res = await fetch(`/api/inventory?query=${encodeURIComponent(barcodeToSearch)}&active=true`);
          if (res.ok) {
            const data = await res.json();
            if (data.products && data.products.length > 0) {
              await addToCartRef.current?.(data.products[0]);
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

  // Productos de la categoría seleccionada
  useEffect(() => {
    if (!selectedCategory) {
      setCategoryProducts([]);
      return;
    }
    let cancelled = false;
    setLoadingCategory(true);
    fetch(`/api/inventory?category=${encodeURIComponent(selectedCategory)}&active=true&limit=48`)
      .then(res => (res.ok ? res.json() : null))
      .then(data => {
        if (!cancelled) setCategoryProducts(data?.products || []);
      })
      .catch(() => {
        if (!cancelled) toast.error('Error al cargar la categoría');
      })
      .finally(() => {
        if (!cancelled) setLoadingCategory(false);
      });
    return () => {
      cancelled = true;
    };
  }, [selectedCategory]);

  // Búsqueda automática con debounce
  useEffect(() => {
    const trimmed = query.trim();
    // Si parece un código de barras (solo dígitos, ≥8 chars), buscar más rápido y auto-agregar
    const looksLikeBarcode = /^\d{8,}$/.test(trimmed);
    const delay = looksLikeBarcode ? 150 : 300;

    const delaySearch = setTimeout(() => {
      if (trimmed.length >= 2) {
        performSearch(looksLikeBarcode); // auto-agrega si es barcode exacto
      } else if (trimmed.length === 0) {
        setProducts([]);
      }
    }, delay);

    return () => clearTimeout(delaySearch);
  }, [query]);

  const performSearch = async (autoAddIfExact = false) => {
    if (!query.trim()) {
      setProducts([]);
      return;
    }

    setLoading(true);
    try {
      const res = await fetch(`/api/inventory?query=${encodeURIComponent(query)}&active=true`);
      const data = await res.json();
      const found: StoreProduct[] = data.products || [];

      // Auto-agregar si hay match exacto por código de barras (scanner con foco en input)
      if (autoAddIfExact && found.length === 1) {
        const exactMatch = found[0].product.barcode === query.trim() ||
                           found[0].product.internalSku === query.trim();
        if (exactMatch) {
          // Dedup: evitar doble agregado si debounce y Enter disparan ambos
          const now = Date.now();
          if (now - lastScanAddRef.current < 500) return;
          lastScanAddRef.current = now;
          await addToCartRef.current?.(found[0]);
          setQuery('');
          setProducts([]);
          // Mantener focus para escaneo continuo con pistola
          return;
        }
      }

      setProducts(found);
    } catch (error) {
      console.error('Error searching products:', error);
      toast.error('Error al buscar productos');
    } finally {
      setLoading(false);
    }
  };

  const handleSearch = () => {
    performSearch(true); // auto-agrega si hay match exacto por barcode
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

  // ✅ MÓDULO PH6: ejecutar el add real (después de confirmación Rx si aplica)
  const executeAddToCart = async (
    sp: StoreProduct,
    rx?: { observation: string; patientName: string; prescriptionNumber: string }
  ) => {
    const existing = cart.find((item) => item.storeProduct.id === sp.id);

    if (existing) {
      playBeep();
      await updateQuantity(sp.id, existing.quantity + 1);
    } else {
      if (operationalLimits?.maxItemsPerSale !== null &&
          operationalLimits?.maxItemsPerSale !== undefined) {
        const currentTotalItems = cart.reduce((sum, item) => sum + item.quantity, 0);
        if (currentTotalItems >= operationalLimits.maxItemsPerSale) {
          toast.error(`No puedes agregar más items. Límite máximo: ${operationalLimits.maxItemsPerSale} items por venta`);
          return;
        }
      }

      const newItem: CartItem = {
        storeProduct: sp,
        quantity: 1,
        rxConfirmed: rx ? true : undefined,
        rxObservation: rx?.observation || null,
        rxPatientName: rx?.patientName || null,
        rxPrescriptionNumber: rx?.prescriptionNumber || null,
      };

      setCart(prev => [...prev, newItem]);
      playBeep();
      toast.success(`${sp.product.name} agregado al carrito`);

      if (sp.stock !== null && sp.stock <= 5) {
        toast.warning(`Advertencia: Solo quedan ${sp.stock} unidades`, { duration: 3000 });
      }

      checkAllPromotionsUnified(newItem).then(itemWithPromo => {
        setCart(prev => prev.map(item =>
          item.storeProduct.id === sp.id ? { ...itemWithPromo, rxConfirmed: newItem.rxConfirmed, rxObservation: newItem.rxObservation, rxPatientName: newItem.rxPatientName, rxPrescriptionNumber: newItem.rxPrescriptionNumber } : item
        ));

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

  const addToCart = async (sp: StoreProduct) => {
    // Validar stock antes de agregar
    if (sp.stock !== null && sp.stock <= 0) {
      toast.error(`${sp.product.name}: sin stock disponible`);
      return;
    }

    // ✅ MÓDULO PH6: productos Rx requieren confirmación
    if (restrictedProductsEnabled && sp.product.requiresPrescription) {
      const alreadyInCart = cart.find((item) => item.storeProduct.id === sp.id);
      if (!alreadyInCart) {
        setRxPendingProduct(sp);
        setRxObservation('');
        setRxPatientName('');
        setRxPrescriptionNumber('');
        setShowRxModal(true);
        return; // esperar confirmación
      }
    }

    const existing = cart.find((item) => item.storeProduct.id === sp.id);
    
    await executeAddToCart(sp);
  };

  // Mantener siempre la referencia actualizada de addToCart para el barcode scanner
  addToCartRef.current = addToCart;

  // ✅ MÓDULO 18.2: Ref para debounce de promociones en updateQuantity
  const promoDebounceRef = useRef<NodeJS.Timeout | null>(null);

  // Botones +/− del carrito: con unidad de venta suman o restan una caja, un
  // rollo o un centímetro; sin ella, una unidad base.
  const changeQuantityByDelta = (storeProductId: string, delta: number) => {
    const item = cart.find((i) => i.storeProduct.id === storeProductId);
    if (item) updateQuantity(storeProductId, nextBaseQuantityForDelta(item, delta));
  };

  const updateQuantity = async (storeProductId: string, newQuantity: number) => {
    const item = cart.find((i) => i.storeProduct.id === storeProductId);
    if (!item) return;

    // ✅ F2.2: Con unidad de venta (caja, rollo, centímetro) newQuantity llega en
    // unidad base y la cantidad se conserva también en la unidad de venta.
    if (item.unitIdUsed && item.conversionFactorUsed && item.conversionFactorUsed !== 1) {
      // Cantidad en unidad de venta = cantidad base / factor (redondeo de flotantes)
      const newOriginal = Math.round((newQuantity / item.conversionFactorUsed) * 1e6) / 1e6;
      const newBase = Math.round(newQuantity * 1e6) / 1e6;
      if (newOriginal <= 0) { removeFromCart(storeProductId); return; }
      setCart(prev => prev.map(i =>
        i.storeProduct.id === storeProductId
          ? { ...i, quantity: newBase, quantityOriginal: newOriginal, quantityBase: newBase }
          : i
      ));
      return;
    }

    // Validar decimales según unidad base
    const baseUnitAllowsDecimals = (item.storeProduct.product as unknown as { baseUnit?: { allowDecimals?: boolean } }).baseUnit?.allowDecimals ?? false;
    if (!baseUnitAllowsDecimals && !Number.isInteger(newQuantity)) {
      toast.error('Cantidad debe ser entera para esta unidad de medida');
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

  // ✅ Validar y aplicar cupón (Módulo 14.2-A)
  const handleApplyCoupon = async () => {
    if (!couponCode.trim()) {
      toast.error('Ingresa un código de cupón');
      return;
    }

    const totalBeforeCouponVal = getTotalBeforeCoupon(cart, globalDiscount);
    if (totalBeforeCouponVal <= 0) {
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
          totalBeforeCoupon: totalBeforeCouponVal,
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

  // ✅ MÓDULO PH4: Handlers para modal de paciente/receptor
  const handleSearchPatientByDni = async () => {
    const dni = patientDniSearch.trim();
    if (!dni) return;
    setSearchingPatient(true);
    setPatientNotFound(false);
    setPatientSearchResult(null);
    setShowNewPatientForm(false);
    try {
      const res = await fetch(`/api/patients?query=${encodeURIComponent(dni)}`);
      if (!res.ok) throw new Error();
      const data = await res.json();
      const found = (data.patients || []).find((p: PatientRecord) => p.dni === dni);
      if (found) {
        setPatientSearchResult(found);
        // Cargar historial de dispensaciones
        setLoadingHistory(true);
        try {
          const histRes = await fetch(`/api/patients?id=${found.id}`);
          if (histRes.ok) {
            const histData = await histRes.json();
            setPatientHistory(histData.patient?.medicationHistory || []);
          }
        } catch { /* historial no crítico */ } finally {
          setLoadingHistory(false);
        }
      } else {
        setPatientNotFound(true);
        setNewPatientName('');
        setNewPatientPhone('');
        setNewPatientBirthDate('');
        setNewPatientGender('');
        setShowNewPatientForm(true);
      }
    } catch {
      toast.error('Error al buscar paciente');
    } finally {
      setSearchingPatient(false);
    }
  };

  const handleCreatePatient = async () => {
    if (!newPatientName.trim() || !patientDniSearch.trim()) {
      toast.error('DNI y nombre son obligatorios');
      return;
    }
    setCreatingPatient(true);
    try {
      // Convertir DD/MM/AAAA → YYYY-MM-DD para la API
      let birthDateIso: string | null = null;
      if (newPatientBirthDate.trim()) {
        const parts = newPatientBirthDate.trim().split('/');
        if (parts.length === 3) {
          birthDateIso = `${parts[2]}-${parts[1].padStart(2,'0')}-${parts[0].padStart(2,'0')}`;
        }
      }
      const res = await fetch('/api/patients', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          dni: patientDniSearch.trim(),
          name: newPatientName.trim(),
          phone: newPatientPhone || null,
          birthDate: birthDateIso,
          gender: newPatientGender || null,
        }),
      });
      const data = await res.json();
      if (!res.ok) {
        // Si ya existe (409) úsalo directamente
        if (res.status === 409 && data.patient) {
          setSelectedPatient(data.patient);
          setShowPatientModal(false);
          toast.success(`Paciente registrado: ${data.patient.name}`);
          return;
        }
        throw new Error(data.error || 'Error al crear');
      }
      setSelectedPatient(data.patient);
      setShowPatientModal(false);
      toast.success(`Paciente registrado: ${data.patient.name}`);
    } catch (err: any) {
      toast.error(err.message || 'Error al crear paciente');
    } finally {
      setCreatingPatient(false);
    }
  };

  const handleConfirmPatient = () => {
    if (patientSearchResult) {
      setSelectedPatient(patientSearchResult);
      setShowPatientModal(false);
      toast.success(`Receptor: ${patientSearchResult.name}`);
    }
  };

  const handleClearPatient = () => {
    setSelectedPatient(null);
    setPatientConsultReason('');
  };

  const openPatientModal = () => {
    setPatientDniSearch(selectedPatient?.dni || '');
    setPatientSearchResult(selectedPatient || null);
    setPatientHistory([]);
    setPatientNotFound(false);
    setShowNewPatientForm(false);
    setNewPatientName('');
    setNewPatientPhone('');
    setNewPatientBirthDate('');
    setNewPatientGender('');
    setShowPatientModal(true);
  };

  const handleConfirmPayment = async () => {
    // En desktop el servidor es local — no se necesita internet para vender
    if (!isDesktop && typeof navigator !== 'undefined' && !navigator.onLine) {
      toast.error('Sin conexión a internet', {
        description: 'No puedes procesar ventas sin conexión. Verifica tu conexión e intenta nuevamente.',
        duration: 5000,
      });
      return;
    }

    const total = getCartTotal(cart, globalDiscount, appliedCoupon);

    // Validaciones según método de pago
    if (paymentMethod === 'CASH') {
      // Campo opcional: si está vacío se asume pago exacto (sin vuelto)
      if (amountPaid) {
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
      }
    } else if (paymentMethod === 'MIXED') {
      // Validar splits de pago mixto
      const validSplits = mixedSplits.filter(s => parseFloat(s.amount) > 0);
      if (validSplits.length < 2) {
        toast.error('Pago mixto requiere al menos 2 métodos con monto');
        return;
      }
      const splitsTotal = validSplits.reduce((sum, s) => sum + Math.round(parseFloat(s.amount) * 100) / 100, 0);
      const totalRounded = Math.round(total * 100) / 100;
      if (Math.round(splitsTotal * 100) / 100 < totalRounded) {
        toast.error(`Falta S/ ${(totalRounded - splitsTotal).toFixed(2)} para cubrir el total`);
        return;
      }
      if (!currentShift) {
        toast.error('Debes abrir un turno para pago mixto');
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

    const controlledCartItems = cart.filter(
      (item) =>
        !item.isService &&
        !item.isFreeItem &&
        item.storeProduct.product.requiresPrescription
    );
    if (controlledBookEnabled && controlledCartItems.length > 0) {
      if (!selectedPatient) {
        toast.error('Selecciona un paciente para la venta controlada');
        openPatientModal();
        return;
      }
      if (controlledCartItems.some((item) => !item.rxPrescriptionNumber?.trim())) {
        toast.error('Todos los productos controlados requieren número de receta');
        return;
      }
    }

    // ✅ MÓDULO 16.1: Prevención de doble submit - deshabilitar botón inmediatamente
    setProcessing(true);
    setShowPaymentModal(false);

    try {
      // Conservar la misma clave si se pierde la respuesta. Solo una respuesta
      // definitiva permite iniciar otro intento con una clave nueva.
      if (!checkoutAttemptKeyRef.current) {
        const randomPart = typeof crypto.randomUUID === 'function'
          ? crypto.randomUUID()
          : `${Date.now()}-${Math.random().toString(36).slice(2)}`;
        checkoutAttemptKeyRef.current = `checkout:${randomPart}`;
      }
      const idempotencyKey = checkoutAttemptKeyRef.current;

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
          // Venta libre (producto no registrado en inventario)
          if (item.isFreeItem) {
            return {
              productName: item.freeItemName || item.storeProduct.product.name,
              quantity: item.quantity,
              unitPrice: item.storeProduct.price,
              isFreeItem: true,
            };
          }
          // Producto normal
          return {
            storeProductId: item.storeProduct.id,
            // ✅ F2.2: Si hay conversión activa, enviar quantityOriginal (en sellUnit)
            // El servidor normaliza a baseUnit internamente — evita doble conversión
            quantity: item.unitIdUsed ? (item.quantityOriginal ?? item.quantity) : item.quantity,
            unitPrice: item.storeProduct.price,
            discountType: item.discountType,
            discountValue: item.discountValue,
            // ✅ MÓDULO F1: Campos de unidades avanzadas
            saleUnitId: item.unitIdUsed,
            // ✅ MÓDULO PH6: Campos Rx para validación server-side
            ...(item.rxPatientName && { rxPatientName: item.rxPatientName }),
            ...(item.rxObservation && { rxObservation: item.rxObservation }),
            ...(item.rxPrescriptionNumber && { rxPrescriptionNumber: item.rxPrescriptionNumber }),
          };
        }),
        paymentMethod,
        discountTotal: globalDiscount > 0 ? globalDiscount : undefined,
        couponCode: appliedCoupon?.code, // ✅ Cupón (Módulo 14.2-A)
      };

      // Solo enviar amountPaid si es CASH; si está vacío se usa el total (pago exacto)
      if (paymentMethod === 'CASH') {
        checkoutData.amountPaid = amountPaid ? parseFloat(amountPaid) : total;
      }

      // ✅ Pago Mixto: enviar splits
      if (paymentMethod === 'MIXED') {
        const validSplits = mixedSplits
          .filter(s => parseFloat(s.amount) > 0)
          .map(s => ({ method: s.method, amount: Math.round(parseFloat(s.amount) * 100) / 100 }));
        checkoutData.paymentSplits = validSplits;
      }

      // Para FIADO, enviar customerId
      if (paymentMethod === 'FIADO') {
        checkoutData.customerId = selectedCustomer!.id;
      }

      // ✅ MÓDULO PH4: Enviar paciente/receptor si está seleccionado
      if ((patientsEnabled || controlledBookEnabled) && selectedPatient) {
        checkoutData.patientId = selectedPatient.id;
        if (patientConsultReason.trim()) {
          checkoutData.consultReason = patientConsultReason.trim();
        }
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
        checkoutAttemptKeyRef.current = null;
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
        if (res.status < 500) checkoutAttemptKeyRef.current = null;
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

      checkoutAttemptKeyRef.current = null;

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
        } else if (paymentMethod === 'MIXED') {
          const splitDesc = mixedSplits
            .filter(s => parseFloat(s.amount) > 0)
            .map(s => `${s.method === 'CASH' ? 'Efectivo' : s.method === 'YAPE' ? 'Yape' : s.method === 'PLIN' ? 'Plin' : 'Tarjeta'}: S/ ${parseFloat(s.amount).toFixed(2)}`)
            .join(' + ');
          toast.success(`¡Venta completada! Total: S/ ${data.total.toFixed(2)}`, {
            description: `Pago mixto: ${splitDesc}`,
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

      // ✅ MÓDULO PH6: Auditar productos Rx vendidos (fire-and-forget)
      const rxItems = cart.filter(
        (item) => !item.isService && item.storeProduct.product.requiresPrescription && item.rxConfirmed
      );
      for (const item of rxItems) {
        fetch('/api/rx-audit', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            saleId: data.saleId,
            productId: item.storeProduct.product.id,
            observation: item.rxObservation,
            patientName: item.rxPatientName,
            prescriptionNumber: item.rxPrescriptionNumber,
          }),
        }).catch(() => {}); // tolerante a fallos
      }

      // ✅ MÓDULO 18.2: Prefetch del ticket para carga instantánea
      // Precargar datos del ticket mientras el usuario ve el modal
      fetch(`/api/sales/${data.saleId}`).catch(() => {});

      clearCart();
      setProducts([]);
      setQuery('');
      setSelectedCustomer(null);
      setSunatData(null); // ✅ Limpiar datos SUNAT
      // ✅ MÓDULO PH4: Limpiar paciente seleccionado
      setSelectedPatient(null);
      setPatientConsultReason('');
    } catch (error) {
      console.error('Checkout error:', error);
      // Detectar error de red/offline (solo relevante en modo web)
      if (!isDesktop && !navigator.onLine) {
        toast.error('Sin conexión a internet', {
          description: 'No se pudo procesar la venta. Verifica tu conexión e intenta nuevamente.',
          duration: 5000,
        });
      } else {
        toast.error('Error al procesar la venta', {
          description: 'Hubo un error en el servidor. Intenta nuevamente.',
          duration: 4000,
        });
      }
      setProcessing(false); // ✅ Reactivar botón solo en error de conexión
    } finally {
      // ✅ MÓDULO 16.1: No reactivar el botón aquí - solo en clearCart
    }
  };

  const renderProductCard = (sp: StoreProduct, onAdd: () => void) => {
    const outOfStock = sp.stock !== null && sp.stock <= 0;
    const lowStock = sp.stock !== null && sp.stock > 0 && sp.stock <= 5;
    let expiryBadge: React.ReactNode = null;
    if (batchExpiryEnabled && sp.batchInfo) {
      const expiry = new Date(sp.batchInfo.nearestExpiry);
      const daysUntil = Math.ceil((expiry.getTime() - Date.now()) / (1000 * 60 * 60 * 24));
      if (sp.batchInfo.hasExpired || daysUntil <= 0) {
        expiryBadge = (
          <span className="inline-flex items-center gap-1 rounded-md bg-red-100 px-1.5 py-0.5 text-xs font-bold text-red-700">
            <AlertTriangle className="w-3 h-3" /> Vencido
          </span>
        );
      } else if (daysUntil <= 60) {
        expiryBadge = (
          <span className="inline-flex items-center gap-1 rounded-md bg-amber-100 px-1.5 py-0.5 text-xs font-semibold text-amber-700">
            <AlertTriangle className="w-3 h-3" /> Vence en {daysUntil}d
          </span>
        );
      }
    }

    return (
      <div
        key={sp.id}
        className={`group flex flex-col rounded-2xl bg-surface-light dark:bg-surface-dark border border-border-light dark:border-border-dark p-3 shadow-soft transition-all ${
          outOfStock ? 'opacity-60' : 'hover:shadow-medium hover:-translate-y-0.5'
        }`}
      >
        {/* Imagen del producto */}
        <div className="relative aspect-[4/3] mb-3 rounded-xl bg-background-light dark:bg-background-dark overflow-hidden">
          {sp.product.imageUrl ? (
            <img src={sp.product.imageUrl} alt={sp.product.name} className="w-full h-full object-cover" />
          ) : (
            <div className="w-full h-full flex items-center justify-center">
              <span className="text-4xl font-bold text-primary/30">{sp.product.name.charAt(0).toUpperCase()}</span>
            </div>
          )}
          <div className="absolute top-2 left-2 flex flex-wrap gap-1">
            {/* ✅ MÓDULO PH5: Badge Rx */}
            {medicineSearchEnabled && sp.product.requiresPrescription && (
              <span className="inline-flex items-center rounded-md bg-red-100 px-1.5 py-0.5 text-xs font-bold text-red-700">Rx</span>
            )}
            {/* ✅ MÓDULO PH3: Badge de vencimiento */}
            {expiryBadge}
          </div>
          {sp.stock !== null && (outOfStock || lowStock) && (
            <span className={`absolute top-2 right-2 rounded-full px-2 py-0.5 text-xs font-semibold text-white ${outOfStock ? 'bg-red-500' : 'bg-orange-500'}`}>
              {outOfStock ? 'Sin stock' : `Stock ${sp.stock}`}
            </span>
          )}
        </div>

        <p className="font-semibold text-sm leading-tight text-text-main dark:text-text-light line-clamp-2">{sp.product.name}</p>
        {(sp.product.brand || sp.product.content) && (
          <p className="mt-0.5 text-xs text-text-secondary dark:text-gray-400 truncate">
            {[sp.product.brand, sp.product.content].filter(Boolean).join(' • ')}
          </p>
        )}
        {/* ✅ MÓDULO PH5: Info farmacéutica */}
        {medicineSearchEnabled && (sp.product.commercialName || sp.product.genericName || sp.product.concentration || sp.product.presentation) && (
          <div className="mt-1 space-y-0.5 text-xs text-text-secondary dark:text-gray-400">
            {sp.product.commercialName && <p className="truncate">Comercial: <span className="font-medium text-text-main dark:text-text-light">{sp.product.commercialName}</span></p>}
            {sp.product.genericName && <p className="truncate">Genérico: <span className="font-medium text-text-main dark:text-text-light">{sp.product.genericName}</span></p>}
            {(sp.product.concentration || sp.product.presentation) && (
              <p className="truncate">
                {sp.product.concentration && <span className="font-medium text-primary">{sp.product.concentration} </span>}
                {sp.product.presentation}
              </p>
            )}
          </div>
        )}
        <p className="mt-1 text-xs text-text-secondary/80 dark:text-gray-500 truncate">
          {sp.product.barcode || sp.product.internalSku}
          {sp.stock !== null && !outOfStock && !lowStock && ` · Stock: ${sp.stock}`}
        </p>

        <div className="mt-auto pt-3 flex items-end justify-between gap-2">
          <div>
            <p className="text-lg font-bold text-primary leading-none">S/ {sp.price.toFixed(2)}</p>
            <p className="mt-1 text-[11px] text-text-secondary dark:text-gray-400">
              {sp.product.unitType === 'UNIT' ? 'por unidad' : 'por kg'}
            </p>
          </div>
          <button
            onClick={onAdd}
            disabled={outOfStock}
            title={outOfStock ? 'Sin stock' : 'Agregar al carrito'}
            aria-label={outOfStock ? 'Sin stock' : `Agregar ${sp.product.name}`}
            className="w-10 h-10 flex-shrink-0 rounded-xl bg-primary hover:bg-primary-hover text-white flex items-center justify-center shadow-sm transition-colors disabled:bg-gray-400 disabled:cursor-not-allowed"
          >
            <Plus className="w-5 h-5" />
          </button>
        </div>
      </div>
    );
  };

  return (
    <AuthLayout storeName="Punto de Venta">
      <OnboardingBanner />
      <Toaster position="top-right" richColors />
      {/* Botón flotante para SUPERADMIN */}
      {isSuperAdmin && (
        <a
          href="/admin/backups"
          className="fixed bottom-4 left-1/2 -translate-x-1/2 z-50 bg-monterrial-forest text-monterrial-cream px-4 py-3 rounded-full shadow-lg ring-1 ring-monterrial-gold/40 hover:bg-monterrial-forest-light transition-colors flex items-center gap-2 font-medium"
        >
          <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 7v10c0 2.21 3.582 4 8 4s8-1.79 8-4V7M4 7c0 2.21 3.582 4 8 4s8-1.79 8-4M4 7c0-2.21 3.582-4 8-4s8 1.79 8 4" />
          </svg>
          Admin Backups
        </a>
      )}
      <main className="h-full flex flex-col overflow-hidden px-4 py-4">
        <div className="w-full max-w-7xl mx-auto flex-1 min-h-0 flex flex-col">
          {/* Saludo + estado de turno */}
          <PosHeader
            shiftOpen={!!currentShift}
            openingCashLabel={currentShift ? formatMoney(currentShift.openingCash) : undefined}
            onOpenShift={() => setShowOpenShiftModal(true)}
          />

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
          
          <div className="grid grid-cols-1 lg:grid-cols-3 gap-4 flex-1 min-h-0 auto-rows-fr">
            {/* Columna Izquierda: Búsqueda y Productos */}
            <div className="lg:col-span-2 space-y-5 overflow-y-auto scrollbar-hide pb-2 pr-1">
              {/* Search - Optimizado para táctil */}
              <div className="bg-surface-light dark:bg-surface-dark border border-border-light dark:border-border-dark rounded-2xl p-4 shadow-soft">
                {/* ✅ MÓDULO 17.1: Hints de atajos */}
                <div className="mb-3 hidden lg:flex items-center gap-3 text-xs text-text-secondary dark:text-gray-400">
                  <span className="px-2 py-1 bg-background-light dark:bg-background-dark rounded-md border border-border-light dark:border-border-dark font-mono">F2</span>
                  <span>Buscar</span>
                  <span className="px-2 py-1 bg-background-light dark:bg-background-dark rounded-md border border-border-light dark:border-border-dark font-mono">Ctrl+Enter</span>
                  <span>Finalizar</span>
                </div>
                
                {/* Campo de búsqueda + botones */}
                <div className="flex flex-col gap-2">
                  <div className="flex gap-2">
                    <div className="flex-1 relative">
                    <Search className="absolute left-4 top-1/2 -translate-y-1/2 text-text-secondary w-5 h-5" />
                    <input
                      ref={searchInputRef}
                      id="product-search"
                      type="text"
                      autoFocus
                      placeholder="Buscar producto por nombre, código..."
                      value={query}
                      onChange={(e) => setQuery(e.target.value)}
                      onKeyDown={(e) => {
                        if (e.key === 'Enter') {
                          e.stopPropagation(); // Evitar que usePosShortcuts duplique la acción
                          const currentQuery = query.trim();

                          // Barcode rápido: si parece código de barras, buscar directo sin esperar debounce
                          if (/^\d{8,}$/.test(currentQuery)) {
                            const barcodeQuery = currentQuery;
                            setQuery('');
                            setProducts([]);
                            // Búsqueda directa por barcode (no depende del estado products)
                            fetch(`/api/inventory?query=${encodeURIComponent(barcodeQuery)}&active=true`)
                              .then(res => res.ok ? res.json() : null)
                              .then(data => {
                                const found = data?.products || [];
                                if (found.length === 1) {
                                  addToCart(found[0]);
                                } else if (found.length > 1) {
                                  setProducts(found);
                                  setQuery(barcodeQuery);
                                } else {
                                  toast.error(`Código no encontrado: ${barcodeQuery}`);
                                }
                              })
                              .catch(() => toast.error('Error al buscar producto'));
                            return;
                          }

                          if (products.length === 1) {
                            // Dedup: evitar doble agregado si debounce ya lo hizo
                            const now = Date.now();
                            if (now - lastScanAddRef.current < 500) {
                              setQuery('');
                              setProducts([]);
                              return;
                            }
                            lastScanAddRef.current = now;
                            addToCart(products[0]);
                            setQuery('');
                            setProducts([]);
                            // Mantener focus para escaneo continuo con pistola
                          } else if (products.length > 1) {
                            handleSearch();
                          } else if (currentQuery === '' && cart.length > 0 && currentShift) {
                            // Input vacío + carrito con productos → abrir checkout
                            handleCheckout();
                          } else if (currentQuery.length >= 2) {
                            // Texto que no es barcode, sin resultados aún → buscar manualmente
                            handleSearch();
                          }
                        }
                      }}
                      className="w-full h-12 md:h-14 pl-12 pr-4 bg-background-light dark:bg-background-dark text-text-main dark:text-text-light border border-transparent rounded-xl placeholder:text-text-secondary/70 focus:outline-none focus:bg-surface-light dark:focus:bg-surface-dark focus:border-primary focus:ring-2 focus:ring-primary/20 text-base md:text-sm"
                      style={{ fontSize: '16px' }}
                    />
                  </div>
                  <button
                    onClick={handleSearch}
                    disabled={loading}
                    className="h-12 md:h-14 px-4 md:px-6 bg-primary text-white rounded-xl font-semibold hover:bg-primary-hover disabled:opacity-50 disabled:cursor-not-allowed transition-colors touch-manipulation"
                  >
                    {loading ? 'Buscando...' : 'Buscar'}
                  </button>
                </div>
                {/* Venta libre: producto no registrado en inventario */}
                <button
                  onClick={() => {
                    setFreeItemName('');
                    setFreeItemPrice('');
                    setFreeItemQty('1');
                    setShowFreeItemModal(true);
                  }}
                  title="Vender producto sin registrar en inventario"
                  className="w-full h-10 px-4 bg-transparent border border-dashed border-primary/50 text-primary rounded-xl font-medium hover:bg-primary/10 hover:border-primary transition-colors touch-manipulation flex items-center justify-center gap-2 text-sm"
                >
                  <span className="text-lg font-bold">+</span> Venta libre (producto no registrado)
                </button>
                </div>
              </div>

              {/* Banner (se oculta durante una búsqueda) */}
              {!query.trim() && <PosBanner />}

              {/* Categorías del inventario */}
              {currentShift && !query.trim() && posTab === 'products' && (
                <CategoryChips selected={selectedCategory} onSelect={setSelectedCategory} />
              )}

              {/* ✅ MÓDULO F3: Tabs Productos/Servicios */}
              {servicesEnabled && currentShift && !query.trim() && (
                <div className="flex gap-2 bg-surface-light dark:bg-surface-dark border border-border-light dark:border-border-dark rounded-2xl p-1.5 shadow-soft">
                  <button
                    onClick={() => setPosTab('products')}
                    className={`flex-1 flex items-center justify-center gap-2 py-2 px-4 rounded-xl font-medium transition-colors ${
                      posTab === 'products'
                        ? 'bg-primary text-white'
                        : 'text-text-secondary hover:bg-background-light dark:hover:bg-background-dark'
                    }`}
                  >
                    <ShoppingCart className="w-4 h-4" />
                    Productos
                  </button>
                  <button
                    onClick={() => setPosTab('services')}
                    className={`flex-1 flex items-center justify-center gap-2 py-2 px-4 rounded-xl font-medium transition-colors ${
                      posTab === 'services'
                        ? 'bg-primary text-white'
                        : 'text-text-secondary hover:bg-background-light dark:hover:bg-background-dark'
                    }`}
                  >
                    <Wrench className="w-4 h-4" />
                    Servicios
                    {services.length > 0 && (
                      <span className="text-xs bg-monterrial-gold text-monterrial-forest font-semibold px-1.5 py-0.5 rounded-full">
                        {services.length}
                      </span>
                    )}
                  </button>
                </div>
              )}

              {/* ✅ MÓDULO 17.2: Quick Sell Grid - Oculto cuando hay búsqueda activa */}
              {currentShift && !query.trim() && posTab === 'products' && !selectedCategory && (
                <QuickSellGrid 
                  onAddProduct={handleAddFromQuickSell}
                  disabled={!currentShift}
                />
              )}

              {/* Productos de la categoría seleccionada */}
              {currentShift && !query.trim() && posTab === 'products' && selectedCategory && (
                <div>
                  <div className="mb-3 flex items-center justify-between">
                    <h3 className="text-lg font-bold text-text-main dark:text-text-light">{selectedCategory}</h3>
                    <button
                      onClick={() => setSelectedCategory(null)}
                      className="rounded-full bg-surface-light dark:bg-surface-dark border border-border-light dark:border-border-dark px-3 py-1 text-xs font-semibold text-primary hover:bg-primary/10"
                    >
                      Ver todo
                    </button>
                  </div>
                  {loadingCategory ? (
                    <div className="py-10 text-center text-sm text-text-secondary">Cargando productos...</div>
                  ) : categoryProducts.length === 0 ? (
                    <div className="py-10 text-center text-sm text-text-secondary">No hay productos activos en esta categoría</div>
                  ) : (
                    <div className="grid grid-cols-2 sm:grid-cols-3 xl:grid-cols-4 gap-3">
                      {categoryProducts.map((sp) => renderProductCard(sp, () => addToCart(sp)))}
                    </div>
                  )}
                </div>
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
                <div>
                  <h3 className="mb-3 text-lg font-bold text-text-main dark:text-text-light">
                    Resultados de búsqueda <span className="text-sm font-medium text-text-secondary">({products.length})</span>
                  </h3>
                  <div className="grid grid-cols-2 sm:grid-cols-3 xl:grid-cols-4 gap-3">
                    {products.map((sp) => renderProductCard(sp, () => {
                      addToCart(sp);
                      setQuery('');
                      setProducts([]);
                      searchInputRef.current?.focus();
                    }))}
                  </div>
                </div>
              )}

              {!loading && query && products.length === 0 && (
                <div className="text-center py-12 text-text-secondary">
                  No se encontraron productos
                </div>
              )}
            </div>

            {/* Columna Derecha: Carrito Desktop/Tablet */}
            <div className="lg:col-span-1 h-full overflow-hidden flex flex-col pb-1">
              <CartPanel
                cart={cart}
                onUpdateQuantity={changeQuantityByDelta}
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
              className="md:hidden fixed bottom-6 right-6 z-30 bg-primary hover:bg-primary-hover text-white px-6 py-4 rounded-full shadow-2xl flex items-center gap-3 font-semibold transition-all active:scale-95"
            >
              <ShoppingCart className="w-6 h-6" />
              <span>Carrito ({cart.length})</span>
              <span className="text-white/80">• {formatMoney(getCartTotal(cart, globalDiscount, appliedCoupon))}</span>
            </button>
          )}

          {/* ✅ MÓDULO 17.3: Mobile Cart Drawer */}
          <MobileCartDrawer
            isOpen={mobileCartOpen}
            onClose={() => setMobileCartOpen(false)}
            cart={cart}
            onUpdateQuantity={changeQuantityByDelta}
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
        <div className="fixed inset-0 bg-black/50 backdrop-blur-sm flex items-center justify-center z-50 p-2 sm:p-4">
          <div className="bg-white rounded-2xl shadow-strong w-full max-w-md max-h-[95vh] flex flex-col">
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
              <div className="rounded-2xl bg-monterrial-forest p-4 text-monterrial-cream">
                <div className="text-xs font-semibold uppercase tracking-wider text-monterrial-gold mb-0.5">Total a pagar</div>
                <div className="text-3xl font-bold">
                  {formatMoney(getCartTotal(cart, globalDiscount, appliedCoupon))}
                </div>
                {getCartIcbper(cart) > 0 && (
                  <div className="text-xs text-monterrial-cream/70 mt-0.5">
                    Incluye ICBPER bolsas {formatMoney(getCartIcbper(cart))}
                  </div>
                )}
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
                    { value: 'MIXED', label: 'Mixto', icon: '🔀' },
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
                        if (method.value === 'MIXED') {
                          setMixedSplits([
                            { method: 'CASH', amount: '' },
                            { method: 'YAPE', amount: '' },
                          ]);
                        }
                      }}
                      disabled={!currentShift && method.value !== 'FIADO'}
                      className={`py-2 px-2 rounded-xl border-2 text-sm font-medium transition-colors disabled:opacity-50 disabled:cursor-not-allowed ${
                        paymentMethod === method.value
                          ? 'border-primary bg-primary/10 text-primary'
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
                <div className="bg-gray-50 rounded-xl p-3">
                  <label className="block text-sm font-medium text-gray-700 mb-1.5">
                    Pagó con (S/)
                  </label>
                  <input
                    type="number"
                    step="0.01"
                    value={amountPaid}
                    onChange={(e) => setAmountPaid(e.target.value)}
                    className="w-full px-3 py-2 border border-gray-300 rounded-xl text-lg focus:ring-2 focus:ring-primary/40 focus:border-primary"
                    placeholder="0.00"
                    autoFocus
                    onKeyDown={(e) => {
                      if (e.key === 'Enter' && !processing) {
                        e.stopPropagation();
                        handleConfirmPayment();
                      }
                    }}
                  />
                  
                  {/* Vuelto */}
                  {amountPaid && parseFloat(amountPaid) >= getCartTotal(cart, globalDiscount, appliedCoupon) && (
                    <div className="mt-2 p-2 bg-primary/10 border border-primary/30 rounded-xl flex items-center justify-between">
                      <span className="text-sm text-primary">Vuelto:</span>
                      <span className="text-xl font-bold text-primary">
                        {formatMoney(parseFloat(amountPaid) - getCartTotal(cart, globalDiscount, appliedCoupon))}
                      </span>
                    </div>
                  )}

                  {amountPaid && (() => {
                    const totalRounded = Math.round(getCartTotal(cart, globalDiscount, appliedCoupon) * 100) / 100;
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
              {paymentMethod !== 'CASH' && paymentMethod !== 'FIADO' && paymentMethod !== 'MIXED' && (
                <div className="p-3 bg-primary/10 border border-primary/30 rounded-xl">
                  <p className="text-sm text-primary">
                    ✓ Pago con <strong>{paymentMethod}</strong>
                  </p>
                </div>
              )}

              {/* ✅ Pago Mixto: inputs de splits */}
              {paymentMethod === 'MIXED' && (
                <div className="bg-purple-50 rounded-xl p-3 border border-purple-200">
                  <label className="block text-sm font-medium text-gray-700 mb-2">
                    Dividir pago
                  </label>
                  <div className="space-y-2">
                    {mixedSplits.map((split, idx) => (
                      <div key={idx} className="flex gap-2 items-center">
                        <select
                          value={split.method}
                          onChange={(e) => {
                            const updated = [...mixedSplits];
                            updated[idx] = { ...updated[idx], method: e.target.value as any };
                            setMixedSplits(updated);
                          }}
                          className="w-28 px-2 py-1.5 border border-gray-300 rounded-xl text-sm focus:ring-2 focus:ring-primary/40 focus:border-primary"
                        >
                          <option value="CASH">Efectivo</option>
                          <option value="YAPE">Yape</option>
                          <option value="PLIN">Plin</option>
                          <option value="CARD">Tarjeta</option>
                        </select>
                        <div className="relative flex-1">
                          <span className="absolute left-2 top-1/2 -translate-y-1/2 text-gray-400 text-sm">S/</span>
                          <input
                            type="number"
                            step="0.01"
                            min="0.01"
                            value={split.amount}
                            onChange={(e) => {
                              const updated = [...mixedSplits];
                              updated[idx] = { ...updated[idx], amount: e.target.value };
                              setMixedSplits(updated);
                            }}
                            className="w-full pl-7 pr-2 py-1.5 border border-gray-300 rounded-xl text-sm focus:ring-2 focus:ring-primary/40 focus:border-primary"
                            placeholder="0.00"
                            autoFocus={idx === 0}
                            onKeyDown={(e) => {
                              if (e.key === 'Enter' && !processing) {
                                e.stopPropagation();
                                // Si hay siguiente split, enfocarlo; si no, confirmar
                                const nextInput = document.getElementById(`mixed-split-${idx + 1}`);
                                if (nextInput) {
                                  nextInput.focus();
                                } else {
                                  handleConfirmPayment();
                                }
                              }
                            }}
                            id={`mixed-split-${idx}`}
                          />
                        </div>
                        {mixedSplits.length > 2 && (
                          <button
                            onClick={() => setMixedSplits(mixedSplits.filter((_, i) => i !== idx))}
                            className="text-red-400 hover:text-red-600 p-1"
                            title="Quitar"
                          >
                            ✕
                          </button>
                        )}
                      </div>
                    ))}
                  </div>

                  {mixedSplits.length < 4 && (
                    <button
                      onClick={() => {
                        const usedMethods = mixedSplits.map(s => s.method);
                        const available = (['CASH', 'YAPE', 'PLIN', 'CARD'] as const).find(m => !usedMethods.includes(m));
                        setMixedSplits([...mixedSplits, { method: available || 'CASH', amount: '' }]);
                      }}
                      className="mt-2 text-xs text-purple-600 hover:text-purple-800 font-medium"
                    >
                      + Agregar otro método
                    </button>
                  )}

                  {/* Resumen de pago mixto */}
                  {(() => {
                    const totalVenta = getCartTotal(cart, globalDiscount, appliedCoupon);
                    const totalSplits = mixedSplits.reduce((sum, s) => sum + (parseFloat(s.amount) || 0), 0);
                    const totalSplitsRounded = Math.round(totalSplits * 100) / 100;
                    const totalVentaRounded = Math.round(totalVenta * 100) / 100;
                    const diff = totalSplitsRounded - totalVentaRounded;

                    return (
                      <div className="mt-3 pt-2 border-t border-purple-200 space-y-1">
                        <div className="flex justify-between text-sm">
                          <span className="text-gray-600">Suma de pagos:</span>
                          <span className={`font-medium ${totalSplitsRounded >= totalVentaRounded ? 'text-primary' : 'text-red-600'}`}>
                            {formatMoney(totalSplitsRounded)}
                          </span>
                        </div>
                        {totalSplitsRounded > 0 && totalSplitsRounded < totalVentaRounded && (
                          <div className="text-xs text-red-600">
                            ⚠️ Falta: {formatMoney(totalVentaRounded - totalSplitsRounded)}
                          </div>
                        )}
                        {diff > 0 && (
                          <div className="flex justify-between text-sm">
                            <span className="text-primary">Vuelto:</span>
                            <span className="font-bold text-primary">{formatMoney(diff)}</span>
                          </div>
                        )}
                      </div>
                    );
                  })()}
                </div>
              )}

              {/* Selector de cliente para FIADO */}
              {paymentMethod === 'FIADO' && (
                <div className="bg-orange-50 rounded-xl p-3 border border-orange-200">
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
                      className="w-full py-2 px-3 border-2 border-dashed border-orange-300 rounded-xl text-orange-600 hover:border-orange-400 text-sm"
                    >
                      + Seleccionar Cliente
                    </button>
                  )}
                </div>
              )}

              {/* ✅ MÓDULO PH4: Receptor de medicamentos (farmacia/ONG) */}
              {(patientsEnabled || controlledBookEnabled) && (
                <div className="bg-teal-50 rounded-xl p-3 border border-teal-200">
                  <label className="block text-sm font-medium text-teal-800 mb-2">
                    Receptor / Paciente
                  </label>
                  {selectedPatient ? (
                    <div className="flex justify-between items-start bg-white p-2 rounded border border-teal-200">
                      <div>
                        <div className="font-medium text-gray-900 text-sm">{selectedPatient.name}</div>
                        <div className="text-xs text-gray-500">DNI: {selectedPatient.dni}</div>
                        {patientConsultReason && (
                          <div className="text-xs text-teal-600 mt-0.5">Motivo: {patientConsultReason}</div>
                        )}
                      </div>
                      <div className="flex flex-col gap-1 ml-2 flex-shrink-0">
                        <button
                          onClick={openPatientModal}
                          className="text-teal-600 hover:text-teal-800 text-xs"
                        >
                          Editar
                        </button>
                        <button
                          onClick={handleClearPatient}
                          className="text-red-400 hover:text-red-600 text-xs"
                        >
                          Quitar
                        </button>
                      </div>
                    </div>
                  ) : (
                    <button
                      onClick={openPatientModal}
                      className="w-full py-2 px-3 border-2 border-dashed border-teal-300 rounded-xl text-teal-600 hover:border-teal-400 text-sm"
                    >
                      + Registrar receptor
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
                className="flex-1 px-4 py-2.5 border border-gray-300 rounded-xl font-medium text-gray-700 hover:bg-gray-100 text-sm"
              >
                Cancelar
              </button>
              <button
                onClick={handleConfirmPayment}
                disabled={processing}
                className="flex-1 px-4 py-2.5 bg-primary text-white rounded-xl font-medium hover:bg-primary-hover disabled:opacity-50 disabled:cursor-not-allowed text-sm"
              >
                {processing ? 'Procesando...' : '✓ Confirmar'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Modal abrir turno */}
      {showOpenShiftModal && (
        <div className="fixed inset-0 bg-black/50 backdrop-blur-sm flex items-center justify-center z-50">
          <div className="bg-white rounded-xl p-6 w-full max-w-md">
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
                  className="w-full px-3 py-2 border border-gray-300 rounded-xl focus:ring-2 focus:ring-primary/40 focus:border-primary"
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
                  className="flex-1 px-4 py-2 border border-gray-300 rounded-xl hover:bg-gray-50"
                >
                  Cancelar
                </button>
                <button
                  onClick={handleOpenShift}
                  className="flex-1 px-4 py-2 bg-primary text-white rounded-xl hover:bg-primary-hover"
                >
                  Abrir Turno
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Modal Venta Libre */}
      {showFreeItemModal && (
        <div className="fixed inset-0 bg-black/50 backdrop-blur-sm flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-xl shadow-2xl w-full max-w-sm p-6">
            <h2 className="text-lg font-bold text-gray-900 mb-1">Venta libre</h2>
            <p className="text-sm text-gray-500 mb-4">Producto no registrado en inventario</p>

            <div className="space-y-3">
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  Descripción del producto <span className="text-red-500">*</span>
                </label>
                <input
                  type="text"
                  autoFocus
                  value={freeItemName}
                  onChange={(e) => setFreeItemName(e.target.value)}
                  placeholder="Ej: Uniforme talla M"
                  className="w-full px-3 py-2 border border-gray-300 rounded-xl focus:outline-none focus:ring-2 focus:ring-primary/40 focus:border-primary text-sm"
                  onKeyDown={(e) => e.key === 'Enter' && document.getElementById('freeItemPrice')?.focus()}
                />
              </div>

              <div className="flex gap-3">
                <div className="flex-1">
                  <label className="block text-sm font-medium text-gray-700 mb-1">
                    Precio (S/) <span className="text-red-500">*</span>
                  </label>
                  <input
                    id="freeItemPrice"
                    type="number"
                    min="0.01"
                    step="0.01"
                    value={freeItemPrice}
                    onChange={(e) => setFreeItemPrice(e.target.value)}
                    placeholder="0.00"
                    className="w-full px-3 py-2 border border-gray-300 rounded-xl focus:outline-none focus:ring-2 focus:ring-primary/40 focus:border-primary text-sm"
                    onKeyDown={(e) => e.key === 'Enter' && document.getElementById('freeItemQty')?.focus()}
                  />
                </div>
                <div className="w-24">
                  <label className="block text-sm font-medium text-gray-700 mb-1">
                    Cantidad
                  </label>
                  <input
                    id="freeItemQty"
                    type="number"
                    min="1"
                    step="1"
                    value={freeItemQty}
                    onChange={(e) => setFreeItemQty(e.target.value)}
                    className="w-full px-3 py-2 border border-gray-300 rounded-xl focus:outline-none focus:ring-2 focus:ring-primary/40 focus:border-primary text-sm"
                    onKeyDown={(e) => {
                      if (e.key === 'Enter') {
                        const name = freeItemName.trim();
                        const price = parseFloat(freeItemPrice);
                        const qty = Math.max(1, parseInt(freeItemQty) || 1);
                        if (!name) { toast.error('Ingresa una descripción'); return; }
                        if (!price || price <= 0) { toast.error('Ingresa un precio válido'); return; }
                        addFreeItemToCart(name, price, qty);
                        setShowFreeItemModal(false);
                        setTimeout(() => searchInputRef.current?.focus(), 50);
                      }
                    }}
                  />
                </div>
              </div>
            </div>

            <div className="flex gap-3 mt-5">
              <button
                onClick={() => {
                  setShowFreeItemModal(false);
                  setTimeout(() => searchInputRef.current?.focus(), 50);
                }}
                className="flex-1 py-2.5 border border-gray-300 rounded-xl text-gray-700 font-medium hover:bg-gray-50 transition-colors"
              >
                Cancelar
              </button>
              <button
                onClick={() => {
                  const name = freeItemName.trim();
                  const price = parseFloat(freeItemPrice);
                  const qty = Math.max(1, parseInt(freeItemQty) || 1);
                  if (!name) { toast.error('Ingresa una descripción'); return; }
                  if (!price || price <= 0) { toast.error('Ingresa un precio válido'); return; }
                  addFreeItemToCart(name, price, qty);
                  setShowFreeItemModal(false);
                  setTimeout(() => searchInputRef.current?.focus(), 50);
                }}
                className="flex-1 py-2.5 bg-primary text-white rounded-xl font-medium hover:bg-primary-hover transition-colors"
              >
                Agregar al carrito
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Sale Complete Modal */}
      {showSaleCompleteModal && completedSale && (
        <div
          className="fixed inset-0 bg-black/50 backdrop-blur-sm flex items-center justify-center z-50 p-4"
          tabIndex={-1}
          ref={(el) => el?.focus()}
          onKeyDown={(e) => {
            if (e.key === 'Enter') {
              e.preventDefault();
              setShowSaleCompleteModal(false);
              setCompletedSale(null);
              searchInputRef.current?.focus();
            }
          }}
        >
          <div className="bg-white rounded-xl shadow-xl max-w-md w-full p-6">
            <div className="text-center mb-6">
              <div className="w-16 h-16 bg-primary/10 rounded-full flex items-center justify-center mx-auto mb-4">
                <svg className="w-8 h-8 text-primary" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
                </svg>
              </div>
              <h3 className="text-2xl font-bold text-gray-900 mb-2">¡Venta Completada!</h3>
              <p className="text-3xl font-bold text-primary">{formatMoney(completedSale.total)}</p>
            </div>

            <div className="space-y-3">
              <button
                onClick={async () => {
                  // ✅ D6: Thermal print via ESC/POS if desktop & configured
                  const desktop = (window as unknown as { desktop?: { 
                    isDesktop?: boolean; 
                    escpos?: { 
                      getConfig: () => Promise<{ mode: string; netHost: string | null; vendorId: number | null }>;
                      printSale: (id: string) => Promise<{ success: boolean; error?: string }>;
                    };
                  }})?.desktop;
                  
                  if (desktop?.isDesktop && desktop?.escpos) {
                    try {
                      const config = await desktop.escpos.getConfig();
                      console.log('[POS] ESC/POS config:', config);
                      
                      // Check if ESC/POS mode is configured
                      const isNetConfigured = config.mode === 'ESCPOS_NET' && config.netHost;
                      const isUsbConfigured = config.mode === 'ESCPOS_USB' && config.vendorId;
                      
                      if (isNetConfigured || isUsbConfigured) {
                        toast.info('Enviando a impresora...');
                        const result = await desktop.escpos.printSale(completedSale.id);
                        if (result.success) {
                          toast.success('Ticket impreso correctamente');
                          // Marcar como impreso en la base de datos
                          fetch(`/api/sales/${completedSale.id}/mark-printed`, { method: 'POST' }).catch(() => {});
                        } else {
                          toast.error(result.error || 'Error al imprimir');
                          // Fallback to web view
                          window.open(`/receipt/${completedSale.id}`, '_blank');
                        }
                        return;
                      } else {
                        // Mode is HTML or not properly configured
                        console.log('[POS] ESC/POS not configured, mode:', config.mode);
                      }
                    } catch (err) {
                      console.error('[POS] ESC/POS print error:', err);
                    }
                  }

                  // ✅ Print Service local: intentar impresión directa vía servicio local
                  try {
                    const statusRes = await fetch('http://127.0.0.1:12121/status', { signal: AbortSignal.timeout(1500) });
                    if (statusRes.ok) {
                      const { pairingToken } = await statusRes.json();
                      if (!pairingToken) throw new Error('Servicio de impresion sin vinculacion segura');
                      // Servicio activo → obtener datos de la venta y enviar
                      toast.info('Enviando a impresora...');
                      const saleRes = await fetch(`/api/sales/${completedSale.id}`);
                      if (saleRes.ok) {
                        const { sale } = await saleRes.json();
                        const createdAt = new Date(sale.createdAt);
                        const printData = {
                          store: {
                            name: sale.store?.name || 'Mi Tienda',
                            ruc: sale.store?.ruc || undefined,
                            address: sale.store?.address || undefined,
                            phone: sale.store?.phone || undefined,
                            slogan: sale.store?.settings?.ticketFooter || undefined,
                          },
                          saleNumber: String(sale.saleNumber),
                          date: createdAt.toLocaleDateString('es-PE', { day: '2-digit', month: '2-digit', year: 'numeric' }),
                          time: createdAt.toLocaleTimeString('es-PE', { hour: '2-digit', minute: '2-digit', second: '2-digit', hour12: false }),
                          items: sale.items.map((it: { productName: string; quantity: number; unitPrice: number; subtotal: number; totalLine: number; discountAmount?: number; unitSymbol?: string }) => ({
                            name: it.productName,
                            quantity: Number(it.quantity),
                            unitPrice: Number(it.unitPrice),
                            subtotal: Number(it.totalLine),
                            discount: it.discountAmount ? Number(it.discountAmount) : undefined,
                            unit: it.unitSymbol || undefined,
                          })),
                          subtotal: Number(sale.subtotal),
                          totalDiscount: Number(sale.discountTotal || 0),
                          total: Number(sale.total),
                          payment: {
                            method: sale.paymentMethod,
                            amountPaid: sale.amountPaid ? Number(sale.amountPaid) : undefined,
                            change: sale.changeAmount ? Number(sale.changeAmount) : undefined,
                            customerName: sale.customer?.name || undefined,
                          },
                          cashierName: sale.user?.name || undefined,
                        };
                        const printRes = await fetch('http://127.0.0.1:12121/print', {
                          method: 'POST',
                          headers: {
                            'Content-Type': 'application/json',
                            'X-MarketPOS-Token': pairingToken,
                          },
                          body: JSON.stringify(printData),
                        });
                        const printResult = await printRes.json();
                        if (printResult.success) {
                          toast.success('Ticket impreso correctamente');
                          fetch(`/api/sales/${completedSale.id}/mark-printed`, { method: 'POST' }).catch(() => {});
                          return;
                        } else {
                          toast.error(printResult.error || 'Error al imprimir');
                        }
                      }
                    }
                  } catch {
                    // Print service no disponible → fallback silencioso a web
                    console.log('[POS] Print service no disponible, usando vista web');
                  }

                  // Fallback: Open receipt in browser/new window
                  window.open(`/receipt/${completedSale.id}`, '_blank');
                }}
                className="w-full flex items-center justify-center gap-2 px-4 py-3 bg-primary text-white rounded-xl hover:bg-primary-hover transition-colors font-medium"
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
                  searchInputRef.current?.focus();
                }}
                className="w-full px-4 py-3 bg-gray-200 text-gray-700 rounded-xl hover:bg-gray-300 transition-colors font-medium flex items-center justify-center gap-2"
              >
                Nueva Venta
                <span className="px-1.5 py-0.5 bg-gray-300 rounded text-xs font-mono">Enter</span>
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Modal Buscar Cliente */}
      {showCustomerModal && (
        <div className="fixed inset-0 bg-black/50 backdrop-blur-sm flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-2xl shadow-strong w-full max-w-md max-h-[80vh] flex flex-col">
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
                className="w-full px-3 py-2 border rounded-xl"
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
                          const saleTotal = getCartTotal(cart, globalDiscount, appliedCoupon);
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
                      className="w-full text-left p-3 border rounded-xl hover:bg-gray-50 transition-colors"
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
                className="w-full py-2 px-4 bg-primary text-white rounded-xl hover:bg-primary-hover"
              >
                + Crear Nuevo Cliente
              </button>
              <button
                onClick={() => setShowCustomerModal(false)}
                className="w-full py-2 px-4 border border-gray-300 rounded-xl hover:bg-gray-50"
              >
                Cancelar
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Modal Crear Cliente */}
      {showCreateCustomerModal && (
        <div className="fixed inset-0 bg-black/50 backdrop-blur-sm flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-2xl shadow-strong w-full max-w-md p-6">
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
                  className="w-full px-3 py-2 border rounded-xl"
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
                  className="w-full px-3 py-2 border rounded-xl"
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
                className="flex-1 py-2 px-4 border border-gray-300 rounded-xl hover:bg-gray-50"
                disabled={creatingCustomer}
              >
                Cancelar
              </button>
              <button
                onClick={handleCreateCustomer}
                className="flex-1 py-2 px-4 bg-primary text-white rounded-xl hover:bg-primary-hover disabled:opacity-50"
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
        <div className="fixed inset-0 bg-black/50 backdrop-blur-sm flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-2xl shadow-strong w-full max-w-md p-6">
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
                  className={`py-2 px-4 rounded-xl border-2 font-medium transition-colors ${
                    discountType === 'PERCENT'
                      ? 'border-primary bg-primary/10 text-primary'
                      : 'border-gray-200 bg-white text-gray-700 hover:border-gray-300'
                  }`}
                >
                  Porcentaje (%)
                </button>
                <button
                  onClick={() => setDiscountType('AMOUNT')}
                  className={`py-2 px-4 rounded-xl border-2 font-medium transition-colors ${
                    discountType === 'AMOUNT'
                      ? 'border-primary bg-primary/10 text-primary'
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
                className="w-full px-4 py-3 border border-gray-300 rounded-xl text-lg focus:ring-2 focus:ring-primary/40 focus:border-primary"
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
                <div className="mb-4 p-3 bg-primary/10 border border-primary/30 rounded-xl">
                  <div className="text-sm text-primary mb-1">Vista previa</div>
                  <div className="text-xs text-primary space-y-1">
                    <div className="flex justify-between">
                      <span>Subtotal:</span>
                      <span>S/ {subtotal.toFixed(2)}</span>
                    </div>
                    <div className="flex justify-between font-medium">
                      <span>Descuento:</span>
                      <span>-S/ {previewDiscount.toFixed(2)}</span>
                    </div>
                    <div className="flex justify-between font-bold text-primary pt-1 border-t border-blue-300">
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
                className="flex-1 px-4 py-3 border border-gray-300 rounded-xl font-medium text-gray-700 hover:bg-gray-50"
              >
                Cancelar
              </button>
              <button
                onClick={handleApplyDiscount}
                className="flex-1 px-4 py-3 bg-primary text-white rounded-xl font-medium hover:bg-primary-hover"
              >
                Aplicar
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Modal de Descuento Global */}
      {showGlobalDiscountModal && (() => {
        const maxDiscount = getSubtotalBeforeDiscounts(cart) - getTotalItemDiscounts(cart);
        
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
            const itemDiscounts = getTotalItemDiscounts(cart);
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
          <div className="fixed inset-0 bg-black/50 backdrop-blur-sm flex items-center justify-center z-50">
            <div className="bg-white rounded-xl shadow-xl max-w-md w-full mx-4">
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
                  <div className="bg-orange-50 border border-orange-200 rounded-xl p-3">
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
                        className={`flex-1 py-2 px-4 rounded-xl font-medium transition-colors ${
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
                        className={`flex-1 py-2 px-4 rounded-xl font-medium transition-colors ${
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
                      className="w-full px-4 py-3 border border-gray-300 rounded-xl focus:ring-2 focus:ring-orange-500 focus:border-transparent text-lg"
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
                    className="flex-1 px-4 py-3 border border-gray-300 rounded-xl font-medium text-gray-700 hover:bg-gray-50"
                  >
                    Cancelar
                  </button>
                  <button
                    onClick={handleApplyGlobalDiscount}
                    className="flex-1 px-4 py-3 bg-orange-600 text-white rounded-xl font-medium hover:bg-orange-700"
                  >
                    Aplicar
                  </button>
                </div>
              </div>
            </div>
          </div>
        );
      })()}

      {/* ✅ MÓDULO PH6: Modal de confirmación de venta Rx */}
      {showRxModal && rxPendingProduct && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50">
          <div className="w-full max-w-md rounded-xl bg-white p-6 shadow-xl">
            {/* Header */}
            <div className="mb-4 flex items-start gap-3">
              <div className="flex h-10 w-10 flex-shrink-0 items-center justify-center rounded-full bg-red-100">
                <svg className="h-5 w-5 text-red-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 9v2m0 4h.01M10.29 3.86L1.82 18a2 2 0 001.71 3h16.94a2 2 0 001.71-3L13.71 3.86a2 2 0 00-3.42 0z" />
                </svg>
              </div>
              <div>
                <h3 className="font-semibold text-gray-900">Producto con receta médica</h3>
                <p className="mt-0.5 text-sm text-gray-600">
                  <span className="font-medium">{rxPendingProduct.product.name}</span> requiere receta médica.
                  ¿Confirmar la venta?
                </p>
              </div>
            </div>

            {/* Campos opcionales */}
            <div className="mb-4 space-y-3">
              <div>
                <label className="mb-1 block text-xs font-medium text-gray-700">
                  Nombre del paciente <span className="text-gray-400">(opcional)</span>
                </label>
                <input
                  type="text"
                  value={rxPatientName}
                  onChange={(e) => setRxPatientName(e.target.value)}
                  placeholder="Ej. Juan Pérez"
                  className="w-full rounded-xl border px-3 py-2 text-sm focus:border-primary focus:outline-none"
                />
              </div>
              <div>
                <label className="mb-1 block text-xs font-medium text-gray-700">
                  Número de receta{' '}
                  {controlledBookEnabled ? (
                    <span className="text-red-500">(obligatorio)</span>
                  ) : (
                    <span className="text-gray-400">(opcional)</span>
                  )}
                </label>
                <input
                  type="text"
                  value={rxPrescriptionNumber}
                  onChange={(e) => setRxPrescriptionNumber(e.target.value)}
                  placeholder="Ej. RX-2026-001"
                  className="w-full rounded-xl border px-3 py-2 text-sm focus:border-primary focus:outline-none"
                />
              </div>
              <div>
                <label className="mb-1 block text-xs font-medium text-gray-700">
                  Observación <span className="text-gray-400">(opcional)</span>
                </label>
                <textarea
                  value={rxObservation}
                  onChange={(e) => setRxObservation(e.target.value)}
                  placeholder="Ej. Receta presentada en físico"
                  rows={2}
                  className="w-full rounded-xl border px-3 py-2 text-sm focus:border-primary focus:outline-none"
                />
              </div>
            </div>

            {/* Acciones */}
            <div className="flex gap-3">
              <button
                onClick={() => {
                  setShowRxModal(false);
                  setRxPendingProduct(null);
                }}
                className="flex-1 rounded-xl border px-4 py-2 text-sm font-medium text-gray-700 hover:bg-gray-50"
              >
                Cancelar
              </button>
              <button
                onClick={() => {
                  if (controlledBookEnabled && !rxPrescriptionNumber.trim()) {
                    toast.error('Ingresa el número de receta');
                    return;
                  }
                  const sp = rxPendingProduct;
                  const rx = {
                    observation: rxObservation,
                    patientName: rxPatientName,
                    prescriptionNumber: rxPrescriptionNumber,
                  };
                  setShowRxModal(false);
                  setRxPendingProduct(null);
                  executeAddToCart(sp, rx);
                }}
                className="flex-1 rounded-xl bg-red-600 px-4 py-2 text-sm font-medium text-white hover:bg-red-700"
              >
                Confirmar venta Rx
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ✅ MÓDULO PH4: Modal Receptor / Paciente */}
      {showPatientModal && (
        <div className="fixed inset-0 bg-black/50 backdrop-blur-sm flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-2xl shadow-strong w-full max-w-md">
            <div className="flex items-center justify-between p-4 border-b">
              <h3 className="text-lg font-semibold text-gray-900">Receptor / Paciente</h3>
              <button
                onClick={() => setShowPatientModal(false)}
                className="text-gray-400 hover:text-gray-600"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <div className="p-4 space-y-4">
              {/* Búsqueda por DNI */}
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  DNI <span className="text-red-500">*</span>
                </label>
                <div className="flex gap-2">
                  <input
                    type="text"
                    value={patientDniSearch}
                    onChange={(e) => {
                      setPatientDniSearch(e.target.value);
                      setPatientSearchResult(null);
                      setPatientNotFound(false);
                      setShowNewPatientForm(false);
                    }}
                    onKeyDown={(e) => e.key === 'Enter' && handleSearchPatientByDni()}
                    placeholder="Ej. 12345678"
                    maxLength={20}
                    className="flex-1 px-3 py-2 border border-gray-300 rounded-xl text-sm focus:ring-2 focus:ring-teal-500"
                    autoFocus
                  />
                  <button
                    onClick={handleSearchPatientByDni}
                    disabled={searchingPatient || !patientDniSearch.trim()}
                    className="px-3 py-2 bg-teal-600 text-white rounded-xl text-sm hover:bg-teal-700 disabled:opacity-50"
                  >
                    {searchingPatient ? '...' : 'Buscar'}
                  </button>
                </div>
              </div>

              {/* Paciente encontrado */}
              {patientSearchResult && (
                <div className="space-y-2">
                  {/* Datos del paciente */}
                  <div className="p-3 bg-teal-50 border border-teal-200 rounded-xl flex items-start justify-between">
                    <div>
                      <div className="text-sm font-semibold text-teal-900">{patientSearchResult.name}</div>
                      <div className="text-xs text-teal-700 mt-0.5">DNI: {patientSearchResult.dni}</div>
                      {patientSearchResult.phone && (
                        <div className="text-xs text-teal-600">Tel: {patientSearchResult.phone}</div>
                      )}
                    </div>
                    {patientHistory.length > 0 && (
                      <span className="text-xs bg-teal-100 text-teal-700 px-1.5 py-0.5 rounded-full font-medium">
                        {patientHistory.length} visita{patientHistory.length !== 1 ? 's' : ''}
                      </span>
                    )}
                  </div>

                  {/* Historial de dispensaciones */}
                  {loadingHistory && (
                    <div className="text-xs text-gray-400 text-center py-2">Cargando historial...</div>
                  )}
                  {!loadingHistory && patientHistory.length > 0 && (
                    <div className="border border-gray-200 rounded-xl overflow-hidden">
                      <div className="px-2 py-1.5 bg-gray-50 border-b border-gray-200">
                        <span className="text-xs font-medium text-gray-600">Últimas dispensaciones</span>
                      </div>
                      <div className="max-h-36 overflow-y-auto divide-y divide-gray-100">
                        {patientHistory.map((entry) => (
                          <div key={entry.id} className="px-2 py-1.5 text-xs">
                            <div className="flex justify-between items-start gap-1">
                              <span className="font-medium text-gray-800 truncate">
                                {entry.genericName || entry.productName}
                                {entry.concentration && (
                                  <span className="text-gray-500"> {entry.concentration}</span>
                                )}
                              </span>
                              <span className="text-gray-400 flex-shrink-0">
                                {new Date(entry.dispensedAt).toLocaleDateString('es-PE', { day:'2-digit', month:'short', year:'2-digit' })}
                              </span>
                            </div>
                            {entry.consultReason && (
                              <div className="text-gray-500 mt-0.5 italic">↳ {entry.consultReason}</div>
                            )}
                          </div>
                        ))}
                      </div>
                    </div>
                  )}
                  {!loadingHistory && patientHistory.length === 0 && (
                    <div className="text-xs text-gray-400 text-center py-1">Sin dispensaciones previas</div>
                  )}
                </div>
              )}

              {/* Paciente no encontrado — formulario de registro */}
              {patientNotFound && showNewPatientForm && (
                <div className="space-y-3 border border-dashed border-gray-300 rounded-xl p-3">
                  <p className="text-xs text-gray-500">
                    No se encontró el DNI. Completa los datos para registrar al paciente.
                  </p>
                  <div>
                    <label className="block text-xs font-medium text-gray-700 mb-1">
                      Nombre completo <span className="text-red-500">*</span>
                    </label>
                    <input
                      type="text"
                      value={newPatientName}
                      onChange={(e) => setNewPatientName(e.target.value)}
                      className="w-full px-3 py-2 border border-gray-300 rounded-xl text-sm"
                      placeholder="Apellidos y nombres"
                    />
                  </div>
                  <div className="grid grid-cols-2 gap-2">
                    <div>
                      <label className="block text-xs font-medium text-gray-700 mb-1">Teléfono</label>
                      <input
                        type="text"
                        value={newPatientPhone}
                        onChange={(e) => setNewPatientPhone(e.target.value)}
                        className="w-full px-3 py-2 border border-gray-300 rounded-xl text-sm"
                        placeholder="Opcional"
                      />
                    </div>
                    <div>
                      <label className="block text-xs font-medium text-gray-700 mb-1">Género</label>
                      <select
                        value={newPatientGender}
                        onChange={(e) => setNewPatientGender(e.target.value)}
                        className="w-full px-3 py-2 border border-gray-300 rounded-xl text-sm"
                      >
                        <option value="">—</option>
                        <option value="M">Masculino</option>
                        <option value="F">Femenino</option>
                      </select>
                    </div>
                  </div>
                  <div className="grid grid-cols-2 gap-2">
                    <div>
                      <label className="block text-xs font-medium text-gray-700 mb-1">Fecha de nac.</label>
                      <input
                        type="text"
                        value={newPatientBirthDate}
                        onChange={(e) => setNewPatientBirthDate(e.target.value)}
                        className="w-full px-3 py-2 border border-gray-300 rounded-xl text-sm"
                        placeholder="DD/MM/AAAA"
                        maxLength={10}
                      />
                    </div>
                    <div className="flex items-end">
                      <p className="text-xs text-gray-400">Ej: 15/08/1990</p>
                    </div>
                  </div>
                  <div>
                    <label className="block text-xs font-medium text-gray-700 mb-1">Motivo de consulta</label>
                    <input
                      type="text"
                      value={patientConsultReason}
                      onChange={(e) => setPatientConsultReason(e.target.value)}
                      className="w-full px-3 py-2 border border-gray-300 rounded-xl text-sm"
                      placeholder="Ej: dolor de cabeza, fiebre... (opcional)"
                    />
                  </div>
                </div>
              )}

              {/* Motivo de consulta para paciente ya encontrado */}
              {patientSearchResult && (
                <div>
                  <label className="block text-xs font-medium text-gray-700 mb-1">Motivo de consulta</label>
                  <input
                    type="text"
                    value={patientConsultReason}
                    onChange={(e) => setPatientConsultReason(e.target.value)}
                    className="w-full px-3 py-2 border border-teal-200 rounded-xl text-sm"
                    placeholder="Ej: dolor de cabeza, fiebre... (opcional)"
                  />
                </div>
              )}
            </div>

            <div className="flex gap-3 p-4 border-t bg-gray-50">
              <button
                onClick={() => setShowPatientModal(false)}
                className="flex-1 py-2 px-4 border border-gray-300 rounded-xl text-sm font-medium text-gray-700 hover:bg-gray-100"
              >
                Cancelar
              </button>
              {patientSearchResult ? (
                <button
                  onClick={handleConfirmPatient}
                  className="flex-1 py-2 px-4 bg-teal-600 text-white rounded-xl text-sm font-medium hover:bg-teal-700"
                >
                  Seleccionar
                </button>
              ) : showNewPatientForm ? (
                <button
                  onClick={handleCreatePatient}
                  disabled={creatingPatient || !newPatientName.trim()}
                  className="flex-1 py-2 px-4 bg-teal-600 text-white rounded-xl text-sm font-medium hover:bg-teal-700 disabled:opacity-50"
                >
                  {creatingPatient ? 'Guardando...' : 'Registrar y seleccionar'}
                </button>
              ) : null}
            </div>
          </div>
        </div>
      )}

    </AuthLayout>
  );
}
