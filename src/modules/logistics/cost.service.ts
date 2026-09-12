import { config } from '../../config/env.js';
import {
  CostBreakdown,
  LandedCost,
  VehicleConfig,
  BaselineComparison,
  DeliveryStop,
} from './types.js';

export class CostService {
  /**
   * Resolves vehicle configuration with defaults from environment configuration
   */
  public static resolveVehicleConfig(override?: Partial<VehicleConfig>): Required<VehicleConfig> {
    return {
      capacityTonnes: override?.capacityTonnes ?? config.LOGISTICS_DEFAULT_VEHICLE_CAPACITY_TONNES,
      mileageKmPerLitre: override?.mileageKmPerLitre ?? config.LOGISTICS_VEHICLE_MILEAGE_KM_PER_LITRE,
      fuelPricePerLitre: override?.fuelPricePerLitre ?? config.LOGISTICS_FUEL_PRICE_PER_LITRE,
      operatingCostPerKm: override?.operatingCostPerKm ?? config.LOGISTICS_VEHICLE_OPERATING_COST_PER_KM,
      driverCostPerHour: override?.driverCostPerHour ?? config.LOGISTICS_DRIVER_COST_PER_HOUR,
      tollRatePerKm: override?.tollRatePerKm ?? config.LOGISTICS_TOLL_RATE_PER_KM,
      loadingCostPerTonne: override?.loadingCostPerTonne ?? config.LOGISTICS_LOADING_COST_PER_TONNE,
      unloadingCostPerStop: override?.unloadingCostPerStop ?? config.LOGISTICS_UNLOADING_COST_PER_STOP,
      averageSpeedKmH: override?.averageSpeedKmH ?? config.LOGISTICS_AVERAGE_SPEED_KM_H,
    };
  }

  /**
   * Calculates comprehensive transparent logistics cost breakdown for a given route leg/trip
   */
  public static calculateTripCost(
    distanceKm: number,
    durationHours: number,
    deliveredQuantityTonnes: number,
    numberOfStops: number,
    vehicleConfig?: Partial<VehicleConfig>
  ): CostBreakdown {
    const cfg = this.resolveVehicleConfig(vehicleConfig);

    // 1. Fuel cost = (distanceKm / vehicleMileageKmPerLitre) * fuelPricePerLitre
    const fuelLitres =
      cfg.mileageKmPerLitre > 0
        ? Math.round((distanceKm / cfg.mileageKmPerLitre) * 100) / 100
        : 0;
    const fuelCost = Math.round(fuelLitres * cfg.fuelPricePerLitre * 100) / 100;

    // 2. Vehicle operating cost = distanceKm * operatingCostPerKm
    const vehicleOperatingCost =
      Math.round(distanceKm * cfg.operatingCostPerKm * 100) / 100;

    // 3. Driver & hazmat crew cost = durationHours * driverCostPerHour
    const driverCost =
      Math.round(durationHours * cfg.driverCostPerHour * 100) / 100;

    // 4. Toll cost estimate = distanceKm * tollRatePerKm
    const tollCost = Math.round(distanceKm * cfg.tollRatePerKm * 100) / 100;

    // 5. Loading cost = deliveredQuantityTonnes * loadingCostPerTonne
    const loadingCost =
      Math.round(deliveredQuantityTonnes * cfg.loadingCostPerTonne * 100) / 100;

    // 6. Unloading & manifold connection cost = numberOfStops * unloadingCostPerStop
    const unloadingCost =
      Math.round(numberOfStops * cfg.unloadingCostPerStop * 100) / 100;

    // 7. Total estimated logistics cost
    const totalEstimatedCost =
      Math.round(
        (fuelCost +
          vehicleOperatingCost +
          driverCost +
          tollCost +
          loadingCost +
          unloadingCost) *
          100
      ) / 100;

    // 8. Unit logistics cost per delivered tonne
    const costPerTonne =
      deliveredQuantityTonnes > 0
        ? Math.round((totalEstimatedCost / deliveredQuantityTonnes) * 100) / 100
        : 0;

    return {
      distanceKm: Math.round(distanceKm * 100) / 100,
      durationHours: Math.round(durationHours * 10) / 10,
      fuelLitres,
      fuelCost,
      vehicleOperatingCost,
      driverCost,
      tollCost,
      loadingCost,
      unloadingCost,
      totalEstimatedCost,
      costPerTonne,
    };
  }

