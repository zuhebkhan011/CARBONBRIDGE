import { describe, it, expect, beforeAll } from 'vitest';
import request from 'supertest';
import { app } from '../../src/app.js';
import { prisma } from '../../src/database/prisma.js';
import {
  Role,
  CompanyType,
  ShipmentIndividualStatus,
  OrderType,
  OrderOverallStatus,
  Prisma,
} from '@prisma/client';
import bcrypt from 'bcryptjs';
import { GPS_UNAVAILABLE_DISCLAIMER } from '../../src/common/utils/geo.js';

describe('Buyer Active Map & Shipments Estimated Progress Suite', () => {
  let passwordHash: string;

  beforeAll(async () => {
    passwordHash = await bcrypt.hash('CarbonBridge2026!', 10);
  });

  async function createBuyerWithShipment(params: {
    status: ShipmentIndividualStatus;
    dispatchedAt?: Date | null;
  }) {
    const timestamp = Date.now() + Math.floor(Math.random() * 100000);

    const seller = await prisma.company.create({
      data: {
        name: `Seller Plant ${timestamp}`,
        companyType: CompanyType.EMITTER,
        registrationNumber: `REG-SELLER-${timestamp}`,
        address: 'GIDC Industrial Area, Dahej, Gujarat',
        latitude: 21.7051,
        longitude: 72.5855,
      },
    });

    const buyer = await prisma.company.create({
      data: {
        name: `Buyer Facility ${timestamp}`,
        companyType: CompanyType.OFFTAKER,
        registrationNumber: `REG-BUYER-${timestamp}`,
        address: 'Naroda Industrial Estate, Ahmedabad, Gujarat',
        latitude: 23.0225,
        longitude: 72.5714,
      },
    });

    const buyerUser = await prisma.user.create({
      data: {
        email: `buyer.${timestamp}@delivery.com`,
        passwordHash,
        fullName: 'Test Buyer User',
        role: Role.BUYER,
        companyId: buyer.id,
      },
    });

    const batch = await prisma.batch.create({
      data: {
        batchNumber: `CB-BATCH-${timestamp}`,
        sellerId: seller.id,
        capturedQuantity: new Prisma.Decimal(500),
        availableQuantity: new Prisma.Decimal(300),
        purityPercentage: new Prisma.Decimal(99.5),
        storageTemperatureC: new Prisma.Decimal(-20),
        storagePressureBar: new Prisma.Decimal(18),
        locationLat: new Prisma.Decimal(21.7051),
        locationLng: new Prisma.Decimal(72.5855),
      },
    });

    const order = await prisma.order.create({
      data: {
        orderNumber: `CB-ORD-${timestamp}`,
        orderType: OrderType.SINGLE_SELLER,
        buyerId: buyer.id,
        totalQuantity: new Prisma.Decimal(200),
        totalPrice: new Prisma.Decimal(460000),
        overallStatus: OrderOverallStatus.CONFIRMED,
      },
    });

    const allocation = await prisma.allocation.create({
      data: {
        orderId: order.id,
        batchId: batch.id,
        sellerId: seller.id,
        allocatedQuantity: new Prisma.Decimal(200),
        pricePerTon: new Prisma.Decimal(2300),
      },
    });

    const shipment = await prisma.shipment.create({
      data: {
        orderId: order.id,
        allocationId: allocation.id,
        sellerId: seller.id,
        buyerId: buyer.id,
        individualStatus: params.status,
        originLat: new Prisma.Decimal(21.7051),
        originLng: new Prisma.Decimal(72.5855),
        destinationLat: new Prisma.Decimal(23.0225),
        destinationLng: new Prisma.Decimal(72.5714),
        dispatchedAt: params.dispatchedAt,
        trackingNotes: 'En route to buyer site',
      },
    });

    const loginRes = await request(app).post('/api/v1/auth/login').send({
      email: buyerUser.email,
      password: 'CarbonBridge2026!',
    });

    return {
      token: loginRes.body.data.tokens.accessToken,
      buyerId: buyer.id,
      sellerId: seller.id,
      shipmentId: shipment.id,
    };
  }

  // TEST 1: IN_TRANSIT shipment shows estimated progress on Active Map
  it('TEST 1: IN_TRANSIT shipment returns estimated progress along road geometry', async () => {
    // Dispatched 2 hours ago
    const twoHoursAgo = new Date(Date.now() - 2 * 60 * 60 * 1000);
    const { token, shipmentId } = await createBuyerWithShipment({
      status: ShipmentIndividualStatus.IN_TRANSIT,
      dispatchedAt: twoHoursAgo,
    });

    const res = await request(app)
      .get('/api/v1/maps/active')
      .set('Authorization', `Bearer ${token}`)
      .expect(200);

    expect(res.body.success).toBe(true);
    expect(res.body.data.routes).toHaveLength(1);

    const route = res.body.data.routes[0];
    expect(route.shipmentId).toBe(shipmentId);
    expect(route.status).toBe('IN_TRANSIT');
    expect(route.isRoadRoute).toBe(true);
    expect(route.distanceKm).toBeGreaterThan(150);

    // Verify estimatedProgress
    const progress = route.estimatedProgress;
    expect(progress).not.toBeNull();
    expect(progress.isCalculable).toBe(true);
    expect(progress.progressPercentage).toBeGreaterThanOrEqual(0);
    expect(progress.progressPercentage).toBeLessThanOrEqual(100);
    expect(progress.position).toHaveLength(2);
    expect(progress.gpsDisclaimer).toBe(GPS_UNAVAILABLE_DISCLAIMER);
    expect(progress.statusLabel).toBe('Estimated shipment progress');
    expect(progress.travelledGeometry.length).toBeGreaterThan(0);
    expect(progress.remainingGeometry.length).toBeGreaterThan(0);
  });

  // TEST 2: Missing timestamp handled safely on Active Map
  it('TEST 2: Missing dispatch timestamp safely reports unavailable without error or fake coordinates', async () => {
    const { token } = await createBuyerWithShipment({
      status: ShipmentIndividualStatus.IN_TRANSIT,
      dispatchedAt: null,
    });

    const res = await request(app)
      .get('/api/v1/maps/active')
      .set('Authorization', `Bearer ${token}`)
      .expect(200);

    const route = res.body.data.routes[0];
    expect(route.status).toBe('IN_TRANSIT');

    const progress = route.estimatedProgress;
    expect(progress).not.toBeNull();
    expect(progress.isCalculable).toBe(false);
    expect(progress.progressPercentage).toBeNull();
    expect(progress.position).toBeNull();
    expect(progress.etaText).toBe('ETA unavailable');
    expect(progress.progressText).toBe('Estimated progress unavailable');
  });

  // TEST 3: DELIVERED shipment has no truck marker
  it('TEST 3: DELIVERED shipment has no in-transit truck progress', async () => {
    const { token } = await createBuyerWithShipment({
      status: ShipmentIndividualStatus.DELIVERED,
      dispatchedAt: new Date(Date.now() - 5 * 60 * 60 * 1000),
    });

    const res = await request(app)
      .get('/api/v1/maps/active')
      .set('Authorization', `Bearer ${token}`)
      .expect(200);

    const route = res.body.data.routes[0];
    expect(route.status).toBe('DELIVERED');
    expect(route.estimatedProgress).toBeNull();
  });

  // TEST 4: RECEIVED shipment is auto-excluded from Active Map
  it('TEST 4: RECEIVED shipment auto-drops from Active Map', async () => {
    const { token } = await createBuyerWithShipment({
      status: ShipmentIndividualStatus.RECEIVED,
      dispatchedAt: new Date(Date.now() - 10 * 60 * 60 * 1000),
    });

    const res = await request(app)
      .get('/api/v1/maps/active')
      .set('Authorization', `Bearer ${token}`)
      .expect(200);

    expect(res.body.data.routes).toHaveLength(0);
    expect(res.body.data.activeRunsCount).toBe(0);
  });

  // TEST 5: Shipments API returns enriched estimated progress for Buyer Shipments page
  it('TEST 5: GET /api/v1/shipments enriches IN_TRANSIT shipments with estimatedProgress', async () => {
    const oneHourAgo = new Date(Date.now() - 1 * 60 * 60 * 1000);
    const { token, shipmentId } = await createBuyerWithShipment({
      status: ShipmentIndividualStatus.IN_TRANSIT,
      dispatchedAt: oneHourAgo,
    });

    const res = await request(app)
      .get('/api/v1/shipments')
      .set('Authorization', `Bearer ${token}`)
      .expect(200);

    expect(res.body.success).toBe(true);
    const found = res.body.data.find((s: any) => s.id === shipmentId);
    expect(found).toBeDefined();
    expect(found.individualStatus).toBe('IN_TRANSIT');
    expect(found.estimatedProgress).toBeDefined();
    expect(found.estimatedProgress.isCalculable).toBe(true);
    expect(found.estimatedProgress.gpsDisclaimer).toBe(GPS_UNAVAILABLE_DISCLAIMER);
  });

  // TEST 6: Tenant isolation — Buyer can only see own estimated progress
  it('TEST 6: Tenant isolation ensures buyers only access their own shipment progress', async () => {
    const { shipmentId } = await createBuyerWithShipment({
      status: ShipmentIndividualStatus.IN_TRANSIT,
      dispatchedAt: new Date(Date.now() - 3600000),
    });

    // Create a second, unrelated buyer
    const { token: token2 } = await createBuyerWithShipment({
      status: ShipmentIndividualStatus.ALLOCATED,
    });

    const res2 = await request(app)
      .get('/api/v1/maps/active')
      .set('Authorization', `Bearer ${token2}`)
      .expect(200);

    // Must NOT contain the first buyer's shipment
    const routes2 = res2.body.data.routes;
    const hasOtherShipment = routes2.some((r: any) => r.shipmentId === shipmentId);
    expect(hasOtherShipment).toBe(false);
  });

  // TEST 7: Existing shipment lifecycle state transitions remain strictly protected
  it('TEST 7: Existing state machine transitions remain strictly enforced', async () => {
    const { shipmentId, sellerId } = await createBuyerWithShipment({
      status: ShipmentIndividualStatus.IN_TRANSIT,
    });

    const sellerUser = await prisma.user.create({
      data: {
        email: `seller.${Date.now()}@shipping.com`,
        passwordHash,
        fullName: 'Test Seller User',
        role: Role.SELLER,
        companyId: sellerId,
      },
    });

    const sellerLogin = await request(app).post('/api/v1/auth/login').send({
      email: sellerUser.email,
      password: 'CarbonBridge2026!',
    });
    const sellerToken = sellerLogin.body.data.tokens.accessToken;

    // Attempt invalid jump from IN_TRANSIT directly to RECEIVED (only DELIVERED is valid next state)
    const invalidJumpRes = await request(app)
      .patch(`/api/v1/shipments/${shipmentId}/status`)
      .set('Authorization', `Bearer ${sellerToken}`)
      .send({ status: 'RECEIVED' });

    expect(invalidJumpRes.status).toBe(400); // InvalidStateTransitionError

    // Valid advance: IN_TRANSIT -> DELIVERED
    const validAdvanceRes = await request(app)
      .patch(`/api/v1/shipments/${shipmentId}/status`)
      .set('Authorization', `Bearer ${sellerToken}`)
      .send({ status: 'DELIVERED' });

    expect(validAdvanceRes.status).toBe(200);
    expect(validAdvanceRes.body.data.shipment.individualStatus).toBe('DELIVERED');
  });
});
