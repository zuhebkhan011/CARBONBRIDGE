export type AssistantRole = 'BUYER' | 'SELLER' | 'ADMIN';

export type AssistantActionCode =
  | 'POST_REQUIREMENT'
  | 'CREATE_LISTING'
  | 'REGISTER_BATCH'
  | 'MARKETPLACE'
  | 'SMART_MATCHING'
  | 'SHIPMENTS'
  | 'LOGISTICS'
  | 'DOCUMENTS'
  | 'AUCTIONS'
  | 'ORDERS'
  | 'PROFILE';

export interface AssistantAction {
  label: string;
  action: AssistantActionCode;
  path: string;
  description?: string;
}

export interface AssistantMessage {
  role: 'user' | 'assistant';
  content: string;
  timestamp: string;
}

export interface AssistantChatRequest {
  message: string;
  conversationId?: string;
  role?: AssistantRole;
}

export interface OnboardingStep {
  step: number;
  title: string;
  description: string;
  action?: AssistantAction;
}

export interface OnboardingCardData {
  title: string;
  subtitle: string;
  role: AssistantRole;
  steps: OnboardingStep[];
  quickPrompts: string[];
}

export type AssistantIntent = 'PLATFORM_GUIDANCE' | 'PERSONAL_INSIGHT' | 'GENERAL_QA' | 'NAVIGATION';

export interface BuyerPersonalizedContext {
  role: 'BUYER';
  hasSufficientData: boolean;
  reason?: string;
  activeRequirements: Array<{
    id: string;
    quantityTonnes: number;
    minPurity: number;
    deliveryAddress: string;
    status: string;
    intendedApplication?: string | null;
    budgetCeilingPerTon?: number | null;
    createdAt: string;
  }>;
  recentOrders: Array<{
    id: string;
    orderNumber: string;
    totalQuantity: number;
    totalPrice: number;
    overallStatus: string;
    createdAt: string;
  }>;
  preferenceSummary: {
    totalRequirements: number;
    totalOrders: number;
    typicalQuantityRange: { min: number; max: number; avg: number };
    typicalPurityRange: { min: number; max: number; avg: number };
    typicalLocations: string[];
    intendedUses: string[];
  };
}

export interface SellerPersonalizedContext {
  role: 'SELLER';
  hasSufficientData: boolean;
  reason?: string;
  activeListings: Array<{
    id: string;
    quantityTonnes: number;
    pricePerTon?: number | null;
    sellingMethod: string;
    status: string;
    createdAt: string;
  }>;
  inventorySummary: {
    totalBatches: number;
    totalAvailableTonnes: number;
    totalAllocatedTonnes: number;
    purityRange: { min: number; max: number };
  };
  recentSales: Array<{
    allocatedQuantity: number;
    pricePerTon: number;
    createdAt: string;
  }>;
  auctionActivity: Array<{
    id: string;
    reservePrice: number;
    currentHighestBid: number;
    status: string;
    bidsCount: number;
  }>;
  metrics: {
    totalListings: number;
    activeListings: number;
    soldListings: number;
  };
}

export type PersonalizedContext = BuyerPersonalizedContext | SellerPersonalizedContext;

export interface AssistantChatResponse {
  reply: string;
  suggestedActions: AssistantAction[];
  relatedFeatures: string[];
  conversationId: string;
  isNewUser?: boolean;
  onboardingCard?: OnboardingCardData;
  source?: 'GEMINI_AI' | 'DETERMINISTIC_FALLBACK';
  intent?: AssistantIntent;
  isPersonalized?: boolean;
}

export const VALID_ACTION_ROUTES: Record<AssistantActionCode, { defaultLabel: string; path: string; buyerOnly?: boolean; sellerOnly?: boolean }> = {
  POST_REQUIREMENT: {
    defaultLabel: 'Post Requirement',
    path: '/requirements/new',
    buyerOnly: true,
  },
  CREATE_LISTING: {
    defaultLabel: 'Create Listing',
    path: '/seller/listings/new',
    sellerOnly: true,
  },
  REGISTER_BATCH: {
    defaultLabel: 'Register CO2 Batch',
    path: '/seller/batches/new',
    sellerOnly: true,
  },
  MARKETPLACE: {
    defaultLabel: 'Browse Marketplace',
    path: '/marketplace',
  },
  SMART_MATCHING: {
    defaultLabel: 'Smart Matchmaker',
    path: '/dashboard',
    buyerOnly: true,
  },
  SHIPMENTS: {
    defaultLabel: 'Track Shipments',
    path: '/shipments',
  },
  LOGISTICS: {
    defaultLabel: 'Smart Logistics',
    path: '/seller/logistics',
    sellerOnly: true,
  },
  DOCUMENTS: {
    defaultLabel: 'CoA Documents',
    path: '/seller/documents',
    sellerOnly: true,
  },
  AUCTIONS: {
    defaultLabel: 'CO2 Auctions',
    path: '/seller/auctions',
    sellerOnly: true,
  },
  ORDERS: {
    defaultLabel: 'View Orders',
    path: '/orders',
  },
  PROFILE: {
    defaultLabel: 'Company Profile',
    path: '/profile',
  },
};
