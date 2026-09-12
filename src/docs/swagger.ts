export const swaggerDocument = {
  openapi: '3.0.3',
  info: {
    title: 'CarbonBridge REST API',
    version: '1.0.0',
    description:
      'CarbonBridge: An Intelligent B2B CO₂ Marketplace & Physical Transaction Platform.\n' +
      'Problem Statement PS8: Carbon Capture-to-Product Matchmaking Platform (HackOut\'26).\n' +
      'Team: AESTRO.\n\n' +
      'Features include:\n' +
      '- Strict Concurrency-Safe Batch Inventory Invariant (Available = Captured - Allocated >= 0)\n' +
      '- Dual selling modalities (Fixed-Price & Upward English Auctions)\n' +
      '- Rule-Based Smart Matching & Multi-Supplier Combinatorial Volume Pooling (e.g. 100T + 200T + 200T = 500T)\n' +
      '- Deterministic Advisory Pricing Engine (Rule-based, Non-ML)\n' +
      '- Verified 5-stage shipment state machine (Allocated -> Dispatch Pending -> In Transit -> Delivered -> Received)\n' +
      '- Single Uncluttered Transaction Map (auto-drops on Received)\n' +
      '- Dynamic Same-Seller Multi-Buyer Route Consolidation with real calculated savings\n' +
      '- Secure Certificate of Analysis (CoA) PDF upload & metadata',
    contact: {
      name: 'Team AESTRO - CarbonBridge',
    },
  },
  servers: [
    {
      url: 'http://localhost:4000',
      description: 'Local Development Server',
    },
  ],
  components: {
    securitySchemes: {
      BearerAuth: {
        type: 'http',
        scheme: 'bearer',
        bearerFormat: 'JWT',
        description: 'Enter your JWT access token in the format: Bearer <token>',
      },
    },
    schemas: {
      ErrorResponse: {
        type: 'object',
        properties: {
          success: { type: 'boolean', example: false },
          error: {
            type: 'object',
            properties: {
              code: { type: 'string', example: 'BATCH_OVER_ALLOCATION' },
              message: { type: 'string', example: 'Requested quantity exceeds available batch quantity.' },
              details: { type: 'object', nullable: true },
            },
          },
          requestId: { type: 'string', example: '4fae6f28-d88b-4976-9c47-386bfeb93049' },
        },
      },
      RegisterRequest: {
        type: 'object',
        required: ['email', 'password', 'fullName', 'role', 'company'],
        properties: {
          email: { type: 'string', format: 'email', example: 'emitter@ultratech.com' },
          password: { type: 'string', minLength: 8, example: 'SecureCarbon2026!' },
          fullName: { type: 'string', example: 'Rajesh Sharma' },
          role: { type: 'string', enum: ['SELLER', 'BUYER'], example: 'SELLER' },
          company: {
            type: 'object',
            required: ['name', 'companyType', 'registrationNumber', 'latitude', 'longitude', 'address'],
            properties: {
              name: { type: 'string', example: 'UltraTech Cement Plant A' },
              companyType: { type: 'string', enum: ['EMITTER', 'OFFTAKER'], example: 'EMITTER' },
              registrationNumber: { type: 'string', example: 'CIN-GJ-CEMENT-001' },
              latitude: { type: 'number', example: 21.7051 },
              longitude: { type: 'number', example: 72.9959 },
              address: { type: 'string', example: 'Ankleshwar Industrial Zone, Gujarat, India' },
            },
          },
        },
      },
      LoginRequest: {
        type: 'object',
        required: ['email', 'password'],
        properties: {
          email: { type: 'string', format: 'email', example: 'emitter@ultratech.com' },
          password: { type: 'string', example: 'SecureCarbon2026!' },
        },
      },
      CreateBatchRequest: {
        type: 'object',
        required: [
          'batchNumber',
          'capturedQuantity',
          'purityPercentage',
          'storagePressureBar',
          'storageTemperatureC',
          'locationLat',
          'locationLng',
        ],
        properties: {
          batchNumber: { type: 'string', example: 'CB-BATCH-2026-001' },
          capturedQuantity: { type: 'number', example: 500 },
          purityPercentage: { type: 'number', example: 78.5 },
          storagePressureBar: { type: 'number', example: 16.5 },
          storageTemperatureC: { type: 'number', example: -22.0 },
          locationLat: { type: 'number', example: 21.7051 },
          locationLng: { type: 'number', example: 72.9959 },
        },
      },
      CreateListingRequest: {
        type: 'object',
        required: ['batchId', 'sellingMethod'],
        properties: {
          batchId: { type: 'string', format: 'uuid' },
          sellingMethod: { type: 'string', enum: ['FIXED_PRICE', 'AUCTION'] },
          pricePerTon: { type: 'number', example: 2500 },
        },
      },
      CreateRequirementRequest: {
        type: 'object',
        required: ['targetQuantity', 'minPurity', 'deliveryLat', 'deliveryLng', 'deliveryAddress', 'requiredDeliveryDate'],
        properties: {
          targetQuantity: { type: 'number', example: 500 },
          minPurity: { type: 'number', example: 70.0 },
          deliveryLat: { type: 'number', example: 23.0225 },
          deliveryLng: { type: 'number', example: 72.5714 },
          deliveryAddress: { type: 'string', example: 'Synthetic Fuels Plant, Ahmedabad, Gujarat' },
          requiredDeliveryDate: { type: 'string', format: 'date-time', example: '2026-10-15T00:00:00Z' },
          budgetCeilingPerTon: { type: 'number', example: 3000 },
          intendedApplication: { type: 'string', example: 'Synthetic aviation fuel (e-kerosene)' },
        },
      },
      ProcureFixedPriceRequest: {
        type: 'object',
        required: ['listingId', 'quantity', 'deliveryLat', 'deliveryLng', 'deliveryAddress'],
        properties: {
          listingId: { type: 'string', format: 'uuid' },
          quantity: { type: 'number', example: 150 },
          deliveryLat: { type: 'number', example: 23.0225 },
          deliveryLng: { type: 'number', example: 72.5714 },
          deliveryAddress: { type: 'string', example: 'Ahmedabad Offtake Hub' },
        },
      },
      ProcureCompositeRequest: {
        type: 'object',
        required: ['deliveryLat', 'deliveryLng', 'deliveryAddress', 'allocations'],
        properties: {
          deliveryLat: { type: 'number', example: 23.0225 },
          deliveryLng: { type: 'number', example: 72.5714 },
          deliveryAddress: { type: 'string', example: 'Ahmedabad Offtake Hub' },
          allocations: {
            type: 'array',
            items: {
              type: 'object',
              required: ['batchId', 'listingId', 'quantity'],
              properties: {
                batchId: { type: 'string', format: 'uuid' },
                listingId: { type: 'string', format: 'uuid' },
                quantity: { type: 'number', example: 100 },
              },
            },
          },
        },
      },
      CreateAuctionRequest: {
        type: 'object',
        required: ['listingId', 'baseReservePrice', 'closingTime'],
        properties: {
          listingId: { type: 'string', format: 'uuid' },
          baseReservePrice: { type: 'number', example: 2500 },
          minBidIncrement: { type: 'number', example: 50 },
          closingTime: { type: 'string', format: 'date-time', example: '2026-09-30T18:00:00Z' },
        },
      },
      PlaceBidRequest: {
        type: 'object',
        required: ['amountPerTon'],
        properties: {
          amountPerTon: { type: 'number', example: 2650 },
        },
      },
      UpdateShipmentStatusRequest: {
        type: 'object',
        required: ['status'],
        properties: {
          status: {
            type: 'string',
            enum: ['DISPATCH_PENDING', 'IN_TRANSIT', 'DELIVERED', 'RECEIVED'],
          },
          trackingNotes: { type: 'string', example: 'Cryo tanker CB-TK-09 departed loading bay.' },
        },
      },
    },
  },
  paths: {
    '/health': {
      get: {
        summary: 'Service liveness check',
        responses: {
          200: { description: 'Service is alive' },
        },
      },
    },
    '/ready': {
      get: {
        summary: 'Service and database readiness check',
        responses: {
          200: { description: 'Service and database are ready' },
          503: { description: 'Database connection failed' },
        },
      },
    },
    '/api/v1/auth/register': {
      post: {
        summary: 'Register enterprise user and organization',
        requestBody: {
          required: true,
          content: { 'application/json': { schema: { $ref: '#/components/schemas/RegisterRequest' } } },
        },
        responses: { 201: { description: 'Registered successfully' } },
      },
    },
    '/api/v1/auth/login': {
      post: {
        summary: 'Login and obtain JWT tokens',
        requestBody: {
          required: true,
          content: { 'application/json': { schema: { $ref: '#/components/schemas/LoginRequest' } } },
        },
        responses: { 200: { description: 'Authenticated successfully' } },
      },
    },
    '/api/v1/batches': {
      post: {
        summary: 'Register captured CO2 batch (Seller only)',
        security: [{ BearerAuth: [] }],
        requestBody: {
          required: true,
          content: { 'application/json': { schema: { $ref: '#/components/schemas/CreateBatchRequest' } } },
        },
        responses: { 201: { description: 'Batch registered' } },
      },
      get: {
        summary: 'List batches owned by authenticated seller',
        security: [{ BearerAuth: [] }],
        responses: { 200: { description: 'Batch list returned' } },
      },
    },
    '/api/v1/listings': {
      post: {
        summary: 'Create marketplace listing (Seller only)',
        security: [{ BearerAuth: [] }],
        requestBody: {
          required: true,
          content: { 'application/json': { schema: { $ref: '#/components/schemas/CreateListingRequest' } } },
        },
        responses: { 201: { description: 'Listing created' } },
      },
      get: {
        summary: 'Browse listings with filters and cursor pagination',
        security: [{ BearerAuth: [] }],
        parameters: [
          { name: 'cursor', in: 'query', schema: { type: 'string' } },
          { name: 'limit', in: 'query', schema: { type: 'integer', default: 20 } },
          { name: 'minPurity', in: 'query', schema: { type: 'number' } },
          { name: 'maxPrice', in: 'query', schema: { type: 'number' } },
          { name: 'sellingMethod', in: 'query', schema: { type: 'string', enum: ['FIXED_PRICE', 'AUCTION'] } },
        ],
        responses: { 200: { description: 'Listings returned' } },
      },
    },
    '/api/v1/requirements': {
      post: {
        summary: 'Post industrial CO2 demand (Buyer only)',
        security: [{ BearerAuth: [] }],
        requestBody: {
          required: true,
          content: { 'application/json': { schema: { $ref: '#/components/schemas/CreateRequirementRequest' } } },
        },
        responses: { 201: { description: 'Requirement created' } },
      },
      get: {
        summary: 'List buyer requirements',
        security: [{ BearerAuth: [] }],
        responses: { 200: { description: 'Requirements returned' } },
      },
    },
    '/api/v1/matching/{requirementId}': {
      get: {
        summary: 'Get smart single and multi-supplier matching proposals',
        security: [{ BearerAuth: [] }],
        parameters: [{ name: 'requirementId', in: 'path', required: true, schema: { type: 'string' } }],
        responses: { 200: { description: 'Ranked matching proposals returned' } },
      },
    },
    '/api/v1/pricing/recommendation': {
      get: {
        summary: 'Get strictly rule-based advisory price corridor',
        security: [{ BearerAuth: [] }],
        parameters: [
          { name: 'purityPercentage', in: 'query', required: true, schema: { type: 'number' } },
          { name: 'batchQuantity', in: 'query', required: true, schema: { type: 'number' } },
        ],
        responses: { 200: { description: 'Advisory price corridor returned' } },
      },
    },
    '/api/v1/orders/procure-fixed': {
      post: {
        summary: 'Procure fixed price listing with atomic batch allocation',
        security: [{ BearerAuth: [] }],
        requestBody: {
          required: true,
          content: { 'application/json': { schema: { $ref: '#/components/schemas/ProcureFixedPriceRequest' } } },
        },
        responses: {
          201: { description: 'Order created and batch allocated' },
          409: { description: 'Batch over-allocation blocked' },
        },
      },
    },
    '/api/v1/orders/procure-composite': {
      post: {
        summary: 'Procure pooled multi-supplier composite package',
        security: [{ BearerAuth: [] }],
        requestBody: {
          required: true,
          content: { 'application/json': { schema: { $ref: '#/components/schemas/ProcureCompositeRequest' } } },
        },
        responses: {
          201: { description: 'Composite order confirmed' },
          409: { description: 'One or more lots had insufficient available balance' },
        },
      },
    },
    '/api/v1/auctions': {
      post: {
        summary: 'Create Seller-Side English Auction',
        security: [{ BearerAuth: [] }],
        requestBody: {
          required: true,
          content: { 'application/json': { schema: { $ref: '#/components/schemas/CreateAuctionRequest' } } },
        },
        responses: { 201: { description: 'Auction created' } },
      },
      get: {
        summary: 'List active open auctions',
        security: [{ BearerAuth: [] }],
        responses: { 200: { description: 'Active auctions returned' } },
      },
    },
    '/api/v1/auctions/{id}/bid': {
      post: {
        summary: 'Place upward bid on auction (concurrency safe)',
        security: [{ BearerAuth: [] }],
        parameters: [{ name: 'id', in: 'path', required: true, schema: { type: 'string' } }],
        requestBody: {
          required: true,
          content: { 'application/json': { schema: { $ref: '#/components/schemas/PlaceBidRequest' } } },
        },
        responses: { 201: { description: 'Bid accepted as new highest bid' } },
      },
    },
    '/api/v1/shipments/{id}/status': {
      patch: {
        summary: 'Advance shipment state machine (Allocated -> Received)',
        security: [{ BearerAuth: [] }],
        parameters: [{ name: 'id', in: 'path', required: true, schema: { type: 'string' } }],
        requestBody: {
          required: true,
          content: { 'application/json': { schema: { $ref: '#/components/schemas/UpdateShipmentStatusRequest' } } },
        },
        responses: { 200: { description: 'Shipment status updated' } },
      },
    },
    '/api/v1/maps/active': {
      get: {
        summary: 'Get single uncluttered active transaction map (auto-drops on Received)',
        security: [{ BearerAuth: [] }],
        responses: { 200: { description: 'Active undelivered runs returned' } },
      },
    },
    '/api/v1/logistics/consolidation': {
      get: {
        summary: 'Analyze same-seller multi-buyer route consolidation with dynamic mileage savings',
        security: [{ BearerAuth: [] }],
        responses: { 200: { description: 'Dynamic route consolidation analysis returned' } },
      },
    },
    '/api/v1/auth/refresh': {
      post: {
        summary: 'Rotate refresh token',
        requestBody: {
          required: true,
          content: {
            'application/json': {
              schema: {
                type: 'object',
                required: ['refreshToken'],
                properties: { refreshToken: { type: 'string' } },
              },
            },
          },
        },
        responses: { 200: { description: 'New token pair generated' } },
      },
    },
    '/api/v1/auth/me': {
      get: {
        summary: 'Get authenticated user profile and company info',
        security: [{ BearerAuth: [] }],
        responses: { 200: { description: 'Current user profile returned' } },
      },
    },
    '/api/v1/listings/{id}/deactivate': {
      patch: {
        summary: 'Deactivate active listing (Seller only)',
        security: [{ BearerAuth: [] }],
        parameters: [{ name: 'id', in: 'path', required: true, schema: { type: 'string' } }],
        responses: { 200: { description: 'Listing deactivated' } },
      },
    },
    '/api/v1/requirements/{id}/cancel': {
      patch: {
        summary: 'Cancel open requirement (Buyer only)',
        security: [{ BearerAuth: [] }],
        parameters: [{ name: 'id', in: 'path', required: true, schema: { type: 'string' } }],
        responses: { 200: { description: 'Requirement cancelled' } },
      },
    },
    '/api/v1/orders': {
      get: {
        summary: 'List orders relevant to authenticated company',
        security: [{ BearerAuth: [] }],
        responses: { 200: { description: 'Orders returned' } },
      },
    },
    '/api/v1/orders/{id}': {
      get: {
        summary: 'Get order details with sub-allocations and shipments',
        security: [{ BearerAuth: [] }],
        parameters: [{ name: 'id', in: 'path', required: true, schema: { type: 'string' } }],
        responses: { 200: { description: 'Order details returned' } },
      },
    },
    '/api/v1/auctions/{id}/finalize': {
      post: {
        summary: 'Finalize auction, award batch, and create order (Seller only)',
        security: [{ BearerAuth: [] }],
        parameters: [{ name: 'id', in: 'path', required: true, schema: { type: 'string' } }],
        requestBody: {
          required: true,
          content: {
            'application/json': {
              schema: {
                type: 'object',
                required: ['deliveryLat', 'deliveryLng', 'deliveryAddress'],
                properties: {
                  deliveryLat: { type: 'number', example: 23.0225 },
                  deliveryLng: { type: 'number', example: 72.5714 },
                  deliveryAddress: { type: 'string', example: 'Ahmedabad Delivery Site' },
                },
              },
            },
          },
        },
        responses: { 200: { description: 'Auction settled or marked expired' } },
      },
    },
    '/api/v1/documents/coa/upload': {
      post: {
        summary: 'Upload Certificate of Analysis PDF for batch (Seller only)',
        security: [{ BearerAuth: [] }],
        requestBody: {
          required: true,
          content: {
            'multipart/form-data': {
              schema: {
                type: 'object',
                required: ['file', 'batchId'],
                properties: {
                  file: { type: 'string', format: 'binary', description: 'PDF file assay' },
                  batchId: { type: 'string', format: 'uuid' },
                },
              },
            },
          },
        },
        responses: { 201: { description: 'CoA uploaded with CERTIFICATE_UPLOADED status' } },
      },
    },
    '/api/v1/documents/coa/{batchId}': {
      get: {
        summary: 'Get CoA metadata for a batch',
        security: [{ BearerAuth: [] }],
        parameters: [{ name: 'batchId', in: 'path', required: true, schema: { type: 'string' } }],
        responses: { 200: { description: 'CoA metadata returned' } },
      },
    },
    '/api/v1/documents/coa/download/{batchId}': {
      get: {
        summary: 'Download Certificate of Analysis PDF',
        security: [{ BearerAuth: [] }],
        parameters: [{ name: 'batchId', in: 'path', required: true, schema: { type: 'string' } }],
        responses: { 200: { description: 'PDF stream' } },
      },
    },
    '/api/v1/shipments': {
      get: {
        summary: 'List shipments for authenticated user',
        security: [{ BearerAuth: [] }],
        responses: { 200: { description: 'Shipments list returned' } },
      },
    },
    '/api/v1/shipments/{id}': {
      get: {
        summary: 'Get shipment details by ID',
        security: [{ BearerAuth: [] }],
        parameters: [{ name: 'id', in: 'path', required: true, schema: { type: 'string' } }],
        responses: { 200: { description: 'Shipment returned' } },
      },
    },
    '/api/v1/notifications': {
      get: {
        summary: 'Get user in-app notifications',
        security: [{ BearerAuth: [] }],
        responses: { 200: { description: 'Notifications returned' } },
      },
    },
    '/api/v1/notifications/{id}/read': {
      patch: {
        summary: 'Mark notification as read',
        security: [{ BearerAuth: [] }],
        parameters: [{ name: 'id', in: 'path', required: true, schema: { type: 'string' } }],
        responses: { 200: { description: 'Marked read' } },
      },
    },
    '/api/v1/insights/marketplace': {
      get: {
        summary: 'Marketplace supply-demand intelligence and regional cluster analytics',
        security: [{ BearerAuth: [] }],
        responses: { 200: { description: 'Aggregated active demand vs supply insights' } },
      },
    },
    '/api/v1/insights/seller': {
      get: {
        summary: 'Seller opportunity insights matching available inventory to active buyer requirements',
        security: [{ BearerAuth: [] }],
        responses: { 200: { description: 'Matched buyer opportunities with match score and CTA' } },
      },
    },
    '/api/v1/opportunities': {
      get: {
        summary: 'Alias for seller matching opportunities',
        security: [{ BearerAuth: [] }],
        responses: { 200: { description: 'Matched buyer opportunities' } },
      },
    },
    '/api/v1/insights/buyer/{requirementId}': {
      get: {
        summary: 'Buyer demand-side intelligence and radius expansion opportunities',
        security: [{ BearerAuth: [] }],
        parameters: [{ name: 'requirementId', in: 'path', required: true, schema: { type: 'string' } }],
        responses: { 200: { description: 'Feasible combos, fulfillment %, radius unlock data' } },
      },
    },
    '/api/v1/auctions/{id}/insights': {
      get: {
        summary: 'Real-time auction analytics, bid frequency trend, and advisory note',
        security: [{ BearerAuth: [] }],
        parameters: [{ name: 'id', in: 'path', required: true, schema: { type: 'string' } }],
        responses: { 200: { description: 'Auction bid analytics returned' } },
      },
    },
  },
};
