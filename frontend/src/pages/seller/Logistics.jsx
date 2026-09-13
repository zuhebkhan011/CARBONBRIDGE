import { useEffect, useState, useRef } from 'react';
import { logisticsApi } from '../../api/logistics';
import './Logistics.css';

const DEMO_SCENARIO_STOPS = [
  {
    buyerId: 'demo-vadodara',
    buyerName: 'Vadodara Bio-Chemicals Ltd',
    address: 'Nandesari GIDC, Vadodara, Gujarat',
    latitude: 22.3072,
    longitude: 73.1812,
    quantityTonnes: 100,
    requiredDeliveryDate: new Date(Date.now() + 48 * 3600 * 1000).toISOString(),
    co2PricePerTon: 2400,
  },
  {
    buyerId: 'demo-rajkot',
    buyerName: 'Rajkot Synfuels Corp',
    address: 'Shapar-Veraval, Rajkot, Gujarat',
    latitude: 22.3039,
    longitude: 70.8022,
    quantityTonnes: 150,
    requiredDeliveryDate: new Date(Date.now() + 72 * 3600 * 1000).toISOString(),
    co2PricePerTon: 2450,
  },
  {
    buyerId: 'demo-surat',
    buyerName: 'Surat Green Polymers',
    address: 'Hazira Industrial Area, Surat, Gujarat',
    latitude: 21.1702,
    longitude: 72.8311,
    quantityTonnes: 100,
    requiredDeliveryDate: new Date(Date.now() + 96 * 3600 * 1000).toISOString(),
    co2PricePerTon: 2480,
  },
];

