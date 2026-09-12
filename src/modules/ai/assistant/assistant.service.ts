import { randomUUID } from 'node:crypto';
import { prisma } from '../../../database/prisma.js';
import { logger } from '../../../common/logging/logger.js';
import { GeminiService } from '../gemini.service.js';
import {
  AssistantAction,
  AssistantActionCode,
  AssistantChatResponse,
  AssistantIntent,
  AssistantMessage,
  AssistantRole,
  BuyerPersonalizedContext,
  OnboardingCardData,
  PersonalizedContext,
  SellerPersonalizedContext,
  VALID_ACTION_ROUTES,
} from './assistant.types.js';
import { config } from '../../../config/env.js';
import { AssistantChatInput, geminiAssistantResponseSchema } from './assistant.schemas.js';
import { buildAssistantSystemPrompt } from './assistant.prompt.js';

interface ConversationSession {
  messages: AssistantMessage[];
  updatedAt: number;
}

export class AssistantService {
  // In-memory conversation store with 30-minute sliding TTL
  private static sessions = new Map<string, ConversationSession>();
  private static readonly SESSION_TTL_MS = 30 * 60 * 1000;
  private static readonly MAX_HISTORY_TURNS = 6;

  /**
   * Main entry point for chatting with CarbonBridge Assistant.
   */
  public static async chat(
    userId: string,
    role: AssistantRole,
    input: AssistantChatInput,
    companyId?: string
  ): Promise<AssistantChatResponse> {
    const conversationId = input.conversationId || randomUUID();
    // Security: strictly enforce authenticated JWT role; ignore any spoofed role in body
    const effectiveRole = role;
    const userMessageText = input.message.trim();

    // 1. Retrieve and update session history
    this.cleanExpiredSessions();
    const session = this.getSession(conversationId);

    session.messages.push({
      role: 'user',
      content: userMessageText,
      timestamp: new Date().toISOString(),
    });

    // Trim history to prevent context overflow
    if (session.messages.length > this.MAX_HISTORY_TURNS * 2) {
      session.messages = session.messages.slice(-this.MAX_HISTORY_TURNS * 2);
    }
    session.updatedAt = Date.now();
    this.sessions.set(conversationId, session);

    // 2. Check if user is a new user
    const isNew = await this.detectIfNewUser(userId, effectiveRole);

    // 3. Detect lightweight query intent
    const intent = this.detectIntent(userMessageText, session.messages.slice(0, -1));

    // 4. Fetch authorized user activity context only when personal insight is requested
    let userContext: PersonalizedContext | null = null;
    if (intent === 'PERSONAL_INSIGHT' && companyId) {
      userContext = await this.fetchAuthorizedUserData(companyId, effectiveRole);
    }

    // 5. Try Gemini first if configured
    if (GeminiService.isConfigured()) {
      try {
        const geminiResponse = await this.callGeminiAssistant(
          userMessageText,
          session.messages.slice(0, -1), // Prior turns as history
          effectiveRole,
          userContext
        );

        if (geminiResponse && geminiResponse.reply) {
          const sanitizedActions = this.sanitizeActions(geminiResponse.suggestedActions, effectiveRole);
          const relatedFeatures = Array.isArray(geminiResponse.relatedFeatures)
            ? geminiResponse.relatedFeatures.slice(0, 4)
            : [];

          session.messages.push({
            role: 'assistant',
            content: geminiResponse.reply,
            timestamp: new Date().toISOString(),
          });

          return {
            reply: geminiResponse.reply,
            suggestedActions: sanitizedActions,
            relatedFeatures,
            conversationId,
            isNewUser: isNew,
            source: 'GEMINI_AI',
            intent,
            isPersonalized: intent === 'PERSONAL_INSIGHT',
          };
        }
      } catch (err: any) {
        logger.warn(
          { err: err.message, conversationId, role: effectiveRole },
          'Gemini Assistant call failed; proceeding with deterministic fallback.'
        );
      }
    }

    // 6. Deterministic Fallback if Gemini is not configured, timed out, or returned invalid output
    const fallbackResponse = this.generateDeterministicResponse(
      userMessageText,
      effectiveRole,
      session.messages,
      userContext,
      intent
    );

    session.messages.push({
      role: 'assistant',
      content: fallbackResponse.reply,
      timestamp: new Date().toISOString(),
    });

    logger.info('[AI Assistant] Responding with deterministic fallback');
    return {
      ...fallbackResponse,
      conversationId,
      isNewUser: isNew,
      source: 'DETERMINISTIC_FALLBACK',
      intent,
      isPersonalized: intent === 'PERSONAL_INSIGHT',
    };
  }

  /**
   * Returns role-tailored onboarding card and introductory guidance for new or exploring users.
   */
  public static async getOnboardingGuidance(
    userId: string,
    role: AssistantRole
  ): Promise<{ isNewUser: boolean; onboardingCard: OnboardingCardData; starterResponse: AssistantChatResponse }> {
    const isNew = await this.detectIfNewUser(userId, role);
    const onboardingCard = this.buildOnboardingCard(role);

    const starterReply =
      role === 'BUYER'
        ? `**Welcome to CarbonBridge 👋**\n\nI am your platform guide. As an industrial CO₂ buyer, you can post exact tonnage and purity specifications, discover verified industrial suppliers via **AI Matchmaker**, participate in seller auctions, and track deliveries with **Smart Logistics**.\n\nHow would you like to begin?`
        : `**Welcome to CarbonBridge 👋**\n\nI am your platform guide. As an industrial carbon capture seller, you can register captured CO₂ batches, extract chemical specs with **CoA AI Intelligence**, create fixed-price or auction listings, and optimize cryogenic transport economics with our **Smart Logistics Optimizer**.\n\nHow would you like to begin?`;

    const starterActions: AssistantAction[] =
      role === 'BUYER'
        ? [
            { label: 'Post Requirement', action: 'POST_REQUIREMENT', path: '/requirements/new' },
            { label: 'Browse Marketplace', action: 'MARKETPLACE', path: '/marketplace' },
          ]
        : [
            { label: 'Register CO2 Batch', action: 'REGISTER_BATCH', path: '/seller/batches/new' },
            { label: 'Create Listing', action: 'CREATE_LISTING', path: '/seller/listings/new' },
          ];

    return {
      isNewUser: isNew,
      onboardingCard,
      starterResponse: {
        reply: starterReply,
        suggestedActions: starterActions,
        relatedFeatures: role === 'BUYER' ? ['SMART_MATCHING', 'MARKETPLACE', 'LOGISTICS'] : ['COA_INTELLIGENCE', 'AUCTIONS', 'LOGISTICS'],
        conversationId: randomUUID(),
        isNewUser: isNew,
        onboardingCard,
      },
    };
  }

