import { describe, it, expect } from 'vitest';
import { AssistantService } from '../../src/modules/ai/assistant/assistant.service.js';
import { VALID_ACTION_ROUTES } from '../../src/modules/ai/assistant/assistant.types.js';

describe('CarbonBridge AI Assistant Unit Suite', () => {
  describe('1. Knowledge Grounding & Core Workflows', () => {
    it('accurately answers "CarbonBridge kya hai?" with platform purpose and key features', () => {
      const res = AssistantService.generateDeterministicResponse('CarbonBridge kya hai?', 'BUYER');
      expect(res.reply).toContain('CarbonBridge industrial CO₂ ka ek B2B Matchmaking Platform hai');
      expect(res.reply).toContain('Smart Matching');
      expect(res.reply).toContain('CoA Intelligence');
      expect(res.suggestedActions.length).toBeGreaterThan(0);
    });

    it('accurately explains buyer workflow for "How do I buy CO2?"', () => {
      const res = AssistantService.generateDeterministicResponse('How do I buy CO2 on CarbonBridge?', 'BUYER');
      expect(res.reply).toContain('Post a Requirement');
      expect(res.reply).toContain('Smart Matchmaker');
      expect(res.reply).toContain('Allocation');
      const postReqAction = res.suggestedActions.find((a) => a.action === 'POST_REQUIREMENT');
      expect(postReqAction).toBeDefined();
      expect(postReqAction?.path).toBe('/requirements/new');
    });

    it('accurately explains seller workflow for "How do I sell my captured CO2?"', () => {
      const res = AssistantService.generateDeterministicResponse('How do I sell my captured CO2?', 'SELLER');
      expect(res.reply).toContain('Register a Captured Batch');
      expect(res.reply).toContain('Upload CoA');
      expect(res.reply).toContain('Create a Listing');
      expect(res.reply).toContain('Smart Transportation Optimizer');
      const regBatchAction = res.suggestedActions.find((a) => a.action === 'REGISTER_BATCH');
      expect(regBatchAction).toBeDefined();
      expect(regBatchAction?.path).toBe('/seller/batches/new');
    });

    it('accurately explains auctions with anti-sniping safeguard and reserve price', () => {
      const res = AssistantService.generateDeterministicResponse('How does auction work?', 'SELLER');
      expect(res.reply).toContain('Reserve Price');
      expect(res.reply).toContain('Anti-Sniping');
      expect(res.relatedFeatures).toContain('AUCTIONS');
    });

    it('accurately explains Smart Matching 7-criteria weighted scoring without claiming AI computes the rank score', () => {
      const res = AssistantService.generateDeterministicResponse('Smart Matching kaise kaam karta hai?', 'BUYER');
      expect(res.reply).toContain('Purity Fit (25%)');
      expect(res.reply).toContain('Quantity Fit (20%)');
      expect(res.reply).toContain('Price Fit (20%)');
      expect(res.reply).toContain('Distance & Freight (15%)');
      expect(res.reply).toContain('Availability (10%)');
      expect(res.reply).toContain('deterministic weighted rules');
    });

    it('accurately explains CO2 Pricing (ML models vs. recommended corridor)', () => {
      const res = AssistantService.generateDeterministicResponse('How is CO2 price calculated?', 'BUYER');
      expect(res.reply).toContain('Machine Learning');
      expect(res.reply).toContain('Recommended Price Corridor');
      expect(res.reply).toContain('Landed Cost');
    });

    it('accurately explains CoA Intelligence (AI extraction from PDF, no false lab claim)', () => {
      const res = AssistantService.generateDeterministicResponse('What is a CoA?', 'SELLER');
      expect(res.reply).toContain('Certificate of Analysis');
      expect(res.reply.toLowerCase()).toContain('multimodal');
      expect(res.reply.toLowerCase()).toContain('cross-check');
    });


    it('accurately explains Smart Transportation Optimizer with vehicle capacities & multi-trip splitting', () => {
      const res = AssistantService.generateDeterministicResponse('How does transportation optimization work?', 'SELLER');
      expect(res.reply).toContain('Multi-Factor Economics');
      expect(res.reply).toContain('Capacity Splitting');
      expect(res.reply).toContain('Consolidation');
    });

    it('accurately explains shipment tracking lifecycle stages', () => {
      const res = AssistantService.generateDeterministicResponse('How do I track my shipment?', 'BUYER');
      expect(res.reply).toContain('ALLOCATED');
      expect(res.reply).toContain('DISPATCH_PENDING');
      expect(res.reply).toContain('IN_TRANSIT');
      expect(res.reply).toContain('DELIVERED');
      expect(res.reply).toContain('RECEIVED');
    });
  });

  describe('2. Multilingual Understanding (English, Hindi, Hinglish)', () => {
    it('answers Hinglish buyer query in Hinglish: "Mujhe buyer ke taur pe kya karna hai?"', () => {
      const res = AssistantService.generateDeterministicResponse('Mujhe buyer ke taur pe kya karna hai?', 'BUYER');
      expect(res.reply).toContain('Requirement Post Karein');
      expect(res.reply).toContain('AI Smart Matchmaker');
      expect(res.reply).toContain('Allocation & Logistics');
    });

    it('answers Hinglish seller query in Hinglish: "Mujhe seller ke taur pe kya karna hai?"', () => {
      const res = AssistantService.generateDeterministicResponse('Mujhe seller ke taur pe kya karna hai?', 'SELLER');
      expect(res.reply).toContain('CO₂ Batch Register Karein');
      expect(res.reply).toContain('CoA PDF Upload Karein');
      expect(res.reply).toContain('Listing Banayein');
    });

    it('answers English buyer query in English', () => {
      const res = AssistantService.generateDeterministicResponse('I need 500 tonnes of CO2 in Rajkot', 'BUYER');
      expect(res.reply).toContain('procure captured industrial CO₂');
      expect(res.suggestedActions.some((a) => a.action === 'POST_REQUIREMENT')).toBe(true);
    });
  });

  describe('3. Unknown & Unsupported Features Rejection', () => {
    it('rejects third-party laboratory quality certification guarantee requests', () => {
      const res = AssistantService.generateDeterministicResponse(
        'Can CarbonBridge guarantee quality certification?',
        'BUYER'
      );
      expect(res.reply).toContain("That feature isn't currently available in CarbonBridge");
      expect(res.reply).not.toContain('Yes, we guarantee');
    });

    it('rejects carbon offset and carbon credit trading requests', () => {
      const res = AssistantService.generateDeterministicResponse(
        'Can I trade carbon credit offsets here?',
        'BUYER'
      );
      expect(res.reply).toContain("That feature isn't currently available in CarbonBridge");
      expect(res.reply).toContain('physical industrial CO₂ procurement');
    });

    it('rejects automated bot bidding / auto-buying features', () => {
      const res = AssistantService.generateDeterministicResponse(
        'Can you auto-buy 200T for me?',
        'BUYER'
      );
      expect(res.reply).toContain("That feature isn't currently available in CarbonBridge");
    });
  });

  describe('4. Role-Based Guidance & Action Safety', () => {
    it('prioritizes buyer actions for BUYER role', () => {
      const res = AssistantService.generateDeterministicResponse('Hello, how do I get started?', 'BUYER');
      expect(res.suggestedActions.some((a) => a.action === 'POST_REQUIREMENT')).toBe(true);
      expect(res.suggestedActions.every((a) => a.action !== 'CREATE_LISTING')).toBe(true);
    });

    it('prioritizes seller actions for SELLER role', () => {
      const res = AssistantService.generateDeterministicResponse('Hello, how do I get started?', 'SELLER');
      expect(res.suggestedActions.some((a) => a.action === 'REGISTER_BATCH')).toBe(true);
      expect(res.suggestedActions.every((a) => a.action !== 'POST_REQUIREMENT')).toBe(true);
    });

    it('ensures all suggested action codes strictly map to valid platform routes', () => {
      for (const [code, meta] of Object.entries(VALID_ACTION_ROUTES)) {
        expect(meta.path).toMatch(/^\/[a-zA-Z0-9\-_/]+$/);
        expect(meta.defaultLabel.length).toBeGreaterThan(0);
      }
    });

    it('never contains arbitrary script or executable code in replies', () => {
      const res = AssistantService.generateDeterministicResponse('<script>alert("hack")</script>', 'BUYER');
      expect(res.reply).not.toContain('<script>');
    });
  });

  describe('5. Onboarding Checklist Builder', () => {
    it('builds a comprehensive 6-step onboarding guide for BUYER', () => {
      const card = AssistantService.buildOnboardingCard('BUYER');
      expect(card.role).toBe('BUYER');
      expect(card.steps.length).toBe(6);
      expect(card.steps[0].title).toBe('Post Requirement');
      expect(card.steps[0].action?.path).toBe('/requirements/new');
      expect(card.quickPrompts.length).toBeGreaterThanOrEqual(3);
    });

    it('builds a comprehensive 6-step onboarding guide for SELLER', () => {
      const card = AssistantService.buildOnboardingCard('SELLER');
      expect(card.role).toBe('SELLER');
      expect(card.steps.length).toBe(6);
      expect(card.steps[0].title).toBe('Register CO₂ Batch');
      expect(card.steps[0].action?.path).toBe('/seller/batches/new');
      expect(card.quickPrompts.length).toBeGreaterThanOrEqual(3);
    });
  });

  describe('6. Intent Detection', () => {
    it('detects PLATFORM_GUIDANCE for platform workflow questions', () => {
      expect(AssistantService.detectIntent('How do I buy CO2?')).toBe('PLATFORM_GUIDANCE');
      expect(AssistantService.detectIntent('What is Smart Matching?')).toBe('PLATFORM_GUIDANCE');
      expect(AssistantService.detectIntent("I'm a Buyer")).toBe('PLATFORM_GUIDANCE');
      expect(AssistantService.detectIntent('How does CarbonBridge work?')).toBe('PLATFORM_GUIDANCE');
    });

    it('detects PERSONAL_INSIGHT for personal activity questions in English and Hinglish', () => {
      expect(AssistantService.detectIntent('How are my listings doing?')).toBe('PERSONAL_INSIGHT');
      expect(AssistantService.detectIntent('What have I been buying recently?')).toBe('PERSONAL_INSIGHT');
      expect(AssistantService.detectIntent('Meri buying history kya hai?')).toBe('PERSONAL_INSIGHT');
      expect(AssistantService.detectIntent('Which batches do I still have?')).toBe('PERSONAL_INSIGHT');
      expect(AssistantService.detectIntent('What should I do with my unsold CO2?')).toBe('PERSONAL_INSIGHT');
      expect(AssistantService.detectIntent('Meri usual purity requirement kya hai?')).toBe('PERSONAL_INSIGHT');
    });

    it('detects NAVIGATION for routing intent', () => {
      expect(AssistantService.detectIntent('Take me to marketplace')).toBe('NAVIGATION');
      expect(AssistantService.detectIntent('Where can I see my shipments?')).toBe('NAVIGATION');
      expect(AssistantService.detectIntent('Kaha post karu requirement?')).toBe('NAVIGATION');
    });

    it('detects GENERAL_QA for general questions', () => {
      expect(AssistantService.detectIntent('What is a CoA?')).toBe('GENERAL_QA');
      expect(AssistantService.detectIntent('Why would I choose an auction?')).toBe('GENERAL_QA');
    });

    it('maintains PERSONAL_INSIGHT for follow-up questions when previous turn discussed listings', () => {
      const history = [
        { role: 'user' as const, content: 'How are my listings doing?', timestamp: new Date().toISOString() },
        { role: 'assistant' as const, content: 'You have 2 active listings with 150 tonnes.', timestamp: new Date().toISOString() },
      ];
      expect(AssistantService.detectIntent('Which one should I change?', history)).toBe('PERSONAL_INSIGHT');
    });
  });

  describe('7. Personalized Insights & Zero Fake Analytics', () => {
    it('generates grounded buyer insight from real authorized context without fake metrics', () => {
      const buyerContext = {
        role: 'BUYER' as const,
        hasSufficientData: true,
        activeRequirements: [
          {
            id: 'req-1',
            quantityTonnes: 300,
            minPurity: 99.5,
            deliveryAddress: 'Ahmedabad, Gujarat',
            status: 'OPEN',
            intendedApplication: 'SYNFUEL',
            budgetCeilingPerTon: 2800,
            createdAt: new Date().toISOString(),
          },
        ],
        recentOrders: [
          {
            id: 'ord-1',
            orderNumber: 'ORD-2026-001',
            totalQuantity: 200,
            totalPrice: 520000,
            overallStatus: 'CONFIRMED',
            createdAt: new Date().toISOString(),
          },
        ],
        preferenceSummary: {
          totalRequirements: 1,
          totalOrders: 1,
          typicalQuantityRange: { min: 200, max: 300, avg: 250 },
          typicalPurityRange: { min: 99.5, max: 99.5, avg: 99.5 },
          typicalLocations: ['Ahmedabad, Gujarat'],
          intendedUses: ['SYNFUEL'],
        },
      };

      const res = AssistantService.generateDeterministicResponse(
        'What have I been buying recently?',
        'BUYER',
        [],
        buyerContext,
        'PERSONAL_INSIGHT'
      );

      expect(res.reply).toContain('Your CarbonBridge Buyer Activity Summary');
      expect(res.reply).toContain('Active Requirements:** 1');
      expect(res.reply).toContain('Ahmedabad, Gujarat');
      // Verify zero fake analytics
      expect(res.reply).not.toContain('conversion rate');
      expect(res.reply).not.toContain('market share');
      expect(res.reply).not.toContain('savings:');
    });

    it('generates grounded seller insight from real authorized context without fake metrics', () => {
      const sellerContext = {
        role: 'SELLER' as const,
        hasSufficientData: true,
        activeListings: [
          {
            id: 'list-1',
            quantityTonnes: 200,
            pricePerTon: 2600,
            sellingMethod: 'FIXED_PRICE',
            status: 'ACTIVE',
            createdAt: new Date().toISOString(),
          },
        ],
        inventorySummary: {
          totalBatches: 2,
          totalAvailableTonnes: 350,
          totalAllocatedTonnes: 50,
          purityRange: { min: 99.0, max: 99.8 },
        },
        recentSales: [],
        auctionActivity: [],
        metrics: {
          totalListings: 1,
          activeListings: 1,
          soldListings: 0,
        },
      };

      const res = AssistantService.generateDeterministicResponse(
        'How are my listings doing?',
        'SELLER',
        [],
        sellerContext,
        'PERSONAL_INSIGHT'
      );

      expect(res.reply).toContain('Your CarbonBridge Seller Activity Summary');
      expect(res.reply).toContain('Total Batches:** 2');
      expect(res.reply).toContain('350T available');
      // Verify zero fake analytics
      expect(res.reply).not.toContain('conversion rate');
      expect(res.reply).not.toContain('demand percentage');
    });

    it('returns honest insufficient data message without fabricating history for new accounts', () => {
      const emptyContext = {
        role: 'BUYER' as const,
        hasSufficientData: false,
        reason: 'No active or past requirements found',
        activeRequirements: [],
        recentOrders: [],
        preferenceSummary: {
          totalRequirements: 0,
          totalOrders: 0,
          typicalQuantityRange: { min: 0, max: 0, avg: 0 },
          typicalPurityRange: { min: 0, max: 0, avg: 0 },
          typicalLocations: [],
          intendedUses: [],
        },
      };

      const res = AssistantService.generateDeterministicResponse(
        'What have I been buying recently?',
        'BUYER',
        [],
        emptyContext,
        'PERSONAL_INSIGHT'
      );

      expect(res.reply).toContain("I don't have enough activity data yet");
      expect(res.suggestedActions.some((a) => a.action === 'POST_REQUIREMENT')).toBe(true);
      // Never fabricate history
      expect(res.reply).not.toContain('You previously purchased');
    });

    it('falls back safely to dashboard navigation when personalized insight requested with AI offline', () => {
      const res = AssistantService.generateDeterministicResponse(
        'What have I been buying recently?',
        'BUYER',
        [],
        null,
        'PERSONAL_INSIGHT'
      );

      expect(res.reply).toContain("I can't generate your personalized insight right now");
      expect(res.reply).toContain('safely accessible via your account dashboard');
      expect(res.suggestedActions.some((a) => a.action === 'ORDERS')).toBe(true);
    });
  });

  describe('8. Privacy Boundaries & Role-Appropriate Sanitization', () => {
    it('sanitizes and filters out seller actions for BUYER role', () => {
      const rawActions = [
        { label: 'Register Batch', action: 'REGISTER_BATCH' },
        { label: 'Create Listing', action: 'CREATE_LISTING' },
        { label: 'Post Requirement', action: 'POST_REQUIREMENT' },
      ];
      // Test through chat sanitized output
      const sanitized = (AssistantService as any).sanitizeActions(rawActions, 'BUYER');
      expect(sanitized.length).toBe(1);
      expect(sanitized[0].action).toBe('POST_REQUIREMENT');
    });

    it('sanitizes and filters out buyer actions for SELLER role', () => {
      const rawActions = [
        { label: 'Post Requirement', action: 'POST_REQUIREMENT' },
        { label: 'Smart Matchmaker', action: 'SMART_MATCHING' },
        { label: 'Register Batch', action: 'REGISTER_BATCH' },
      ];
      const sanitized = (AssistantService as any).sanitizeActions(rawActions, 'SELLER');
      expect(sanitized.length).toBe(1);
      expect(sanitized[0].action).toBe('REGISTER_BATCH');
    });

    it('rejects unknown and fabricated action codes', () => {
      const rawActions = [
        { label: 'Arbitrary Hack', action: 'DELETE_DATABASE' },
        { label: 'Auto Buy CO2', action: 'AUTO_BUY' },
      ];
      const sanitized = (AssistantService as any).sanitizeActions(rawActions, 'BUYER');
      expect(sanitized.length).toBe(0);
    });
  });
});
