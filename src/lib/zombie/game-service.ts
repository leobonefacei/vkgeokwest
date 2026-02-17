// Главный игровой сервис зомби-режима
import { supabase } from '../supabase-proxy';
import { 
  ZombieGameSession, 
  GameEvent, 
  GAME_CONSTANTS,
  Zombie,
  WorldObject,
  SpawnRule,
  generateRandomPoint,
  calculateDistance,
} from './types';
import { ZombieService } from './zombie-service';
import { WorldService } from './world-service';
import { InventoryService } from './inventory-service';
import { StatsService } from './stats-service';
import { ScenarioService } from './scenario-service';

export interface GameState {
  session: ZombieGameSession | null;
  zombies: Zombie[];
  worldObjects: WorldObject[];
  events: GameEvent[];
  isInSafeZone: boolean;
  safeZoneName?: string;
  isExtractionCamp?: boolean;
  extractionLocked?: boolean;
  extractionUnlocksIn?: number;
}

export const GameService = {
// Начать новую игру
    async startGame(vkId: number, lat: number, lon: number): Promise<GameState> {
      if (!supabase) {
        return { session: null, zombies: [], worldObjects: [], events: [], isInSafeZone: false };
      }
      
      // Завершить ВСЕ предыдущие активные сессии напрямую (избегаем проблемы с дубликатами)
      await supabase
        .from('zombie_game_sessions')
        .update({ is_active: false, ended_at: new Date().toISOString() })
        .eq('vk_id', vkId)
        .eq('is_active', true);
      
      // Получить пресет сценария по умолчанию
      const defaultPreset = await ScenarioService.getDefaultPreset();
      
      // Создать новую сессию
      const now = new Date().toISOString();
      const { data: session, error } = await supabase
        .from('zombie_game_sessions')
        .insert({
          vk_id: vkId,
          started_at: now,
          is_active: true,
          player_hp: GAME_CONSTANTS.INITIAL_HP,
          max_hp: GAME_CONSTANTS.MAX_HP,
          action_points: GAME_CONSTANTS.INITIAL_AP,
          max_action_points: GAME_CONSTANTS.MAX_AP,
          last_ap_regen: now,
          last_ap_use: now,
          player_lat: lat,
          player_lon: lon,
          noise_level: 0,
          survival_time_seconds: 0,
          is_in_safe_zone: false,
          deaths_count: 0,
          move_count: 0,
          scenario_preset_id: defaultPreset?.id || null,
        })
        .select()
        .single();
      
      if (error || !session) {
        console.error('Error creating game session:', error);
        return { session: null, zombies: [], worldObjects: [], events: [], isInSafeZone: false };
      }
      
      // Сгенерировать мир
      const worldObjects = await WorldService.generateWorldObjects(session.id, lat, lon);
      
      // Сгенерировать начальных зомби по правилам сценария (ход 0 - старт игры)
      let zombies: Zombie[] = [];
      if (defaultPreset?.rules) {
        const startRules = ScenarioService.evaluateRulesForTurn(defaultPreset.rules, 0);
        for (const rule of startRules) {
          const ruleZombies = await this.spawnZombiesByRule(session.id, lat, lon, rule);
          zombies = [...zombies, ...ruleZombies];
        }
      }
      
      // Если правила не сработали, спавним базовых зомби
      if (zombies.length === 0) {
        zombies = await ZombieService.spawnZombies(session.id, lat, lon, 10);
      }
      
    // Проверить безопасную зону (move_count = 0 при старте)
    const safeCheck = await WorldService.isInSafeZone(session.id, lat, lon, 0);
    
    // Добавить стартовый набор: аптечка, фонарик, книга "Война и мир"
    const starterKit = await InventoryService.addStarterKit(session.id);
    
    const events: GameEvent[] = [{
      type: 'zombie_spawned',
      message: `Игра началась! Вокруг вас ${zombies.length} зомби. Найдите убежище!`,
      timestamp: Date.now(),
    }];
    
    // Добавить событие о стартовом наборе
    if (starterKit.success && starterKit.items.length > 0) {
      events.push({
        type: 'resource_found',
        message: `Стартовый набор: ${starterKit.items.join(', ')}`,
        timestamp: Date.now() + 1,
      });
    }
      
      return {
        session,
        zombies,
        worldObjects,
        events,
        isInSafeZone: safeCheck.inSafe,
        safeZoneName: safeCheck.zoneName,
        isExtractionCamp: safeCheck.isExtractionCamp,
        extractionLocked: safeCheck.isLocked,
        extractionUnlocksIn: safeCheck.unlocksIn,
      };
    },
  
  // Получить активную сессию
  async getActiveSession(vkId: number): Promise<ZombieGameSession | null> {
    if (!supabase) return null;
    
    // Используем limit(1) вместо single() чтобы избежать ошибки при множественных активных сессиях
    const { data, error } = await supabase
      .from('zombie_game_sessions')
      .select('*')
      .eq('vk_id', vkId)
      .eq('is_active', true)
      .order('started_at', { ascending: false })
      .limit(1);
    
    if (error || !data || data.length === 0) return null;
    
    return data[0];
  },
  
  // Загрузить состояние игры
  async loadGameState(vkId: number): Promise<GameState> {
    const session = await this.getActiveSession(vkId);
    
    if (!session) {
      return { session: null, zombies: [], worldObjects: [], events: [], isInSafeZone: false };
    }
    
    const zombies = await ZombieService.getVisibleZombies(
      session.id, session.player_lat, session.player_lon
    );
    const worldObjects = await WorldService.getVisibleObjects(
      session.id, session.player_lat, session.player_lon
    );
    const safeCheck = await WorldService.isInSafeZone(
      session.id, session.player_lat, session.player_lon, session.move_count || 0
    );
    
    return {
      session,
      zombies,
      worldObjects,
      events: [],
      isInSafeZone: safeCheck.inSafe,
      safeZoneName: safeCheck.zoneName,
      isExtractionCamp: safeCheck.isExtractionCamp,
      extractionLocked: safeCheck.isLocked,
      extractionUnlocksIn: safeCheck.unlocksIn,
    };
  },
  
// Сделать ход (главная игровая механика)
    async makeMove(vkId: number, newLat: number, newLon: number): Promise<GameState & { success: boolean; message?: string }> {
      const session = await this.getActiveSession(vkId);
      
      if (!session) {
        return { 
          success: false, 
          message: 'Нет активной игры',
          session: null, 
          zombies: [], 
          worldObjects: [], 
          events: [],
          isInSafeZone: false,
        };
      }
      
      // Проверить очки действий
      const currentAP = await this.calculateCurrentAP(session);
      
      if (currentAP < 1) {
        return { 
          success: false, 
          message: 'Недостаточно очков действий. Подождите восстановления.',
          session,
          zombies: await ZombieService.getVisibleZombies(session.id, session.player_lat, session.player_lon),
          worldObjects: await WorldService.getVisibleObjects(session.id, session.player_lat, session.player_lon),
          events: [],
          isInSafeZone: session.is_in_safe_zone,
        };
      }
      
      const events: GameEvent[] = [];
      
// Увеличить счётчик ходов
        const newMoveCount = (session.move_count || 0) + 1;
        
        // Обновить позицию игрока
        const now = new Date();
        
        // Определить first_move_at: если это первый ход, записываем текущее время
        const isFirstMove = !session.first_move_at;
        const firstMoveAt = isFirstMove ? now.toISOString() : session.first_move_at;
        
        // Таймер выживания начинается с первого хода, а не с создания сессии
        const survivalTime = firstMoveAt 
          ? Math.floor((now.getTime() - new Date(firstMoveAt).getTime()) / 1000)
          : 0;
      
      // Увеличить шум
      const newNoiseLevel = Math.min(100, session.noise_level + GAME_CONSTANTS.NOISE_PER_ACTION);
      
      // Двинуть зомби и проверить атаки
      const zombieResult = await ZombieService.moveZombies(
        session.id, newLat, newLon, newNoiseLevel
      );
      
      // Заспавнить зомби по правилам сценария
      let newZombies: Zombie[] = [];
      if (session.scenario_preset_id) {
        const preset = await ScenarioService.getPreset(session.scenario_preset_id);
        if (preset?.rules) {
          const triggeredRules = ScenarioService.evaluateRulesForTurn(preset.rules, newMoveCount);
          for (const rule of triggeredRules) {
            const ruleZombies = await this.spawnZombiesByRule(session.id, newLat, newLon, rule);
            newZombies = [...newZombies, ...ruleZombies];
            
            // Добавить событие о срабатывании правила
            if (ruleZombies.length > 0) {
              events.push({
                type: 'zombie_spawned',
                message: `${rule.name}: появилось ${ruleZombies.length} зомби!`,
                timestamp: Date.now(),
                data: { ruleName: rule.name, count: ruleZombies.length },
              });
            }
          }
        }
      }
      
      // Если правила не спавнили зомби, используем базовую механику
      if (newZombies.length === 0) {
        newZombies = await ZombieService.spawnZombies(
          session.id, newLat, newLon, 
          Math.floor(Math.random() * 5) + 3 // 3-7 новых зомби
        );
        
        if (newZombies.length > 0) {
          events.push({
            type: 'zombie_spawned',
            message: `Ваш шум привлёк ${newZombies.length} зомби!`,
            timestamp: Date.now(),
          });
        }
      }
      
      // Рассчитать урон
      let newHP = session.player_hp;
      if (zombieResult.attacks > 0) {
        const damage = zombieResult.attacks * GAME_CONSTANTS.ZOMBIE_DAMAGE;
        newHP = Math.max(0, session.player_hp - damage);
        
        events.push({
          type: 'zombie_attack',
          message: `${zombieResult.attacks} зомби атаковали вас! -${damage} HP`,
          timestamp: Date.now(),
          data: { damage, attackers: zombieResult.attacks },
        });
      }
      
      // Проверить безопасную зону (с учётом move_count для extraction camp)
      const safeCheck = await WorldService.isInSafeZone(session.id, newLat, newLon, newMoveCount);
      
      // Событие для extraction camp (заблокированного)
      if (safeCheck.isExtractionCamp && safeCheck.isLocked) {
        events.push({
          type: 'warning',
          message: `${safeCheck.zoneName} заблокирована. Осталось ходов: ${safeCheck.unlocksIn}`,
          timestamp: Date.now(),
        });
      }
      
      if (safeCheck.inSafe && !session.is_in_safe_zone) {
        events.push({
          type: 'entered_safe_zone',
          message: safeCheck.isExtractionCamp 
            ? `Вы вошли в ${safeCheck.zoneName}! Можете эвакуироваться.`
            : `Вы вошли в безопасную зону: ${safeCheck.zoneName}`,
          timestamp: Date.now(),
        });
      } else if (!safeCheck.inSafe && session.is_in_safe_zone) {
        events.push({
          type: 'left_safe_zone',
          message: 'Вы покинули безопасную зону. Будьте осторожны!',
          timestamp: Date.now(),
        });
      }
      
      // Проверить смерть
      if (newHP <= 0) {
        await this.handleDeath(session, survivalTime, vkId);
        
        events.push({
          type: 'player_died',
          message: 'Вы погибли! Зомби вас настигли...',
          timestamp: Date.now(),
        });
        
        return {
          success: true,
          session: { ...session, player_hp: 0, is_active: false, move_count: newMoveCount },
          zombies: [],
          worldObjects: [],
          events,
          isInSafeZone: false,
        };
      }
      
      // Проверить ресурсы рядом
      const nearbyObjects = await WorldService.getNearbyObjects(session.id, newLat, newLon);
      for (const obj of nearbyObjects) {
        if (!obj.is_looted && obj.type !== 'camp') {
          const lootResult = await WorldService.lootObject(obj.id);
          if (lootResult.success && lootResult.loot) {
            await InventoryService.addItem(session.id, lootResult.loot);
            await StatsService.incrementResourcesCollected(vkId);
            
            events.push({
              type: 'resource_found',
              message: `Найдено: ${lootResult.loot.name}`,
              timestamp: Date.now(),
              data: lootResult.loot,
            });
          }
        }
      }
      
// Обновить сессию в базе
        if (supabase) {
          const updateData: Record<string, unknown> = {
            player_lat: newLat,
            player_lon: newLon,
            player_hp: newHP,
            action_points: currentAP - 1,
            last_ap_regen: now.toISOString(),
            last_ap_use: now.toISOString(),
            last_move_at: now.toISOString(), // Для механики запаха
            noise_level: newNoiseLevel,
            survival_time_seconds: survivalTime,
            is_in_safe_zone: safeCheck.inSafe,
            move_count: newMoveCount,
          };
          
          // Записать first_move_at только при первом ходе
          if (isFirstMove) {
            updateData.first_move_at = firstMoveAt;
          }
          
          await supabase
            .from('zombie_game_sessions')
            .update(updateData)
            .eq('id', session.id);
        }
      
      // Обновить статистику выживания
      await StatsService.updateSurvivalTime(vkId, survivalTime);
      
      // Получить видимые объекты
      const visibleZombies = await ZombieService.getVisibleZombies(session.id, newLat, newLon);
      const visibleObjects = await WorldService.getVisibleObjects(session.id, newLat, newLon);
      
return {
          success: true,
          session: {
            ...session,
            player_lat: newLat,
            player_lon: newLon,
            player_hp: newHP,
            action_points: currentAP - 1,
            noise_level: newNoiseLevel,
            survival_time_seconds: survivalTime,
            is_in_safe_zone: safeCheck.inSafe,
            move_count: newMoveCount,
            first_move_at: firstMoveAt,
          },
          zombies: visibleZombies,
          worldObjects: visibleObjects,
          events,
          isInSafeZone: safeCheck.inSafe,
          safeZoneName: safeCheck.zoneName,
          isExtractionCamp: safeCheck.isExtractionCamp,
          extractionLocked: safeCheck.isLocked,
          extractionUnlocksIn: safeCheck.unlocksIn,
        };
    },
  
  // Рассчитать текущие очки действий с учётом регенерации
  async calculateCurrentAP(session: ZombieGameSession): Promise<number> {
    const now = Date.now();
    const lastRegen = new Date(session.last_ap_regen).getTime();
    const elapsed = now - lastRegen;
    
    const regenInterval = session.is_in_safe_zone 
      ? GAME_CONSTANTS.AP_REGEN_IN_SAFE_ZONE_MS 
      : GAME_CONSTANTS.AP_REGEN_INTERVAL_MS;
    
    const regenedAP = Math.floor(elapsed / regenInterval);
    
    return Math.min(session.max_action_points, session.action_points + regenedAP);
  },
  
  // Использовать аптечку
  async useMedkit(vkId: number): Promise<{ success: boolean; newHP?: number; message: string }> {
    const session = await this.getActiveSession(vkId);
    
    if (!session) {
      return { success: false, message: 'Нет активной игры' };
    }
    
    const result = await InventoryService.useMedkit(session.id);
    
    if (!result.success) {
      return { success: false, message: 'Нет аптечек в инвентаре' };
    }
    
    const newHP = Math.min(session.max_hp, session.player_hp + (result.healAmount || 0));
    
    if (supabase) {
      await supabase
        .from('zombie_game_sessions')
        .update({ player_hp: newHP })
        .eq('id', session.id);
    }
    
    return { 
      success: true, 
      newHP, 
      message: `Восстановлено ${result.healAmount} HP` 
    };
  },
  
  // Обработка смерти
  async handleDeath(session: ZombieGameSession, survivalTime: number, vkId: number): Promise<void> {
    // Записать статистику
    await StatsService.recordDeath(vkId, survivalTime);
    
    // Завершить сессию
    if (supabase) {
      await supabase
        .from('zombie_game_sessions')
        .update({
          is_active: false,
          ended_at: new Date().toISOString(),
          player_hp: 0,
          deaths_count: session.deaths_count + 1,
        })
        .eq('id', session.id);
    }
    
    // Очистить данные сессии
    await ZombieService.clearZombies(session.id);
    await WorldService.clearWorldObjects(session.id);
    await InventoryService.clearInventory(session.id);
  },
  
  // Завершить активную сессию (выход из игры)
  async endActiveSession(vkId: number): Promise<void> {
    const session = await this.getActiveSession(vkId);
    
    if (!session) return;
    
    // Рассчитать текущее время выживания (от первого хода, или 0 если не было ходов)
    const now = new Date();
    const survivalTime = session.first_move_at 
      ? Math.floor((now.getTime() - new Date(session.first_move_at).getTime()) / 1000)
      : 0;
    
    // Если игрок не в безопасной зоне — он умирает
    if (!session.is_in_safe_zone) {
      await this.handleDeath(session, survivalTime, vkId);
    } else {
      // Безопасный выход — сохраняем всё состояние
      if (supabase) {
        // Рассчитать текущие AP с учётом регенерации
        const currentAP = await this.calculateCurrentAP(session);
        
        await supabase
          .from('zombie_game_sessions')
          .update({ 
            is_active: false,
            ended_at: now.toISOString(),
            survival_time_seconds: survivalTime,
            action_points: currentAP,
            last_ap_use: now.toISOString(),
          })
          .eq('id', session.id);
      }
    }
  },
  
  // Проверить, умер ли игрок пока был офлайн
  async checkOfflineDeath(vkId: number): Promise<{ died: boolean; message?: string }> {
    if (!supabase) return { died: false };
    
    // Найти последнюю неактивную сессию
    const { data: lastSession } = await supabase
      .from('zombie_game_sessions')
      .select('*')
      .eq('vk_id', vkId)
      .eq('is_active', false)
      .order('ended_at', { ascending: false })
      .limit(1)
      .single();
    
    if (!lastSession) return { died: false };
    
    // Если был не в безопасной зоне при выходе
    if (!lastSession.is_in_safe_zone && lastSession.player_hp > 0) {
      return { 
        died: true, 
        message: 'Вы вышли из игры не в безопасной зоне. Зомби вас нашли и съели...' 
      };
    }
    
    return { died: false };
  },
  
  // Возобновить игру (продолжить из безопасной зоны)
  async resumeGame(vkId: number): Promise<GameState | null> {
    if (!supabase) return null;
    
    // Найти последнюю сессию которая была в безопасной зоне
    const { data: lastSession } = await supabase
      .from('zombie_game_sessions')
      .select('*')
      .eq('vk_id', vkId)
      .eq('is_active', false)
      .eq('is_in_safe_zone', true)
      .order('ended_at', { ascending: false })
      .limit(1)
      .single();
    
    if (!lastSession || lastSession.player_hp <= 0) return null;
    
    // Реактивировать сессию
    const now = new Date();
    await supabase
      .from('zombie_game_sessions')
      .update({ 
        is_active: true,
        last_ap_regen: now.toISOString(),
      })
      .eq('id', lastSession.id);
    
    return this.loadGameState(vkId);
  },

  // Получить сохранённую сессию для отображения в меню (без активации)
  async getSavedSession(vkId: number): Promise<{
    session: ZombieGameSession | null;
    hasActiveSession: boolean;
    canResume: boolean;
  }> {
    if (!supabase) return { session: null, hasActiveSession: false, canResume: false };
    
    // Сначала проверяем активную сессию
    const activeSession = await this.getActiveSession(vkId);
    if (activeSession) {
      return { session: activeSession, hasActiveSession: true, canResume: true };
    }
    
    // Ищем последнюю сохранённую сессию в безопасной зоне
    const { data: savedSession } = await supabase
      .from('zombie_game_sessions')
      .select('*')
      .eq('vk_id', vkId)
      .eq('is_active', false)
      .eq('is_in_safe_zone', true)
      .gt('player_hp', 0)
      .order('ended_at', { ascending: false })
      .limit(1)
      .single();
    
    return {
      session: savedSession || null,
      hasActiveSession: false,
      canResume: !!savedSession && savedSession.player_hp > 0,
    };
  },

// Получить название города по координатам (reverse geocoding)
    async getCityName(lat: number, lon: number): Promise<string> {
      try {
        const response = await fetch(
          `https://api.maptiler.com/geocoding/${lon},${lat}.json?key=wIfs08UziK6xJeBmZMgv&types=place,locality`
        );
        const data = await response.json();
        
        if (data.features && data.features.length > 0) {
          // Ищем город или населённый пункт
          const place = data.features.find((f: any) => 
            f.place_type?.includes('place') || f.place_type?.includes('locality')
          );
          if (place) {
            return place.text || place.place_name?.split(',')[0] || 'Неизвестный город';
          }
          return data.features[0].text || 'Неизвестный город';
        }
        return 'Неизвестный город';
      } catch (error) {
        console.error('Error getting city name:', error);
        return 'Неизвестный город';
      }
    },

  // Спавн зомби по правилу сценария (с поддержкой аватарок погибших игроков)
  async spawnZombiesByRule(
    sessionId: string,
    playerLat: number,
    playerLon: number,
    rule: SpawnRule
  ): Promise<Zombie[]> {
    // Используем ZombieService для спавна с аватарками
    return ZombieService.spawnZombiesWithRule(sessionId, playerLat, playerLon, rule);
  },

  // Бросить книгу в зомби (образовать его)
  async educateZombie(
    vkId: number,
    zombieId: string,
    playerLat: number,
    playerLon: number
  ): Promise<{ success: boolean; message: string; bookName?: string }> {
    if (!supabase) return { success: false, message: 'База данных недоступна' };
    
    const session = await this.getActiveSession(vkId);
    if (!session) {
      return { success: false, message: 'Нет активной игры' };
    }
    
    // Получить зомби
    const { data: zombie, error: zombieError } = await supabase
      .from('zombie_entities')
      .select('*')
      .eq('id', zombieId)
      .eq('session_id', session.id)
      .single();
    
    if (zombieError || !zombie) {
      return { success: false, message: 'Зомби не найден' };
    }
    
    // Проверить дистанцию
    const distance = calculateDistance(playerLat, playerLon, zombie.lat, zombie.lon);
    if (distance > GAME_CONSTANTS.BOOK_THROW_RANGE_M) {
      return { success: false, message: `Зомби слишком далеко (${Math.round(distance)}м). Максимальная дистанция: ${GAME_CONSTANTS.BOOK_THROW_RANGE_M}м` };
    }
    
    // Проверить наличие книги
    const bookResult = await InventoryService.useBook(session.id);
    if (!bookResult.success) {
      return { success: false, message: 'Нет книг в инвентаре' };
    }
    
    // Удалить зомби
    await supabase
      .from('zombie_entities')
      .delete()
      .eq('id', zombieId);
    
    // Обновить статистику
    await StatsService.incrementZombiesEducated(vkId);
    
    return { 
      success: true, 
      message: `Вы бросили "${bookResult.bookName}" и сделали зомби умнее! Он ушёл читать.`,
      bookName: bookResult.bookName,
    };
  },

  // Получить книгу из библиотеки/книжного магазина
  async pickupBook(
    vkId: number,
    objectId: string,
    playerLat: number,
    playerLon: number
  ): Promise<{ success: boolean; message: string; bookName?: string }> {
    if (!supabase) return { success: false, message: 'База данных недоступна' };
    
    const session = await this.getActiveSession(vkId);
    if (!session) {
      return { success: false, message: 'Нет активной игры' };
    }
    
    // Получить объект
    const { data: worldObj, error: objError } = await supabase
      .from('zombie_world_objects')
      .select('*')
      .eq('id', objectId)
      .eq('session_id', session.id)
      .single();
    
    if (objError || !worldObj) {
      return { success: false, message: 'Объект не найден' };
    }
    
    // Проверить тип объекта
    if (worldObj.type !== 'library' && worldObj.type !== 'bookstore') {
      return { success: false, message: 'Здесь нельзя получить книгу' };
    }
    
    // Проверить дистанцию
    const distance = calculateDistance(playerLat, playerLon, worldObj.lat, worldObj.lon);
    if (distance < GAME_CONSTANTS.BOOK_PICKUP_RANGE_MIN_M || distance > GAME_CONSTANTS.BOOK_PICKUP_RANGE_MAX_M) {
      return { 
        success: false, 
        message: `Вы должны быть на расстоянии ${GAME_CONSTANTS.BOOK_PICKUP_RANGE_MIN_M}-${GAME_CONSTANTS.BOOK_PICKUP_RANGE_MAX_M}м от объекта (сейчас: ${Math.round(distance)}м)` 
      };
    }
    
    // Проверить cooldown (раз в сутки)
    if (session.last_book_pickup) {
      const lastPickup = new Date(session.last_book_pickup).getTime();
      const now = Date.now();
      const elapsed = now - lastPickup;
      
      if (elapsed < GAME_CONSTANTS.BOOK_PICKUP_COOLDOWN_MS) {
        const remainingHours = Math.ceil((GAME_CONSTANTS.BOOK_PICKUP_COOLDOWN_MS - elapsed) / (60 * 60 * 1000));
        return { success: false, message: `Вы уже получали книгу сегодня. Попробуйте через ${remainingHours}ч` };
      }
    }
    
    // Добавить случайную книгу
    const bookResult = await InventoryService.addRandomBook(session.id);
    if (!bookResult.success || !bookResult.book) {
      return { success: false, message: 'Не удалось получить книгу' };
    }
    
    // Обновить время последнего получения книги
    await supabase
      .from('zombie_game_sessions')
      .update({ last_book_pickup: new Date().toISOString() })
      .eq('id', session.id);
    
    return { 
      success: true, 
      message: `Вы нашли книгу: ${bookResult.book.author} "${bookResult.book.title}"`,
      bookName: `${bookResult.book.author} "${bookResult.book.title}"`,
    };
  },

  // Проверка механики "запаха" — зомби стягиваются к неподвижному игроку
  async checkSmellAttraction(vkId: number): Promise<{
    isIdle: boolean;
    zombiesMoved: number;
    attacks: number;
    damage: number;
    newHP: number;
    isDead: boolean;
    zombies: Zombie[];
    events: GameEvent[];
  }> {
    const session = await this.getActiveSession(vkId);
    
    if (!session) {
      return { 
        isIdle: false, 
        zombiesMoved: 0, 
        attacks: 0, 
        damage: 0, 
        newHP: 0, 
        isDead: false, 
        zombies: [],
        events: [],
      };
    }
    
    // Если игрок в безопасной зоне — запах не действует
    if (session.is_in_safe_zone) {
      const zombies = await ZombieService.getVisibleZombies(
        session.id, session.player_lat, session.player_lon
      );
      return { 
        isIdle: false, 
        zombiesMoved: 0, 
        attacks: 0, 
        damage: 0, 
        newHP: session.player_hp, 
        isDead: false, 
        zombies,
        events: [],
      };
    }
    
// Проверить время последнего хода
      const lastMoveTime = session.last_move_at 
        ? new Date(session.last_move_at).getTime() 
        : session.first_move_at 
          ? new Date(session.first_move_at).getTime()
          : new Date(session.started_at).getTime();
      const now = Date.now();
      const idleTime = now - lastMoveTime;
    
    const isIdle = idleTime >= GAME_CONSTANTS.SMELL_IDLE_THRESHOLD_MS;
    
    if (!isIdle) {
      const zombies = await ZombieService.getVisibleZombies(
        session.id, session.player_lat, session.player_lon
      );
      return { 
        isIdle: false, 
        zombiesMoved: 0, 
        attacks: 0, 
        damage: 0, 
        newHP: session.player_hp, 
        isDead: false, 
        zombies,
        events: [],
      };
    }
    
    const events: GameEvent[] = [];
    
    // Двинуть зомби к игроку
    const moveResult = await ZombieService.passiveMoveZombies(
      session.id,
      session.player_lat,
      session.player_lon
    );
    
    // Рассчитать урон от атак
    let newHP = session.player_hp;
    let damage = 0;
    
    if (moveResult.attacks > 0) {
      damage = moveResult.attacks * GAME_CONSTANTS.ZOMBIE_DAMAGE;
      newHP = Math.max(0, session.player_hp - damage);
      
      events.push({
        type: 'zombie_attack',
        message: `${moveResult.attacks} зомби подкрались и атаковали вас! -${damage} HP`,
        timestamp: Date.now(),
        data: { damage, attackers: moveResult.attacks },
      });
      
      // Обновить HP в базе
      if (supabase) {
        await supabase
          .from('zombie_game_sessions')
          .update({ player_hp: newHP })
          .eq('id', session.id);
      }
    }
    
// Проверить смерть
      const isDead = newHP <= 0;
      if (isDead) {
        const survivalTime = session.first_move_at 
          ? Math.floor((now - new Date(session.first_move_at).getTime()) / 1000)
          : 0;
        await this.handleDeath(session, survivalTime, vkId);
        
        events.push({
          type: 'player_died',
          message: 'Зомби подкрались к вам пока вы стояли на месте...',
          timestamp: Date.now(),
        });
      }
    
    // Получить видимых зомби
    const visibleZombies = await ZombieService.getVisibleZombies(
      session.id, session.player_lat, session.player_lon
    );
    
    return {
      isIdle,
      zombiesMoved: moveResult.movedCount,
      attacks: moveResult.attacks,
      damage,
      newHP,
      isDead,
      zombies: visibleZombies,
      events,
    };
  },

  // Эвакуироваться из Extraction Camp (безопасный выход с сохранением прогресса)
  async extractPlayer(vkId: number): Promise<{
    success: boolean;
    message: string;
    survivalTime?: number;
  }> {
    const session = await this.getActiveSession(vkId);
    
    if (!session) {
      return { success: false, message: 'Нет активной игры' };
    }
    
    // Проверить, что игрок в extraction camp и оно разблокировано
    const safeCheck = await WorldService.isInSafeZone(
      session.id,
      session.player_lat,
      session.player_lon,
      session.move_count || 0
    );
    
    if (!safeCheck.isExtractionCamp) {
      return { success: false, message: 'Вы должны быть в Точке эвакуации' };
    }
    
    if (safeCheck.isLocked) {
      return { 
        success: false, 
        message: `Точка эвакуации заблокирована. Осталось ходов: ${safeCheck.unlocksIn}` 
      };
    }
    
    // Рассчитать время выживания
    const now = new Date();
    const survivalTime = session.first_move_at 
      ? Math.floor((now.getTime() - new Date(session.first_move_at).getTime()) / 1000)
      : 0;
    
    // Завершить сессию с сохранением данных (успешная эвакуация)
    if (supabase) {
      await supabase
        .from('zombie_game_sessions')
        .update({ 
          is_active: false,
          ended_at: now.toISOString(),
          survival_time_seconds: survivalTime,
          is_in_safe_zone: true, // Помечаем как безопасный выход
        })
        .eq('id', session.id);
    }
    
    // Обновить лучшее время выживания
    await StatsService.updateSurvivalTime(vkId, survivalTime);
    
    // Очистить данные сессии
    await ZombieService.clearZombies(session.id);
    await WorldService.clearWorldObjects(session.id);
    await InventoryService.clearInventory(session.id);
    
    return { 
      success: true, 
      message: 'Вы успешно эвакуировались!',
      survivalTime,
    };
  },
};
