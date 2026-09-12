import { useEffect, useState, useRef } from 'react';
import { mapsApi } from '../../api/maps';

export function ActiveMap() {
  const [mapData, setMapData] = useState(null);
  const [loading, setLoading] = useState(true);
  const mapRef = useRef(null);
  const mapInstanceRef = useRef(null);

  useEffect(() => {
    async function load() {
      try {
        const res = await mapsApi.getActive();
        setMapData(res?.data || res);
      } catch (e) { console.error(e); }
      setLoading(false);
    }
    load();
  }, []);

  useEffect(() => {
    if (!mapData || !mapRef.current || mapInstanceRef.current) return;

    // Dynamically import Leaflet CSS
    const link = document.createElement('link');
    link.rel = 'stylesheet';
    link.href = 'https://unpkg.com/leaflet@1.9.4/dist/leaflet.css';
    document.head.appendChild(link);

    import('leaflet').then((L) => {
      const map = L.map(mapRef.current).setView([22.3, 72.8], 7);
      mapInstanceRef.current = map;

      L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
        attribution: '© OpenStreetMap contributors',
        maxZoom: 18,
      }).addTo(map);

      const transactions = mapData.transactions || mapData || [];
      const txArray = Array.isArray(transactions) ? transactions : [];

      txArray.forEach(tx => {
        const origin = tx.origin || tx.sellerLocation;
        const dest = tx.destination || tx.buyerLocation;

        if (origin?.lat && origin?.lng) {
          L.circleMarker([origin.lat, origin.lng], {
            radius: 8, color: 'var(--color-primary)', fillColor: '#1B4332',
            fillOpacity: 0.8, weight: 2
          })
          .bindPopup(`<strong>Seller:</strong> ${tx.sellerName || 'Seller'}<br/><strong>Qty:</strong> ${tx.quantity || '—'} T`)
          .addTo(map);
        }

        if (dest?.lat && dest?.lng) {
          L.circleMarker([dest.lat, dest.lng], {
            radius: 8, color: '#0D9488', fillColor: '#0D9488',
            fillOpacity: 0.8, weight: 2
          })
          .bindPopup(`<strong>Buyer:</strong> ${tx.buyerName || 'Buyer'}<br/><strong>Status:</strong> ${tx.status || '—'}`)
          .addTo(map);
        }

        if (origin?.lat && origin?.lng && dest?.lat && dest?.lng) {
          L.polyline([[origin.lat, origin.lng], [dest.lat, dest.lng]], {
            color: '#40916C', weight: 2, opacity: 0.6, dashArray: '8 6'
          }).addTo(map);
        }
      });

      setTimeout(() => map.invalidateSize(), 100);
    });

    return () => {
      if (mapInstanceRef.current) {
        mapInstanceRef.current.remove();
        mapInstanceRef.current = null;
      }
    };
  }, [mapData]);

  return (
    <div className="page-enter">
      <div className="page-header">
        <h2>Active Transaction Map</h2>
      </div>
      <div className="card" style={{ padding: 0, overflow: 'hidden' }}>
        {loading ? (
          <div className="skeleton" style={{ height: '500px' }} />
        ) : (
          <div ref={mapRef} style={{ height: '500px', width: '100%', borderRadius: 'var(--radius-lg)' }} />
        )}
      </div>
    </div>
  );
}