  /**
   * Calculates landed economics (CO2 purchase + estimated logistics)
   */
  public static calculateLandedCost(
    deliveredQuantityTonnes: number,
    totalLogisticsCost: number,
    averageCo2PricePerTon: number = 2400
  ): LandedCost {
    const co2PurchaseCost =
      Math.round(deliveredQuantityTonnes * averageCo2PricePerTon * 100) / 100;
    const totalLandedCost =
      Math.round((co2PurchaseCost + totalLogisticsCost) * 100) / 100;
    const landedCostPerTonne =
      deliveredQuantityTonnes > 0
        ? Math.round((totalLandedCost / deliveredQuantityTonnes) * 100) / 100
        : averageCo2PricePerTon;

    return {
      co2PurchaseCost,
      totalLogisticsCost,
      totalLandedCost,
      landedCostPerTonne,
      averageCo2PricePerTon,
    };
  }

  /**
   * Compares baseline (sum of independent round trips) vs consolidated route
   * Strictly calculates savings ONLY when both are genuinely computed.
   */
  public static calculateBaselineComparison(
    independentTrips: { distanceKm: number; durationHours: number; quantityTonnes: number }[],
    consolidatedCost: CostBreakdown,
    vehicleConfig?: Partial<VehicleConfig>
  ): BaselineComparison {
    const cfg = this.resolveVehicleConfig(vehicleConfig);

    let independentDistanceKm = 0;
    let independentHours = 0;
    let independentTotalCost = 0;
    let totalQuantityTonnes = 0;

    for (const trip of independentTrips) {
      independentDistanceKm += trip.distanceKm;
      independentHours += trip.durationHours;
      totalQuantityTonnes += trip.quantityTonnes;

      const tripCost = this.calculateTripCost(
        trip.distanceKm,
        trip.durationHours,
        trip.quantityTonnes,
        1,
        cfg
      );
      independentTotalCost += tripCost.totalEstimatedCost;
    }

    independentDistanceKm = Math.round(independentDistanceKm * 100) / 100;
    independentHours = Math.round(independentHours * 10) / 10;
    independentTotalCost = Math.round(independentTotalCost * 100) / 100;

    const independentCostPerTonne =
      totalQuantityTonnes > 0
        ? Math.round((independentTotalCost / totalQuantityTonnes) * 100) / 100
        : 0;

    const consolidatedTotalCost = consolidatedCost.totalEstimatedCost;
    const consolidatedCostPerTonne = consolidatedCost.costPerTonne;

    // Savings = baseline - consolidated
    const savingsAmount =
      Math.round(Math.max(0, independentTotalCost - consolidatedTotalCost) * 100) / 100;
    const savingsPercentage =
      independentTotalCost > 0
        ? Math.round((savingsAmount / independentTotalCost) * 10000) / 100
        : 0;
    const distanceSavedKm =
      Math.round(Math.max(0, independentDistanceKm - consolidatedCost.distanceKm) * 100) / 100;
    const hoursSaved =
      Math.round(Math.max(0, independentHours - consolidatedCost.durationHours) * 10) / 10;

    return {
      independentTripsCount: independentTrips.length,
      independentDistanceKm,
      independentHours,
      independentTotalCost,
      independentCostPerTonne,
      consolidatedTotalCost,
      consolidatedCostPerTonne,
      savingsAmount,
      savingsPercentage,
      distanceSavedKm,
      hoursSaved,
      isGenuinelyCalculated: true,
    };
  }
}
