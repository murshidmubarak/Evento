import React, { useState, useEffect, useRef } from 'react';
import mapboxgl from 'mapbox-gl';
import 'mapbox-gl/dist/mapbox-gl.css';
import { SearchBox } from '@mapbox/search-js-react';
import { Loader2 } from 'lucide-react';

export interface LocationState {
  address: string;
  lat?: number;
  lng?: number;
}

interface LocationMapSelectorProps {
  location: LocationState;
  onChange: (location: LocationState) => void;
  addressLabel?: string;
  placeholder?: string;
  emptyWarning?: string;
}

const defaultCenter = { lat: 9.9312, lng: 76.2673 }; // Kochi

export const LocationMapSelector: React.FC<LocationMapSelectorProps> = (props) => {
  const token = import.meta.env.VITE_MAPBOX_ACCESS_TOKEN;
  
  if (!token) {
    return (
      <div className="p-4 bg-red-50 border border-red-200 rounded-lg text-red-600 text-sm">
        <strong>Configuration Error:</strong> VITE_MAPBOX_ACCESS_TOKEN is missing. Please add it to your environment variables.
      </div>
    );
  }

  return (
    <MapSelectorInner {...props} token={token} />
  );
};

const MapSelectorInner: React.FC<LocationMapSelectorProps & { token: string }> = ({
  location,
  onChange,
  token,
  addressLabel = 'Full Event Address',
  placeholder = 'e.g. Grand Ballroom, XYZ Convention Centre, MG Road...',
  emptyWarning = 'Please select the event location on the map.',
}) => {
  const [isLocating, setIsLocating] = useState(false);
  const [searchError, setSearchError] = useState('');
  const [successMessage, setSuccessMessage] = useState('');
  
  const mapContainer = useRef<HTMLDivElement>(null);
  const map = useRef<mapboxgl.Map | null>(null);
  const marker = useRef<mapboxgl.Marker | null>(null);

  const lat = location.lat !== undefined ? location.lat : defaultCenter.lat;
  const lng = location.lng !== undefined ? location.lng : defaultCenter.lng;

  // Initialize Mapbox map
  useEffect(() => {
    if (!mapContainer.current || map.current) return;

    mapboxgl.accessToken = token;
    
    map.current = new mapboxgl.Map({
      container: mapContainer.current,
      style: 'mapbox://styles/mapbox/streets-v12',
      center: [lng, lat],
      zoom: 13,
    });

    marker.current = new mapboxgl.Marker({ draggable: true });

    if (location.lat !== undefined && location.lng !== undefined) {
      marker.current.setLngLat([location.lng, location.lat]).addTo(map.current);
    }

    map.current.on('click', (e) => {
      const newLat = e.lngLat.lat;
      const newLng = e.lngLat.lng;
      updateLocationAndGeocode(newLat, newLng);
    });

    marker.current.on('dragend', () => {
      const lngLat = marker.current?.getLngLat();
      if (lngLat) {
        updateLocationAndGeocode(lngLat.lat, lngLat.lng);
      }
    });

    return () => {
      map.current?.remove();
      map.current = null;
    };
  }, [token]); // We only initialize once

  // Update map and marker when location changes externally (e.g. from search)
  useEffect(() => {
    if (map.current && marker.current && location.lat !== undefined && location.lng !== undefined) {
      marker.current.setLngLat([location.lng, location.lat]);
      if (!marker.current.getElement().parentNode) {
        marker.current.addTo(map.current);
      }
      map.current.flyTo({ center: [location.lng, location.lat], zoom: 15 });
    }
  }, [location.lat, location.lng]);

  const updateLocationAndGeocode = async (newLat: number, newLng: number) => {
    try {
      setSearchError('');
      // Perform reverse geocoding
      const response = await fetch(`https://api.mapbox.com/search/geocode/v6/reverse?longitude=${newLng}&latitude=${newLat}&access_token=${token}`);
      const data = await response.json();
      
      let newAddress = location.address;
      if (data.features && data.features.length > 0) {
        newAddress = data.features[0].properties.full_address || data.features[0].properties.name || location.address;
      }
      
      onChange({
        address: newAddress,
        lat: newLat,
        lng: newLng
      });
    } catch (error) {
      console.error("Reverse geocoding error:", error);
      // Fallback: keep lat/lng even if reverse geocoding fails
      onChange({
        address: location.address,
        lat: newLat,
        lng: newLng
      });
    }
  };

  const handleRetrieve = (res: any) => {
    setSearchError('');
    setSuccessMessage('');
    
    if (!res || !res.features || res.features.length === 0) {
      setSearchError('No matching mapped location was found. You can select the location manually on the map or enter the full address.');
      return;
    }

    const feature = res.features[0];
    const coords = feature.geometry.coordinates; // [lng, lat]
    const address = feature.properties.full_address || feature.properties.name || feature.properties.address || '';
    
    onChange({
      address,
      lat: coords[1],
      lng: coords[0]
    });
  };

  const handleCurrentLocation = () => {
    if (!navigator.geolocation) {
      setSearchError('Current location is not supported by this browser. Please select the location manually.');
      return;
    }

    setIsLocating(true);
    setSearchError('');
    setSuccessMessage('');

    navigator.geolocation.getCurrentPosition(
      (position) => {
        setIsLocating(false);
        const { latitude, longitude } = position.coords;
        if (!Number.isFinite(latitude) || !Number.isFinite(longitude)) {
           setSearchError('Your current location could not be determined. Please select the location manually.');
           return;
        }
        
        updateLocationAndGeocode(latitude, longitude);
        setSuccessMessage('Current location selected');
        setTimeout(() => setSuccessMessage(''), 3000);
      },
      (error) => {
        setIsLocating(false);
        switch (error.code) {
          case error.PERMISSION_DENIED:
            setSearchError('Location permission was denied. Please select the event location manually.');
            break;
          case error.POSITION_UNAVAILABLE:
            setSearchError('Your current location could not be determined. Please select the location manually.');
            break;
          case error.TIMEOUT:
            setSearchError('Location request timed out. Please try again.');
            break;
          default:
            setSearchError('Your current location could not be determined. Please select the location manually.');
            break;
        }
      },
      { timeout: 10000, maximumAge: 0 }
    );
  };

  return (
    <div className="flex flex-col gap-4 relative z-0">
      <div className="relative z-[1000]">
        <div className="mb-2 mapbox-search-container">
          <SearchBox
            accessToken={token}
            options={{
              language: 'en',
              country: 'IN' // Optional, can remove if global
            }}
            onRetrieve={handleRetrieve}
            theme={{
              variables: {
                fontFamily: 'inherit',
                unit: '1rem',
                border: '1px solid #d1d5db',
                borderRadius: '0.5rem',
                boxShadow: 'none',
              },
            }}
          />
        </div>
        
        <div className="flex justify-between items-center mt-2">
          <button
            type="button"
            onClick={handleCurrentLocation}
            disabled={isLocating}
            className="text-[#0051e5] font-bold text-sm flex items-center gap-1.5 hover:text-blue-700 disabled:opacity-70 transition-colors"
          >
            {isLocating ? <Loader2 className="w-4 h-4 animate-spin" /> : '📍'} Use Current Location
          </button>
        </div>
        
        {searchError && (
          <p className="text-red-500 text-xs mt-2 font-medium">{searchError}</p>
        )}
        {successMessage && (
          <p className="text-green-600 text-xs mt-2 font-medium">{successMessage}</p>
        )}
      </div>

      <div className="h-[300px] w-full rounded-xl overflow-hidden border border-gray-300 relative z-0">
        <div ref={mapContainer} data-testid="map-container" style={{ height: '100%', width: '100%' }} />
      </div>

      <div className="bg-white">
        <label className="block text-xs font-bold text-gray-700 mb-1.5 uppercase tracking-wider">{addressLabel}</label>
        <textarea 
          value={location.address} 
          onChange={e => onChange({ ...location, address: e.target.value })} 
          rows={3}
          className="w-full rounded-lg border border-gray-300 focus:border-[#0051e5] focus:ring-[#0051e5] p-3 text-sm outline-none resize-none shadow-sm"
          placeholder={placeholder}
        />
        {(location.lat === undefined || location.lng === undefined) && (
          <p className="text-amber-600 text-xs mt-2 font-medium flex items-center gap-1">
            <span className="inline-block w-1.5 h-1.5 bg-amber-500 rounded-full"></span>
            {emptyWarning}
          </p>
        )}
      </div>
    </div>
  );
};
