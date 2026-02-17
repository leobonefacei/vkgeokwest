// Сервис объектов мира (ресурсы, убежища)
import { supabase } from '../supabase-proxy';
import { 
  WorldObject, 
  GAME_CONSTANTS, 
  calculateDistance, 
  generateRandomPoint 
} from './types';

// Константы для Extraction Camp
const EXTRACTION_CAMP_DISTANCE_M = 10; // Расстояние от игрока при старте
const EXTRACTION_CAMP_UNLOCK_MOVES = 20; // Разблокируется после N ходов

// Шаблоны объектов мира
const WORLD_OBJECT_TEMPLATES = {
  extraction_camp: [
    { name: 'Точка эвакуации', radius: 15 },
  ],
  camp: [
    { name: 'Лагерь выживших', radius: GAME_CONSTANTS.SAFE_ZONE_RADIUS_M },
    { name: 'Убежище', radius: GAME_CONSTANTS.SAFE_ZONE_RADIUS_M },
    { name: 'Бункер', radius: GAME_CONSTANTS.SAFE_ZONE_RADIUS_M },
  ],
  shelter: [
    { name: 'Заброшенный дом', radius: 50 },
    { name: 'Подвал', radius: 30 },
    { name: 'Гараж', radius: 40 },
  ],
  shop: [
    { name: 'Продуктовый магазин', radius: 50 },
    { name: 'Супермаркет', radius: 80 },
    { name: 'Ларёк', radius: 20 },
  ],
  pharmacy: [
    { name: 'Аптека', radius: 40 },
    { name: 'Больница', radius: 100 },
    { name: 'Медпункт', radius: 30 },
  ],
  gas_station: [
    { name: 'Заправка', radius: 60 },
    { name: 'АЗС', radius: 50 },
  ],
  library: [
    { name: 'Библиотека', radius: 60 },
    { name: 'Читальный зал', radius: 40 },
  ],
  bookstore: [
    { name: 'Книжный магазин', radius: 50 },
    { name: 'Букинист', radius: 30 },
  ],
};