  /**
   * Detects whether the user is newly registered (created within 7 days and has 0 requirements/batches).
   */
  public static async detectIfNewUser(userId: string, role: AssistantRole): Promise<boolean> {
    if (!userId || userId === 'anonymous') {
      return false;
    }
    try {
      const user = await prisma.user.findUnique({
        where: { id: userId },
        include: {
          company: {
            include: {
              _count: {
                select: {
                  requirements: true,

                  batches: true,
                  listings: true,
                },
              },
            },
          },
        },
      });

      if (!user) return true;

      const sevenDaysAgo = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000);
      const isRecentlyCreated = user.createdAt >= sevenDaysAgo;

      if (role === 'BUYER') {
        return isRecentlyCreated || (user.company?._count.requirements ?? 0) === 0;
      } else if (role === 'SELLER') {
        return isRecentlyCreated || (user.company?._count.batches ?? 0) === 0;
      }
      return isRecentlyCreated;
    } catch {
      return false;
    }
  }

  /**
   * Calls Gemini with structured JSON output contract.
   */
  private static async callGeminiAssistant(
    currentPrompt: string,
    history: AssistantMessage[],
    role: AssistantRole,
    userContext?: PersonalizedContext | null
  ): Promise<{ reply: string; suggestedActions?: any[]; relatedFeatures?: string[] } | null> {
    const systemPrompt = buildAssistantSystemPrompt(role, userContext);

    // Format conversation history turns
    const historyText =
      history.length > 0
        ? `CONVERSATION HISTORY:\n${history
            .map((m) => `${m.role.toUpperCase()}: ${m.content}`)
            .join('\n')}\n\nCURRENT USER MESSAGE:\n${currentPrompt}`
        : currentPrompt;

    const responseSchema = {
      type: 'OBJECT',
      properties: {
        reply: { type: 'STRING' },
        suggestedActions: {
          type: 'ARRAY',
          items: {
            type: 'OBJECT',
            properties: {
              label: { type: 'STRING' },
              action: { type: 'STRING' },
            },
            required: ['label', 'action'],
          },
        },
        relatedFeatures: {
          type: 'ARRAY',
          items: { type: 'STRING' },
        },
      },
      required: ['reply'],
    };

    const configuredModel = config.GEMINI_MODEL || 'gemini-3.6-flash';
    logger.info(`[AI Assistant] Gemini request started`);
    logger.info(`[AI Assistant] Model: ${configuredModel}`);

    const result = await GeminiService.generateJsonDetailed<any>({
      systemPrompt,
      userPrompt: historyText,
      responseSchema,
      temperature: 0.2,
      timeoutMs: 12000,
    });

    if (!result.success || !result.data) {
      logger.warn(`[AI Assistant] Gemini request failed`);
      logger.warn(`[AI Assistant] Error type: ${result.errorCategory || 'unknown'}`);
      logger.warn(`[AI Assistant] Fallback activated`);
      return null;
    }

    logger.info(`[AI Assistant] Gemini response received`);

    const validationResult = geminiAssistantResponseSchema.safeParse(result.data);
    if (!validationResult.success) {
      logger.warn(`[AI Assistant] Gemini response validation failed: ${validationResult.error.message}`);
      logger.warn(`[AI Assistant] Fallback activated`);
      return null;
    }

    logger.info(`[AI Assistant] Gemini response validation: SUCCESS`);
    return validationResult.data;
  }

  /**
   * Lightweight intent detector classifying the user query into guidance, personalization, navigation, or general QA.
   */
  public static detectIntent(message: string, history: AssistantMessage[] = []): AssistantIntent {
    const text = message.toLowerCase().trim();

    // 1. Navigation Intent (evaluated first so "Where can I see my shipments?" routes to NAVIGATION)
    const navigationPatterns = [
      /\b(take me to|navigate to|go to|open|show me the|where do i post|where can i see|where are my|where can i find)\b/i,
      /\b(kaise jaun|kaha milega|kaha post karu|kaha dekhu)\b/i,
    ];
    if (navigationPatterns.some((p) => p.test(text))) {
      return 'NAVIGATION';
    }

    // 2. Personal insight patterns (first-person possessive queries in English, Hindi, and Hinglish)
    const personalPatterns = [
      /\b(my|mine|i have|i usually|what have i|what do i|how are my|which of my|my active|my unsold|my past|my co2|my inventory)\b/i,
      /\b(meri|mera|mere|maine|hamari|apna|apni|mujhko)\b/i,
      /\b(buying history|selling history|my listings|my batches|my requirements|my orders)\b/i,
      /\b(recent purchases|recent sales|unsold co2|unsold inventory|which one should i change|focus on next|usual purity)\b/i,
      /\b(still have|do i have|i still have|which batches|which listings)\b/i,
    ];

    const isPersonalQuery = personalPatterns.some((pattern) => pattern.test(text));

    // Follow-up context check (e.g. previous assistant message was about listings/requirements, and user asks "which one should I change?")
    const lastAssistantTurn = [...history].reverse().find((m) => m.role === 'assistant')?.content.toLowerCase() || '';
    const isPersonalFollowUp =
      (text.includes('which one') || text.includes('change it') || text.includes('what should i do next') || text.includes('kya karu')) &&
      (lastAssistantTurn.includes('listing') || lastAssistantTurn.includes('requirement') || lastAssistantTurn.includes('batch') || lastAssistantTurn.includes('order'));

    if (isPersonalQuery || isPersonalFollowUp) {
      return 'PERSONAL_INSIGHT';
    }

    // 3. General Conceptual / Definition Q&A
    if (
      /\b(what is (a |an )?coa|what is coa|why would i choose|why choose|difference between|what does .* mean|what is cryogenic|what is food grade)\b/i.test(text)
    ) {
      return 'GENERAL_QA';
    }

    // 4. Platform Guidance
    const platformGuidancePatterns = [
      /\b(how do i|how to|how does|what is|kya hai|kaise hota hai|kaise kaam karta hai|workflow|steps)\b/i,
      /\b(smart matching|matchmaker|auction|fixed price|transpor|logistics)\b/i,
      /\b(i'm a buyer|i'm a seller|how does carbonbridge work|show me the platform)\b/i,
    ];
    if (platformGuidancePatterns.some((p) => p.test(text))) {
      return 'PLATFORM_GUIDANCE';
    }

    return 'GENERAL_QA';
  }

  /**
   * Fetches only authorized user activity for personalized insights.
   * Strictly enforces company-level privacy boundaries: buyers only see their own requirements/orders,
   * sellers only see their own batches/listings/allocations.
   */
  public static async fetchAuthorizedUserData(
    companyId: string,
    role: AssistantRole
  ): Promise<PersonalizedContext | null> {
    if (!companyId) return null;

    try {
      if (role === 'BUYER') {
        const [requirements, orders, totalReqs, totalOrders] = await Promise.all([
          prisma.requirement.findMany({
            where: { buyerId: companyId },
            orderBy: { createdAt: 'desc' },
            take: 5,
            select: {
              id: true,
              targetQuantity: true,
              minPurity: true,
              deliveryAddress: true,
              status: true,
              intendedApplication: true,
              budgetCeilingPerTon: true,
              createdAt: true,
            },
          }),
          prisma.order.findMany({
            where: { buyerId: companyId },
            orderBy: { createdAt: 'desc' },
            take: 5,
            select: {
              id: true,
              orderNumber: true,
              totalQuantity: true,
              totalPrice: true,
              overallStatus: true,
              createdAt: true,
            },
          }),
          prisma.requirement.count({ where: { buyerId: companyId } }),
          prisma.order.count({ where: { buyerId: companyId } }),
        ]);

        const hasSufficientData = totalReqs > 0 || totalOrders > 0;

        const quantities = requirements.map((r) => Number(r.targetQuantity));
        const purities = requirements.map((r) => Number(r.minPurity));
        const locations = Array.from(new Set(requirements.map((r) => r.deliveryAddress).filter(Boolean)));
        const intendedUses = Array.from(new Set(requirements.map((r) => r.intendedApplication).filter(Boolean) as string[]));

        const minQty = quantities.length ? Math.min(...quantities) : 0;
        const maxQty = quantities.length ? Math.max(...quantities) : 0;
        const avgQty = quantities.length ? Math.round(quantities.reduce((a, b) => a + b, 0) / quantities.length) : 0;

        const minPur = purities.length ? Math.min(...purities) : 0;
        const maxPur = purities.length ? Math.max(...purities) : 0;
        const avgPur = purities.length ? Number((purities.reduce((a, b) => a + b, 0) / purities.length).toFixed(1)) : 0;

        return {
          role: 'BUYER',
          hasSufficientData,
          reason: hasSufficientData ? undefined : 'No active or past requirements or orders found on this account.',
          activeRequirements: requirements.map((r) => ({
            id: r.id,
            quantityTonnes: Number(r.targetQuantity),
            minPurity: Number(r.minPurity),
            deliveryAddress: r.deliveryAddress,
            status: r.status,
            intendedApplication: r.intendedApplication,
            budgetCeilingPerTon: r.budgetCeilingPerTon ? Number(r.budgetCeilingPerTon) : null,
            createdAt: r.createdAt.toISOString(),
          })),
          recentOrders: orders.map((o) => ({
            id: o.id,
            orderNumber: o.orderNumber,
            totalQuantity: Number(o.totalQuantity),
            totalPrice: Number(o.totalPrice),
            overallStatus: o.overallStatus,
            createdAt: o.createdAt.toISOString(),
          })),
          preferenceSummary: {
            totalRequirements: totalReqs,
            totalOrders,
            typicalQuantityRange: { min: minQty, max: maxQty, avg: avgQty },
            typicalPurityRange: { min: minPur, max: maxPur, avg: avgPur },
            typicalLocations: locations,
            intendedUses,
          },
        };
      } else if (role === 'SELLER') {
        const [batches, listings, allocations, totalBatches, totalListings, activeListingsCount, soldListingsCount] =
          await Promise.all([
            prisma.batch.findMany({
              where: { sellerId: companyId },
              orderBy: { createdAt: 'desc' },
              take: 5,
              select: {
                id: true,
                batchNumber: true,
                capturedQuantity: true,
                availableQuantity: true,
                allocatedQuantity: true,
                purityPercentage: true,
                status: true,
                createdAt: true,
              },
            }),
            prisma.listing.findMany({
              where: { sellerId: companyId },
              orderBy: { createdAt: 'desc' },
              take: 5,
              select: {
                id: true,
                sellingMethod: true,
                quantity: true,
                pricePerTon: true,
                status: true,
                createdAt: true,
                auction: {
                  select: {
                    id: true,
                    baseReservePrice: true,
                    currentHighestBid: true,
                    status: true,
                    bids: { select: { amountPerTon: true } },
                  },
                },
              },
            }),
            prisma.allocation.findMany({
              where: { sellerId: companyId },
              orderBy: { createdAt: 'desc' },
              take: 5,
              select: {
                allocatedQuantity: true,
                pricePerTon: true,
                createdAt: true,
              },
            }),
            prisma.batch.count({ where: { sellerId: companyId } }),
            prisma.listing.count({ where: { sellerId: companyId } }),
            prisma.listing.count({ where: { sellerId: companyId, status: 'ACTIVE' } }),
            prisma.listing.count({ where: { sellerId: companyId, status: 'SOLD' } }),
          ]);

        const hasSufficientData = totalBatches > 0 || totalListings > 0;

        const totalAvailable = batches.reduce((sum, b) => sum + Number(b.availableQuantity), 0);
        const totalAllocated = batches.reduce((sum, b) => sum + Number(b.allocatedQuantity), 0);
        const purities = batches.map((b) => Number(b.purityPercentage));
        const minPur = purities.length ? Math.min(...purities) : 0;
        const maxPur = purities.length ? Math.max(...purities) : 0;

        return {
          role: 'SELLER',
          hasSufficientData,
          reason: hasSufficientData ? undefined : 'No registered batches or listings found on this account.',
          activeListings: listings.map((l) => ({
            id: l.id,
            quantityTonnes: Number(l.quantity),
            pricePerTon: l.pricePerTon ? Number(l.pricePerTon) : null,
            sellingMethod: l.sellingMethod,
            status: l.status,
            createdAt: l.createdAt.toISOString(),
          })),
          inventorySummary: {
            totalBatches,
            totalAvailableTonnes: totalAvailable,
            totalAllocatedTonnes: totalAllocated,
            purityRange: { min: minPur, max: maxPur },
          },
          recentSales: allocations.map((a) => ({
            allocatedQuantity: Number(a.allocatedQuantity),
            pricePerTon: Number(a.pricePerTon),
            createdAt: a.createdAt.toISOString(),
          })),
          auctionActivity: listings
            .filter((l) => l.auction)
            .map((l) => ({
              id: l.auction!.id,
              reservePrice: Number(l.auction!.baseReservePrice),
              currentHighestBid: Number(l.auction!.currentHighestBid),
              status: l.auction!.status,
              bidsCount: l.auction!.bids?.length || 0,
            })),
          metrics: {
            totalListings,
            activeListings: activeListingsCount,
            soldListings: soldListingsCount,
          },
        };
      }
      return null;
    } catch (err: any) {
      logger.error({ err: err.message, companyId, role }, 'Failed to fetch authorized user data for assistant');
      return null;
    }
  }

  /**
   * Deterministic knowledge base and fallback responses.
   * Handles English, Hindi, and Hinglish queries for core platform topics.
   */
  public static generateDeterministicResponse(
    message: string,
    role: AssistantRole,
    history: AssistantMessage[] = [],
    userContext?: PersonalizedContext | null,
    intent?: AssistantIntent
  ): { reply: string; suggestedActions: AssistantAction[]; relatedFeatures: string[] } {
    const text = message.toLowerCase();

    // Check recent history for context continuity (e.g. "can I use it for 500 tonnes?")
    const lastAssistantTurn = [...history].reverse().find((m) => m.role === 'assistant')?.content.toLowerCase() || '';

    // 0. Personal Insight Handling (when intent is personal or query is asking for personal history)
    if (
      intent === 'PERSONAL_INSIGHT' ||
      text.includes('buying history') ||
      text.includes('selling history') ||
      text.includes('my listings') ||
      text.includes('meri listings') ||
      text.includes('my batches') ||
      text.includes('mere batches') ||
      text.includes('my requirements') ||
      text.includes('mere requirements')
    ) {
      if (userContext) {
        if (!userContext.hasSufficientData) {
          const isBuyer = role === 'BUYER';
          return {
            reply: `I don't have enough activity data yet to give you a reliable personalized insight.\n\n${
              isBuyer
                ? "You haven't posted any active requirements or completed any CO₂ purchases yet. Once you create your first requirement, I can analyze your procurement patterns!"
                : "You haven't registered any captured CO₂ batches or created marketplace listings yet. Once you register a batch, I can analyze your sales and inventory!"
            }`,
            suggestedActions: isBuyer
              ? [
                  { label: 'Post Requirement', action: 'POST_REQUIREMENT', path: '/requirements/new' },
                  { label: 'Browse Marketplace', action: 'MARKETPLACE', path: '/marketplace' },
                ]
              : [
                  { label: 'Register Batch', action: 'REGISTER_BATCH', path: '/seller/batches/new' },
                  { label: 'Create Listing', action: 'CREATE_LISTING', path: '/seller/listings/new' },
                ],
            relatedFeatures: isBuyer ? ['POST_REQUIREMENT', 'MARKETPLACE'] : ['REGISTER_BATCH', 'CREATE_LISTING'],
          };
        }

        // Factual summary from authorized userContext
        if (userContext.role === 'BUYER') {
          const pref = userContext.preferenceSummary;
          return {
            reply: `**Your CarbonBridge Buyer Activity Summary:**\n\n- **Active Requirements:** ${userContext.activeRequirements.length}\n- **Total Requirements Created:** ${pref.totalRequirements}\n- **Orders Placed:** ${pref.totalOrders}\n- **Typical Tonnage:** ${pref.typicalQuantityRange.avg > 0 ? `${pref.typicalQuantityRange.avg} tonnes` : 'N/A'}\n- **Purity Preference:** ${pref.typicalPurityRange.avg > 0 ? `${pref.typicalPurityRange.avg}%` : 'N/A'}\n- **Delivery Locations:** ${pref.typicalLocations.length > 0 ? pref.typicalLocations.join(', ') : 'None registered yet'}\n\nWould you like to post a new requirement or review existing listings?`,
            suggestedActions: [
              { label: 'Post Requirement', action: 'POST_REQUIREMENT', path: '/requirements/new' },
              { label: 'My Orders', action: 'ORDERS', path: '/orders' },
            ],
            relatedFeatures: ['POST_REQUIREMENT', 'ORDERS', 'SMART_MATCHING'],
          };
        } else if (userContext.role === 'SELLER') {
          const inv = userContext.inventorySummary;
          const met = userContext.metrics;
          return {
            reply: `**Your CarbonBridge Seller Activity Summary:**\n\n- **Total Batches:** ${inv.totalBatches} (${inv.totalAvailableTonnes}T available, ${inv.totalAllocatedTonnes}T allocated)\n- **Active Listings:** ${met.activeListings}\n- **Total Listings:** ${met.totalListings}\n- **Recent Allocations:** ${userContext.recentSales.length}\n- **Active Auctions:** ${userContext.auctionActivity.length}\n\nWould you like to manage your listings or register a new batch?`,
            suggestedActions: [
              { label: 'My Listings', action: 'CREATE_LISTING', path: '/seller/listings/new' },
              { label: 'Register Batch', action: 'REGISTER_BATCH', path: '/seller/batches/new' },
            ],
            relatedFeatures: ['CREATE_LISTING', 'REGISTER_BATCH', 'AUCTIONS'],
          };
        }
      }

      // If no context or AI is offline
      const isBuyer = role === 'BUYER';
      return {
        reply: `I can't generate your personalized insight right now because AI analytics services are temporarily unavailable. Your CarbonBridge data is still safely accessible via your account dashboard.`,
        suggestedActions: isBuyer
          ? [
              { label: 'My Orders', action: 'ORDERS', path: '/orders' },
              { label: 'Post Requirement', action: 'POST_REQUIREMENT', path: '/requirements/new' },
            ]
          : [
              { label: 'My Listings', action: 'CREATE_LISTING', path: '/seller/listings/new' },
              { label: 'My Batches', action: 'REGISTER_BATCH', path: '/seller/batches/new' },
            ],
        relatedFeatures: isBuyer ? ['ORDERS', 'POST_REQUIREMENT'] : ['CREATE_LISTING', 'REGISTER_BATCH'],
      };
    }

    // Quick prompt checks: "I'm a Buyer", "I'm a Seller", "How does CarbonBridge work?"
    if (text === "i'm a buyer" || text === "im a buyer" || text.includes("i'm a buyer")) {
      return {
        reply: `**Welcome Industrial Buyer 👋**\n\nOn CarbonBridge, you can discover high-purity industrial CO₂ from verified emitters.\n\n**Next Steps:**\n1. **Post a Requirement** with your desired tonnage, min purity (%), and delivery location.\n2. Run **AI Smart Matchmaker** to evaluate ranked suppliers or multi-supplier fulfillment plans.\n3. Buy directly at fixed price or participate in seller auctions with transparent landed cost.\n4. Track deliveries smoothly with Smart Logistics.`,
        suggestedActions: [
          { label: 'Post Requirement', action: 'POST_REQUIREMENT', path: '/requirements/new' },
          { label: 'Browse Marketplace', action: 'MARKETPLACE', path: '/marketplace' },
        ],
        relatedFeatures: ['POST_REQUIREMENT', 'SMART_MATCHING', 'MARKETPLACE'],
      };
    }

    if (text === "i'm a seller" || text === "im a seller" || text.includes("i'm a seller")) {
      return {
        reply: `**Welcome Point-Source CO₂ Emitter 👋**\n\nOn CarbonBridge, you can monetize your captured CO₂ with industrial offtakers.\n\n**Next Steps:**\n1. **Register a Captured Batch** with tonnage, storage parameters, and capture plant coordinates.\n2. Upload your lab PDF to run **CoA AI Intelligence** for automated purity extraction.\n3. Create a **Fixed Price** listing or host a timed **Auction** with reserve price protection.\n4. Optimize cryogenic tanker dispatches using the **Smart Transportation Optimizer**.`,
        suggestedActions: [
          { label: 'Register Batch', action: 'REGISTER_BATCH', path: '/seller/batches/new' },
          { label: 'Create Listing', action: 'CREATE_LISTING', path: '/seller/listings/new' },
        ],
        relatedFeatures: ['REGISTER_BATCH', 'CREATE_LISTING', 'COA_INTELLIGENCE'],
      };
    }

    if (
      text.includes('how does carbonbridge work') ||
      text.includes('show me the platform') ||
      text.includes('platform kaise kaam karta hai')
    ) {
      return {
        reply: `**How CarbonBridge Works 🌐**\n\nCarbonBridge is a specialized B2B industrial matchmaking platform connecting CO₂ point-source emitters with commercial offtakers:\n\n- **For Buyers**: Post volume and purity specs, use AI Smart Matchmaker to rank suppliers by 7 weighted factors, lock allocations, and track shipments.\n- **For Sellers**: Register captured batches, extract CoA specs with Gemini AI, create listings/auctions, and optimize multi-stop delivery routes.\n\nWhere would you like to begin?`,
        suggestedActions:
          role === 'SELLER'
            ? [
                { label: 'Register Batch', action: 'REGISTER_BATCH', path: '/seller/batches/new' },
                { label: 'Browse Marketplace', action: 'MARKETPLACE', path: '/marketplace' },
              ]
            : [
                { label: 'Post Requirement', action: 'POST_REQUIREMENT', path: '/requirements/new' },
                { label: 'Browse Marketplace', action: 'MARKETPLACE', path: '/marketplace' },
              ],
        relatedFeatures: ['MARKETPLACE', 'SMART_MATCHING', 'COA_INTELLIGENCE'],
      };
    }

    // 1. Unknown / Unsupported Features Check
    if (
      text.includes('guarantee quality') ||
      text.includes('quality certification') ||
      text.includes('guarantee co2') ||
      text.includes('carbon credit') ||
      text.includes('carbon offset') ||
      text.includes('gps live') ||
      text.includes('sensor tracking') ||
      text.includes('auto buy') ||
      text.includes('auto-buy') ||
      text.includes('bot bidding')
    ) {
      return {
        reply: `That feature isn't currently available in CarbonBridge.\n\nCarbonBridge focuses on physical industrial CO₂ procurement, quality evaluation via AI-extracted Certificates of Analysis (CoAs), transparent pricing, and smart road logistics. We do not issue third-party laboratory quality certification guarantees or trade carbon credits.`,
        suggestedActions: [
          { label: 'Browse Marketplace', action: 'MARKETPLACE', path: '/marketplace' },
        ],
        relatedFeatures: ['MARKETPLACE', 'COA_INTELLIGENCE'],
      };
    }

    // 2. How to Buy CO2 / Buyer workflow / "Mujhe buyer ke taur pe kya karna hai?"
    if (
      text.includes('how do i buy') ||
      text.includes('buy co2') ||
      text.includes('buyer ke taur') ||
      text.includes('buyer flow') ||
      text.includes('co2 chahiye') ||
      text.includes('procure')
    ) {
      const reply =
        text.includes('chahiye') || text.includes('taur') || text.includes('kya karu')
          ? `**CO₂ khareedne ke liye Buyer Workflow:**\n\n1. **Requirement Post Karein**: Apni required quantity (tonnes), minimum purity (%), delivery location aur application (jaise Concrete, Synfuel) enter karein.\n2. **AI Smart Matchmaker**: Requirement post karte hi system available suppliers ko match score ke hisaab se rank karega.\n3. **Marketplace ya Auction**: Aap fixed-price listing se directly order kar sakte hain ya seller auctions mein bid laga sakte hain.\n4. **Allocation & Logistics**: Deal confirm hone ke baad CO₂ allocate hota hai aur **Smart Logistics** se road delivery optimize hoti hai.\n5. **Track Shipment**: Aap 'Shipments' page par dispatch se lekar delivery tak live status track kar sakte hain.`
          : `**To buy CO₂ on CarbonBridge, follow this workflow:**\n\n1. **Post a Requirement**: Specify your required tonnage, minimum purity (%), budget ceiling, delivery site, and intended application (e.g. Concrete, Synfuel).\n2. **Run AI Smart Matchmaker**: The system ranks available seller listings and generates multi-supplier fulfillment plans based on landed cost and distance.\n3. **Order or Bid**: Buy directly at fixed price or participate in seller auctions.\n4. **Allocation & Logistics**: Secured allocation locks protect your order from double-selling. Smart Logistics plans the optimal cryogenic delivery route.\n5. **Track Delivery**: Monitor shipment milestones from dispatch to final site receipt.`;

      return {
        reply,
        suggestedActions: [
          { label: 'Post Requirement', action: 'POST_REQUIREMENT', path: '/requirements/new' },
          { label: 'Browse Marketplace', action: 'MARKETPLACE', path: '/marketplace' },
        ],
        relatedFeatures: ['POST_REQUIREMENT', 'SMART_MATCHING', 'MARKETPLACE'],
      };
    }

    // 3. How to Sell CO2 / Seller workflow / "Mujhe seller ke taur pe kya karna hai?"
    if (
      text.includes('how do i sell') ||
      text.includes('sell co2') ||
      text.includes('seller ke taur') ||
      text.includes('sell my captured') ||
      text.includes('bechna hai')
    ) {
      const reply =
        text.includes('bechna') || text.includes('taur') || text.includes('kya karu')
          ? `**CO₂ bechne ke liye Seller Workflow:**\n\n1. **CO₂ Batch Register Karein**: Batch quantity, purity (%), capture date aur storage plant location register karein.\n2. **CoA PDF Upload Karein**: Certificate of Analysis upload karein jahan AI automatically chemical specs extract karega.\n3. **Listing Banayein**: Batch ke liye Fixed Price ya Seller Auction (with reserve price) listing create karein.\n4. **Buyer Interest & Orders**: Buyers ke direct orders aur bids review karein.\n5. **CO₂ Allocate Karein**: Order confirm karke tonnage allocate karein (system double-selling rokkta hai).\n6. **Smart Transportation Optimizer**: Delivery ke liye multi-trip route aur vehicle capacity optimize karke dispatch karein.`
          : `**To sell captured CO₂ on CarbonBridge, follow this workflow:**\n\n1. **Register a Captured Batch**: Add your batch tonnage, captured purity (%), capture date, and facility location.\n2. **Upload CoA**: Attach your lab test PDF; our CoA AI will extract and cross-check purity and impurity parameters.\n3. **Create a Listing**: Choose between a Fixed Price listing or a timed Seller Auction with reserve price protection.\n4. **Review Orders & Bids**: Review buyer orders or auction bids from verified industrial offtakers.\n5. **Allocate CO₂**: Confirm allocations with guaranteed stock reservation protection.\n6. **Optimize Logistics & Dispatch**: Use our Smart Transportation Optimizer to plan efficient delivery before dispatch.`;

      return {
        reply,
        suggestedActions: [
          { label: 'Register CO2 Batch', action: 'REGISTER_BATCH', path: '/seller/batches/new' },
          { label: 'Create Listing', action: 'CREATE_LISTING', path: '/seller/listings/new' },
          { label: 'Smart Logistics', action: 'LOGISTICS', path: '/seller/logistics' },
        ],
        relatedFeatures: ['REGISTER_BATCH', 'CREATE_LISTING', 'LOGISTICS'],
      };
    }

    // 4. Smart Matching / AI Matchmaker / "Smart Matching kaise kaam karta hai?"
    if (
      text.includes('smart matching') ||
      text.includes('matchmaker') ||
      text.includes('matching work') ||
      text.includes('matching kaise')
    ) {
      const reply =
        text.includes('kaise') || text.includes('kya karta')
          ? `**AI Matchmaker kaise kaam karta hai:**\n\nAI Matchmaker buyer ki requirement ko active seller listings ke saath compare karta hai aur **7 weighted factors** par match score (0-100) calculate karta hai:\n\n1. **Purity Fit (25%)**: Supplier ki purity buyer ki minimum purity se match karti hai ya nahi\n2. **Quantity Fit (20%)**: Required volume availability\n3. **Price Fit (20%)**: Price ceiling ke anuroop\n4. **Distance & Freight (15%)**: Transport distance aur landed cost\n5. **Availability (10%)**: Delivery date compatibility\n6. **CoA Certificate (5%)**: Lab test certificate maujood hona\n7. **Application Compatibility (5%)**: Intended use (e.g. concrete curing vs food grade)\n\n*Note: Matching score deterministic weighted rules se calculate hota hai, jabki Gemini AI har match ka detailed explanation provide karta hai.*`
          : `**How Smart Matching & AI Matchmaker Works:**\n\nThe Matchmaker evaluates active listings against your requirement across **7 deterministic weighted criteria**:\n\n1. **Purity Fit (25%)**: Compliance with required purity thresholds\n2. **Quantity Fit (20%)**: Volume fulfillment capability\n3. **Price Fit (20%)**: Alignment with your budget ceiling\n4. **Distance & Freight (15%)**: Road distance and estimated transport cost\n5. **Availability (10%)**: Readiness for your delivery deadline\n6. **CoA Presence (5%)**: Verified Certificate of Analysis availability\n7. **Application Compatibility (5%)**: Industry use suitability (e.g. Synfuel, Concrete)\n\n*Note: Match ranking scores are computed via deterministic weighted rules; Gemini AI provides human-readable explanations of why each supplier was recommended.*`;

      return {
        reply,
        suggestedActions: [
          { label: 'Post Requirement', action: 'POST_REQUIREMENT', path: '/requirements/new' },
          { label: 'Browse Marketplace', action: 'MARKETPLACE', path: '/marketplace' },
        ],
        relatedFeatures: ['SMART_MATCHING', 'POST_REQUIREMENT'],
      };
    }

    // 5. What is CarbonBridge? / "CarbonBridge kya hai?"
    if (
      text.includes('what is carbonbridge') ||
      text.includes('about carbonbridge') ||
      text.includes('how does carbonbridge work') ||
      (text.includes('carbonbridge') && (text.includes('kya hai') || text.includes('about') || text.includes('kaise'))) ||
      text === 'carbonbridge' ||
      text === 'kya hai'
    ) {
      const reply =
        text.includes('kya hai') || text.includes('kaise')
          ? `**CarbonBridge industrial CO₂ ka ek B2B Matchmaking Platform hai.**\n\nYe carbon capture karne wale industrial emitters (cement, steel, chemical plants) ko un buyers se connect karta hai jinhe commercial use (concrete curing, synfuels, chemicals, greenhouses) ke liye CO₂ ki zaroorat hoti hai.\n\n**Platform ke key features:**\n• **Smart Matching**: Buyer requirement ko purity, quantity aur distance ke basis par rank karta hai\n• **AI Price Intelligence**: ML-powered fair price corridor aur landed cost calculation\n• **CoA Intelligence**: Lab certificates se AI dwara chemical specs extract karta hai\n• **Smart Logistics**: Cryogenic transport routes aur multi-trip delivery cost optimize karta hai`
          : `**CarbonBridge is a specialized B2B matchmaking platform for captured industrial CO₂.**\n\nWe connect point-source carbon emitters (cement, steel, fertilizer, and power plants) with industrial offtakers (concrete curing, synfuel producers, chemical manufacturers, and greenhouses).\n\n**Key Platform Capabilities:**\n• **AI Smart Matchmaker**: Multi-supplier matching based on 7 weighted factors including purity, quantity, and landed cost\n• **AI Price Intelligence**: ML price prediction model & recommended market corridor\n• **CoA AI Intelligence**: Automated chemical parameter extraction from Certificate of Analysis PDFs\n• **Smart Logistics Optimizer**: Real-world route cost optimization considering tanker capacities and multi-trip delivery`;

      return {
        reply,
        suggestedActions:
          role === 'BUYER'
            ? [
                { label: 'Post Requirement', action: 'POST_REQUIREMENT', path: '/requirements/new' },
                { label: 'Browse Marketplace', action: 'MARKETPLACE', path: '/marketplace' },
              ]
            : [
                { label: 'Register CO2 Batch', action: 'REGISTER_BATCH', path: '/seller/batches/new' },
                { label: 'Create Listing', action: 'CREATE_LISTING', path: '/seller/listings/new' },
              ],
        relatedFeatures: ['SMART_MATCHING', 'MARKETPLACE', 'LOGISTICS'],
      };
    }


    // 6. Auctions / "How does auction work?" / "Auction kaise kaam karta hai?"
    if (text.includes('auction') || text.includes('neelami') || text.includes('bidding')) {
      const reply =
        text.includes('kaise') || text.includes('kya')
          ? `**CarbonBridge par Auctions kaise kaam karte hain:**\n\n• **Seller-Hosted Auctions**: Industrial sellers apne premium captured CO₂ lots ke liye timed auction create kar sakte hain.\n• **Reserve Price Protection**: Seller reserve price set karte hain jisse minimum price guarantee rehti hai.\n• **Real-Time Bidding**: Buyers live bidding window mein competitive bids place karte hain.\n• **Anti-Sniping Extension**: Aakhri 2 minute mein bid aane par auction time automatically 2 minute extend ho jata hai taaki fairness bani rahe.\n• **Settlement**: Auction complete hone par highest valid bid ko deal settle hoti hai aur allocation ho jata hai.`
          : `**How Seller Auctions Work on CarbonBridge:**\n\n• **Seller-Initiated Auctions**: Sellers can list high-grade CO₂ batches for competitive bidding.\n• **Reserve Price Protection**: Sellers define a minimum floor price below which lots will not be sold.\n• **Competitive Bidding**: Buyers submit bids with real-time feedback on standing.\n• **Anti-Sniping Safeguard**: Any bid placed in the final 2 minutes extends the auction timer by 2 minutes to prevent last-second sniping.\n• **Settlement**: The winning bid receives allocated CO₂ for logistics scheduling.`;

      return {
        reply,
        suggestedActions:
          role === 'SELLER'
            ? [{ label: 'View Auctions', action: 'AUCTIONS', path: '/seller/auctions' }]
            : [{ label: 'Browse Marketplace', action: 'MARKETPLACE', path: '/marketplace' }],
        relatedFeatures: ['AUCTIONS', 'MARKETPLACE'],
      };
    }

    // 7. Pricing / Price Intelligence / "How is CO2 price calculated?"
    if (text.includes('price') || text.includes('pricing') || text.includes('cost') || text.includes('keemat')) {
      const reply =
        text.includes('kaise') || text.includes('kya')
          ? `**CarbonBridge par CO₂ Pricing kaise hoti hai:**\n\n• **AI Price Intelligence**: Ek dedicated Python Machine Learning regression model (Linear, Ridge, Lasso, GBR, Random Forest) jo volume, purity, capture source aur market conditions ke aadhar par fair market price predict karta hai.\n• **Recommended Price Corridor**: Rule-based advisory corridor jo sellers ko optimal price range suggest karta hai.\n• **Landed Cost Calculation**: Real-world logistics cost (fuel, tolls, cryogenic handling) ko base price mein add karke buyer ki delivered cost per tonne calculate ki jaati hai.`
          : `**How CO₂ Pricing Works on CarbonBridge:**\n\n• **AI Price Intelligence**: Our Python Machine Learning (ML) regression models (Ridge, Lasso, GBR, Random Forest) predict fair market prices based on volume, purity, capture source, and delivery timelines.\n• **Recommended Price Corridor**: An advisory price band showing benchmark floors and ceilings.\n• **Landed Cost Transparency**: Landed Cost per Tonne = Base CO₂ Price + Estimated Road Logistics (fuel, tolls, driver hours, and cryogenic transfer).`;

      return {
        reply,
        suggestedActions: [
          { label: 'Browse Marketplace', action: 'MARKETPLACE', path: '/marketplace' },
        ],
        relatedFeatures: ['PRICE_INTELLIGENCE', 'MARKETPLACE'],
      };
    }

    // 8. CoA / Certificate of Analysis / "What is a CoA?"
    if (text.includes('coa') || text.includes('certificate of analysis') || text.includes('quality') || text.includes('purity')) {
      const reply =
        text.includes('kya') || text.includes('kaise')
          ? `**Certificate of Analysis (CoA) kya hai:**\n\nCoA ek lab document hota hai jo captured CO₂ ki chemical composition verify karta hai.\n\n**CarbonBridge CoA Intelligence:**\n• Seller ke PDF document se AI multimodal analysis ke through CO₂ purity (%), moisture, O₂, CO aur hydrocarbons extract karta hai.\n• In extracted values ko registered batch specs ke saath cross-check kiya jata hai.\n• Verified metrics marketplace buyers ko transparency aur confidence deti hain.`
          : `**What is a Certificate of Analysis (CoA)?**\n\nA CoA is a laboratory test certificate detailing the chemical composition and purity of a captured CO₂ batch.\n\n**CarbonBridge CoA Intelligence:**\n• Automatically analyzes uploaded PDF certificates via Gemini multimodal AI.\n• Extracts key parameters: CO₂ purity (%), moisture content, oxygen, carbon monoxide, and total hydrocarbons.\n• Cross-checks extracted data with seller-registered claims to highlight any discrepancies before buyers commit.`;


      return {
        reply,
        suggestedActions:
          role === 'SELLER'
            ? [{ label: 'CoA Documents', action: 'DOCUMENTS', path: '/seller/documents' }]
            : [{ label: 'Browse Marketplace', action: 'MARKETPLACE', path: '/marketplace' }],
        relatedFeatures: ['COA_INTELLIGENCE', 'REGISTER_BATCH'],
      };
    }

    // 9. Transportation / Logistics / "How does transportation optimization work?"
    if (text.includes('transport') || text.includes('logistics') || text.includes('route') || text.includes('truck')) {
      const reply =
        text.includes('kaise') || text.includes('kya')
          ? `**Smart Transportation Cost Optimizer kaise kaam karta hai:**\n\n• **Real Logistics Economics**: Shortest distance ke bajaye lowest total cost optimize karta hai (fuel, driver wages, commercial toll tariffs, cryogenic loading/unloading fees).\n• **Tanker Capacity Constraints**: Heavy volume orders (jaise 350T demand aur 200T tanker) ke liye automatic multi-trip delivery split karta hai.\n• **Multi-Buyer Consolidation**: Single seller ke active delivery orders ko consolidate karke empty return trips bachta hai.\n• **Realistic Road Routing**: Highway winding factor (1.22x) aur normal road conditions ke anuroop calculations karta hai.`
          : `**How Smart Transportation Cost Optimizer Works:**\n\n• **Multi-Factor Economics**: Minimizes true logistics cost (fuel consumption, vehicle operating wear, commercial tolls, driver wages, and cryogenic loading/unloading fees) rather than simple shortest distance.\n• **Capacity Splitting**: Automatically splits shipments exceeding cryogenic road tanker limits (e.g. 350 T demand with 200 T tanker capacity $\rightarrow$ Trip 1: 150 T, Trip 2: 200 T).\n• **Multi-Buyer Route Consolidation**: Combines deliveries for a single seller to eliminate empty return trips.\n• **Transparent Trade-offs**: Provides 2–3 alternative routes with cost-per-tonne comparisons and route maps.`;

      return {
        reply,
        suggestedActions:
          role === 'SELLER'
            ? [{ label: 'Smart Logistics', action: 'LOGISTICS', path: '/seller/logistics' }]
            : [{ label: 'Track Shipments', action: 'SHIPMENTS', path: '/shipments' }],
        relatedFeatures: ['LOGISTICS', 'SHIPMENTS'],
      };
    }

    // 10. Shipment Tracking / "How do I track my shipment?"
    if (text.includes('track') || text.includes('shipment') || text.includes('delivery')) {
      const reply =
        text.includes('kaise') || text.includes('kahan')
          ? `**Shipment Tracking:**\n\nOrder confirm aur allocate hone ke baad shipment lifecycle track ki ja sakti hai:\n1. **ALLOCATED**: CO₂ volume locked for order\n2. **DISPATCH_PENDING**: Tanker loading underway\n3. **IN_TRANSIT**: Tanker on the road\n4. **DELIVERED**: Arrived at buyer destination site\n5. **RECEIVED**: Offtaker acceptance complete\n\nAap 'Shipments' page par real-time progress dekh sakte hain.`
          : `**Tracking Your CO₂ Shipments:**\n\nOnce an order is confirmed, follow its lifecycle in the Shipments dashboard:\n1. **ALLOCATED**: Stock reserved and locked\n2. **DISPATCH_PENDING**: Cryogenic tanker loading underway\n3. **IN_TRANSIT**: En route to delivery destination\n4. **DELIVERED**: Tanker reached destination\n5. **RECEIVED**: Offtaker verified delivery and accepted quantity\n\nVisit the Shipments tab to inspect all active deliveries.`;

      return {
        reply,
        suggestedActions: [
          { label: 'Track Shipments', action: 'SHIPMENTS', path: role === 'SELLER' ? '/seller/shipments' : '/shipments' },
        ],
        relatedFeatures: ['SHIPMENTS'],
      };
    }

    // Default conversational response tailored to role
    const defaultReply =
      role === 'BUYER'
        ? `I am here to help you procure captured industrial CO₂ efficiently on CarbonBridge.\n\nYou can post your delivery requirements, find verified suppliers using our **AI Matchmaker**, or explore fixed-price listings and live auctions in the Marketplace.\n\nWhat would you like to explore?`
        : `I am here to help you monetize captured CO₂ on CarbonBridge.\n\nYou can register your capture batches, verify quality with **CoA AI Intelligence**, create fixed-price or auction listings, and optimize road delivery with our **Smart Logistics Optimizer**.\n\nWhat would you like to explore?`;

    return {
      reply: defaultReply,
      suggestedActions:
        role === 'BUYER'
          ? [
              { label: 'Post Requirement', action: 'POST_REQUIREMENT', path: '/requirements/new' },
              { label: 'Browse Marketplace', action: 'MARKETPLACE', path: '/marketplace' },
            ]
          : [
              { label: 'Register CO2 Batch', action: 'REGISTER_BATCH', path: '/seller/batches/new' },
              { label: 'Create Listing', action: 'CREATE_LISTING', path: '/seller/listings/new' },
            ],
      relatedFeatures: ['MARKETPLACE', 'SMART_MATCHING', 'LOGISTICS'],
    };
  }

  /**
   * Builds the structured onboarding card data.
   */
  public static buildOnboardingCard(role: AssistantRole): OnboardingCardData {
    if (role === 'BUYER') {
      return {
        title: 'New Buyer Onboarding Guide',
        subtitle: 'Quick 6-step walkthrough to procure industrial CO₂ on CarbonBridge',
        role: 'BUYER',
        quickPrompts: [
          "I'm a Buyer",
          'How does CarbonBridge work?',
          'How do I buy CO2?',
          'How does Smart Matching work?',
          'What is landed cost?',
          'How do I track my shipment?',
        ],
        steps: [
          {
            step: 1,
            title: 'Post Requirement',
            description: 'Define your desired CO₂ tonnage, min purity percentage, budget ceiling, delivery site, and industrial application.',
            action: { label: 'Post Requirement', action: 'POST_REQUIREMENT', path: '/requirements/new' },
          },
          {
            step: 2,
            title: 'AI Smart Matchmaker',
            description: 'Evaluate seller listings ranked by purity, volume, distance, landed cost, and CoA quality.',
            action: { label: 'Smart Matchmaker', action: 'SMART_MATCHING', path: '/dashboard' },
          },
          {
            step: 3,
            title: 'Browse Marketplace',
            description: 'Discover active fixed-price seller listings or participate in timed seller-hosted auctions.',
            action: { label: 'Browse Marketplace', action: 'MARKETPLACE', path: '/marketplace' },
          },
          {
            step: 4,
            title: 'Order & Allocation',
            description: 'Confirm purchase with guaranteed allocation protection preventing duplicate sales.',
          },
          {
            step: 5,
            title: 'Smart Logistics',
            description: 'Review calculated road logistics and cryogenic transport routing.',
          },
          {
            step: 6,
            title: 'Delivery & Receipt',
            description: 'Track dispatch, transit, and receipt confirmation on your shipment dashboard.',
            action: { label: 'Track Shipments', action: 'SHIPMENTS', path: '/shipments' },
          },
        ],
      };
    }

    return {
      title: 'New Seller Onboarding Guide',
      subtitle: 'Quick 6-step walkthrough to list and deliver captured CO₂ on CarbonBridge',
      role: 'SELLER',
      quickPrompts: [
        "I'm a Seller",
        'How does CarbonBridge work?',
        'How do I sell my captured CO2?',
        'How does CoA AI Intelligence work?',
        'How does auction work?',
        'How does transport optimizer work?',
      ],
      steps: [
        {
          step: 1,
          title: 'Register CO₂ Batch',
          description: 'Record your captured batch tonnage, purity (%), capture timestamp, and plant location.',
          action: { label: 'Register Batch', action: 'REGISTER_BATCH', path: '/seller/batches/new' },
        },
        {
          step: 2,
          title: 'Upload CoA Certificate',
          description: 'Attach lab test PDF; our AI extracts chemical purity and cross-checks with batch claims.',
          action: { label: 'CoA Documents', action: 'DOCUMENTS', path: '/seller/documents' },
        },
        {
          step: 3,
          title: 'Create Marketplace Listing',
          description: 'Offer your batch via Fixed Price or timed Seller Auction with reserve price protection.',
          action: { label: 'Create Listing', action: 'CREATE_LISTING', path: '/seller/listings/new' },
        },
        {
          step: 4,
          title: 'Review Orders & Bids',
          description: 'Accept buyer purchase orders or monitor competitive bids in real time.',
          action: { label: 'View Auctions', action: 'AUCTIONS', path: '/seller/auctions' },
        },
        {
          step: 5,
          title: 'Allocate & Optimize Transport',
          description: 'Use the Smart Transportation Optimizer for multi-trip splitting and consolidated delivery.',
          action: { label: 'Smart Logistics', action: 'LOGISTICS', path: '/seller/logistics' },
        },
        {
          step: 6,
          title: 'Dispatch & Complete Order',
          description: 'Dispatch cryogenic tankers and verify delivery completion with the offtaker.',
          action: { label: 'Shipments', action: 'SHIPMENTS', path: '/seller/shipments' },
        },
      ],
    };
  }

  /**
   * Sanitizes suggested actions from LLM output so that they strictly map to actual platform routes.
   */
  private static sanitizeActions(rawActions: any, role: AssistantRole): AssistantAction[] {
    if (!Array.isArray(rawActions)) return [];

    const sanitized: AssistantAction[] = [];
    for (const raw of rawActions) {
      if (!raw || typeof raw !== 'object') continue;
      const actionCode = (raw.action || '').toUpperCase() as AssistantActionCode;
      const mapping = VALID_ACTION_ROUTES[actionCode];

      if (mapping) {
        // Enforce role-appropriate actions
        if (role === 'BUYER' && mapping.sellerOnly) continue;
        if (role === 'SELLER' && mapping.buyerOnly) continue;

        sanitized.push({
          label: typeof raw.label === 'string' && raw.label.trim().length > 0 ? raw.label.trim() : mapping.defaultLabel,
          action: actionCode,
          path: mapping.path,
        });
      }
    }

    return sanitized.slice(0, 3);
  }

  private static getSession(conversationId: string): ConversationSession {
    const existing = this.sessions.get(conversationId);
    if (existing) return existing;
    const newSession: ConversationSession = {
      messages: [],
      updatedAt: Date.now(),
    };
    this.sessions.set(conversationId, newSession);
    return newSession;
  }

  private static cleanExpiredSessions(): void {
    const now = Date.now();
    for (const [id, session] of this.sessions.entries()) {
      if (now - session.updatedAt > this.SESSION_TTL_MS) {
        this.sessions.delete(id);
      }
    }
  }
}
