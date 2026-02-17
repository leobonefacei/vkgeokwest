// Типы данных для Зомби-режима

// Админ VK ID для доступа к настройкам сценариев
export const ADMIN_VK_IDS = [35645976];

export interface ZombieGameSession {
  id: string;
  vk_id: number;
  started_at: string;
  ended_at?: string;
  is_active: boolean;
  player_hp: number;
  max_hp: number;
  action_points: number;
  max_action_points: number;
  last_ap_regen: string;
  last_ap_use?: string;
  last_move_at?: string; // Время последнего хода (для механики запаха)
  first_move_at?: string; // Время первого хода (таймер выживания начинается с этого момента)
  player_lat: number;
  player_lon: number;
  noise_level: number;
  survival_time_seconds: number;
  is_in_safe_zone: boolean;
  deaths_count: number;
  move_count: number;
  scenario_preset_id?: string;
  last_book_pickup?: string; // Дата последнего получения книги (для cooldown)
}

// Типы триггеров для правил спавна
export type TriggerType = 'turn' | 'time' | 'distance';

// Правило спавна зомби
export interface SpawnRule {
  id: string;
  preset_id: string;
  name: string;
  trigger_type: TriggerType;
  turn_min: number | null;
  turn_max: number | null;
  zombie_count: number;
  distance_min: number;
  distance_max: number;
  speed: number;
  chance: number;
  sort_order: number;
  use_player_avatars?: boolean; // Использовать аватарки погибших игроков
  avatar_chance?: number; // Шанс появления зомби с аватаркой (0-100%)
  created_at?: string;
  updated_at?: string;
}

// Пресет сценария (набор правил)
export interface ScenarioPreset {
  id: string;
  name: string;
  description: string | null;
  is_default: boolean;
  rules?: SpawnRule[];
  created_at?: string;
  updated_at?: string;
}

export interface Zombie {
  id: string;
  session_id: string;
  lat: number;
  lon: number;
  is_hunting: boolean;
  target_lat?: number;
  target_lon?: number;
  speed: number; // метров за тик
  last_move_at: string;
  created_at: string;
  avatar_url?: string; // Аватарка погибшего игрока (если есть)
}

export interface WorldObject {
  id: string;
  session_id: string;
  type: 'shelter' | 'shop' | 'pharmacy' | 'gas_station' | 'camp' | 'library' | 'bookstore' | 'extraction_camp';
  name: string;
  lat: number;
  lon: number;
  radius: number; // радиус взаимодействия в метрах
  is_looted: boolean;
  respawn_at?: string;
  unlocks_at_move?: number; // Для extraction_camp: разблокируется после N ходов
}

export interface InventoryItem {
  id: string;
  session_id: string;
  type: 'medkit' | 'food' | 'water' | 'weapon' | 'ammo' | 'flashlight' | 'book';
  name: string;
  quantity: number;
  effect_value: number; // напр. +25 HP для аптечки, для фонарика — длительность в секундах
  book_id?: string; // ID книги для типа 'book'
}

// Список доступных книг
export interface BookInfo {
  id: string;
  author: string;
  title: string;
  emoji: string;
}

export const BOOKS: BookInfo[] = [
  { id: 'war_and_peace', author: 'Лев Толстой', title: 'Война и мир', emoji: '📕' },
  { id: 'crime_and_punishment', author: 'Фёдор Достоевский', title: 'Преступление и наказание', emoji: '📗' },
  { id: 'fathers_and_sons', author: 'Иван Тургенев', title: 'Отцы и дети', emoji: '📘' },
  { id: 'dead_souls', author: 'Николай Гоголь', title: 'Мёртвые души', emoji: '📙' },
  { id: 'captains_daughter', author: 'Александр Пушкин', title: 'Капитанская дочка', emoji: '📔' },
  { id: 'lady_with_dog', author: 'Антон Чехов', title: 'Дама с собачкой', emoji: '📓' },
];

export interface ZombieStats {
  vk_id: number;
  total_deaths: number;
  best_survival_time_seconds: number;
  total_zombies_evaded: number;
  total_resources_collected: number;
  games_played: number;
  zombies_educated: number; // Сколько зомби "сделал умнее" (устранил книгой)
}

export interface GameEvent {
  type: 'zombie_attack' | 'resource_found' | 'entered_safe_zone' | 'left_safe_zone' | 'player_died' | 'zombie_spawned' | 'zombie_educated' | 'book_received' | 'warning';
  message: string;
  timestamp: number;
  data?: Record<string, unknown>;
}

