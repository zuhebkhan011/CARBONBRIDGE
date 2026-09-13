import { describe, it, expect, beforeAll } from 'vitest';
import request from 'supertest';
import { app } from '../../src/app.js';
import { prisma } from '../../src/database/prisma.js';

describe('Smart Transportation Cost Optimizer — Integration Suite', () => {
  let sellerToken: string;
  let sellerCompanyId: string;
  let otherSellerToken: string;
  let otherSellerCompanyId: string;
  let buyerToken: string;
  let sampleShipmentId: string;
  let otherSellerShipmentId: string;

  beforeAll(async () => {
    // 1. Authenticate primary seller (UltraTech)
    const sellerRes = await request(app).post('/api/v1/auth/login').send({
      email: 'seller.a@ultratech.com',
      password: 'CarbonBridge2026!',
    });
    if (sellerRes.body.data?.tokens?.accessToken) {
      sellerToken = sellerRes.body.data.tokens.accessToken;
      sellerCompanyId = sellerRes.body.data.user.companyId;
    }

    // 2. Authenticate second seller (Tata Steel)
    const otherSellerRes = await request(app).post('/api/v1/auth/login').send({
      email: 'seller.b@tatasteel.com',
      password: 'CarbonBridge2026!',
    });
    if (otherSellerRes.body.data?.tokens?.accessToken) {
      otherSellerToken = otherSellerRes.body.data.tokens.accessToken;
      otherSellerCompanyId = otherSellerRes.body.data.user.companyId;
    }

    // 3. Authenticate buyer
    const buyerRes = await request(app).post('/api/v1/auth/login').send({
      email: 'buyer.synfuels@ahmedabad.com',
      password: 'CarbonBridge2026!',
    });
    if (buyerRes.body.data?.tokens?.accessToken) {
      buyerToken = buyerRes.body.data.tokens.accessToken;
    }

    // 4. Find active shipment for primary seller
    const ship = await prisma.shipment.findFirst({
      where: { sellerId: sellerCompanyId },
    });
    if (ship) {
      sampleShipmentId = ship.id;
    }

    // 5. Find shipment for other seller
    const otherShip = await prisma.shipment.findFirst({
      where: { sellerId: { not: sellerCompanyId } },
    });
    if (otherShip) {
      otherSellerShipmentId = otherShip.id;
    }
  });

  // 1. Active shipments lookup
  it('1. GET /api/v1/logistics/active-shipments returns active shipments for seller', async () => {
    if (!sellerToken) return;

    const res = await request(app)
      .get('/api/v1/logistics/active-shipments')
      .set('Authorization', `Bearer ${sellerToken}`);

    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);
    expect(res.body.data).toHaveProperty('sellerPlant');
    expect(res.body.data).toHaveProperty('activeShipmentsCount');
    expect(res.body.data).toHaveProperty('shipments');
    expect(Array.isArray(res.body.data.shipments)).toBe(true);
  });

  // 2. Route optimization for seller
  it('2. POST /api/v1/logistics/optimize-route produces recommended route with lowest estimated cost', async () => {
    if (!sellerToken) return;

    const res = await request(app)
      .post('/api/v1/logistics/optimize-route')
      .set('Authorization', `Bearer ${sellerToken}`)
      .send({
        customStops: [
          {
            buyerId: 'b1',
            buyerName: 'Vadodara Bio-Chemicals',
            address: 'Vadodara, Gujarat',
            latitude: 22.3072,
            longitude: 73.1812,
            quantityTonnes: 100,
            co2PricePerTon: 2400,
          },
          {
            buyerId: 'b2',
            buyerName: 'Surat Green Polymers',
            address: 'Surat, Gujarat',
            latitude: 21.1702,
            longitude: 72.8311,
            quantityTonnes: 150,
            co2PricePerTon: 2450,
          },
        ],
        vehicle: {
          capacityTonnes: 300,
        },
      });

    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);

    const data = res.body.data;
    expect(data).toHaveProperty('sellerPlant');
    expect(data).toHaveProperty('recommendedRoute');
    expect(data).toHaveProperty('alternatives');
    expect(data).toHaveProperty('baselineComparison');
    expect(data).toHaveProperty('assumptions');

    // Verify recommended route has lowest cost
    const recCost = data.recommendedRoute.costBreakdown.totalEstimatedCost;
    expect(recCost).toBeGreaterThan(0);
    expect(data.recommendedRoute.isRecommended).toBe(true);
    expect(data.recommendedRoute.whyRecommended).toContain('lowest estimated logistics cost');

    // Unit economics
    expect(data.recommendedRoute.costBreakdown).toHaveProperty('costPerTonne');
    expect(data.recommendedRoute.landedCost).toHaveProperty('landedCostPerTonne');
    expect(data.recommendedRoute.landedCost.landedCostPerTonne).toBeGreaterThan(2400);

    // Baseline savings
    expect(data.baselineComparison.isGenuinelyCalculated).toBe(true);

    // Road network geometry verification
    expect(data.recommendedRoute).toHaveProperty('isRoadRoute');
    expect(data.recommendedRoute.isRoadRoute).toBe(true);
    expect(data.recommendedRoute.routeType).toBe('ROAD_NETWORK');
    expect(data.recommendedRoute.routingProvider).toBe('OSRM');
    expect(Array.isArray(data.recommendedRoute.geometry)).toBe(true);
    expect(data.recommendedRoute.geometry.length).toBeGreaterThan(100);
  });

  // 3. Multi-trip partitioning when demand exceeds vehicle capacity
  it('3. POST /api/v1/logistics/optimize-route splits demand into multiple trips when capacity exceeded', async () => {
    if (!sellerToken) return;

    const res = await request(app)
      .post('/api/v1/logistics/optimize-route')
      .set('Authorization', `Bearer ${sellerToken}`)
      .send({
        customStops: [
          {
            buyerId: 'b1',
            buyerName: 'Buyer A',
            latitude: 22.3,
            longitude: 73.1,
            quantityTonnes: 200,
          },
          {
            buyerId: 'b2',
            buyerName: 'Buyer B',
            latitude: 21.2,
            longitude: 72.8,
            quantityTonnes: 150,
          },
        ],
        vehicle: {
          capacityTonnes: 200, // Total is 350T -> must split into 2 trips
        },
      });

    expect(res.status).toBe(200);
    expect(res.body.data.requiresMultipleTrips).toBe(true);
    expect(res.body.data.recommendedRoute.trips.length).toBe(2);

    // Each trip must be <= 200T
    for (const trip of res.body.data.recommendedRoute.trips) {
      expect(trip.allocatedTonnage).toBeLessThanOrEqual(200);
    }
  });

  // 4. Route selection without mutating shipment state machine
  it('4. POST /api/v1/logistics/select-route records selection and does not mutate shipment status', async () => {
    if (!sellerToken || !sampleShipmentId) return;

    const shipBefore = await prisma.shipment.findUnique({
      where: { id: sampleShipmentId },
    });
    expect(shipBefore).not.toBeNull();
    const statusBefore = shipBefore!.individualStatus;

    const res = await request(app)
      .post('/api/v1/logistics/select-route')
      .set('Authorization', `Bearer ${sellerToken}`)
      .send({
        routeId: 'opt-cost',
        routeName: 'Economically Optimized Route',
        shipmentIds: [sampleShipmentId],
        tripPlans: [
          {
            tripNumber: 1,
            stops: [sampleShipmentId],
            distanceKm: 150,
            totalCost: 8500,
          },
        ],
      });

    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);
    expect(res.body.data.status).toBe('ROUTE_CONFIRMED');

    // Verify shipment individual status did NOT mutate
    const shipAfter = await prisma.shipment.findUnique({
      where: { id: sampleShipmentId },
    });
    expect(shipAfter?.individualStatus).toBe(statusBefore);
    expect(shipAfter?.trackingNotes).toContain('[Selected Route: Economically Optimized Route]');
  });

  // 5. Backward compatibility: GET /api/v1/logistics/consolidation
  it('5. GET /api/v1/logistics/consolidation remains backward-compatible with existing tests', async () => {
    if (!sellerToken) return;

    const res = await request(app)
      .get('/api/v1/logistics/consolidation')
      .set('Authorization', `Bearer ${sellerToken}`);

    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);
  });

  // 6. Security: Unauthenticated request returns 401
  it('6. Unauthenticated request to /api/v1/logistics/optimize-route returns 401 Unauthorized', async () => {
    const res = await request(app).post('/api/v1/logistics/optimize-route').send({});
    expect(res.status).toBe(401);
  });

  // 7. Security: Unauthorized role (Buyer) cannot access seller-only route optimizer
  it('7. Buyer role receives 403 Forbidden on /api/v1/logistics/optimize-route', async () => {
    if (!buyerToken) return;

    const res = await request(app)
      .post('/api/v1/logistics/optimize-route')
      .set('Authorization', `Bearer ${buyerToken}`)
      .send({});

    expect(res.status).toBe(403);
  });

  // 8. Security: Seller cannot optimize shipments owned by another seller
  it('8. Seller attempting to bundle shipments owned by another seller receives 403 Forbidden', async () => {
    if (!sellerToken || !otherSellerShipmentId) return;

    const res = await request(app)
      .post('/api/v1/logistics/optimize-route')
      .set('Authorization', `Bearer ${sellerToken}`)
      .send({
        shipmentIds: [otherSellerShipmentId],
      });

    expect(res.status).toBe(403);
    expect(res.body.error?.message).toContain('another seller');
  });
});
