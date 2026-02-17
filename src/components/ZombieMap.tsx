'use client';

import { useEffect, useRef, useCallback } from 'react';
import * as maptilersdk from '@maptiler/sdk';
import '@maptiler/sdk/dist/maptiler-sdk.css';
import { Zombie, WorldObject, GAME_CONSTANTS } from '@/lib/zombie/types';

interface ZombieMapProps {
  playerPos: [number, number];
  zombies: Zombie[];
  worldObjects: WorldObject[];
  visibilityRadius?: number;
  isInSafeZone?: boolean;
  playerAvatar?: string;
  onZombieClick?: (zombie: Zombie) => void;
  onObjectClick?: (obj: WorldObject) => void;
  extractionUnlocksIn?: number; // Сколько ходов до разблокировки extraction camp
}

/** Synchronous WebGL check — runs once at module level */
function checkWebGL2Support(): boolean {
  if (typeof document === 'undefined') return true;
  try {
    const canvas = document.createElement('canvas');
    const gl = canvas.getContext('webgl2') || canvas.getContext('webgl') || canvas.getContext('experimental-webgl');
    return !!gl;
  } catch {
    return false;
  }
}

const WEBGL_SUPPORTED = typeof window !== 'undefined' ? checkWebGL2Support() : true;

export default function ZombieMap({
  playerPos,
  zombies,
  worldObjects,
  visibilityRadius = GAME_CONSTANTS.VISIBILITY_RADIUS_M,
  isInSafeZone = false,
  playerAvatar,
  onZombieClick,
  onObjectClick,
  extractionUnlocksIn,
}: ZombieMapProps) {
  const mapContainer = useRef<HTMLDivElement>(null);
  const map = useRef<maptilersdk.Map | null>(null);
  const playerMarker = useRef<maptilersdk.Marker | null>(null);
  const zombieMarkers = useRef<Map<string, maptilersdk.Marker>>(new Map());
  const objectMarkers = useRef<Map<string, maptilersdk.Marker>>(new Map());
  const fogLayerId = 'fog-of-war';
  const visibilityCircleId = 'visibility-circle';
  const visibilityBorderId = 'visibility-border';

  // Создать GeoJSON для тумана войны с дыркой (видимая область)
  function createFogWithHole(lat: number, lon: number, radiusM: number) {
    const points = 64;
    const innerCoords: [number, number][] = [];
    
    // Создаём внутренний круг (дырку)
    for (let i = 0; i <= points; i++) {
      const angle = (i / points) * 2 * Math.PI;
      const dx = radiusM * Math.cos(angle);
      const dy = radiusM * Math.sin(angle);
      
      const newLat = lat + (dy / 111000);
      const newLon = lon + (dx / (111000 * Math.cos(lat * Math.PI / 180)));
      
      innerCoords.push([newLon, newLat]);
    }
    
    // Внешний полигон покрывает весь мир, внутренний вырезает дырку
    return {
      type: 'Feature' as const,
      properties: {},
      geometry: {
        type: 'Polygon' as const,
        coordinates: [
          // Внешний контур (весь мир)
          [[-180, -85], [-180, 85], [180, 85], [180, -85], [-180, -85]],
          // Внутренний контур (дырка) — порядок точек обратный
          innerCoords.reverse()
        ]
      }
    };
  }

  // Создать круг видимости для визуальной границы
  function createVisibilityCircle(lat: number, lon: number, radiusM: number) {
    const points = 64;
    const coords: [number, number][] = [];
    
    for (let i = 0; i <= points; i++) {
      const angle = (i / points) * 2 * Math.PI;
      const dx = radiusM * Math.cos(angle);
      const dy = radiusM * Math.sin(angle);
      
      const newLat = lat + (dy / 111000);
      const newLon = lon + (dx / (111000 * Math.cos(lat * Math.PI / 180)));
      
      coords.push([newLon, newLat]);
    }
    
    return {
      type: 'Feature' as const,
      properties: {},
      geometry: {
        type: 'Polygon' as const,
        coordinates: [coords]
      }
    };
  }

  // Создать маркер игрока
  const createPlayerMarker = useCallback(() => {
    const el = document.createElement('div');
    el.className = 'zombie-player-marker';
    
    const avatarContent = playerAvatar 
      ? `<img src="${playerAvatar}" class="w-full h-full object-cover rounded-full" alt="player" />`
      : `<span class="text-xl">🧑</span>`;
    
    el.innerHTML = `
      <div class="relative">
        <div class="w-14 h-14 rounded-full bg-gradient-to-br from-blue-500 to-cyan-400 flex items-center justify-center shadow-lg shadow-blue-500/50 border-3 border-white overflow-hidden">
          ${avatarContent}
        </div>
        <div class="absolute -bottom-1 left-1/2 -translate-x-1/2 w-0 h-0 border-l-[6px] border-r-[6px] border-t-[8px] border-transparent border-t-white"></div>
        ${isInSafeZone ? `
          <div class="absolute -top-1 -right-1 w-6 h-6 bg-green-500 rounded-full flex items-center justify-center border-2 border-white shadow-md">
            <span class="text-xs">🛡️</span>
          </div>
        ` : ''}
      </div>
    `;
    return el;
  }, [isInSafeZone, playerAvatar]);

  // Создать маркер зомби
  const createZombieMarker = useCallback((zombie: Zombie) => {
    const el = document.createElement('div');
    el.className = 'zombie-marker cursor-pointer';
    
    // Если у зомби есть аватарка погибшего игрока
    if (zombie.avatar_url) {
      el.innerHTML = `
        <div class="relative">
          <div class="w-10 h-10 rounded-full bg-gradient-to-br from-green-700 to-lime-600 flex items-center justify-center shadow-lg shadow-green-500/50 border-2 border-green-900 ${zombie.is_hunting ? 'animate-bounce' : ''} hover:scale-110 transition-transform overflow-hidden">
            <img src="${zombie.avatar_url}" class="w-full h-full object-cover opacity-80" style="filter: hue-rotate(80deg) saturate(1.5);" alt="zombie" />
          </div>
          <div class="absolute -bottom-0.5 -right-0.5 text-sm">🧟</div>
          ${zombie.is_hunting ? `
            <div class="absolute -top-1 -right-1 w-4 h-4 bg-red-500 rounded-full animate-ping"></div>
          ` : ''}
        </div>
      `;
    } else {
      el.innerHTML = `
        <div class="w-10 h-10 rounded-full bg-gradient-to-br from-green-700 to-lime-600 flex items-center justify-center shadow-lg shadow-green-500/50 border-2 border-green-900 ${zombie.is_hunting ? 'animate-bounce' : ''} hover:scale-110 transition-transform">
          <span class="text-lg">🧟</span>
        </div>
        ${zombie.is_hunting ? `
          <div class="absolute -top-1 -right-1 w-4 h-4 bg-red-500 rounded-full animate-ping"></div>
        ` : ''}
      `;
    }
    
    if (onZombieClick) {
      el.addEventListener('click', (e) => {
        e.stopPropagation();
        onZombieClick(zombie);
      });
    }
    
    return el;
  }, [onZombieClick]);

  // Создать маркер объекта мира
  const createObjectMarker = useCallback((obj: WorldObject) => {
    const el = document.createElement('div');
    el.className = 'world-object-marker cursor-pointer';
    
    let icon = '🏠';
    let bgColor = 'from-zinc-600 to-zinc-500';
    let isLocked = false;
    
    switch (obj.type) {
      case 'extraction_camp':
        icon = '🚁';
        // Проверяем заблокирован ли extraction camp
        isLocked = extractionUnlocksIn !== undefined && extractionUnlocksIn > 0;
        bgColor = isLocked ? 'from-zinc-600 to-zinc-500' : 'from-cyan-500 to-teal-400';
        break;
      case 'camp':
        icon = '⛺';
        bgColor = 'from-green-500 to-emerald-400';
        break;
      case 'shelter':
        icon = '🏚️';
        bgColor = 'from-amber-600 to-yellow-500';
        break;
      case 'shop':
        icon = '🏪';
        bgColor = 'from-blue-500 to-indigo-400';
        break;
      case 'pharmacy':
        icon = '💊';
        bgColor = 'from-red-500 to-pink-400';
        break;
      case 'gas_station':
        icon = '⛽';
        bgColor = 'from-orange-500 to-amber-400';
        break;
      case 'library':
        icon = '📚';
        bgColor = 'from-purple-500 to-violet-400';
        break;
      case 'bookstore':
        icon = '📖';
        bgColor = 'from-indigo-500 to-blue-400';
        break;
    }
    
    // Extraction camp — особое отображение
    if (obj.type === 'extraction_camp') {
      el.innerHTML = `
        <div class="relative">
          <div class="w-11 h-11 rounded-xl bg-gradient-to-br ${bgColor} flex items-center justify-center shadow-lg border-2 ${isLocked ? 'border-zinc-500 opacity-60' : 'border-cyan-300 animate-pulse'} hover:scale-110 transition-transform">
            <span class="text-lg">${icon}</span>
          </div>
          ${isLocked ? `
            <div class="absolute -top-2 -right-2 w-6 h-6 bg-red-600 rounded-full flex items-center justify-center border border-white shadow-md">
              <span class="text-white text-[10px] font-black">${extractionUnlocksIn}</span>
            </div>
            <div class="absolute -bottom-5 left-1/2 -translate-x-1/2 bg-zinc-700 text-zinc-300 text-[7px] font-bold px-1.5 py-0.5 rounded whitespace-nowrap">
              ЗАБЛОК.
            </div>
          ` : `
            <div class="absolute -bottom-5 left-1/2 -translate-x-1/2 bg-cyan-500 text-white text-[7px] font-black px-1.5 py-0.5 rounded whitespace-nowrap shadow-lg shadow-cyan-500/50">
              ЭВАКУАЦИЯ
            </div>
          `}
        </div>
      `;
    } else {
      el.innerHTML = `
        <div class="relative">
          <div class="w-9 h-9 rounded-xl bg-gradient-to-br ${bgColor} flex items-center justify-center shadow-md border border-white/50 ${obj.is_looted ? 'opacity-50 grayscale' : ''} hover:scale-110 transition-transform">
            <span class="text-sm">${icon}</span>
          </div>
          ${obj.type === 'camp' ? `
            <div class="absolute -bottom-4 left-1/2 -translate-x-1/2 bg-green-500 text-white text-[8px] font-black px-1.5 py-0.5 rounded whitespace-nowrap">
              SAFE
            </div>
          ` : ''}
          ${(obj.type === 'library' || obj.type === 'bookstore') ? `
            <div class="absolute -bottom-4 left-1/2 -translate-x-1/2 bg-purple-500 text-white text-[8px] font-black px-1.5 py-0.5 rounded whitespace-nowrap">
              📕
            </div>
          ` : ''}
        </div>
      `;
    }
    
    if (onObjectClick) {
      el.addEventListener('click', (e) => {
        e.stopPropagation();
        onObjectClick(obj);
      });
    }
    
    return el;
  }, [onObjectClick, extractionUnlocksIn]);

  // Инициализация карты
  useEffect(() => {
    if (map.current || !mapContainer.current || !WEBGL_SUPPORTED) return;

    (maptilersdk as any).config.apiKey = 'wIfs08UziK6xJeBmZMgv';

    map.current = new maptilersdk.Map({
      container: mapContainer.current,
      style: maptilersdk.MapStyle.DARK,
      center: [playerPos[1], playerPos[0]],
      zoom: 16,
      attributionControl: false,
      navigationControl: false,
      geolocateControl: false,
      logoControl: false,
      // Заблокировать взаимодействие с картой
      interactive: false,
      dragPan: false,
      scrollZoom: false,
      doubleClickZoom: false,
      touchZoomRotate: false,
      keyboard: false,
    });

    map.current.on('load', () => {
        if (!map.current) return;

        // Добавить слой тумана войны с дыркой для видимости
        map.current.addSource('fog-source', {
          type: 'geojson',
          data: createFogWithHole(playerPos[0], playerPos[1], visibilityRadius) as any
        });

        map.current.addLayer({
          id: fogLayerId,
          type: 'fill',
          source: 'fog-source',
          paint: {
            'fill-color': '#0a0a0a',
            'fill-opacity': 0.9,
          }
        });

        // Добавить визуальную границу круга видимости
        map.current.addSource('visibility-border-source', {
          type: 'geojson',
          data: createVisibilityCircle(playerPos[0], playerPos[1], visibilityRadius) as any
        });

        map.current.addLayer({
          id: visibilityBorderId,
          type: 'line',
          source: 'visibility-border-source',
          paint: {
            'line-color': isInSafeZone ? '#22c55e' : '#3b82f6',
            'line-width': 3,
            'line-opacity': 0.8,
            'line-dasharray': [2, 2],
          }
        });

        // Добавить заливку круга видимости с легким свечением
        map.current.addLayer({
          id: visibilityCircleId,
          type: 'fill',
          source: 'visibility-border-source',
          paint: {
            'fill-color': isInSafeZone ? '#22c55e' : '#3b82f6',
            'fill-opacity': 0.05,
          }
        }, fogLayerId); // Вставить под слой тумана
      });

    return () => {
      map.current?.remove();
      map.current = null;
    };
  }, []);

  // Обновить позицию игрока
  useEffect(() => {
    if (!map.current) return;

    // Центрировать карту на игроке
    map.current.setCenter([playerPos[1], playerPos[0]]);

    // Обновить или создать маркер игрока
    if (playerMarker.current) {
      playerMarker.current.setLngLat([playerPos[1], playerPos[0]]);
      // Обновить элемент маркера для отображения статуса безопасной зоны
      const el = createPlayerMarker();
      playerMarker.current.getElement().replaceWith(el);
    } else {
      playerMarker.current = new maptilersdk.Marker({ element: createPlayerMarker() })
        .setLngLat([playerPos[1], playerPos[0]])
        .addTo(map.current);
    }

    // Обновить туман войны (с дыркой в новой позиции)
    const fogSource = map.current.getSource('fog-source') as maptilersdk.GeoJSONSource;
    if (fogSource) {
      fogSource.setData(createFogWithHole(playerPos[0], playerPos[1], visibilityRadius) as any);
    }

    // Обновить границу круга видимости
    const borderSource = map.current.getSource('visibility-border-source') as maptilersdk.GeoJSONSource;
    if (borderSource) {
      borderSource.setData(createVisibilityCircle(playerPos[0], playerPos[1], visibilityRadius) as any);
    }

    // Обновить цвет границы в зависимости от безопасной зоны
    if (map.current.getLayer(visibilityBorderId)) {
      map.current.setPaintProperty(visibilityBorderId, 'line-color', isInSafeZone ? '#22c55e' : '#3b82f6');
    }
    if (map.current.getLayer(visibilityCircleId)) {
      map.current.setPaintProperty(visibilityCircleId, 'fill-color', isInSafeZone ? '#22c55e' : '#3b82f6');
    }
  }, [playerPos, isInSafeZone, visibilityRadius, createPlayerMarker]);

  // Обновить маркеры зомби
  useEffect(() => {
    if (!map.current) return;

    // Удалить старые маркеры
    const currentIds = new Set(zombies.map(z => z.id));
    zombieMarkers.current.forEach((marker, id) => {
      if (!currentIds.has(id)) {
        marker.remove();
        zombieMarkers.current.delete(id);
      }
    });

    // Обновить или добавить маркеры
    zombies.forEach(zombie => {
      const existingMarker = zombieMarkers.current.get(zombie.id);
      
      if (existingMarker) {
        existingMarker.setLngLat([zombie.lon, zombie.lat]);
      } else {
        const marker = new maptilersdk.Marker({ element: createZombieMarker(zombie) })
          .setLngLat([zombie.lon, zombie.lat])
          .addTo(map.current!);
        zombieMarkers.current.set(zombie.id, marker);
      }
    });
  }, [zombies]);

  // Обновить маркеры объектов
  useEffect(() => {
    if (!map.current) return;

    // Удалить все маркеры и создать заново при изменении extractionUnlocksIn
    objectMarkers.current.forEach((marker) => {
      marker.remove();
    });
    objectMarkers.current.clear();

    // Добавить маркеры
    worldObjects.forEach(obj => {
      const marker = new maptilersdk.Marker({ element: createObjectMarker(obj) })
        .setLngLat([obj.lon, obj.lat])
        .addTo(map.current!);
      objectMarkers.current.set(obj.id, marker);
    });
  }, [worldObjects, extractionUnlocksIn, createObjectMarker]);

  if (!WEBGL_SUPPORTED) {
    return (
      <div className="relative w-full h-full flex items-center justify-center bg-zinc-900 p-6">
        <div className="max-w-xs text-center space-y-4">
          <div className="w-16 h-16 mx-auto rounded-full bg-zinc-800 flex items-center justify-center text-3xl">
            🗺️
          </div>
          <h3 className="text-lg font-bold text-zinc-200">
            Карта недоступна
          </h3>
          <p className="text-sm text-zinc-400 leading-relaxed">
            Ваш браузер или устройство не поддерживает технологию <strong className="text-zinc-300">WebGL</strong>, необходимую для зомби-режима.
          </p>
          <p className="text-xs text-zinc-500 leading-relaxed">
            Попробуйте открыть приложение в другом браузере (Google Chrome, Safari) или на другом устройстве.
          </p>
        </div>
      </div>
    );
  }

  return (
    <div className="relative w-full h-full">
      <style jsx global>{`
        .maplibregl-ctrl-logo, 
        .maptiler-logo,
        .maplibregl-ctrl-attrib,
        .maptiler-ctrl-attrib,
        .maplibregl-ctrl { 
          display: none !important; 
        }
        
        /* Плавное движение маркеров зомби */
        .zombie-marker {
          transition: transform 2s ease-out !important;
        }
        
        /* Родительский контейнер маркера тоже плавно двигается */
        .maplibregl-marker:has(.zombie-marker) {
          transition: transform 2s ease-out !important;
        }
      `}</style>
      <div ref={mapContainer} className="w-full h-full" />
      
      {/* Виньетка по краям для эффекта тумана */}
      <div className="absolute inset-0 pointer-events-none">
        <div className="absolute inset-0 bg-gradient-to-t from-zinc-900/80 via-transparent to-zinc-900/60" />
        <div className="absolute inset-0 bg-gradient-to-l from-zinc-900/50 via-transparent to-zinc-900/50" />
      </div>
      
      {/* Рамка экрана */}
      <div className="absolute inset-0 border-4 border-zinc-800/50 rounded-3xl pointer-events-none" />
    </div>
  );
}