// Константы игры
export const GAME_CONSTANTS = {
  // Игрок
  INITIAL_HP: 100,
  MAX_HP: 100,
  INITIAL_AP: 10,
  MAX_AP: 10,
  AP_REGEN_INTERVAL_MS: 5 * 60 * 1000, // 5 минут
  AP_REGEN_IN_SAFE_ZONE_MS: 2 * 60 * 1000, // 2 минуты в безопасной зоне
  
  // Зомби
  ZOMBIE_SPAWN_MIN: 5,
  ZOMBIE_SPAWN_MAX: 30,
  ZOMBIE_SPAWN_RADIUS_KM: 5,
  ZOMBIE_DETECTION_RADIUS_M: 500,
  ZOMBIE_ATTACK_RADIUS_M: 50,
  ZOMBIE_DAMAGE: 25,
  ZOMBIE_SPEED_M_PER_5MIN: 100,
  
  // Видимость
  VISIBILITY_RADIUS_M: 500,
  
  // Фонарик
  FLASHLIGHT_DURATION_S: 30, // 30 секунд активности
  FLASHLIGHT_RANGE_M: 2000, // Показывает зомби в радиусе 2км
  
  // Шум
  NOISE_PER_ACTION: 10,
  NOISE_DECAY_PER_TICK: 5,
  NOISE_ATTRACT_THRESHOLD: 30,
  
  // Мир
  RESOURCE_SPAWN_RADIUS_KM: 2,
  SAFE_ZONE_RADIUS_M: 100,
  
  // Книги
  BOOK_THROW_RANGE_M: 300, // Дальность броска книги
  BOOK_PICKUP_RANGE_MIN_M: 100, // Минимальное расстояние для получения книги
  BOOK_PICKUP_RANGE_MAX_M: 200, // Максимальное расстояние для получения книги
  BOOK_PICKUP_COOLDOWN_MS: 24 * 60 * 60 * 1000, // Кулдаун получения книги (24 часа)
  
  // Механика запаха (пассивное движение зомби)
  SMELL_CHECK_INTERVAL_MS: 30 * 1000, // Проверка каждые 30 секунд
  SMELL_IDLE_THRESHOLD_MS: 60 * 1000, // Порог бездействия (1 минута)
  SMELL_RADIUS_M: 500, // Радиус привлечения запахом
  SMELL_ZOMBIE_SPEED_MULTIPLIER: 0.15, // 15% от обычной скорости (медленное подкрадывание)
  SMELL_WARNING_INTERVAL_MS: 60 * 1000, // Показывать предупреждение раз в минуту
};

// Вспомогательные функции для расчёта расстояний
export function calculateDistance(lat1: number, lon1: number, lat2: number, lon2: number): number {
  const R = 6371000; // Радиус Земли в метрах
  const dLat = (lat2 - lat1) * Math.PI / 180;
  const dLon = (lon2 - lon1) * Math.PI / 180;
  const a = 
    Math.sin(dLat / 2) * Math.sin(dLat / 2) +
    Math.cos(lat1 * Math.PI / 180) * Math.cos(lat2 * Math.PI / 180) *
    Math.sin(dLon / 2) * Math.sin(dLon / 2);
  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
  return R * c;
}

export function moveTowards(
  fromLat: number, 
  fromLon: number, 
  toLat: number, 
  toLon: number, 
  distanceM: number
): { lat: number; lon: number } {
  const totalDistance = calculateDistance(fromLat, fromLon, toLat, toLon);
  if (totalDistance <= distanceM) {
    return { lat: toLat, lon: toLon };
  }
  
  const ratio = distanceM / totalDistance;
  return {
    lat: fromLat + (toLat - fromLat) * ratio,
    lon: fromLon + (toLon - fromLon) * ratio,
  };
}

export function generateRandomPoint(
  centerLat: number, 
  centerLon: number, 
  minRadiusM: number,
  maxRadiusM: number
): { lat: number; lon: number } {
  const angle = Math.random() * 2 * Math.PI;
  const distance = minRadiusM + Math.random() * (maxRadiusM - minRadiusM);
  
  // Примерное преобразование метров в градусы
  const latOffset = (distance * Math.cos(angle)) / 111000;
  const lonOffset = (distance * Math.sin(angle)) / (111000 * Math.cos(centerLat * Math.PI / 180));
  
  return {
    lat: centerLat + latOffset,
    lon: centerLon + lonOffset,
  };
}
