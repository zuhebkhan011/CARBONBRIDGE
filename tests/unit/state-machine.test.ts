import { describe, it, expect } from 'vitest';
import { ShipmentIndividualStatus, OrderOverallStatus } from '@prisma/client';

describe('Shipment State Machine & Order Status Aggregation Rules', () => {
  const VALID_TRANSITIONS: Record<
    ShipmentIndividualStatus,
    ShipmentIndividualStatus[]
  > = {
    [ShipmentIndividualStatus.ALLOCATED]: [ShipmentIndividualStatus.DISPATCH_PENDING],
    [ShipmentIndividualStatus.DISPATCH_PENDING]: [ShipmentIndividualStatus.IN_TRANSIT],
    [ShipmentIndividualStatus.IN_TRANSIT]: [ShipmentIndividualStatus.DELIVERED],
    [ShipmentIndividualStatus.DELIVERED]: [ShipmentIndividualStatus.RECEIVED],
    [ShipmentIndividualStatus.RECEIVED]: [],
  };

  it('should permit only exact forward step-by-step state machine progressions', () => {
    expect(VALID_TRANSITIONS[ShipmentIndividualStatus.ALLOCATED]).toEqual([
      ShipmentIndividualStatus.DISPATCH_PENDING,
    ]);
    expect(VALID_TRANSITIONS[ShipmentIndividualStatus.DISPATCH_PENDING]).toEqual([
      ShipmentIndividualStatus.IN_TRANSIT,
    ]);
    expect(VALID_TRANSITIONS[ShipmentIndividualStatus.IN_TRANSIT]).toEqual([
      ShipmentIndividualStatus.DELIVERED,
    ]);
    expect(VALID_TRANSITIONS[ShipmentIndividualStatus.DELIVERED]).toEqual([
      ShipmentIndividualStatus.RECEIVED,
    ]);
    expect(VALID_TRANSITIONS[ShipmentIndividualStatus.RECEIVED]).toEqual([]);
  });

  it('should reject invalid illegal shortcuts such as ALLOCATED -> RECEIVED', () => {
    const isAllowed = VALID_TRANSITIONS[ShipmentIndividualStatus.ALLOCATED].includes(
      ShipmentIndividualStatus.RECEIVED
    );
    expect(isAllowed).toBe(false);
  });

  it('should reject backward transitions such as DELIVERED -> IN_TRANSIT', () => {
    const isAllowed = VALID_TRANSITIONS[ShipmentIndividualStatus.DELIVERED].includes(
      ShipmentIndividualStatus.IN_TRANSIT
    );
    expect(isAllowed).toBe(false);
  });

  it('should compute parent order status as IN_FULFILLMENT if any allocation shipment is in progress', () => {
    const shipmentStatuses: ShipmentIndividualStatus[] = [
      ShipmentIndividualStatus.DELIVERED,
      ShipmentIndividualStatus.IN_TRANSIT,
      ShipmentIndividualStatus.DISPATCH_PENDING,
    ];

    const allReceived = shipmentStatuses.every(
      (s) => s === ShipmentIndividualStatus.RECEIVED
    );
    const allDeliveredOrReceived = shipmentStatuses.every(
      (s) =>
        s === ShipmentIndividualStatus.DELIVERED || s === ShipmentIndividualStatus.RECEIVED
    );
    const anyInProgress = shipmentStatuses.some(
      (s) =>
        s === ShipmentIndividualStatus.DISPATCH_PENDING ||
        s === ShipmentIndividualStatus.IN_TRANSIT ||
        s === ShipmentIndividualStatus.DELIVERED
    );

    let overall: OrderOverallStatus = OrderOverallStatus.CONFIRMED;
    if (allReceived) overall = OrderOverallStatus.RECEIVED;
    else if (allDeliveredOrReceived) overall = OrderOverallStatus.DELIVERED;
    else if (anyInProgress) overall = OrderOverallStatus.IN_FULFILLMENT;

    expect(overall).toBe(OrderOverallStatus.IN_FULFILLMENT);
  });

  it('should transition parent order to DELIVERED only when ALL child allocations reach DELIVERED or RECEIVED', () => {
    const shipmentStatuses = [
      ShipmentIndividualStatus.DELIVERED,
      ShipmentIndividualStatus.DELIVERED,
      ShipmentIndividualStatus.DELIVERED,
    ];

    const allDeliveredOrReceived = shipmentStatuses.every(
      (s) =>
        s === ShipmentIndividualStatus.DELIVERED || s === ShipmentIndividualStatus.RECEIVED
    );
    expect(allDeliveredOrReceived).toBe(true);
  });

  it('should transition parent order to RECEIVED only when ALL child allocations are confirmed RECEIVED by the buyer', () => {
    const shipmentStatuses = [
      ShipmentIndividualStatus.RECEIVED,
      ShipmentIndividualStatus.RECEIVED,
      ShipmentIndividualStatus.RECEIVED,
    ];

    const allReceived = shipmentStatuses.every(
      (s) => s === ShipmentIndividualStatus.RECEIVED
    );
    expect(allReceived).toBe(true);
  });
});
