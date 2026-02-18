'use client';

import { useEffect, useRef } from 'react';
import * as maptilersdk from '@maptiler/sdk';
import '@maptiler/sdk/dist/maptiler-sdk.css';
import { FriendProfile } from '@/lib/friend-service';

interface MapProps {
  userPos: [number, number];
  locations: any[];
  friends?: FriendProfile[];
  onPosChange?: (pos: [number, number]) => void;
  onFriendClick?: (friend: FriendProfile) => void;
  onLocationClick?: (location: any) => void;
  offsetY?: number;
  centerOn?: [number, number];
  pulse?: boolean;
}

const AVATAR_PLACEHOLDER = 'https://slelguoygbfzlpylpxfs.supabase.co/storage/v1/render/image/public/project-uploads/7cd6342b-7128-4406-883d-82fa7d09a389/unnamed-1769990678038.jpg?width=8000&height=8000&resize=contain';

/** Synchronous WebGL2 check — runs once at module level */
function checkWebGL2Support(): boolean {
  if (typeof document === 'undefined') return true; // SSR — assume supported
  try {
    const canvas = document.createElement('canvas');
    const gl = canvas.getContext('webgl2') || canvas.getContext('webgl') || canvas.getContext('experimental-webgl');
    return !!gl;
  } catch {
    return false;
  }
}

const WEBGL_SUPPORTED = typeof window !== 'undefined' ? checkWebGL2Support() : true;

/** Fallback UI when WebGL is not supported */
function WebGLFallback() {
  return (
    <div className="h-full w-full flex items-center justify-center bg-gradient-to-b from-blue-50 to-blue-100 p-6">
      <div className="max-w-xs text-center space-y-4">
        <div className="w-16 h-16 mx-auto rounded-full bg-amber-100 flex items-center justify-center text-3xl">
          🗺️
        </div>
        <h3 className="text-lg font-bold text-zinc-800">
          Карта недоступна
        </h3>
        <p className="text-sm text-zinc-500 leading-relaxed">
          Ваш браузер или устройство не поддерживает технологию <strong>WebGL</strong>, необходимую для отображения карты.
        </p>
        <p className="text-xs text-zinc-400 leading-relaxed">
          Попробуйте открыть приложение в другом браузере (Google Chrome, Safari) или на другом устройстве.
        </p>
        <a
          href="https://get.webgl.org/webgl2/"
          target="_blank"
          rel="noopener noreferrer"
          className="inline-block text-xs text-indigo-500 font-medium underline underline-offset-2"
        >
          Проверить поддержку WebGL
        </a>
      </div>
    </div>
  );
}

