export interface PublicCatalogStore {
  id: string;
  name: string;
  slug: string;
  whatsappNumber: string;
  logoUrl: string | null;
  bannerUrl: string | null;
  catalogUrl: string | null;
  facebookUrl?: string | null;
  instagramUrl?: string | null;
  tiktokUrl?: string | null;
  updatedAt: string;
}

export interface PublicCatalogProduct {
  id: string;
  localProductId: string;
  name: string;
  description: string | null;
  price: number;
  category: string;
  imageUrl: string | null;
  visible: boolean;
  updatedAt: string | null;
}

export interface PublicCatalogResponse {
  success: boolean;
  store: PublicCatalogStore;
  products: PublicCatalogProduct[];
}
