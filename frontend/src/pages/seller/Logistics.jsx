import { useEffect, useState, useRef } from 'react';
import { logisticsApi } from '../../api/logistics';

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

        // If seller has at least 1 active shipment, optimize live shipments;
        // Otherwise default to the 3-buyer demo scenario for immediate demonstration
        if (shipments.length >= 1) {
          setUseScenario(false);
          await runOptimization(false, 200);
        } else {
          setUseScenario(true);
          await runOptimization(true, 200);
        }
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

        // Draw delivery drop pins
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
          L.polyline(trip.geometry, {
            color,
            weight: 4,
            opacity: 0.85,
            lineJoin: 'round',
          }).addTo(layerGroup);
        }
      });

      if (bounds.length > 1) {
        map.fitBounds(bounds, { padding: [40, 40] });
      }

      setTimeout(() => map.invalidateSize(), 150);
    });
  }, [optimization, selectedRouteId]);

  const recommended = optimization?.recommendedRoute;
  const activeCandidate =
    optimization?.alternatives?.find((a) => a.routeId === selectedRouteId) || recommended;

  return (
    <div className="page-enter">
      {/* Page Header */}
      <div className="page-header" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', flexWrap: 'wrap', gap: 'var(--space-4)' }}>
        <div>
          <div style={{ display: 'flex', alignItems: 'center', gap: 'var(--space-3)' }}>
            <h2>Smart Transportation Cost Optimizer</h2>
            <span className="badge badge-primary">Logistics Intelligence</span>
          </div>
          <p style={{ color: 'var(--color-text-muted)', marginTop: 'var(--space-1)', fontSize: 'var(--text-sm)' }}>
            Determines the lowest-cost delivery route sequence respecting cryogenic vehicle payload limits, travel durations, and commercial tolls.
          </p>
        </div>

        {/* Top Controls */}
        <div style={{ display: 'flex', gap: 'var(--space-3)', alignItems: 'center', flexWrap: 'wrap' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 'var(--space-2)' }}>
            <span style={{ fontSize: 'var(--text-xs)', fontWeight: 600, color: 'var(--color-text-muted)' }}>TANKER CAPACITY:</span>
            <select
              value={vehicleCapacity}
              onChange={(e) => {
                const val = Number(e.target.value);
                setVehicleCapacity(val);
                runOptimization(useScenario, val);
              }}
              className="form-input"
              style={{ width: '130px', padding: '6px 10px', fontSize: 'var(--text-sm)' }}
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
            {useScenario ? '📁 View Database Shipments' : '✨ Test 3-Buyer Corridor (350T)'}
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
          <div style={{ display: 'grid', gridTemplateColumns: 'minmax(0, 1.1fr) minmax(0, 0.9fr)', gap: 'var(--space-6)', marginBottom: 'var(--space-6)' }}>
            {/* Left Column: Interactive Map & Stops */}
            <div className="card" style={{ padding: 0, overflow: 'hidden', display: 'flex', flexDirection: 'column' }}>
              <div style={{ padding: 'var(--space-4) var(--space-5)', borderBottom: '1px solid var(--color-border)', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                <div>
                  <h3 style={{ fontSize: 'var(--text-base)', margin: 0 }}>
                    {activeCandidate?.name || 'Recommended Delivery Itinerary'}
                  </h3>
                  <span style={{ fontSize: 'var(--text-xs)', color: 'var(--color-text-muted)' }}>
                    Origin: {optimization.sellerPlant?.name} • {optimization.activeShipmentsCount} Drops • {optimization.totalDeliveredQuantityTonnes} T Total
                  </span>
                </div>

                <div style={{ display: 'flex', gap: 'var(--space-2)' }}>
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

              {/* Map Container */}
              <div ref={mapRef} style={{ height: '460px', width: '100%' }} />

              {/* Sequence Footer */}
              <div style={{ padding: 'var(--space-4) var(--space-5)', backgroundColor: 'var(--color-bg-subtle)', borderTop: '1px solid var(--color-border)', fontSize: 'var(--text-xs)' }}>
                <strong>Itinerary: </strong>
                {activeCandidate?.trips?.[0]?.routeSequence?.join(' ➔ ') || 'Origin ➔ Deliveries ➔ Return'}
              </div>
            </div>

            {/* Right Column: Economics & Lowest Cost Breakdown */}
            <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--space-5)' }}>
              {/* Recommended Route Card */}
              <div className="card" style={{ borderLeft: '4px solid var(--color-success)', position: 'relative' }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 'var(--space-3)' }}>
                  <div>
                    <span className="badge badge-success" style={{ marginBottom: 'var(--space-2)', display: 'inline-block' }}>
                      🟢 {activeCandidate?.isRecommended ? 'RECOMMENDED ROUTE — LOWEST ESTIMATED COST' : 'ALTERNATIVE ROUTE'}
                    </span>
                    <h3 style={{ fontSize: 'var(--text-xl)', margin: 0 }}>{activeCandidate?.name}</h3>
                  </div>

                  <button
                    className="btn btn-primary btn-sm"
                    onClick={() => handleSelectRoute(activeCandidate)}
                  >
                    {selectedRouteId === activeCandidate?.routeId ? '✓ Selected Route' : 'Use This Route'}
                  </button>
                </div>

                <p style={{ fontSize: 'var(--text-xs)', color: 'var(--color-text-muted)', marginBottom: 'var(--space-4)' }}>
                  {activeCandidate?.whyRecommended}
                </p>

                {/* Key Metric Highlights */}
                <div className="grid grid-3 dashboard-metrics" style={{ marginBottom: 'var(--space-4)' }}>
                  <div className="metric-card">
                    <div className="metric-label">Total Logistics Cost</div>
                    <div className="metric-value" style={{ color: 'var(--color-success)', fontSize: 'var(--text-2xl)' }}>
                      ₹{activeCandidate?.costBreakdown?.totalEstimatedCost?.toLocaleString('en-IN') || '—'}
                    </div>
                  </div>

                  <div className="metric-card">
                    <div className="metric-label">Logistics Cost / Tonne</div>
                    <div className="metric-value" style={{ fontSize: 'var(--text-2xl)' }}>
                      ₹{activeCandidate?.costBreakdown?.costPerTonne?.toFixed(1) || '—'} <span className="metric-sub">/T</span>
                    </div>
                  </div>

                  <div className="metric-card">
                    <div className="metric-label">Estimated Landed Cost</div>
                    <div className="metric-value" style={{ color: 'var(--color-primary)', fontSize: 'var(--text-2xl)' }}>
                      ₹{activeCandidate?.landedCost?.landedCostPerTonne?.toFixed(1) || '—'} <span className="metric-sub">/T</span>
                    </div>
                  </div>
                </div>

                {/* Road & Duration Details */}
                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 'var(--space-3)', padding: 'var(--space-3)', backgroundColor: 'var(--color-bg-subtle)', borderRadius: 'var(--radius-md)', fontSize: 'var(--text-xs)', marginBottom: 'var(--space-3)' }}>
                  <div>
                    <span style={{ color: 'var(--color-text-muted)' }}>Total Distance:</span>
                    <div style={{ fontWeight: 700, fontSize: 'var(--text-sm)', marginTop: '2px' }}>
                      {activeCandidate?.totalDistanceKm} km
                    </div>
                  </div>
                  <div>
                    <span style={{ color: 'var(--color-text-muted)' }}>Travel Time:</span>
                    <div style={{ fontWeight: 700, fontSize: 'var(--text-sm)', marginTop: '2px' }}>
                      {Math.floor(activeCandidate?.totalDurationHours || 0)}h {Math.round(((activeCandidate?.totalDurationHours || 0) % 1) * 60)}m
                    </div>
                  </div>
                  <div>
                    <span style={{ color: 'var(--color-text-muted)' }}>Estimated Toll:</span>
                    <div style={{ fontWeight: 700, fontSize: 'var(--text-sm)', marginTop: '2px' }}>
                      ₹{activeCandidate?.costBreakdown?.tollCost?.toLocaleString('en-IN')}
                    </div>
                  </div>
                </div>

                {/* Traffic disclosure badge */}
                <div style={{ fontSize: 'var(--text-xs)', color: 'var(--color-text-muted)', display: 'flex', alignItems: 'center', gap: 'var(--space-2)' }}>
                  <span>ℹ️</span>
                  <span>{optimization.trafficDisclosure}</span>
                </div>
              </div>

              {/* Cost Component Breakdown */}
              <div className="card">
                <h4 style={{ fontSize: 'var(--text-sm)', textTransform: 'uppercase', letterSpacing: '0.05em', color: 'var(--color-text-muted)', marginBottom: 'var(--space-3)' }}>
                  Transparent Cost Breakdown
                </h4>

                <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--space-2)', fontSize: 'var(--text-sm)' }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', paddingBottom: 'var(--space-2)', borderBottom: '1px solid var(--color-border)' }}>
                    <span>Fuel Cost ({activeCandidate?.costBreakdown?.fuelLitres} L @ ₹92.5/L):</span>
                    <strong>₹{activeCandidate?.costBreakdown?.fuelCost?.toLocaleString('en-IN')}</strong>
                  </div>

                  <div style={{ display: 'flex', justifyContent: 'space-between', paddingBottom: 'var(--space-2)', borderBottom: '1px solid var(--color-border)' }}>
                    <span>Vehicle Operating & Maintenance ({activeCandidate?.totalDistanceKm} km @ ₹14/km):</span>
                    <strong>₹{activeCandidate?.costBreakdown?.vehicleOperatingCost?.toLocaleString('en-IN')}</strong>
                  </div>

                  <div style={{ display: 'flex', justifyContent: 'space-between', paddingBottom: 'var(--space-2)', borderBottom: '1px solid var(--color-border)' }}>
                    <span>Driver & Certified Hazmat Crew ({activeCandidate?.totalDurationHours} hrs @ ₹250/h):</span>
                    <strong>₹{activeCandidate?.costBreakdown?.driverCost?.toLocaleString('en-IN')}</strong>
                  </div>

                  <div style={{ display: 'flex', justifyContent: 'space-between', paddingBottom: 'var(--space-2)', borderBottom: '1px solid var(--color-border)' }}>
                    <span>Commercial Highway Tolls (Estimated ₹2.40/km):</span>
                    <strong>₹{activeCandidate?.costBreakdown?.tollCost?.toLocaleString('en-IN')}</strong>
                  </div>

                  <div style={{ display: 'flex', justifyContent: 'space-between', paddingBottom: 'var(--space-2)', borderBottom: '1px solid var(--color-border)' }}>
                    <span>Cryogenic Loading & Depressurization Check:</span>
                    <strong>₹{activeCandidate?.costBreakdown?.loadingCost?.toLocaleString('en-IN')}</strong>
                  </div>

                  <div style={{ display: 'flex', justifyContent: 'space-between', paddingBottom: 'var(--space-2)', borderBottom: '1px solid var(--color-border)' }}>
                    <span>Customer Offload & Thermal Manifold Connection:</span>
                    <strong>₹{activeCandidate?.costBreakdown?.unloadingCost?.toLocaleString('en-IN')}</strong>
                  </div>

                  <div style={{ display: 'flex', justifyContent: 'space-between', paddingTop: 'var(--space-2)', fontWeight: 800, fontSize: 'var(--text-base)', color: 'var(--color-success)' }}>
                    <span>Total Estimated Logistics Cost:</span>
                    <span>₹{activeCandidate?.costBreakdown?.totalEstimatedCost?.toLocaleString('en-IN')}</span>
                  </div>
                </div>
              </div>
            </div>
          </div>

          {/* Baseline vs. Consolidated Comparison */}
          {optimization.baselineComparison?.isGenuinelyCalculated && (
            <div className="card" style={{ marginBottom: 'var(--space-6)' }}>
              <h3 style={{ fontSize: 'var(--text-base)', marginBottom: 'var(--space-3)' }}>
                Economic Advantage: Independent Dispatches vs. Consolidated Routing
              </h3>

              <div style={{ display: 'grid', gridTemplateColumns: '1fr auto 1fr auto 1.2fr', gap: 'var(--space-4)', alignItems: 'center' }}>
                <div style={{ padding: 'var(--space-4)', backgroundColor: 'var(--color-bg-subtle)', borderRadius: 'var(--radius-md)', textAlign: 'center' }}>
                  <div style={{ fontSize: 'var(--text-xs)', color: 'var(--color-text-muted)', textTransform: 'uppercase', marginBottom: '4px' }}>
                    Without Consolidation
                  </div>
                  <div style={{ fontSize: 'var(--text-2xl)', fontWeight: 700, color: 'var(--color-text-muted)' }}>
                    ₹{optimization.baselineComparison.independentTotalCost?.toLocaleString('en-IN')}
                  </div>
                  <div style={{ fontSize: 'var(--text-xs)', color: 'var(--color-text-muted)', marginTop: '4px' }}>
                    {optimization.baselineComparison.independentTripsCount} separate round-trips ({optimization.baselineComparison.independentDistanceKm} km)
                  </div>
                </div>

                <div style={{ fontSize: 'var(--text-2xl)', fontWeight: 800, color: 'var(--color-text-muted)' }}>➔</div>

                <div style={{ padding: 'var(--space-4)', backgroundColor: 'var(--color-primary-light)', borderRadius: 'var(--radius-md)', textAlign: 'center' }}>
                  <div style={{ fontSize: 'var(--text-xs)', color: 'var(--color-primary)', textTransform: 'uppercase', fontWeight: 600, marginBottom: '4px' }}>
                    With Smart Consolidation
                  </div>
                  <div style={{ fontSize: 'var(--text-2xl)', fontWeight: 800, color: 'var(--color-primary)' }}>
                    ₹{optimization.baselineComparison.consolidatedTotalCost?.toLocaleString('en-IN')}
                  </div>
                  <div style={{ fontSize: 'var(--text-xs)', color: 'var(--color-primary)', marginTop: '4px' }}>
                    Optimized bundled circuit ({recommended?.totalDistanceKm} km)
                  </div>
                </div>

                <div style={{ fontSize: 'var(--text-2xl)', fontWeight: 800, color: 'var(--color-text-muted)' }}>=</div>

                <div style={{ padding: 'var(--space-4)', backgroundColor: 'rgba(45, 106, 79, 0.1)', border: '1px solid var(--color-success)', borderRadius: 'var(--radius-md)', textAlign: 'center' }}>
                  <div style={{ fontSize: 'var(--text-xs)', color: 'var(--color-success)', textTransform: 'uppercase', fontWeight: 700, marginBottom: '4px' }}>
                    Genuinely Calculated Savings
                  </div>
                  <div style={{ fontSize: 'var(--text-3xl)', fontWeight: 900, color: 'var(--color-success)' }}>
                    ₹{optimization.baselineComparison.savingsAmount?.toLocaleString('en-IN')}
                  </div>
                  <div style={{ fontSize: 'var(--text-xs)', color: 'var(--color-success)', fontWeight: 600, marginTop: '4px' }}>
                    {optimization.baselineComparison.savingsPercentage}% cost reduction ({optimization.baselineComparison.distanceSavedKm} km saved)
                  </div>
                </div>
              </div>
            </div>
          )}

          {/* Multi-Trip Plan (when total demand > vehicle capacity) */}
          {optimization.requiresMultipleTrips && (
            <div className="card" style={{ marginBottom: 'var(--space-6)', borderLeft: '4px solid #0284C7' }}>
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

              <div style={{ display: 'grid', gridTemplateColumns: `repeat(${activeCandidate?.trips?.length || 1}, 1fr)`, gap: 'var(--space-4)' }}>
                {activeCandidate?.trips?.map((trip, tIdx) => (
                  <div key={tIdx} style={{ padding: 'var(--space-3)', backgroundColor: 'var(--color-bg-subtle)', borderRadius: 'var(--radius-md)', border: '1px solid var(--color-border)' }}>
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
            <div className="card">
              <h3 style={{ fontSize: 'var(--text-base)', marginBottom: 'var(--space-3)' }}>
                Feasible Route Alternatives & Trade-Offs
              </h3>

              <div style={{ display: 'grid', gridTemplateColumns: `repeat(${1 + optimization.alternatives.length}, 1fr)`, gap: 'var(--space-4)' }}>
                {/* Recommended Card */}
                <div
                  style={{
                    padding: 'var(--space-4)',
                    borderRadius: 'var(--radius-md)',
                    border: selectedRouteId === recommended?.routeId ? '2px solid var(--color-success)' : '1px solid var(--color-border)',
                    backgroundColor: selectedRouteId === recommended?.routeId ? 'rgba(45, 106, 79, 0.05)' : '#fff',
                    cursor: 'pointer',
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