export const WorldService = {
  // Сгенерировать объекты мира вокруг точки
  async generateWorldObjects(
    sessionId: string,
    centerLat: number,
    centerLon: number
  ): Promise<WorldObject[]> {
    if (!supabase) return [];
    
    const objects: Partial<WorldObject>[] = [];
    
    // Создать Extraction Camp ровно в 10м от игрока (случайное направление)
    const extractionTemplate = WORLD_OBJECT_TEMPLATES.extraction_camp[0];
    const extractionPos = generateRandomPoint(centerLat, centerLon, EXTRACTION_CAMP_DISTANCE_M, EXTRACTION_CAMP_DISTANCE_M + 1);
    objects.push({
      session_id: sessionId,
      type: 'extraction_camp',
      name: extractionTemplate.name,
      lat: extractionPos.lat,
      lon: extractionPos.lon,
      radius: extractionTemplate.radius,
      is_looted: false,
      unlocks_at_move: EXTRACTION_CAMP_UNLOCK_MOVES,
    });
    
    // Создать 1 лагерь (безопасная зона) рядом с игроком
    const campTemplate = WORLD_OBJECT_TEMPLATES.camp[
      Math.floor(Math.random() * WORLD_OBJECT_TEMPLATES.camp.length)
    ];
    const campPos = generateRandomPoint(centerLat, centerLon, 100, 300);
    objects.push({
      session_id: sessionId,
      type: 'camp',
      name: campTemplate.name,
      lat: campPos.lat,
      lon: campPos.lon,
      radius: campTemplate.radius,
      is_looted: false,
    });
    
    // Создать 2-4 укрытия
    const shelterCount = 2 + Math.floor(Math.random() * 3);
    for (let i = 0; i < shelterCount; i++) {
      const template = WORLD_OBJECT_TEMPLATES.shelter[
        Math.floor(Math.random() * WORLD_OBJECT_TEMPLATES.shelter.length)
      ];
      const pos = generateRandomPoint(
        centerLat, centerLon, 
        200, GAME_CONSTANTS.RESOURCE_SPAWN_RADIUS_KM * 1000
      );
      objects.push({
        session_id: sessionId,
        type: 'shelter',
        name: template.name,
        lat: pos.lat,
        lon: pos.lon,
        radius: template.radius,
        is_looted: false,
      });
    }
    
    // Создать 2-3 магазина
    const shopCount = 2 + Math.floor(Math.random() * 2);
    for (let i = 0; i < shopCount; i++) {
      const template = WORLD_OBJECT_TEMPLATES.shop[
        Math.floor(Math.random() * WORLD_OBJECT_TEMPLATES.shop.length)
      ];
      const pos = generateRandomPoint(
        centerLat, centerLon, 
        300, GAME_CONSTANTS.RESOURCE_SPAWN_RADIUS_KM * 1000
      );
      objects.push({
        session_id: sessionId,
        type: 'shop',
        name: template.name,
        lat: pos.lat,
        lon: pos.lon,
        radius: template.radius,
        is_looted: false,
      });
    }
    
    // Создать 1-2 аптеки
    const pharmacyCount = 1 + Math.floor(Math.random() * 2);
    for (let i = 0; i < pharmacyCount; i++) {
      const template = WORLD_OBJECT_TEMPLATES.pharmacy[
        Math.floor(Math.random() * WORLD_OBJECT_TEMPLATES.pharmacy.length)
      ];
      const pos = generateRandomPoint(
        centerLat, centerLon, 
        400, GAME_CONSTANTS.RESOURCE_SPAWN_RADIUS_KM * 1000
      );
      objects.push({
        session_id: sessionId,
        type: 'pharmacy',
        name: template.name,
        lat: pos.lat,
        lon: pos.lon,
        radius: template.radius,
        is_looted: false,
      });
    }
    
    // Создать 1 заправку
    const gasTemplate = WORLD_OBJECT_TEMPLATES.gas_station[
      Math.floor(Math.random() * WORLD_OBJECT_TEMPLATES.gas_station.length)
    ];
    const gasPos = generateRandomPoint(
      centerLat, centerLon, 
      500, GAME_CONSTANTS.RESOURCE_SPAWN_RADIUS_KM * 1000
    );
    objects.push({
      session_id: sessionId,
      type: 'gas_station',
      name: gasTemplate.name,
      lat: gasPos.lat,
      lon: gasPos.lon,
      radius: gasTemplate.radius,
      is_looted: false,
    });
    
    // Создать 1-2 библиотеки
    const libraryCount = 1 + Math.floor(Math.random() * 2);
    for (let i = 0; i < libraryCount; i++) {
      const template = WORLD_OBJECT_TEMPLATES.library[
        Math.floor(Math.random() * WORLD_OBJECT_TEMPLATES.library.length)
      ];
      const pos = generateRandomPoint(
        centerLat, centerLon, 
        300, GAME_CONSTANTS.RESOURCE_SPAWN_RADIUS_KM * 1000
      );
      objects.push({
        session_id: sessionId,
        type: 'library',
        name: template.name,
        lat: pos.lat,
        lon: pos.lon,
        radius: template.radius,
        is_looted: false,
      });
    }
    
    // Создать 1 книжный магазин
    const bookstoreTemplate = WORLD_OBJECT_TEMPLATES.bookstore[
      Math.floor(Math.random() * WORLD_OBJECT_TEMPLATES.bookstore.length)
    ];
    const bookstorePos = generateRandomPoint(
      centerLat, centerLon, 
      400, GAME_CONSTANTS.RESOURCE_SPAWN_RADIUS_KM * 1000
    );
    objects.push({
      session_id: sessionId,
      type: 'bookstore',
      name: bookstoreTemplate.name,
      lat: bookstorePos.lat,
      lon: bookstorePos.lon,
      radius: bookstoreTemplate.radius,
      is_looted: false,
    });
    
    const { data, error } = await supabase
      .from('zombie_world_objects')
      .insert(objects)
      .select();
    
    if (error) {
      console.error('Error creating world objects:', error);
      return [];
    }
    
    return data || [];
  },
  
  // Получить все объекты сессии
  async getWorldObjects(sessionId: string): Promise<WorldObject[]> {
    if (!supabase) return [];
    
    const { data, error } = await supabase
      .from('zombie_world_objects')
      .select('*')
      .eq('session_id', sessionId);
    
    if (error) {
      console.error('Error fetching world objects:', error);
      return [];
    }
    
    return data || [];
  },
  
  // Получить видимые объекты
  async getVisibleObjects(
    sessionId: string,
    playerLat: number,
    playerLon: number
  ): Promise<WorldObject[]> {
    const objects = await this.getWorldObjects(sessionId);
    
    return objects.filter(obj => {
      const distance = calculateDistance(playerLat, playerLon, obj.lat, obj.lon);
      return distance <= GAME_CONSTANTS.VISIBILITY_RADIUS_M;
    });
  },
  
  // Проверить, находится ли игрок в безопасной зоне
  async isInSafeZone(
    sessionId: string,
    playerLat: number,
    playerLon: number,
    currentMoveCount: number = 0
  ): Promise<{ inSafe: boolean; zoneName?: string; isExtractionCamp?: boolean; isLocked?: boolean; unlocksIn?: number }> {
    const objects = await this.getWorldObjects(sessionId);
    
    for (const obj of objects) {
      // Extraction camp — особая логика
      if (obj.type === 'extraction_camp') {
        const distance = calculateDistance(playerLat, playerLon, obj.lat, obj.lon);
        if (distance <= obj.radius) {
          const unlockMove = obj.unlocks_at_move || EXTRACTION_CAMP_UNLOCK_MOVES;
          const isLocked = currentMoveCount < unlockMove;
          const unlocksIn = Math.max(0, unlockMove - currentMoveCount);
          
          if (!isLocked) {
            return { inSafe: true, zoneName: obj.name, isExtractionCamp: true, isLocked: false, unlocksIn: 0 };
          } else {
            // Игрок в зоне, но она заблокирована
            return { inSafe: false, zoneName: obj.name, isExtractionCamp: true, isLocked: true, unlocksIn };
          }
        }
      }
      
      // Обычный camp
      if (obj.type === 'camp') {
        const distance = calculateDistance(playerLat, playerLon, obj.lat, obj.lon);
        if (distance <= obj.radius) {
          return { inSafe: true, zoneName: obj.name, isExtractionCamp: false };
        }
      }
    }
    
    return { inSafe: false };
  },
  
  // Собрать ресурсы с объекта
  async lootObject(
    objectId: string
  ): Promise<{ success: boolean; loot?: { type: string; name: string; value: number } }> {
    if (!supabase) return { success: false };
    
    const { data: obj, error } = await supabase
      .from('zombie_world_objects')
      .select('*')
      .eq('id', objectId)
      .single();
    
    if (error || !obj || obj.is_looted) {
      return { success: false };
    }
    
    // Определить лут в зависимости от типа объекта
    let loot: { type: string; name: string; value: number } | undefined;
    
    switch (obj.type) {
      case 'shop':
        // Шанс найти фонарик в магазине
        if (Math.random() < 0.15) {
          loot = { type: 'flashlight', name: 'Фонарик', value: 30 };
        } else {
          loot = { type: 'food', name: 'Консервы', value: 10 };
        }
        break;
      case 'pharmacy':
        loot = { type: 'medkit', name: 'Аптечка', value: 25 };
        break;
      case 'gas_station':
        // Шанс найти фонарик на заправке
        if (Math.random() < 0.25) {
          loot = { type: 'flashlight', name: 'Фонарик', value: 30 };
        } else {
          loot = { type: 'food', name: 'Энергетик', value: 5 };
        }
        break;
      case 'shelter':
        const roll = Math.random();
        if (roll < 0.3) {
          loot = { type: 'medkit', name: 'Бинт', value: 10 };
        } else if (roll < 0.4) {
          loot = { type: 'flashlight', name: 'Фонарик', value: 30 };
        }
        break;
    }
    
    // Пометить как обысканный
    await supabase
      .from('zombie_world_objects')
      .update({ 
        is_looted: true,
        respawn_at: new Date(Date.now() + 30 * 60 * 1000).toISOString() // респаун через 30 мин
      })
      .eq('id', objectId);
    
    return { success: true, loot };
  },
  
  // Найти объекты рядом с игроком
  async getNearbyObjects(
    sessionId: string,
    playerLat: number,
    playerLon: number,
    maxDistance: number = 100
  ): Promise<WorldObject[]> {
    const objects = await this.getWorldObjects(sessionId);
    
    return objects.filter(obj => {
      const distance = calculateDistance(playerLat, playerLon, obj.lat, obj.lon);
      return distance <= maxDistance + obj.radius;
    });
  },
  
  // Удалить все объекты сессии
  async clearWorldObjects(sessionId: string): Promise<void> {
    if (!supabase) return;
    
    await supabase
      .from('zombie_world_objects')
      .delete()
      .eq('session_id', sessionId);
  },
};
