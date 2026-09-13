import { useEffect, useState, useRef, useMemo } from 'react';
import { useNavigate } from 'react-router-dom';
import { mapsApi } from '../../api/maps';
import { resolveLocationCoordinates, calculateEstimatedProgress, GPS_UNAVAILABLE_DISCLAIMER } from '../../utils/geo';
import './ActiveMap.css';

const STATUS_CONFIG = {
  ALLOCATED: {
    label: 'Allocated',
    color: '#2563eb',
    bg: '#eff6ff',
    border: '#bfdbfe',
    icon: '📋',
  },
  DISPATCH_PENDING: {
    label: 'Dispatch Pending',
    color: '#d97706',
    bg: '#fffbeb',
    border: '#fde68a',
    icon: '⏳',
  },
  IN_TRANSIT: {
    label: 'In Transit',
    color: '#059669',
    bg: '#ecfdf5',
    border: '#a7f3d0',
    icon: '🚚',
  },
  DELIVERED: {
    label: 'Delivered',
    color: '#0d9488',
    bg: '#f0fdfa',
    border: '#99f6e4',
    icon: '✓',
  },
};

export function ActiveMap() {
  const navigate = useNavigate();
  const [mapData, setMapData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [activeRouteId, setActiveRouteId] = useState(null);
  const [tick, setTick] = useState(0);

  // Periodic timer (every 30s) to refresh estimated progress along existing geometry without API calls
  useEffect(() => {
    const timer = setInterval(() => setTick((t) => t + 1), 30000);
    return () => clearInterval(timer);
  }, []);

  const mapRef = useRef(null);
  const mapInstanceRef = useRef(null);
  const layersGroupRef = useRef(null);
  const markerRefs = useRef(new Map());

  // Load Active Map Data
  useEffect(() => {
    let isMounted = true;

    async function loadActiveMap() {
      setLoading(true);
      setError(null);
      try {
        const res = await mapsApi.getActive();
        const data = res?.data || res;
        if (isMounted) {
          setMapData(data);
        }
      } catch (err) {
        console.error('Failed to load active transactions map:', err);
        if (isMounted) {
          setError('Unable to load active delivery map. Please try again.');
        }
      } finally {
        if (isMounted) {
          setLoading(false);
        }
      }
    }

    loadActiveMap();

    return () => {
      isMounted = false;
    };
  }, []);

  // Normalize routes from API response
  const routes = useMemo(() => {
    if (Array.isArray(mapData?.routes)) return mapData.routes;
    if (Array.isArray(mapData?.transactions)) return mapData.transactions;
    if (Array.isArray(mapData)) return mapData;
    return [];
  }, [mapData]);

  const activeRunsCount = mapData?.activeRunsCount ?? routes.length;
  const totalAllocatedTonnage =
    mapData?.totalAllocatedTonnage ??
    Math.round(
      routes.reduce((sum, r) => sum + (Number(r.allocatedTonnage) || Number(r.quantity) || 0), 0) * 100
    ) / 100;
  const suppliersCount =
    mapData?.suppliersCount ??
    new Set(routes.map((r) => r.seller?.id || r.sellerName || r.origin?.name)).size;

  // Initialize and update Leaflet Map
  useEffect(() => {
    if (loading || routes.length === 0 || !mapRef.current) return;

    // Dynamically inject Leaflet CSS if not already present
    if (!document.querySelector('link[href*="leaflet.css"]')) {
      const link = document.createElement('link');
      link.rel = 'stylesheet';
      link.href = 'https://unpkg.com/leaflet@1.9.4/dist/leaflet.css';
      document.head.appendChild(link);
    }

    import('leaflet').then((L) => {
      if (!mapRef.current) return;

      // Create map instance once
      if (!mapInstanceRef.current) {
        const map = L.map(mapRef.current, {
          zoomControl: true,
          scrollWheelZoom: true,
        }).setView([22.3, 72.8], 7);

        L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
          attribution: '&copy; OpenStreetMap contributors',
          maxZoom: 18,
        }).addTo(map);

        layersGroupRef.current = L.layerGroup().addTo(map);
        mapInstanceRef.current = map;
      }

      const map = mapInstanceRef.current;
      const layerGroup = layersGroupRef.current;
      if (!layerGroup) return;

      layerGroup.clearLayers();
      markerRefs.current.clear();

      const allBounds = [];

      // 1. Draw Buyer Destination Marker ("B")
      const firstRoute = routes[0];
      const rawDest = mapData?.destination || firstRoute.destination || firstRoute.buyer;
      const rawAddress = rawDest?.address || firstRoute.destination?.address || firstRoute.buyer?.address || '';
      const rawLat = rawDest?.latitude ?? rawDest?.lat ?? firstRoute.destination?.latitude ?? firstRoute.buyer?.latitude;
      const rawLng = rawDest?.longitude ?? rawDest?.lng ?? firstRoute.destination?.longitude ?? firstRoute.buyer?.longitude;

      const resolvedDest = resolveLocationCoordinates(rawAddress || rawDest?.name, rawLat, rawLng);
      const buyerLat = resolvedDest.latitude;
      const buyerLng = resolvedDest.longitude;
      const buyerName = rawDest?.name || firstRoute.buyer?.name || 'Buyer Facility';
      const buyerAddress = rawAddress || `${resolvedDest.city}, ${resolvedDest.state}`;

      const buyerIcon = L.divIcon({
        className: 'custom-leaflet-pin buyer-destination-pin',
        html: `
          <div class="cb-buyer-pin" title="Delivery Destination">
            <span class="cb-pin-badge">B</span>
            <span class="cb-pin-pulse"></span>
          </div>
        `,
        iconSize: [36, 36],
        iconAnchor: [18, 18],
      });

      const buyerMarker = L.marker([buyerLat, buyerLng], {
        icon: buyerIcon,
        zIndexOffset: 1000,
      }).addTo(layerGroup);

      buyerMarker.bindPopup(`
        <div class="cb-popup">
          <div class="cb-popup-header buyer">
            <span class="cb-popup-tag">DESTINATION FACILITY</span>
            <h4>${buyerName}</h4>
          </div>
          <p class="cb-popup-address">${buyerAddress}</p>
          <div class="cb-popup-stats">
            <div><span class="label">City / State:</span> <strong>${resolvedDest.city}, ${resolvedDest.state}</strong></div>
            <div><span class="label">Total Incoming Volume:</span> <strong>${totalAllocatedTonnage} T CO₂</strong></div>
            <div><span class="label">Active Suppliers:</span> <strong>${suppliersCount}</strong></div>
            <div><span class="label">Total Active Shipments:</span> <strong>${routes.length}</strong></div>
          </div>
        </div>
      `);

      allBounds.push([buyerLat, buyerLng]);

      // 2. Draw Seller Sources, OSRM Road Routes, & Estimated In-Transit Trucks
      routes.forEach((route, idx) => {
        const sellerName = route.seller?.name || route.origin?.name || route.sellerName || `Supplier ${idx + 1}`;
        const sellerAddress = route.seller?.address || route.origin?.address || 'Capture Terminal';
        const sellerLat = route.origin?.latitude ?? route.sellerLocation?.lat ?? route.origin?.lat;
        const sellerLng = route.origin?.longitude ?? route.sellerLocation?.lng ?? route.origin?.lng;

        if (sellerLat == null || sellerLng == null) return;

        const statusKey = route.status || 'ALLOCATED';
        const statusCfg = STATUS_CONFIG[statusKey] || STATUS_CONFIG.ALLOCATED;
        const isRoad = route.isRoadRoute !== false;
        const distanceKm = route.distanceKm != null ? Math.round(route.distanceKm * 10) / 10 : null;
        const durationHours = route.durationHours != null ? Math.round(route.durationHours * 10) / 10 : null;

        // Seller Icon (with supplier index number)
        const sellerIcon = L.divIcon({
          className: 'custom-leaflet-pin seller-source-pin',
          html: `
            <div class="cb-seller-pin" style="border-color: ${statusCfg.color};" title="${sellerName}">
              <span class="cb-seller-num">${idx + 1}</span>
            </div>
          `,
          iconSize: [32, 32],
          iconAnchor: [16, 16],
        });

        const sellerMarker = L.marker([sellerLat, sellerLng], { icon: sellerIcon }).addTo(layerGroup);

        const sellerPopupContent = `
          <div class="cb-popup">
            <div class="cb-popup-header seller">
              <span class="cb-popup-tag">CO₂ SOURCE #${idx + 1}</span>
              <h4>${sellerName}</h4>
            </div>
            <p class="cb-popup-address">${sellerAddress}</p>
            <div class="cb-popup-grid">
              <div><span class="label">Allocated Quantity:</span> <strong>${route.allocatedTonnage || route.quantity || '—'} T CO₂</strong></div>
              <div><span class="label">Batch ID:</span> <code>${route.batchNumber || '—'}</code></div>
              ${route.purityPercentage ? `<div><span class="label">CO₂ Purity:</span> <strong>${route.purityPercentage}%</strong></div>` : ''}
              <div><span class="label">Shipment Status:</span> <span class="cb-status-badge" style="background:${statusCfg.bg};color:${statusCfg.color};border:1px solid ${statusCfg.border};">${statusCfg.icon} ${statusCfg.label}</span></div>
              ${distanceKm ? `<div><span class="label">Road Distance:</span> <strong>${distanceKm} km</strong></div>` : ''}
              ${durationHours ? `<div><span class="label">Est. Transit Time:</span> <strong>${durationHours} hrs</strong></div>` : ''}
            </div>
            <div class="cb-route-quality ${isRoad ? 'verified' : 'fallback'}">
              ${isRoad ? '✓ Road Network Route · OSRM' : '⚠ Road route unavailable — approximate visualization'}
            </div>
          </div>
        `;

        sellerMarker.bindPopup(sellerPopupContent);
        markerRefs.current.set(route.shipmentId || idx, sellerMarker);
        allBounds.push([sellerLat, sellerLng]);

        // 3. Anchor geometry to destination
        let geometry =
          Array.isArray(route.geometry) && route.geometry.length > 0
            ? [...route.geometry]
            : [
                [sellerLat, sellerLng],
                [buyerLat, buyerLng],
              ];

        if (geometry.length > 0) {
          geometry[geometry.length - 1] = [buyerLat, buyerLng];
        }

        // Add coordinates to bounds for framing
        geometry.forEach((pt) => {
          if (Array.isArray(pt) && pt.length === 2) {
            allBounds.push(pt);
          }
        });

        // 4. Calculate estimated progress along OSRM road geometry
        const progress = calculateEstimatedProgress({
          dispatchedAt: route.dispatchedAt,
          durationHours: route.durationHours,
          distanceKm: route.distanceKm,
          geometry,
        });

        const isInTransit = statusKey === 'IN_TRANSIT';

        if (isInTransit && progress.isCalculable && progress.position) {
          // A. Travelled road segment (solid green)
          const travelledLine = L.polyline(progress.travelledGeometry, {
            color: '#059669',
            weight: 5,
            opacity: 0.95,
            lineJoin: 'round',
            lineCap: 'round',
          }).addTo(layerGroup);

          // B. Remaining road segment (dashed)
          const remainingLine = L.polyline(progress.remainingGeometry, {
            color: '#64748b',
            weight: 3.5,
            opacity: 0.75,
            dashArray: '6, 8',
            lineJoin: 'round',
            lineCap: 'round',
          }).addTo(layerGroup);

          // C. Estimated truck position marker along the road geometry
          const truckIcon = L.divIcon({
            className: 'custom-leaflet-pin truck-progress-pin',
            html: `
              <div class="cb-truck-pin" title="Estimated Shipment Progress: ${progress.progressPercentage}%">
                <span class="cb-truck-icon">🚚</span>
                <span class="cb-truck-pulse"></span>
              </div>
            `,
            iconSize: [32, 32],
            iconAnchor: [16, 16],
          });

          const truckMarker = L.marker(progress.position, {
            icon: truckIcon,
            zIndexOffset: 850,
          }).addTo(layerGroup);

          const truckPopupContent = `
            <div class="cb-popup">
              <div class="cb-popup-header in-transit">
                <span class="cb-popup-tag">IN TRANSIT &middot; ESTIMATED SHIPMENT PROGRESS</span>
                <h4>${sellerName} &rarr; ${buyerName}</h4>
              </div>
              <p class="cb-popup-address"><strong>From:</strong> ${sellerAddress}</p>
              <p class="cb-popup-address"><strong>To:</strong> ${buyerAddress}</p>
              <div class="cb-popup-grid">
                <div><span class="label">Seller:</span> <strong>${sellerName}</strong></div>
                <div><span class="label">Quantity:</span> <strong>${route.allocatedTonnage || route.quantity || '—'} T CO₂</strong></div>
                <div><span class="label">Progress:</span> <strong>${progress.progressPercentage}% estimated</strong></div>
                ${progress.distanceCoveredKm != null ? `<div><span class="label">Distance:</span> <strong>~${progress.distanceCoveredKm} km covered &middot; ~${progress.distanceRemainingKm} km remaining</strong></div>` : ''}
                <div><span class="label">ETA:</span> <strong>${progress.etaText}</strong></div>
                <div><span class="label">GPS:</span> <span class="cb-status-badge fallback">Unavailable</span></div>
                <div><span class="label">Status:</span> <strong>Estimated shipment progress</strong></div>
              </div>
              <div class="cb-route-quality fallback" style="margin-top: 10px; font-size: 0.75rem;">
                ⚠️ ${GPS_UNAVAILABLE_DISCLAIMER}
              </div>
            </div>
          `;

          truckMarker.bindPopup(truckPopupContent);
          allBounds.push(progress.position);

          const routePopupContent = `
            <div class="cb-popup">
              <div class="cb-popup-header route">
                <span class="cb-popup-tag">ACTIVE CO₂ SUPPLY LINE &middot; IN TRANSIT</span>
                <h4>${sellerName} &rarr; ${buyerName}</h4>
              </div>
              <div class="cb-popup-grid">
                <div><span class="label">Allocated Volume:</span> <strong>${route.allocatedTonnage || route.quantity || '—'} T</strong></div>
                <div><span class="label">Batch Number:</span> <code>${route.batchNumber || '—'}</code></div>
                <div><span class="label">Estimated Progress:</span> <strong>${progress.progressPercentage}%</strong></div>
                ${progress.distanceCoveredKm != null ? `<div><span class="label">Distance:</span> <strong>~${progress.distanceCoveredKm} km covered &middot; ~${progress.distanceRemainingKm} km remaining</strong></div>` : ''}
                <div><span class="label">Estimated ETA:</span> <strong>${progress.etaText}</strong></div>
              </div>
              <div class="cb-route-quality ${isRoad ? 'verified' : 'fallback'}">
                ${isRoad ? '✓ Road Network Route · OSRM' : '⚠ Road route unavailable — approximate visualization'}
              </div>
              <div class="cb-route-quality fallback" style="margin-top: 6px; font-size: 0.72rem;">
                ⚠️ ${GPS_UNAVAILABLE_DISCLAIMER}
              </div>
            </div>
          `;

          travelledLine.bindPopup(routePopupContent);
          remainingLine.bindPopup(routePopupContent);
        } else {
          // Regular route polyline (ALLOCATED, DISPATCH_PENDING, DELIVERED)
          const polyline = L.polyline(geometry, {
            color: statusCfg.color,
            weight: 4.5,
            opacity: 0.88,
            dashArray: isRoad ? null : '6, 8',
            lineJoin: 'round',
            lineCap: 'round',
          }).addTo(layerGroup);

          const routePopupContent = `
            <div class="cb-popup">
              <div class="cb-popup-header route">
                <span class="cb-popup-tag">ACTIVE CO₂ SUPPLY LINE</span>
                <h4>${sellerName} &rarr; ${buyerName}</h4>
              </div>
              <div class="cb-popup-grid">
                <div><span class="label">Allocated Volume:</span> <strong>${route.allocatedTonnage || route.quantity || '—'} T</strong></div>
                <div><span class="label">Batch Number:</span> <code>${route.batchNumber || '—'}</code></div>
                <div><span class="label">Shipment Status:</span> <span class="cb-status-badge" style="background:${statusCfg.bg};color:${statusCfg.color};border:1px solid ${statusCfg.border};">${statusCfg.icon} ${statusCfg.label}</span></div>
                ${distanceKm ? `<div><span class="label">Road Distance:</span> <strong>${distanceKm} km (OSRM)</strong></div>` : ''}
                ${durationHours ? `<div><span class="label">Est. Transit Duration:</span> <strong>~${durationHours} hours</strong></div>` : ''}
              </div>
              <div class="cb-route-quality ${isRoad ? 'verified' : 'fallback'}">
                ${isRoad ? '✓ Road Network Route · OSRM' : '⚠ Road route unavailable — approximate visualization'}
              </div>
            </div>
          `;
          polyline.bindPopup(routePopupContent);

          polyline.on('mouseover', function () {
            this.setStyle({ weight: 6.5, opacity: 1 });
          });
          polyline.on('mouseout', function () {
            this.setStyle({ weight: 4.5, opacity: 0.88 });
          });
        }
      });

      // Fit map viewport to encompass all suppliers and destination
      if (allBounds.length > 0) {
        try {
          map.fitBounds(allBounds, { padding: [50, 50], maxZoom: 13 });
        } catch {
          map.setView([buyerLat, buyerLng], 8);
        }
      }

      setTimeout(() => map.invalidateSize(), 150);
    });

    return () => {
      if (mapInstanceRef.current) {
        mapInstanceRef.current.remove();
        mapInstanceRef.current = null;
      }
    };
  }, [loading, routes, totalAllocatedTonnage, suppliersCount, tick]);

  // Focus a specific route from the summary card
  const handleFocusRoute = (route, idx) => {
    setActiveRouteId(route.shipmentId || idx);
    const marker = markerRefs.current.get(route.shipmentId || idx);
    const map = mapInstanceRef.current;
    if (marker && map) {
      const sellerLat = route.origin?.latitude ?? route.sellerLocation?.lat ?? route.origin?.lat;
      const sellerLng = route.origin?.longitude ?? route.sellerLocation?.lng ?? route.origin?.lng;
      if (sellerLat && sellerLng) {
        map.flyTo([sellerLat, sellerLng], 10, { duration: 1 });
        setTimeout(() => marker.openPopup(), 1100);
      }
    }
  };

  return (
    <div className="cb-active-map-page page-enter">
      {/* Page Header */}
      <div className="cb-map-header-row">
        <div>
          <h2>Active CO₂ Delivery Map</h2>
          <p className="cb-map-header-sub">
            Real-time multi-supplier logistics tracking & active supply lines delivering to your facility
          </p>
        </div>

        {!loading && routes.length > 0 && (
          <div className="cb-map-badge-group">
            <div className="cb-stat-pill highlight">
              <span>●</span>
              <span>{suppliersCount} Active Suppliers</span>
            </div>
            <div className="cb-stat-pill">
              <span>{totalAllocatedTonnage} T Total Allocated</span>
            </div>
            <div className="cb-stat-pill">
              <span>{activeRunsCount} Active Shipments</span>
            </div>
          </div>
        )}
      </div>

      {error && (
        <div className="alert alert-error" role="alert">
          {error}
        </div>
      )}

      {/* Loading Skeleton */}
      {loading ? (
        <div className="card" style={{ padding: 0, overflow: 'hidden' }}>
          <div className="skeleton" style={{ height: '520px', width: '100%' }} />
        </div>
      ) : routes.length === 0 ? (
        /* Empty State */
        <div className="cb-empty-state-card">
          <div className="cb-empty-icon-wrap">🚚</div>
          <h3 className="cb-empty-title">No active CO₂ deliveries yet</h3>
          <p className="cb-empty-desc">
            You don't have any in-progress shipments right now. When you purchase lots on the marketplace
            or match requirements with suppliers, your live delivery routes and supplier allocations will
            appear here in real-time.
          </p>
          <button className="cb-btn-cta" onClick={() => navigate('/marketplace')}>
            <span>Explore Marketplace</span>
            <span>&rarr;</span>
          </button>
        </div>
      ) : (
        <>
          {/* Transparent GPS Disclaimer Banner */}
          <div className="cb-disclaimer-banner">
            <span>ℹ️</span>
            <span>
              <strong>Estimated shipment progress:</strong> In-transit truck positions and ETAs are calculated along planned OSRM road routes based on dispatch times and route distance. GPS tracking unavailable — position estimated from shipment progress.
            </span>
          </div>

          {/* Main Map Card */}
          <div className="cb-map-card">
            {/* Compact Map Legend */}
            <div className="cb-map-legend">
              <div className="cb-legend-title">Map Legend</div>
              <div className="cb-legend-items">
                <div className="cb-legend-row">
                  <span className="cb-legend-dot seller" />
                  <span>Seller / CO₂ Source</span>
                </div>
                <div className="cb-legend-row">
                  <span className="cb-legend-dot buyer" />
                  <span>Buyer / Destination (B)</span>
                </div>
                <div className="cb-legend-row">
                  <span className="cb-legend-line" />
                  <span>Active Road Route (OSRM)</span>
                </div>
                <div className="cb-legend-row">
                  <span>🚚</span>
                  <span>Estimated In-Transit Position</span>
                </div>
                <div className="cb-legend-row">
                  <span>✓</span>
                  <span>Delivered</span>
                </div>
              </div>
            </div>

            {/* Leaflet Map DOM Element */}
            <div ref={mapRef} className="cb-map-container" />
          </div>

          {/* Transaction Summary Section */}
          <div className="cb-summary-section">
            <div className="cb-summary-card">
              <div className="cb-summary-header">
                <div>
                  <h3>Active CO₂ Sources</h3>
                  <span style={{ fontSize: '0.75rem', color: '#64748b' }}>
                    Click any supplier to focus and highlight their delivery route on the map
                  </span>
                </div>
                <div className="cb-summary-meta">
                  {suppliersCount} Suppliers &middot; {totalAllocatedTonnage} T Total
                </div>
              </div>

              <div className="cb-routes-grid">
                {routes.map((route, idx) => {
                  const sellerName =
                    route.seller?.name || route.origin?.name || route.sellerName || `Supplier ${idx + 1}`;
                  const sellerAddress =
                    route.seller?.address || route.origin?.address || 'Capture Terminal';
                  const statusKey = route.status || 'ALLOCATED';
                  const statusCfg = STATUS_CONFIG[statusKey] || STATUS_CONFIG.ALLOCATED;
                  const distanceKm =
                    route.distanceKm != null ? Math.round(route.distanceKm * 10) / 10 : null;
                  const durationHours =
                    route.durationHours != null ? Math.round(route.durationHours * 10) / 10 : null;
                  const isRoad = route.isRoadRoute !== false;
                  const isSelected = activeRouteId === (route.shipmentId || idx);

                  const cardProgress = calculateEstimatedProgress({
                    dispatchedAt: route.dispatchedAt,
                    durationHours: route.durationHours,
                    distanceKm: route.distanceKm,
                  });

                  return (
                    <div
                      key={route.shipmentId || idx}
                      className={`cb-route-item-card ${isSelected ? 'active' : ''}`}
                      onClick={() => handleFocusRoute(route, idx)}
                    >
                      <div className="cb-route-card-top">
                        <div className="cb-seller-info">
                          <div className="cb-seller-badge-num">{idx + 1}</div>
                          <div>
                            <h4 className="cb-seller-name">{sellerName}</h4>
                            <p className="cb-seller-addr">{sellerAddress}</p>
                          </div>
                        </div>
                        <span
                          className="cb-status-badge"
                          style={{
                            background: statusCfg.bg,
                            color: statusCfg.color,
                            borderColor: statusCfg.border,
                          }}
                        >
                          {statusCfg.icon} {statusCfg.label}
                        </span>
                      </div>

                      <div className="cb-route-card-metrics">
                        <div className="cb-metric-cell">
                          <span className="cb-metric-label">Allocated Volume</span>
                          <span className="cb-metric-val">
                            {route.allocatedTonnage || route.quantity || '—'} T
                          </span>
                        </div>
                        <div className="cb-metric-cell">
                          <span className="cb-metric-label">Batch ID</span>
                          <span className="cb-metric-val" style={{ fontFamily: 'monospace' }}>
                            {route.batchNumber || '—'}
                          </span>
                        </div>
                        <div className="cb-metric-cell">
                          <span className="cb-metric-label">Road Distance</span>
                          <span className="cb-metric-val">
                            {distanceKm ? `${distanceKm} km` : '—'}
                          </span>
                        </div>
                        <div className="cb-metric-cell">
                          <span className="cb-metric-label">Est. Transit Time</span>
                          <span className="cb-metric-val">
                            {durationHours ? `~${durationHours} hrs` : '—'}
                          </span>
                        </div>
                      </div>

                      {/* In-Transit Progress Bar Section */}
                      {statusKey === 'IN_TRANSIT' && cardProgress.isCalculable && (
                        <div className="cb-route-progress-wrap">
                          <div className="cb-route-progress-meta">
                            <span>🚚 Estimated Progress: {cardProgress.progressPercentage}%</span>
                            <span>ETA: {cardProgress.etaText}</span>
                          </div>
                          <div className="cb-route-progress-track">
                            <div
                              className="cb-route-progress-fill"
                              style={{ width: `${cardProgress.progressPercentage}%` }}
                            />
                          </div>
                          <div className="cb-route-progress-sub">
                            <span>
                              {cardProgress.distanceCoveredKm != null
                                ? `~${cardProgress.distanceCoveredKm} km covered · ~${cardProgress.distanceRemainingKm} km remaining`
                                : ''}
                            </span>
                            <span className="cb-gps-disclaimer-pill">
                              GPS tracking unavailable
                            </span>
                          </div>
                        </div>
                      )}

                      <div className="cb-route-card-bottom">
                        <span
                          style={{
                            color: isRoad ? '#065f46' : '#b45309',
                            fontWeight: 600,
                          }}
                        >
                          {isRoad ? '✓ Road Network (OSRM)' : '⚠ Approx. Route'}
                        </span>
                        <button
                          type="button"
                          className="cb-route-link-cta"
                          onClick={(e) => {
                            e.stopPropagation();
                            handleFocusRoute(route, idx);
                          }}
                        >
                          <span>Focus on map</span>
                          <span>&rarr;</span>
                        </button>
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>
          </div>
        </>
      )}
    </div>
  );
}