export default function KnowledgeMap(props: MapProps) {
    const { userPos, locations, friends = [], offsetY = 0, onFriendClick, onLocationClick, centerOn, pulse } = props || {};
    const mapContainer = useRef<HTMLDivElement>(null);
  const map = useRef<any>(null);
  const userMarker = useRef<any>(null);
  const locationMarkers = useRef<any[]>([]);
  const userCircleSourceId = 'user-circle-source';
    const userCircleLayerId = 'user-circle-layer';
    const markersRef = useRef<globalThis.Map<string, any>>(new globalThis.Map());
    const friendMarkersRef = useRef<globalThis.Map<number, any>>(new globalThis.Map());

    // Moscow fallback
    const isValidPos = userPos && userPos[0] !== 0 && userPos[1] !== 0;
    const centerPos: [number, number] = isValidPos ? userPos : [55.7539, 37.6208];

    const formatFriendDate = (dateStr: string) => {
      const date = new Date(dateStr);
      const now = new Date();
      const yesterday = new Date(now);
      yesterday.setDate(now.getDate() - 1);

      const isToday = date.toDateString() === now.toDateString();
      const isYesterday = date.toDateString() === yesterday.toDateString();

      const time = date.toLocaleTimeString('ru-RU', { hour: '2-digit', minute: '2-digit' });

      if (isToday) return `Сегодня, ${time}`;
      if (isYesterday) return `Вчера, ${time}`;
      
      const dayMonth = date.toLocaleDateString('ru-RU', { day: 'numeric', month: 'short' });
      return `${dayMonth}, ${time}`;
    };

    const updateFriendMarkerContent = (el: HTMLElement, friend: FriendProfile) => {
      const nameText = el.querySelector('.friend-name') as HTMLElement;
      const timeLabel = el.querySelector('.friend-time') as HTMLElement;
      const avatar = el.querySelector('.friend-avatar') as HTMLElement;

      if (nameText) nameText.innerText = friend.first_name;
      if (timeLabel && friend.last_mined_at) {
        timeLabel.innerText = formatFriendDate(friend.last_mined_at);
      }
      if (avatar) {
        avatar.style.backgroundImage = `url(${friend.photo_200 || AVATAR_PLACEHOLDER})`;
      }
    };

    // Init map immediately — no extra render cycle
    useEffect(() => {
      if (map.current || !WEBGL_SUPPORTED) return;

      (maptilersdk.config as any).apiKey = 'wIfs08UziK6xJeBmZMgv';

        map.current = new (maptilersdk as any).Map({
          container: mapContainer.current!,
          style: maptilersdk.MapStyle.STREETS,
          center: [centerPos[1], centerPos[0]],
          zoom: 16,
          pitch: 55,
          language: 'ru',
          attributionControl: false,
          navigationControl: false,
          geolocateControl: false,
          logoControl: false,
        });

      map.current.on('load', () => {
        if (map.current) {
          map.current.addSource(userCircleSourceId, {
            type: 'geojson',
            data: createGeoJSONCircle(centerPos, 0.2)
          });

          map.current.addLayer({
            id: userCircleLayerId,
            type: 'fill',
            source: userCircleSourceId,
            layout: {},
            paint: {
              'fill-color': '#4A90E2',
              'fill-opacity': 0.1,
              'fill-outline-color': '#4A90E2'
            }
          });

          // Set disputed borders to show Russian perspective
          const showDisputedBorders = (countryCode: string) => {
            const claimed_by_countries = ["RU", "UA", "XN", "AM", "XK", "IN", "PK", "CN", "NP", "BT", "TR", "SY", "PS", "IL", "SY", "ET", "EH", "SD", "SS", "KE"];
            if (!claimed_by_countries.includes(countryCode)) return;
            
            if (map.current?.getLayer("boundary_2_z5_disputed")) {
              const boundary_disputed = map.current.getLayer("boundary_2_z5_disputed");
              if (boundary_disputed && boundary_disputed.filter) {
                map.current.setFilter("boundary_2_z5_disputed", [...(boundary_disputed.filter as any[]), ["==", "claimed_by", countryCode]]);
              }
            }
            if (map.current?.getLayer("boundary_2_z5_disputed_maritime")) {
              const boundary_disputed_maritime = map.current.getLayer("boundary_2_z5_disputed_maritime");
              if (boundary_disputed_maritime && boundary_disputed_maritime.filter) {
                map.current.setFilter("boundary_2_z5_disputed_maritime", [...(boundary_disputed_maritime.filter as any[]), ["==", "claimed_by", countryCode]]);
              }
            }
          };
          
          showDisputedBorders('RU');
        }
      });

      const el = document.createElement('div');
      el.className = 'user-marker';
      el.innerHTML = `
        <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round">
          <path d="M19 21v-2a4 4 0 0 0-4-4H9a4 4 0 0 0-4 4v2"></path>
          <circle cx="12" cy="7" r="4"></circle>
        </svg>
      `;
      el.style.backgroundColor = 'white';
      el.style.color = '#3b82f6';
      el.style.width = '32px';
      el.style.height = '32px';
      el.style.borderRadius = '12px';
      el.style.display = 'flex';
      el.style.alignItems = 'center';
      el.style.justifyContent = 'center';
      el.style.border = '2px solid white';
      el.style.boxShadow = '0 4px 12px rgba(59, 130, 246, 0.4)';

      userMarker.current = new (maptilersdk as any).Marker({ 
        element: el,
        scale: 1,
        pitchAlignment: 'viewport',
        rotationAlignment: 'viewport'
      })
        .setLngLat([centerPos[1], centerPos[0]])
        .addTo(map.current);

      return () => {
        if (map.current) {
          map.current.remove();
          map.current = null;
        }
      };
    }, []);

    // Effect for user position and map centering
    useEffect(() => {
      if (!map.current) return;

      const targetPos = centerOn || centerPos;
      const lngLat: [number, number] = [targetPos[1], targetPos[0]];
      
      map.current.setCenter(lngLat);
      if (offsetY !== 0) {
        map.current.panBy([0, -offsetY], { animate: false });
      }

      const userLngLat: [number, number] = [centerPos[1], centerPos[0]];
      if (userMarker.current) {
        userMarker.current.setLngLat(userLngLat);
      }

      const source = map.current.getSource(userCircleSourceId);
      if (source && (source as any).setData) {
        (source as any).setData(createGeoJSONCircle(centerPos, 0.2));
      }

      // Fix for "flying markers" - force map to recalculate its container size
      // especially when parent height changes (isExpanded toggle)
      setTimeout(() => {
        if (map.current) map.current.resize();
      }, 100);
    }, [centerPos[0], centerPos[1], offsetY, centerOn]);

    // Effect for knowledge places markers - separated to avoid "flying" bug
    useEffect(() => {
      if (!map.current) return;

      const currentIds = new Set(locations.map(l => l.id));
      
      // Remove markers that are no longer in the locations list
      for (const [id, marker] of markersRef.current.entries()) {
        if (!currentIds.has(id)) {
          marker.remove();
          markersRef.current.delete(id);
        }
      }

      // Add or update markers
      locations.forEach(loc => {
        if (markersRef.current.has(loc.id)) {
          // Optional: update marker style if state changed (e.g. isMined)
          // For now, let's keep it simple. If we need to update, we can recreate just this one.
          const existingMarker = markersRef.current.get(loc.id);
          // If state changed, update it
          const el = existingMarker.getElement();
          const markerDot = el.querySelector('.location-marker');
          if (markerDot) {
            markerDot.style.backgroundColor = loc.isMined ? '#3b82f6' : '#FF4B5C';
            markerDot.style.boxShadow = loc.isMined 
              ? '0 0 10px rgba(59, 130, 246, 0.5)' 
              : '0 4px 8px rgba(0, 0, 0, 0.1)';
          }
          
          const existingLabel = el.querySelector('.mined-label');
          if (loc.isMined && loc.minedAt && !existingLabel) {
            const date = new Date(loc.minedAt);
            const dateStr = date.toLocaleDateString('ru-RU', { day: 'numeric', month: 'short' });
            const timeStr = date.toLocaleTimeString('ru-RU', { hour: '2-digit', minute: '2-digit' });

            const label = document.createElement('div');
            label.className = 'mined-label';
            label.style.position = 'absolute';
            label.style.bottom = '100%';
            label.style.marginBottom = '6px';
            label.style.backgroundColor = 'rgba(59, 130, 246, 0.9)';
            label.style.color = 'white';
            label.style.padding = '2px 8px';
            label.style.borderRadius = '6px';
            label.style.fontSize = '9px';
            label.style.fontWeight = 'bold';
            label.style.whiteSpace = 'nowrap';
            label.style.backdropFilter = 'blur(4px)';
            label.style.border = '1px solid rgba(255, 255, 255, 0.2)';
            label.innerHTML = `<span style="opacity: 0.8">${dateStr}</span> ${timeStr}`;
            el.appendChild(label);
          }
          return;
        }

        const el = document.createElement('div');
        el.className = 'location-marker-container';
        el.style.display = 'flex';
        el.style.flexDirection = 'column';
        el.style.alignItems = 'center';
        el.style.pointerEvents = 'auto'; // Ensure clicks work if needed
        el.style.zIndex = loc.isMined ? '2' : '1';

        const marker = document.createElement('div');
        marker.className = 'location-marker';
        marker.style.backgroundColor = loc.isMined ? '#3b82f6' : '#FF4B5C';
        marker.style.width = '24px';
        marker.style.height = '24px';
        marker.style.borderRadius = '8px';
        marker.style.border = '2px solid white';
        marker.style.display = 'flex';
        marker.style.alignItems = 'center';
        marker.style.justifyContent = 'center';
        marker.style.color = 'white';
        marker.style.fontSize = '12px';
        marker.style.boxShadow = loc.isMined 
          ? '0 0 10px rgba(59, 130, 246, 0.5)' 
          : '0 4px 8px rgba(0, 0, 0, 0.1)';
        
        const getCategoryIconSvg = (category: string): string => {
          const size = 14;
          const icons: Record<string, string> = {
            'Вуз': `<svg xmlns="http://www.w3.org/2000/svg" width="${size}" height="${size}" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M22 10v6M2 10l10-5 10 5-10 5z"/><path d="M6 12v5c0 2 2 3 6 3s6-1 6-3v-5"/></svg>`,
            'Школа': `<svg xmlns="http://www.w3.org/2000/svg" width="${size}" height="${size}" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M22 10v6M2 10l10-5 10 5-10 5z"/><path d="M6 12v5c0 2 2 3 6 3s6-1 6-3v-5"/></svg>`,
            'Колледж': `<svg xmlns="http://www.w3.org/2000/svg" width="${size}" height="${size}" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M22 10v6M2 10l10-5 10 5-10 5z"/><path d="M6 12v5c0 2 2 3 6 3s6-1 6-3v-5"/></svg>`,
            'Библиотека': `<svg xmlns="http://www.w3.org/2000/svg" width="${size}" height="${size}" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M4 22V4a2 2 0 0 1 2-2h12a2 2 0 0 1 2 2v18Z"/><path d="M8 22v-6h8v6"/><path d="M9 2h6"/><path d="M9 6h6"/><path d="M9 10h6"/><path d="M9 14h6"/></svg>`,
            'Музей': `<svg xmlns="http://www.w3.org/2000/svg" width="${size}" height="${size}" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="m3 21 9-9 9 4"/><path d="M12.5 5.5 16 9"/><path d="m12 15 3.5-3.5"/><path d="M12 15v6"/><path d="m9 21 3-9 3 9"/></svg>`,
            'Памятник': `<svg xmlns="http://www.w3.org/2000/svg" width="${size}" height="${size}" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="m21 10-9 4-9-4-9 4 9 4"/><path d="M3 14v-4"/><path d="M6 10V6a2 2 0 0 1 2-2h8a2 2 0 0 1 2 2v4"/><path d="M21 14v4"/><path d="M18 14v4"/></svg>`,
          };
          return icons[category] || `<svg xmlns="http://www.w3.org/2000/svg" width="${size}" height="${size}" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M20 10c0 6-8 12-8 12s-8-6-8-12a8 8 0 0 1 16 0Z"/><circle cx="12" cy="10" r="3"/></svg>`;
        };

        marker.innerHTML = getCategoryIconSvg(loc.category);
        
        el.appendChild(marker);

        // Add click handler for location details
        el.addEventListener('click', (e) => {
          e.stopPropagation();
          if (onLocationClick) onLocationClick(loc);
        });
        el.style.cursor = 'pointer';

        if (loc.isMined && loc.minedAt) {
          const date = new Date(loc.minedAt);
          const dateStr = date.toLocaleDateString('ru-RU', { day: 'numeric', month: 'short' });
          const timeStr = date.toLocaleTimeString('ru-RU', { hour: '2-digit', minute: '2-digit' });

          const label = document.createElement('div');
          label.className = 'mined-label';
          label.style.position = 'absolute';
          label.style.bottom = '100%';
          label.style.marginBottom = '6px';
          label.style.backgroundColor = 'rgba(59, 130, 246, 0.9)';
          label.style.color = 'white';
          label.style.padding = '2px 8px';
          label.style.borderRadius = '6px';
          label.style.fontSize = '9px';
          label.style.fontWeight = 'bold';
          label.style.whiteSpace = 'nowrap';
          label.style.backdropFilter = 'blur(4px)';
          label.style.border = '1px solid rgba(255, 255, 255, 0.2)';
          label.innerHTML = `<span style="opacity: 0.8">${dateStr}</span> ${timeStr}`;
          
          el.appendChild(label);
        }

        const m = new (maptilersdk as any).Marker({ 
          element: el,
          scale: 1,
          pitchAlignment: 'viewport',
          rotationAlignment: 'viewport'
        })
          .setLngLat([loc.lon, loc.lat])
          .addTo(map.current!);
        
        markersRef.current.set(loc.id, m);
      });
    }, [locations]);

    // Effect for friend markers
    useEffect(() => {
      if (!map.current) return;

      const currentFriendIds = new Set(friends.map(f => f.vk_id));
      
      // Remove friend markers that are no longer in the list
      for (const [vkId, marker] of friendMarkersRef.current.entries()) {
        if (!currentFriendIds.has(vkId)) {
          marker.remove();
          friendMarkersRef.current.delete(vkId);
        }
      }

      // 1. Group friends by coordinates
      const groups = new globalThis.Map<string, FriendProfile[]>();
      friends.forEach(f => {
        if (f.last_lat && f.last_lon) {
          const key = `${f.last_lat.toFixed(6)}_${f.last_lon.toFixed(6)}`;
          if (!groups.has(key)) groups.set(key, []);
          groups.get(key)!.push(f);
        }
      });

      // 2. Add or update friend markers with grouping logic
      groups.forEach((groupFriends) => {
        const count = groupFriends.length;
        
        groupFriends.forEach((friend, index) => {
          // Calculate horizontal offset to avoid overlap
          // Spacing of 42px between friends in the same location
          const spacing = 42;
          const offsetX = count > 1 ? (index - (count - 1) / 2) * spacing : 0;
          // offsetY is 16px to stay below the location icon (which is 24px/2 = 12px height)
          const offsetY = 16;

          if (friendMarkersRef.current.has(friend.vk_id)) {
            const m = friendMarkersRef.current.get(friend.vk_id);
            m.setLngLat([friend.last_lon, friend.last_lat]);
            m.setOffset([offsetX, offsetY]);
            updateFriendMarkerContent(m.getElement(), friend);
            return;
          }

          const el = document.createElement('div');
          el.className = 'friend-marker-container';
          el.style.display = 'flex';
          el.style.flexDirection = 'column';
          el.style.alignItems = 'center';
          el.style.cursor = 'pointer';
          el.style.width = '100px'; 
          el.style.zIndex = '10'; // Keep friends above location markers

          // Avatar circle
          const avatar = document.createElement('div');
          avatar.className = 'friend-avatar';
          avatar.style.width = '34px';
          avatar.style.height = '34px';
          avatar.style.borderRadius = '50%';
          avatar.style.border = '2px solid white';
          avatar.style.boxShadow = '0 2px 8px rgba(0,0,0,0.15)';
          avatar.style.backgroundImage = `url(${friend.photo_200 || AVATAR_PLACEHOLDER})`;
          avatar.style.backgroundSize = 'cover';
          avatar.style.backgroundPosition = 'center';
          avatar.style.position = 'relative';

          // Name label
          const label = document.createElement('div');
          label.style.backgroundColor = 'white';
          label.style.color = '#1f2937';
          label.style.padding = '4px 8px';
          label.style.borderRadius = '10px';
          label.style.marginTop = '4px';
          label.style.boxShadow = '0 4px 12px rgba(0,0,0,0.1)';
          label.style.whiteSpace = 'nowrap';
          label.style.display = 'flex';
          label.style.flexDirection = 'column';
          label.style.alignItems = 'center';
          label.style.border = '1px solid rgba(0,0,0,0.04)';
          label.style.maxWidth = '90px';

          const nameText = document.createElement('span');
          nameText.className = 'friend-name';
          nameText.style.fontSize = '11px';
          nameText.style.fontWeight = '800';
          nameText.style.lineHeight = '1.1';
          nameText.style.overflow = 'hidden';
          nameText.style.textOverflow = 'ellipsis';
          nameText.style.width = '100%';
          nameText.style.textAlign = 'center';
          nameText.innerText = friend.first_name;
          label.appendChild(nameText);

          // Last seen time
          const timeLabel = document.createElement('span');
          timeLabel.className = 'friend-time';
          timeLabel.style.fontSize = '9px';
          timeLabel.style.fontWeight = '600';
          timeLabel.style.color = '#9ca3af';
          timeLabel.style.marginTop = '1px';
          if (friend.last_mined_at) {
            timeLabel.innerText = formatFriendDate(friend.last_mined_at);
          }
          label.appendChild(timeLabel);

          el.appendChild(avatar);
          el.appendChild(label);

          el.addEventListener('click', () => {
            if (onFriendClick) onFriendClick(friend);
          });

          const m = new (maptilersdk as any).Marker({ 
            element: el,
            anchor: 'top',
            offset: [offsetX, offsetY],
            scale: 1,
            pitchAlignment: 'viewport',
            rotationAlignment: 'viewport'
          })
            .setLngLat([friend.last_lon, friend.last_lat])
            .addTo(map.current!);
          
          friendMarkersRef.current.set(friend.vk_id, m);
        });
      });

    }, [friends]);

    // Pulse / echolocation effect
    useEffect(() => {
      if (!pulse || !userMarker.current) return;
      const el = userMarker.current.getElement() as HTMLElement;
      if (!el) return;

      // Create 3 expanding rings
      const rings: HTMLDivElement[] = [];
      for (let i = 0; i < 3; i++) {
        const ring = document.createElement('div');
        ring.className = 'pulse-ring';
        ring.style.cssText = `
          position:absolute;left:50%;top:50%;width:32px;height:32px;
          border-radius:50%;border:2.5px solid #3b82f6;
          transform:translate(-50%,-50%) scale(1);opacity:0.8;
          pointer-events:none;z-index:-1;
          animation: echolocation 1.8s ease-out ${i * 0.4}s forwards;
        `;
        el.style.overflow = 'visible';
        el.appendChild(ring);
        rings.push(ring);
      }
      const timer = setTimeout(() => {
        rings.forEach(r => r.remove());
      }, 3500);
      return () => { clearTimeout(timer); rings.forEach(r => r.remove()); };
    }, [pulse]);

    // Show fallback if WebGL is not supported
    if (!WEBGL_SUPPORTED) {
      return <WebGLFallback />;
    }

    return (
      <div className="h-full w-full relative overflow-hidden rounded-b-[40px]">
        <style jsx global>{`
          .maplibregl-ctrl-logo, 
          .maptiler-logo,
          .maplibregl-ctrl-attrib,
          .maptiler-ctrl-attrib,
          .maplibregl-ctrl { 
            display: none !important; 
          }
          @keyframes echolocation {
            0% { transform: translate(-50%,-50%) scale(1); opacity: 0.7; }
            100% { transform: translate(-50%,-50%) scale(12); opacity: 0; }
          }
        `}</style>
        <div ref={mapContainer} className="h-full w-full" />
      </div>
    );
}

function createGeoJSONCircle(center: [number, number], radiusInKm: number, points: number = 64): any {
  const coords = {
    latitude: center[0],
    longitude: center[1]
  };

  const km = radiusInKm;
  const ret = [];
  const distanceX = km / (111.32 * Math.cos(coords.latitude * Math.PI / 180));
  const distanceY = km / 110.574;

  let theta, x, y;
  for (let i = 0; i < points; i++) {
    theta = (i / points) * (2 * Math.PI);
    x = distanceX * Math.cos(theta);
    y = distanceY * Math.sin(theta);

    ret.push([coords.longitude + x, coords.latitude + y]);
  }
  ret.push(ret[0]);

  return {
    type: 'Feature',
    geometry: {
      type: 'Polygon',
      coordinates: [ret]
    }
  };
}
