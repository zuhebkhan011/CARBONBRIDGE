import { GeoCoordinate } from '../../common/utils/geo.js';

export interface MatchingWeightsConfig {
  quantityFit: number;     // e.g. 0.20 (20%)
  purityFit: number;       // e.g. 0.25 (25%)
  priceFit: number;        // e.g. 0.20 (20%)
  distance: number;        // e.g. 0.15 (15%)
  availability: number;    // e.g. 0.10 (10%)
  certificate: number;     // e.g. 0.05 (5%)
  useCompatibility: number;// e.g. 0.05 (5%)
}

export const DEFAULT_MATCHING_WEIGHTS: MatchingWeightsConfig = {
  quantityFit: 0.20,
  purityFit: 0.25,
  priceFit: 0.20,
  distance: 0.15,
  availability: 0.10,
  certificate: 0.05,
  useCompatibility: 0.05,
};

export interface AIMatchScoreBreakdown {
  quantity: number;      // 0 - 20
  purity: number;        // 0 - 25
  price: number;         // 0 - 20
  distance: number;      // 0 - 15
  availability: number;  // 0 - 10
  certificate: number;   // 0 - 5
  useCompatibility: number; // 0 - 5
}

export interface AIMatchCandidate {
  listingId: string;
  batchId: string;
  batchNumber: string;
  sellerId: string;
  sellerName: string;
  availableQuantity: number;
  offeredQuantity: number;
  purityPercentage: number;
  pricePerTon: number;
  freightCostPerTon: number;
  landedCostPerTon: number;
  distanceKm: number;
  hasCertificate: boolean;
  matchScore: number; // 0 - 100
  rating: 'Excellent' | 'Good' | 'Moderate' | 'Fair';
  scoreBreakdown: AIMatchScoreBreakdown;
  reasons: string[];
  concerns: string[];
  recommendation?: string;
  deliveryFeasibility: {
    status: 'FEASIBLE' | 'TIGHT' | 'UNLIKELY';
    label: string;
    estimatedTransitHours: number;
    explanation: string;
  };
}

export interface AISupplierContribution {
  listingId: string;
  batchId: string;
  batchNumber: string;
  sellerId: string;
  sellerName: string;
  contributingQuantity: number;
  availableQuantity: number;
  purityPercentage: number;
  pricePerTon: number;
  freightCostPerTon: number;
  landedCostPerTon: number;
  totalLotCost: number;
  distanceKm: number;
  hasCertificate: boolean;
}

export interface AISupplyPlan {
  planId: string;
  title: string;
  totalQuantity: number;
  targetQuantity: number;
  fulfillmentPercentage: number;
  averagePurity: number;
  totalProductCost: number;
  totalFreightCost: number;
  totalCost: number;
  averageLandedCostPerTon: number;
  overallScore: number;
  suppliers: AISupplierContribution[];
  explanation: string;
  deliveryFeasibility: 'FEASIBLE' | 'TIGHT' | 'UNLIKELY';
}

export interface AIMatchResponse {
  requirement: {
    id: string;
    targetQuantity: number;
    minPurity: number;
    deliveryAddress: string;
    requiredDeliveryDate?: string | null;
    budgetCeilingPerTon?: number | null;
    intendedApplication?: string | null;
  };
  matches: AIMatchCandidate[];
  multiSupplierPlans: AISupplyPlan[];
  evaluatedSupplyCount: number;
  geminiExplanationUsed: boolean;
  scoringWeights: MatchingWeightsConfig;
}

export interface ParseRequirementRequest {
  text: string;
}

export interface ParsedRequirementResult {
  quantityTonnes: number | null;
  minimumPurity: number | null;
  city: string | null;
  state: string | null;
  location: string | null;
  maxPricePerTonne: number | null;
  requiredDate: string | null;
  intendedUse: string | null;
  parserMode: 'GEMINI_AI' | 'DETERMINISTIC_NLP_FALLBACK';
  summaryMessage: string;
}

export interface CoaQualityParameter {
  name: string;
  value: string | number;
  unit?: string | null;
  sourceText?: string | null;
  sourcePage?: number | null;
}

export interface CoaContaminant {
  name: string;
  value: string | number;
  unit?: string | null;
  sourceText?: string | null;
}

export interface CoaExtractionData {
  documentType: string;
  co2PurityPercent: number | null;
  moisturePercent: number | null;
  testDate: string | null;
  batchReference: string | null;
  laboratoryName: string | null;
  contaminants: CoaContaminant[];
  qualityParameters: CoaQualityParameter[];
  extractionNotes: string[];
  missingFields: string[];
  warnings: string[];
  provenance?: Record<string, any>;
}

export interface CoaCrossCheckResult {
  batchReferenceMatch: boolean | null;
  batchReferenceNote: string;
  purityMatch: boolean | null;
  purityDifference: number | null;
  purityDifferencePoints: string | null;
  purityNote: string;
  hasDiscrepancy: boolean;
  summary: string;
}

export interface CoaAnalysisResponse {
  batchId: string;
  certificateId: string;
  status: 'PENDING' | 'PROCESSING' | 'EXTRACTED' | 'PARTIAL' | 'FAILED' | 'REVIEW_REQUIRED';
  extraction: CoaExtractionData | null;
  crossCheck: CoaCrossCheckResult | null;
  modelName: string;
  modelVersion: string;
  disclaimer: string;
  latencyMs?: number;
  extractedAt: string;
}

