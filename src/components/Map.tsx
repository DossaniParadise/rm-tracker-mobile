import L from 'leaflet';
import 'leaflet/dist/leaflet.css';
import { MapContainer, Marker, Popup, TileLayer } from 'react-leaflet';
import { Store } from '../constants';

// Fix for default marker icons in Leaflet with React
let DefaultIcon = L.icon({
    iconUrl: 'https://unpkg.com/leaflet@1.9.4/dist/images/marker-icon.png',
    shadowUrl: 'https://unpkg.com/leaflet@1.9.4/dist/images/marker-shadow.png',
    iconSize: [25, 41],
    iconAnchor: [12, 41]
});

L.Marker.prototype.options.icon = DefaultIcon;

interface MapProps {
  stores: Store[];
  onSelectStore: (store: Store) => void;
}

export default function Map({ stores, onSelectStore }: MapProps) {
  const center: [number, number] = [33.0, -96.5];

  return (
    <MapContainer 
      center={center} 
      zoom={7} 
      style={{ height: '100%', width: '100%', borderRadius: '0.75rem' }}
      scrollWheelZoom={false}
    >
      <TileLayer
        attribution='&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors'
        url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png"
      />
      {stores.map((store) => (
        <Marker 
          key={store.id} 
          position={[store.lat, store.lng]}
        >
          <Popup>
            <div className="p-1">
              <h3 className="font-bold text-sm">{store.name}</h3>
              <p className="text-xs text-gray-500 mb-2">{store.address}</p>
              <button 
                onClick={() => onSelectStore(store)}
                className="w-full bg-blue-600 text-white text-xs py-1.5 rounded font-semibold hover:bg-blue-700 transition-colors"
              >
                Select Store
              </button>
            </div>
          </Popup>
        </Marker>
      ))}
    </MapContainer>
  );
}