export function Logistics() {
  const [optimization, setOptimization] = useState(null);
  const [activeShipments, setActiveShipments] = useState([]);
  const [loading, setLoading] = useState(true);
  const [optimizing, setOptimizing] = useState(false);
  const [selectedRouteId, setSelectedRouteId] = useState(null);
  const [selectionSuccess, setSelectionSuccess] = useState(null);
  const [vehicleCapacity, setVehicleCapacity] = useState(200);
  const [useScenario, setUseScenario] = useState(false);

  const mapRef = useRef(null);
  const mapInstanceRef = useRef(null);
  const layersGroupRef = useRef(null);

  // Load initial active shipments and run baseline optimization
  useEffect(() => {
    async function loadInitial() {
      setLoading(true);
      try {
        const res = await logisticsApi.getActiveShipments();
        const shipments = res?.data?.shipments || [];
        setActiveShipments(shipments);

        // Default to the 3-buyer demo corridor (350T) for immediate multi-trip capacity demonstration
        setUseScenario(true);
        await runOptimization(true, 200);
      } catch (err) {
        console.error('Failed to load active shipments. Falling back to demo corridor:', err);
        setUseScenario(true);
        await runOptimization(true, 200);
      } finally {
        setLoading(false);
      }
    }

    loadInitial();
  }, []);

  // Trigger optimization
  async function runOptimization(scenarioMode = useScenario, capacity = vehicleCapacity) {
    setOptimizing(true);
    setSelectionSuccess(null);
    try {
      const payload = {
        vehicle: { capacityTonnes: Number(capacity) },
      };

      if (scenarioMode) {
        payload.customStops = DEMO_SCENARIO_STOPS;
      }

      const res = await logisticsApi.optimizeRoute(payload);
      const optData = res?.data || res;
      setOptimization(optData);
      setSelectedRouteId(optData?.recommendedRoute?.routeId || 'opt-cost');
    } catch (err) {
      console.error('Optimization error:', err);
    } finally {
      setOptimizing(false);
    }
  }

  // Handle route selection persistence
  async function handleSelectRoute(candidate) {
    try {
      const payload = {
        routeId: candidate.routeId,
        routeName: candidate.name,
        tripPlans: candidate.trips.map((t) => ({
          tripNumber: t.tripNumber,
          stops: t.stops.map((s) => s.buyerName),
          distanceKm: t.totalDistanceKm,
          totalCost: t.costBreakdown.totalEstimatedCost,
        })),
        shipmentIds: activeShipments.map((s) => s.shipmentId).filter(Boolean),
      };

      const res = await logisticsApi.selectRoute(payload);
      setSelectedRouteId(candidate.routeId);
      setSelectionSuccess(
        `Route '${candidate.name}' confirmed! Assigned to trip planning without altering shipment status.`
      );
      setTimeout(() => setSelectionSuccess(null), 6000);
    } catch (err) {
      console.error('Failed to select route:', err);
    }
  }

  // Render Leaflet Map
  useEffect(() => {
    if (!mapRef.current) return;

    // Load Leaflet dynamically
    const link = document.createElement('link');
    link.rel = 'stylesheet';
    link.href = 'https://unpkg.com/leaflet@1.9.4/dist/leaflet.css';
    document.head.appendChild(link);

    import('leaflet').then((L) => {
      if (!mapInstanceRef.current) {
        const map = L.map(mapRef.current).setView([22.3, 72.8], 7);
        mapInstanceRef.current = map;

        L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
          attribution: '© OpenStreetMap contributors',
          maxZoom: 18,
        }).addTo(map);

        layersGroupRef.current = L.layerGroup().addTo(map);
      }

      const map = mapInstanceRef.current;
      const layerGroup = layersGroupRef.current;
      if (!layerGroup) return;
      layerGroup.clearLayers();

      const candidate =
        optimization?.alternatives?.find((a) => a.routeId === selectedRouteId) ||
        optimization?.recommendedRoute;

      if (!candidate || !candidate.trips) return;

      const origin = optimization?.sellerPlant?.coordinates || { latitude: 22.9563, longitude: 72.6375 };
      const bounds = [];

      // Add Seller Origin Plant Marker
      const originIcon = L.divIcon({
        className: 'custom-map-pin origin-pin',
        html: `<div style="background:#1B4332;color:#fff;border-radius:50%;width:34px;height:34px;display:flex;align-items:center;justify-content:center;font-weight:bold;border:2px solid #fff;box-shadow:0 2px 8px rgba(0,0,0,0.3);font-size:14px;">S</div>`,
        iconSize: [34, 34],
        iconAnchor: [17, 17],
      });

      L.marker([origin.latitude, origin.longitude], { icon: originIcon })
        .bindPopup(`<strong>Origin:</strong> ${optimization?.sellerPlant?.name || 'Seller Plant'}<br/><em>Depot & Cryogenic Terminal</em>`)
        .addTo(layerGroup);
      bounds.push([origin.latitude, origin.longitude]);

      // Trip Polyline Colors
      const tripColors = ['#2D6A4F', '#0284C7', '#D97706', '#7C3AED'];

      candidate.trips.forEach((trip, tIdx) => {
        const color = tripColors[tIdx % tripColors.length];

        // Draw delivery drop pins (1, 2, 3...)
        trip.stops.forEach((stop, sIdx) => {
          const stopIcon = L.divIcon({
            className: 'custom-map-pin stop-pin',
            html: `<div style="background:${color};color:#fff;border-radius:50%;width:30px;height:30px;display:flex;align-items:center;justify-content:center;font-weight:bold;border:2px solid #fff;box-shadow:0 2px 6px rgba(0,0,0,0.25);font-size:13px;">${sIdx + 1}</div>`,
            iconSize: [30, 30],
            iconAnchor: [15, 15],
          });

          L.marker([stop.coordinates.latitude, stop.coordinates.longitude], { icon: stopIcon })
            .bindPopup(
              `<strong>Stop ${sIdx + 1}: ${stop.buyerName}</strong><br/>
               Drop: <strong>${stop.quantityTonnes} T CO₂</strong><br/>
               Trip: ${trip.tripNumber} of ${candidate.trips.length}<br/>
               ${stop.address ? `Address: ${stop.address}<br/>` : ''}`
            )
            .addTo(layerGroup);

          bounds.push([stop.coordinates.latitude, stop.coordinates.longitude]);
        });

        // Draw Route Geometry
        if (trip.geometry && trip.geometry.length > 0) {
          const isRoad = trip.isRoadRoute !== false && candidate.isRoadRoute !== false;
          L.polyline(trip.geometry, {
            color: isRoad ? color : '#b45309',
            weight: isRoad ? 5 : 3,
            opacity: isRoad ? 0.9 : 0.75,
            dashArray: isRoad ? null : '6, 8',
            lineJoin: 'round',
            lineCap: 'round',
          }).addTo(layerGroup);

          // Sample road geometry points into bounds for accurate viewport framing
          const step = Math.max(1, Math.floor(trip.geometry.length / 30));
          for (let i = 0; i < trip.geometry.length; i += step) {
            bounds.push(trip.geometry[i]);
          }
        }
      });

      if (bounds.length > 1) {
        map.fitBounds(bounds, { padding: [40, 40] });
      }

      setTimeout(() => map.invalidateSize(), 150);
    });
  }, [optimization, selectedRouteId]);

  // Handle container resize to ensure Leaflet recomputes its viewport
  useEffect(() => {
    if (!mapRef.current) return;
    const ro = new ResizeObserver(() => {
      if (mapInstanceRef.current) {
        mapInstanceRef.current.invalidateSize();
      }
    });
    ro.observe(mapRef.current);
    return () => ro.disconnect();
  }, []);

  const recommended = optimization?.recommendedRoute;
  const activeCandidate =
    optimization?.alternatives?.find((a) => a.routeId === selectedRouteId) || recommended;

  // Single Source of Truth for economic comparison
  const candidateToCompare = activeCandidate || recommended;
  const baselineCost = optimization?.baselineComparison?.independentTotalCost ?? 0;
  const baselineDistance = optimization?.baselineComparison?.independentDistanceKm ?? 0;
  const baselineTripsCount = optimization?.baselineComparison?.independentTripsCount ?? 1;
  const candidateCost = candidateToCompare?.costBreakdown?.totalEstimatedCost ?? optimization?.baselineComparison?.consolidatedTotalCost ?? 0;
  const candidateDistance = candidateToCompare?.totalDistanceKm ?? optimization?.baselineComparison?.consolidatedDistanceKm ?? 0;
  const candidateTripsCount = candidateToCompare?.trips?.length ?? optimization?.baselineComparison?.consolidatedTripsCount ?? 1;
  const savingsAmount = Math.max(0, Math.round((baselineCost - candidateCost) * 100) / 100);
  const savingsPct = baselineCost > 0 ? Math.round((savingsAmount / baselineCost) * 10000) / 100 : 0;
  const distanceSavedKm = Math.max(0, Math.round((baselineDistance - candidateDistance) * 100) / 100);

  return (
    <div className="logistics-page page-enter">
      {/* Page Header */}
      <div className="logistics-header">
        <div className="logistics-header-info">
          <div className="logistics-header-title-row">
            <h2 className="logistics-header-title">Smart Transportation Cost Optimizer</h2>
            <span className="badge badge-primary">Logistics Intelligence</span>
            {useScenario ? (
              <span className="badge" style={{ backgroundColor: 'rgba(2, 132, 199, 0.12)', color: '#0284C7', border: '1px solid rgba(2, 132, 199, 0.3)', fontSize: '11px', fontWeight: 600 }}>
                ✨ 3-Buyer Regional Corridor (350T Demo)
              </span>
            ) : (
              <span className="badge" style={{ backgroundColor: 'rgba(100, 116, 139, 0.12)', color: '#64748b', border: '1px solid rgba(100, 116, 139, 0.3)', fontSize: '11px', fontWeight: 600 }}>
                📁 Live Dispatches ({activeShipments.length})
              </span>
            )}
          </div>
          <p className="logistics-header-subtitle">
            Determines the lowest-cost delivery route sequence respecting cryogenic vehicle payload limits, travel durations, and commercial tolls.
          </p>
        </div>

        {/* Top Controls */}
        <div className="logistics-header-controls">
          <div className="logistics-capacity-group">
            <span className="logistics-capacity-label">TANKER CAPACITY:</span>
            <select
              value={vehicleCapacity}
              onChange={(e) => {
                const val = Number(e.target.value);
                setVehicleCapacity(val);
                runOptimization(useScenario, val);
              }}
              className="form-input logistics-capacity-select"
            >
              <option value={150}>150 Tonnes</option>
              <option value={200}>200 Tonnes (Std)</option>
              <option value={250}>250 Tonnes</option>
              <option value={300}>300 Tonnes</option>
              <option value={500}>500 Tonnes</option>
            </select>
          </div>

          <button
            className="btn btn-secondary btn-sm"
            onClick={() => {
              const nextMode = !useScenario;
              setUseScenario(nextMode);
              runOptimization(nextMode, vehicleCapacity);
            }}
          >
            {useScenario
              ? `📁 View Live Dispatches (${activeShipments.length})`
              : '✨ Test 3-Buyer Corridor (350T)'}
          </button>

          <button
            className="btn btn-primary btn-sm"
            disabled={optimizing}
            onClick={() => runOptimization(useScenario, vehicleCapacity)}
          >
            {optimizing ? 'Calculating Routes...' : '🔄 Recalculate Economics'}
          </button>
        </div>
      </div>

      {selectionSuccess && (
        <div className="alert alert-success" style={{ marginBottom: 'var(--space-4)' }}>
          ✓ {selectionSuccess}
        </div>
      )}

      {loading ? (
        <div className="skeleton" style={{ height: '450px' }} />
      ) : !optimization || (!optimization.recommendedRoute && activeShipments.length === 0) ? (
        <div className="card empty-state">
          <h3>No Active Shipments Available for Route Optimization</h3>
          <p>You do not currently have pending dispatches in the database.</p>
          <button
            className="btn btn-primary"
            style={{ marginTop: 'var(--space-4)' }}
            onClick={() => {
              setUseScenario(true);
              runOptimization(true, vehicleCapacity);
            }}
          >
            Load 3-Buyer Regional Demonstration (Ahmedabad → Vadodara, Rajkot, Surat)
          </button>
        </div>
      ) : (
        <>
          {/* Main 2-Column Responsive Layout */}
          <div className="logistics-main-grid">
            {/* Left Column: Interactive Map & Stops */}
            <div className="card logistics-map-card">
              <div className="logistics-map-header">
                <div className="logistics-map-header-title-block">
                  <div className="logistics-map-header-title-row">
                    <h3 className="logistics-map-header-title">
                      {activeCandidate?.name || 'Recommended Delivery Itinerary'}
                    </h3>
                    {activeCandidate?.isRoadRoute !== false ? (
                      <span className="badge" style={{ backgroundColor: 'rgba(5, 150, 105, 0.12)', color: '#059669', fontWeight: 600, border: '1px solid rgba(5, 150, 105, 0.3)', fontSize: '11px' }}>
                        ✓ Road Network Route · OSRM
                      </span>
                    ) : (
                      <span className="badge" style={{ backgroundColor: 'rgba(217, 119, 6, 0.15)', color: '#d97706', fontWeight: 600, border: '1px solid rgba(217, 119, 6, 0.3)', fontSize: '11px' }}>
                        ⚠️ Road route unavailable — approximate visualization
                      </span>
                    )}
                  </div>
                  <span className="logistics-map-header-subtitle">
                    Origin: {optimization.sellerPlant?.name} • {optimization.activeShipmentsCount} Drops • {optimization.totalDeliveredQuantityTonnes} T Total
                  </span>
                </div>

                <div className="logistics-map-trips-badges">
                  {activeCandidate?.trips?.map((trip, idx) => (
                    <span
                      key={idx}
                      className="badge"
                      style={{
                        backgroundColor: idx === 0 ? 'var(--color-primary-light)' : 'rgba(2, 132, 199, 0.15)',
                        color: idx === 0 ? 'var(--color-primary)' : '#0284C7',
                        fontWeight: 600,
                      }}
                    >
                      Trip {trip.tripNumber}: {trip.allocatedTonnage}T
                    </span>
                  ))}
                </div>
              </div>

              {/* Warning Banner if Road Route is Unavailable */}
              {activeCandidate?.isRoadRoute === false && (
                <div className="logistics-map-warning-banner">
                  <span>⚠️</span>
                  <span><strong>Notice:</strong> Road route unavailable — approximate visualization. Drivable road geometry could not be retrieved; straight lines shown are approximate.</span>
                </div>
              )}

              {/* Map Container */}
              <div ref={mapRef} className="logistics-map-container" />

              {/* Sequence Footer */}
              <div className="logistics-map-footer">
                <strong>Itinerary: </strong>
                {activeCandidate?.trips?.[0]?.routeSequence?.join(' ➔ ') || 'Origin ➔ Deliveries ➔ Return'}
              </div>
            </div>

            {/* Right Column: Economics & Lowest Cost Breakdown */}
            <div className="logistics-details-column">
              {/* Recommended Route Card */}
              <div className="card logistics-route-card">
                <div className="logistics-route-card-header">
                  <div>
                    <span className="badge badge-success" style={{ marginBottom: 'var(--space-2)', display: 'inline-block' }}>
                      🟢 {activeCandidate?.isRecommended ? 'RECOMMENDED ROUTE — LOWEST ESTIMATED COST' : 'ALTERNATIVE ROUTE'}
                    </span>
                    <h3 className="logistics-route-title">{activeCandidate?.name}</h3>
                  </div>

                  <button
                    className="btn btn-primary btn-sm"
                    onClick={() => handleSelectRoute(activeCandidate)}
                  >
                    {selectedRouteId === activeCandidate?.routeId ? '✓ Selected Route' : 'Use This Route'}
                  </button>
                </div>

                <p className="logistics-route-desc">
                  {activeCandidate?.whyRecommended}
                </p>

                {/* Key Metric Highlights */}
                <div className="logistics-metrics-grid">
                  <div className="logistics-metric-card">
                    <div className="logistics-metric-label">Total Logistics Cost</div>
                    <div className="logistics-metric-value" style={{ color: 'var(--color-success)' }}>
                      ₹{activeCandidate?.costBreakdown?.totalEstimatedCost?.toLocaleString('en-IN') || '—'}
                    </div>
                  </div>

                  <div className="logistics-metric-card">
                    <div className="logistics-metric-label">Cost / Tonne</div>
                    <div className="logistics-metric-value">
                      ₹{activeCandidate?.costBreakdown?.costPerTonne?.toFixed(2) || '—'} <span className="logistics-metric-sub">/T</span>
                    </div>
                  </div>

                  <div className="logistics-metric-card">
                    <div className="logistics-metric-label">Landed Cost</div>
                    <div className="logistics-metric-value" style={{ color: 'var(--color-primary)' }}>
                      ₹{activeCandidate?.landedCost?.landedCostPerTonne?.toFixed(2) || '—'} <span className="logistics-metric-sub">/T</span>
                    </div>
                  </div>
                </div>

                {/* Road & Duration Details */}
                <div className="logistics-quick-stats">
                  <div className="logistics-stat-item">
                    <span style={{ color: 'var(--color-text-muted)' }}>Total Distance:</span>
                    <div className="logistics-stat-val">
                      {activeCandidate?.totalDistanceKm} km
                    </div>
                  </div>
                  <div className="logistics-stat-item">
                    <span style={{ color: 'var(--color-text-muted)' }}>Travel Time:</span>
                    <div className="logistics-stat-val">
                      {Math.floor(activeCandidate?.totalDurationHours || 0)}h {Math.round(((activeCandidate?.totalDurationHours || 0) % 1) * 60)}m
                    </div>
                  </div>
                  <div className="logistics-stat-item">
                    <span style={{ color: 'var(--color-text-muted)' }}>Estimated Toll:</span>
                    <div className="logistics-stat-val">
                      ₹{activeCandidate?.costBreakdown?.tollCost?.toLocaleString('en-IN')}
                    </div>
                    <span style={{ fontSize: '10px', color: 'var(--color-text-muted)', display: 'block', lineHeight: 1.1 }}>
                      Configured model rate
                    </span>
                  </div>
                </div>

                {/* Traffic and Toll disclosure badges */}
                <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--space-1)', marginTop: 'var(--space-2)' }}>
                  <div style={{ fontSize: 'var(--text-xs)', color: 'var(--color-text-muted)', display: 'flex', alignItems: 'center', gap: 'var(--space-2)' }}>
                    <span>ℹ️</span>
                    <span>{optimization.trafficDisclosure}</span>
                  </div>
                  <div style={{ fontSize: 'var(--text-xs)', color: 'var(--color-text-muted)', display: 'flex', alignItems: 'center', gap: 'var(--space-2)' }}>
                    <span>ℹ️</span>
                    <span>Estimated Toll — based on configured assumptions. Actual live toll data unavailable.</span>
                  </div>
                </div>
              </div>

              {/* Cost Component Breakdown */}
              <div className="card logistics-cost-card">
                <h4 className="logistics-cost-card-title">
                  Transparent Cost Breakdown
                </h4>

                <div className="logistics-cost-list">
                  <div className="logistics-cost-row">
                    <span className="logistics-cost-label">Fuel Cost ({activeCandidate?.costBreakdown?.fuelLitres} L @ ₹92.5/L):</span>
                    <strong className="logistics-cost-val">₹{activeCandidate?.costBreakdown?.fuelCost?.toLocaleString('en-IN')}</strong>
                  </div>

                  <div className="logistics-cost-row">
                    <span className="logistics-cost-label">Vehicle Operating & Maintenance ({activeCandidate?.totalDistanceKm} km @ ₹14/km):</span>
                    <strong className="logistics-cost-val">₹{activeCandidate?.costBreakdown?.vehicleOperatingCost?.toLocaleString('en-IN')}</strong>
                  </div>

                  <div className="logistics-cost-row">
                    <span className="logistics-cost-label">Driver & Certified Hazmat Crew ({activeCandidate?.totalDurationHours} hrs @ ₹250/h):</span>
                    <strong className="logistics-cost-val">₹{activeCandidate?.costBreakdown?.driverCost?.toLocaleString('en-IN')}</strong>
                  </div>

                  <div className="logistics-cost-row">
                    <span className="logistics-cost-label">Commercial Highway Tolls (Estimated Toll — based on configured assumptions):</span>
                    <strong className="logistics-cost-val">₹{activeCandidate?.costBreakdown?.tollCost?.toLocaleString('en-IN')}</strong>
                  </div>

                  <div className="logistics-cost-row">
                    <span className="logistics-cost-label">Cryogenic Loading & Depressurization Check:</span>
                    <strong className="logistics-cost-val">₹{activeCandidate?.costBreakdown?.loadingCost?.toLocaleString('en-IN')}</strong>
                  </div>

                  <div className="logistics-cost-row">
                    <span className="logistics-cost-label">Customer Offload & Thermal Manifold Connection:</span>
                    <strong className="logistics-cost-val">₹{activeCandidate?.costBreakdown?.unloadingCost?.toLocaleString('en-IN')}</strong>
                  </div>

                  <div className="logistics-cost-row-total">
                    <span className="logistics-cost-label">Total Estimated Logistics Cost:</span>
                    <span className="logistics-cost-val">₹{activeCandidate?.costBreakdown?.totalEstimatedCost?.toLocaleString('en-IN')}</span>
                  </div>
                </div>
              </div>
            </div>
          </div>

          {/* Baseline vs. Consolidated Comparison */}
          {optimization.baselineComparison?.isGenuinelyCalculated && (
            <div className="card logistics-comparison-card">
              <h3 style={{ fontSize: 'var(--text-base)', marginBottom: 'var(--space-3)' }}>
                Economic Advantage: Independent Dispatches vs. Consolidated Routing
              </h3>

              <div className="logistics-comparison-grid">
                <div style={{ padding: 'var(--space-4)', backgroundColor: 'var(--color-bg-subtle)', borderRadius: 'var(--radius-md)', textAlign: 'center', minWidth: 0 }}>
                  <div style={{ fontSize: 'var(--text-xs)', color: 'var(--color-text-muted)', textTransform: 'uppercase', marginBottom: '4px' }}>
                    Without Consolidation
                  </div>
                  <div style={{ fontSize: 'var(--text-2xl)', fontWeight: 700, color: 'var(--color-text-muted)', wordBreak: 'break-word' }}>
                    ₹{baselineCost.toLocaleString('en-IN')}
                  </div>
                  <div style={{ fontSize: 'var(--text-xs)', color: 'var(--color-text-muted)', marginTop: '4px' }}>
                    {baselineTripsCount} separate round-trip{baselineTripsCount === 1 ? '' : 's'} ({baselineDistance} km total)
                  </div>
                </div>

                <div className="logistics-comparison-arrow">➔</div>

                <div style={{ padding: 'var(--space-4)', backgroundColor: 'var(--color-primary-light)', borderRadius: 'var(--radius-md)', textAlign: 'center', minWidth: 0 }}>
                  <div style={{ fontSize: 'var(--text-xs)', color: 'var(--color-primary)', textTransform: 'uppercase', fontWeight: 600, marginBottom: '4px' }}>
                    With Smart Consolidation
                  </div>
                  <div style={{ fontSize: 'var(--text-2xl)', fontWeight: 800, color: 'var(--color-primary)', wordBreak: 'break-word' }}>
                    ₹{candidateCost.toLocaleString('en-IN')}
                  </div>
                  <div style={{ fontSize: 'var(--text-xs)', color: 'var(--color-primary)', marginTop: '4px' }}>
                    {candidateTripsCount} optimized trip{candidateTripsCount === 1 ? '' : 's'} ({candidateDistance} km total)
                  </div>
                </div>

                <div className="logistics-comparison-arrow">=</div>

                <div style={{ padding: 'var(--space-4)', backgroundColor: 'rgba(45, 106, 79, 0.1)', border: '1px solid var(--color-success)', borderRadius: 'var(--radius-md)', textAlign: 'center', minWidth: 0 }}>
                  <div style={{ fontSize: 'var(--text-xs)', color: 'var(--color-success)', textTransform: 'uppercase', fontWeight: 700, marginBottom: '4px' }}>
                    Genuinely Calculated Savings
                  </div>
                  <div style={{ fontSize: 'var(--text-3xl)', fontWeight: 900, color: 'var(--color-success)', wordBreak: 'break-word' }}>
                    ₹{savingsAmount.toLocaleString('en-IN')}
                  </div>
                  <div style={{ fontSize: 'var(--text-xs)', color: 'var(--color-success)', fontWeight: 600, marginTop: '4px' }}>
                    {savingsPct}% cost reduction ({distanceSavedKm} km saved)
                  </div>
                </div>
              </div>
            </div>
          )}

          {/* Multi-Trip Plan (when total demand > vehicle capacity) */}
          {optimization.requiresMultipleTrips && (
            <div className="card logistics-trips-card">
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 'var(--space-3)' }}>
                <div>
                  <h3 style={{ fontSize: 'var(--text-base)', margin: 0 }}>
                    Multi-Trip Splitting Required (Demand: {optimization.totalDeliveredQuantityTonnes}T &gt; Tanker Capacity: {optimization.vehicleCapacityTonnes}T)
                  </h3>
                  <p style={{ fontSize: 'var(--text-xs)', color: 'var(--color-text-muted)', margin: '4px 0 0' }}>
                    The optimizer has partitioned your deliveries into {activeCandidate?.trips?.length} feasible trips to respect tanker payload safety.
                  </p>
                </div>
              </div>

              <div className="logistics-trips-grid">
                {activeCandidate?.trips?.map((trip, tIdx) => (
                  <div key={tIdx} style={{ padding: 'var(--space-3)', backgroundColor: 'var(--color-bg-subtle)', borderRadius: 'var(--radius-md)', border: '1px solid var(--color-border)', minWidth: 0 }}>
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 'var(--space-2)' }}>
                      <strong style={{ fontSize: 'var(--text-sm)', color: '#0284C7' }}>Trip {trip.tripNumber}</strong>
                      <span className="badge badge-primary">{trip.allocatedTonnage}T Payload</span>
                    </div>

                    <div style={{ fontSize: 'var(--text-xs)', marginBottom: 'var(--space-2)' }}>
                      <strong>Stops:</strong> {trip.stops.map((s) => s.buyerName).join(' ➔ ')}
                    </div>

                    <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 'var(--text-xs)', color: 'var(--color-text-muted)' }}>
                      <span>Distance: {trip.totalDistanceKm} km</span>
                      <span>Duration: {trip.totalDurationHours} hrs</span>
                    </div>

                    <div style={{ marginTop: 'var(--space-2)', paddingTop: 'var(--space-2)', borderTop: '1px solid var(--color-border)', display: 'flex', justifyContent: 'space-between', fontWeight: 700, fontSize: 'var(--text-sm)' }}>
                      <span>Trip Cost:</span>
                      <span>₹{trip.costBreakdown.totalEstimatedCost.toLocaleString('en-IN')}</span>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* Alternative Routes Comparison */}
          {optimization.alternatives && optimization.alternatives.length > 0 && (
            <div className="card logistics-alternatives-card">
              <h3 style={{ fontSize: 'var(--text-base)', marginBottom: 'var(--space-3)' }}>
                Feasible Route Alternatives & Trade-Offs
              </h3>

              <div className="logistics-alternatives-grid">
                {/* Recommended Card */}
                <div
                  style={{
                    padding: 'var(--space-4)',
                    borderRadius: 'var(--radius-md)',
                    border: selectedRouteId === recommended?.routeId ? '2px solid var(--color-success)' : '1px solid var(--color-border)',
                    backgroundColor: selectedRouteId === recommended?.routeId ? 'rgba(45, 106, 79, 0.05)' : '#fff',
                    cursor: 'pointer',
                    minWidth: 0,
                  }}
                  onClick={() => setSelectedRouteId(recommended?.routeId)}
                >
                  <span className="badge badge-success" style={{ marginBottom: 'var(--space-2)', display: 'inline-block' }}>
                    Route A (Recommended)
                  </span>
                  <h4 style={{ margin: '0 0 var(--space-2)', fontSize: 'var(--text-sm)' }}>{recommended?.name}</h4>

                  <div style={{ fontSize: 'var(--text-2xl)', fontWeight: 800, color: 'var(--color-success)', marginBottom: 'var(--space-2)' }}>
                    ₹{recommended?.costBreakdown?.totalEstimatedCost?.toLocaleString('en-IN')}
                  </div>

                  <div style={{ fontSize: 'var(--text-xs)', color: 'var(--color-text-muted)', marginBottom: 'var(--space-3)' }}>
                    {recommended?.totalDistanceKm} km • {recommended?.totalDurationHours} hrs • ₹{recommended?.costBreakdown?.costPerTonne?.toFixed(1)}/T
                  </div>

                  <p style={{ fontSize: 'var(--text-xs)', color: 'var(--color-text-muted)', margin: 0 }}>
                    {recommended?.whyRecommended}
                  </p>
                </div>

                {/* Alternatives Cards */}
                {optimization.alternatives.map((alt, aIdx) => (
                  <div
                    key={alt.routeId}
                    style={{
                      padding: 'var(--space-4)',
                      borderRadius: 'var(--radius-md)',
                      border: selectedRouteId === alt.routeId ? '2px solid var(--color-primary)' : '1px solid var(--color-border)',
                      backgroundColor: selectedRouteId === alt.routeId ? 'var(--color-primary-light)' : '#fff',
                      cursor: 'pointer',
                      minWidth: 0,
                    }}
                    onClick={() => setSelectedRouteId(alt.routeId)}
                  >
                    <span className="badge" style={{ backgroundColor: 'var(--color-bg-subtle)', color: 'var(--color-text-muted)', marginBottom: 'var(--space-2)', display: 'inline-block' }}>
                      Route {String.fromCharCode(66 + aIdx)} (Alternative)
                    </span>
                    <h4 style={{ margin: '0 0 var(--space-2)', fontSize: 'var(--text-sm)' }}>{alt.name}</h4>

                    <div style={{ fontSize: 'var(--text-2xl)', fontWeight: 800, color: 'var(--color-text)', marginBottom: 'var(--space-2)' }}>
                      ₹{alt.costBreakdown?.totalEstimatedCost?.toLocaleString('en-IN')}
                    </div>

                    <div style={{ fontSize: 'var(--text-xs)', color: 'var(--color-text-muted)', marginBottom: 'var(--space-3)' }}>
                      {alt.totalDistanceKm} km • {alt.totalDurationHours} hrs • ₹{alt.costBreakdown?.costPerTonne?.toFixed(1)}/T
                    </div>

                    <p style={{ fontSize: 'var(--text-xs)', color: 'var(--color-text-muted)', margin: 0 }}>
                      {alt.cons?.[0] || alt.description}
                    </p>

                    <button
                      className="btn btn-secondary btn-sm"
                      style={{ marginTop: 'var(--space-3)', width: '100%' }}
                      onClick={(e) => {
                        e.stopPropagation();
                        handleSelectRoute(alt);
                      }}
                    >
                      {selectedRouteId === alt.routeId ? '✓ Selected' : 'Select This Route'}
                    </button>
                  </div>
                ))}
              </div>
            </div>
          )}
        </>
      )}
    </div>
  );
}
