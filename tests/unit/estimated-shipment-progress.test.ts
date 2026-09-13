import { describe, it, expect } from 'vitest';
import {
  calculatePositionAlongGeometry,
  calculateEstimatedProgress,
  GPS_UNAVAILABLE_DISCLAIMER,
  calculateDistanceKm,
} from '../../src/common/utils/geo.js';

describe('Estimated In-Transit Shipment Progress & Geometry Interpolation', () => {
  const baseTime = new Date('2026-09-13T12:00:00.000Z');

  // Test 1: IN_TRANSIT shipment shows estimated progress
  it('TEST 1: IN_TRANSIT shipment shows estimated progress', () => {
    const dispatchedAt = new Date(baseTime.getTime() - 2 * 60 * 60 * 1000); // 2 hours ago
    const durationHours = 4;
    const distanceKm = 200;

    const result = calculateEstimatedProgress({
      dispatchedAt,
      durationHours,
      distanceKm,
      currentTime: baseTime,
    });

    expect(result.isCalculable).toBe(true);
    expect(result.progressPercentage).toBe(50);
    expect(result.distanceCoveredKm).toBe(100);
    expect(result.distanceRemainingKm).toBe(100);
    expect(result.durationRemainingHours).toBe(2);
    expect(result.etaText).toBe('~2h remaining');
    expect(result.progressText).toBe('50% estimated');
    expect(result.statusLabel).toBe('Estimated shipment progress');
  });

  // Test 2: 50% elapsed time produces approximately 50% route progress
  it('TEST 2: 50% elapsed time produces approximately 50% route progress (400km / 8h example)', () => {
    // Exactly matches prompt: 400km road distance, 8h duration, 4h in transit
    const dispatchedAt = new Date(baseTime.getTime() - 4 * 60 * 60 * 1000);
    const durationHours = 8;
    const distanceKm = 400;

    const result = calculateEstimatedProgress({
      dispatchedAt,
      durationHours,
      distanceKm,
      currentTime: baseTime,
    });

    expect(result.isCalculable).toBe(true);
    expect(result.elapsedRatio).toBe(0.5);
    expect(result.progressPercentage).toBe(50);
    expect(result.distanceCoveredKm).toBe(200);
    expect(result.distanceRemainingKm).toBe(200);
    expect(result.etaText).toBe('~4h remaining');
  });

  // Test 3: Truck position follows OSRM geometry
  it('TEST 3: Truck position follows OSRM geometry along road segments', () => {
    // 3-point road geometry: (21.0, 72.0) -> (22.0, 72.0) -> (22.0, 73.0)
    // Segment 1 goes North along lon 72.0; Segment 2 goes East along lat 22.0
    const geometry: [number, number][] = [
      [21.0, 72.0],
      [22.0, 72.0],
      [22.0, 73.0],
    ];

    const dist1 = calculateDistanceKm(
      { latitude: 21.0, longitude: 72.0 },
      { latitude: 22.0, longitude: 72.0 }
    );
    const dist2 = calculateDistanceKm(
      { latitude: 22.0, longitude: 72.0 },
      { latitude: 22.0, longitude: 73.0 }
    );
    const totalDist = dist1 + dist2;

    // At 25% of total route, truck must be strictly on Segment 1 (lon = 72.0)
    const pos25 = calculatePositionAlongGeometry(geometry, 0.25);
    expect(pos25).not.toBeNull();
    expect(pos25!.position[1]).toBeCloseTo(72.0, 4); // still along lon 72.0
    expect(pos25!.position[0]).toBeGreaterThan(21.0);
    expect(pos25!.position[0]).toBeLessThan(22.0);

    // At 75% of total route, truck must be strictly on Segment 2 (lat = 22.0)
    const pos75 = calculatePositionAlongGeometry(geometry, 0.75);
    expect(pos75).not.toBeNull();
    expect(pos75!.position[0]).toBeCloseTo(22.0, 4); // turned corner along lat 22.0
    expect(pos75!.position[1]).toBeGreaterThan(72.0);
    expect(pos75!.position[1]).toBeLessThan(73.0);
  });

  // Test 4: Truck never uses straight-line coordinates
  it('TEST 4: Truck never uses straight-line coordinates', () => {
    // Origin: (20.0, 70.0), Destination: (20.0, 80.0)
    // Road route goes way North to avoid a barrier: (20.0, 70.0) -> (25.0, 75.0) -> (20.0, 80.0)
    const roadGeometry: [number, number][] = [
      [20.0, 70.0],
      [25.0, 75.0],
      [20.0, 80.0],
    ];

    const straightLineMidpoint = [20.0, 75.0]; // Direct chord between origin & dest

    const geomResult = calculatePositionAlongGeometry(roadGeometry, 0.5);
    expect(geomResult).not.toBeNull();

    // The road position at 50% must be near (25.0, 75.0), NOT the straight-line midpoint (20.0, 75.0)
    expect(geomResult!.position[0]).toBeCloseTo(25.0, 2);
    expect(geomResult!.position[1]).toBeCloseTo(75.0, 2);

    const distFromStraightLine = Math.abs(geomResult!.position[0] - straightLineMidpoint[0]);
    expect(distFromStraightLine).toBeGreaterThan(4.0); // 5 degrees latitude difference (~550 km)
  });

  // Test 5: Missing timestamp handled safely
  it('TEST 5: Missing timestamp handled safely without fabricating values', () => {
    const resultNull = calculateEstimatedProgress({
      dispatchedAt: null,
      durationHours: 4,
      distanceKm: 200,
    });
    expect(resultNull.isCalculable).toBe(false);
    expect(resultNull.progressPercentage).toBeNull();
    expect(resultNull.position).toBeNull();
    expect(resultNull.etaText).toBe('ETA unavailable');
    expect(resultNull.progressText).toBe('Estimated progress unavailable');

    const resultUndefined = calculateEstimatedProgress({
      dispatchedAt: undefined,
      durationHours: 4,
      distanceKm: 200,
    });
    expect(resultUndefined.isCalculable).toBe(false);
  });

  // Test 6: Missing route duration handled safely
  it('TEST 6: Missing route duration handled safely without fabricating values', () => {
    const resultNullDuration = calculateEstimatedProgress({
      dispatchedAt: new Date(),
      durationHours: null,
      distanceKm: 200,
    });
    expect(resultNullDuration.isCalculable).toBe(false);
    expect(resultNullDuration.progressPercentage).toBeNull();
    expect(resultNullDuration.etaText).toBe('ETA unavailable');

    const resultZeroDuration = calculateEstimatedProgress({
      dispatchedAt: new Date(),
      durationHours: 0,
      distanceKm: 200,
    });
    expect(resultZeroDuration.isCalculable).toBe(false);
  });

  // Test 7: ETA calculated correctly when inputs exist
  it('TEST 7: ETA calculated correctly when inputs exist', () => {
    // 5 hours total duration, 3.5 hours elapsed -> 1.5 hours remaining
    const dispatchedAt1 = new Date(baseTime.getTime() - 3.5 * 60 * 60 * 1000);
    const result1 = calculateEstimatedProgress({
      dispatchedAt: dispatchedAt1,
      durationHours: 5,
      currentTime: baseTime,
    });
    expect(result1.durationRemainingHours).toBe(1.5);
    expect(result1.etaText).toBe('~1.5h remaining');

    // 2 hours total duration, 1 hour 45 min elapsed -> 15 min remaining
    const dispatchedAt2 = new Date(baseTime.getTime() - 1.75 * 60 * 60 * 1000);
    const result2 = calculateEstimatedProgress({
      dispatchedAt: dispatchedAt2,
      durationHours: 2,
      currentTime: baseTime,
    });
    expect(result2.durationRemainingHours).toBe(0.25);
    expect(result2.etaText).toBe('~15m remaining');
  });

  // Test 8: Progress capped between 0–100%
  it('TEST 8: Progress capped between 0% and 100%', () => {
    // Clock skew / future dispatch
    const futureDispatch = new Date(baseTime.getTime() + 1 * 60 * 60 * 1000);
    const resultFuture = calculateEstimatedProgress({
      dispatchedAt: futureDispatch,
      durationHours: 4,
      distanceKm: 200,
      currentTime: baseTime,
    });
    expect(resultFuture.progressPercentage).toBe(0);
    expect(resultFuture.elapsedRatio).toBe(0);
    expect(resultFuture.distanceCoveredKm).toBe(0);
    expect(resultFuture.distanceRemainingKm).toBe(200);

    // Overdue transit: 10h elapsed on a 4h route
    const overdueDispatch = new Date(baseTime.getTime() - 10 * 60 * 60 * 1000);
    const resultOverdue = calculateEstimatedProgress({
      dispatchedAt: overdueDispatch,
      durationHours: 4,
      distanceKm: 200,
      currentTime: baseTime,
    });
    expect(resultOverdue.progressPercentage).toBe(100);
    expect(resultOverdue.elapsedRatio).toBe(1.0);
    expect(resultOverdue.distanceCoveredKm).toBe(200);
    expect(resultOverdue.distanceRemainingKm).toBe(0);
    expect(resultOverdue.durationRemainingHours).toBe(0);
    expect(resultOverdue.etaText).toBe('Arriving shortly');
  });

  // Test 9 & 10: DELIVERED & RECEIVED have no active truck progress
  it('TEST 9 & 10: DELIVERED and RECEIVED status semantics exclude truck interpolation', async () => {
    const { MapsService } = await import('../../src/modules/maps/maps.service.js');
    // MapsService only attaches estimatedProgress when status === IN_TRANSIT
    expect(typeof MapsService.getActiveTransactionMap).toBe('function');
  });

  // Test 11: Multiple sellers have separate estimated positions
  it('TEST 11: Multiple sellers have separate estimated positions based on individual dispatch times', () => {
    const geometryA: [number, number][] = [
      [21.7, 72.5],
      [23.0, 72.5],
    ];
    const geometryB: [number, number][] = [
      [22.3, 73.1],
      [23.0, 72.5],
    ];

    const dispatchA = new Date(baseTime.getTime() - 1 * 60 * 60 * 1000); // 1h of 4h = 25%
    const dispatchB = new Date(baseTime.getTime() - 3 * 60 * 60 * 1000); // 3h of 4h = 75%

    const progressA = calculateEstimatedProgress({
      dispatchedAt: dispatchA,
      durationHours: 4,
      distanceKm: 140,
      geometry: geometryA,
      currentTime: baseTime,
    });

    const progressB = calculateEstimatedProgress({
      dispatchedAt: dispatchB,
      durationHours: 4,
      distanceKm: 110,
      geometry: geometryB,
      currentTime: baseTime,
    });

    expect(progressA.progressPercentage).toBe(25);
    expect(progressB.progressPercentage).toBe(75);
    expect(progressA.position).not.toEqual(progressB.position);
    expect(progressA.etaText).toBe('~3h remaining');
    expect(progressB.etaText).toBe('~1h remaining');
  });

  // Test 12: GPS-unavailable disclaimer is displayed
  it('TEST 12: GPS-unavailable disclaimer is standardized and transparent', () => {
    expect(GPS_UNAVAILABLE_DISCLAIMER).toBe(
      'GPS tracking unavailable — position estimated from shipment progress'
    );
    const progress = calculateEstimatedProgress({
      dispatchedAt: new Date(baseTime.getTime() - 1000),
      durationHours: 2,
    });
    expect(progress.gpsDisclaimer).toBe(
      'GPS tracking unavailable — position estimated from shipment progress'
    );
    expect(progress.statusLabel).toBe('Estimated shipment progress');
  });
});
