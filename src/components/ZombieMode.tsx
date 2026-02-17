'use client';

import { useState, useEffect, useCallback } from 'react';
import dynamic from 'next/dynamic';
import { motion, AnimatePresence } from 'framer-motion';
import { 
    Heart, 
    Zap, 
    Volume2, 
    VolumeX, 
    X, 
    Skull, 
    Timer, 
    Package, 
    AlertTriangle,
    Play,
    MapPin,
    Shield,
    Footprints,
    Flashlight,
    Navigation,
    Settings,
    BookOpen
  } from 'lucide-react';
import { GameService, GameState, StatsService, GAME_CONSTANTS, ZombieStats, GameEvent, InventoryItem, ZombieGameSession, Zombie, WorldObject, ADMIN_VK_IDS, BOOKS } from '@/lib/zombie';
import { InventoryService } from '@/lib/zombie/inventory-service';
import { ZombieService } from '@/lib/zombie/zombie-service';
import ZombieAdmin from './ZombieAdmin';

// Динамический импорт карты
const ZombieMap = dynamic(() => import('./ZombieMap'), {
  ssr: false,
  loading: () => (
    <div className="h-full w-full bg-zinc-900 animate-pulse flex items-center justify-center">
      <span className="text-zinc-500">Загрузка карты...</span>
    </div>
  ),
});

interface ZombieModeProps {
  vkId: number;
  onExit: () => void;
  userPosition: [number, number];
  userPhoto?: string;
}

type GameScreen = 'menu' | 'playing' | 'dead' | 'exit_warning' | 'extracted';
type MoveStep = 'gps' | 'scanning' | 'zombies' | 'resources' | 'done' | null;

const MOVE_STEPS: { step: MoveStep; label: string; icon: string }[] = [
  { step: 'gps', label: 'Определение GPS...', icon: '📍' },
  { step: 'scanning', label: 'Сканирование местности...', icon: '🔍' },
  { step: 'zombies', label: 'Зомби делают ход...', icon: '🧟' },
  { step: 'resources', label: 'Поиск ресурсов...', icon: '📦' },
  { step: 'done', label: 'Готово!', icon: '✅' },
];

export default function ZombieMode({ vkId, onExit, userPosition, userPhoto }: ZombieModeProps) {
  const [screen, setScreen] = useState<GameScreen>('menu');
  const [gameState, setGameState] = useState<GameState | null>(null);
  const [stats, setStats] = useState<ZombieStats | null>(null);
  const [inventory, setInventory] = useState<InventoryItem[]>([]);
  const [events, setEvents] = useState<GameEvent[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [showInventory, setShowInventory] = useState(false);
  const [currentAP, setCurrentAP] = useState(GAME_CONSTANTS.INITIAL_AP);
  const [deathMessage, setDeathMessage] = useState<string>('');
  const [currentPosition, setCurrentPosition] = useState<[number, number]>(userPosition);
  const [survivalTime, setSurvivalTime] = useState(0);
  const [apRegenProgress, setApRegenProgress] = useState(0);
  
// Новые состояния для фонарика и сохранённой сессии
    const [flashlightActive, setFlashlightActive] = useState(false);
    const [flashlightEndTime, setFlashlightEndTime] = useState<number | null>(null);
    const [distantZombies, setDistantZombies] = useState<Array<Zombie & { distance: number; direction: number }>>([]);
    const [savedSession, setSavedSession] = useState<ZombieGameSession | null>(null);
    const [savedCity, setSavedCity] = useState<string>('');
    const [canResume, setCanResume] = useState(false);
    const [showAdmin, setShowAdmin] = useState(false);
    
  // Состояния для механики книг
  const [selectedZombie, setSelectedZombie] = useState<Zombie | null>(null);
  const [showBookDialog, setShowBookDialog] = useState(false);
  const [bookCount, setBookCount] = useState(0);
  
  // Состояние для детального просмотра предмета
  const [selectedItem, setSelectedItem] = useState<InventoryItem | null>(null);
  
  // Состояние для пошаговой обработки хода
  const [moveStep, setMoveStep] = useState<MoveStep>(null);
  
    // Проверка админ-прав
    const isAdmin = ADMIN_VK_IDS.includes(vkId);

  // Отслеживание GPS в реальном времени
  useEffect(() => {
    if (screen !== 'playing') return;
    
    let watchId: number | null = null;
    
    if ('geolocation' in navigator) {
      watchId = navigator.geolocation.watchPosition(
        (position) => {
          setCurrentPosition([position.coords.latitude, position.coords.longitude]);
        },
        (error) => {
          console.error('Geolocation error:', error);
        },
        {
          enableHighAccuracy: true,
          timeout: 10000,
          maximumAge: 2000,
        }
      );
    }
    
    return () => {
      if (watchId !== null) {
        navigator.geolocation.clearWatch(watchId);
      }
    };
  }, [screen]);

  // Загрузить статистику
  useEffect(() => {
    const loadStats = async () => {
      const s = await StatsService.getStats(vkId);
      setStats(s);
    };
    loadStats();
  }, [vkId]);

  // Загрузить сохранённую сессию при входе
  useEffect(() => {
    const loadSavedSession = async () => {
      const result = await GameService.getSavedSession(vkId);
      setSavedSession(result.session);
      setCanResume(result.canResume);
      
      if (result.session) {
        const city = await GameService.getCityName(result.session.player_lat, result.session.player_lon);
        setSavedCity(city);
      }
    };
    loadSavedSession();
  }, [vkId]);

  // Проверить офлайн смерть при входе
  useEffect(() => {
    const checkDeath = async () => {
      const result = await GameService.checkOfflineDeath(vkId);
      if (result.died) {
        setDeathMessage(result.message || 'Вы погибли...');
        setScreen('dead');
      }
    };
    checkDeath();
  }, [vkId]);

  // Обновить AP каждую секунду
  useEffect(() => {
    if (!gameState?.session) return;
    
    const interval = setInterval(async () => {
      const ap = await GameService.calculateCurrentAP(gameState.session!);
      setCurrentAP(ap);
    }, 1000);
    
    return () => clearInterval(interval);
  }, [gameState?.session]);

  // Непрерывный таймер выживания и прогресс восстановления AP
  useEffect(() => {
    if (screen !== 'playing' || !gameState?.session) return;
    
    // Инициализировать время выживания из сессии
    setSurvivalTime(gameState.session.survival_time_seconds || 0);
    
    const interval = setInterval(() => {
      // Увеличить таймер выживания ТОЛЬКО если был первый ход
      if (gameState.session?.first_move_at) {
        setSurvivalTime(prev => prev + 1);
      }
      
      // Рассчитать прогресс восстановления AP
      if (currentAP < GAME_CONSTANTS.MAX_AP && gameState.session) {
        const regenTime = gameState.isInSafeZone 
          ? GAME_CONSTANTS.AP_REGEN_IN_SAFE_ZONE_MS 
          : GAME_CONSTANTS.AP_REGEN_INTERVAL_MS;
        
        const lastApUse = new Date(gameState.session.last_ap_use).getTime();
        const now = Date.now();
        const elapsed = now - lastApUse;
        const apFromRegen = Math.floor(elapsed / regenTime);
        const remainingTime = elapsed - (apFromRegen * regenTime);
        const progress = (remainingTime / regenTime) * 100;
        
        setApRegenProgress(progress);
      } else {
        setApRegenProgress(0);
      }
    }, 1000);
    
    return () => clearInterval(interval);
  }, [screen, gameState?.session, gameState?.isInSafeZone, currentAP]);

  // Эффект фонарика - загружать далёких зомби когда активен
  useEffect(() => {
    if (!flashlightActive || !gameState?.session) {
      setDistantZombies([]);
      return;
    }
    
    const loadDistantZombies = async () => {
      const zombies = await ZombieService.getDistantZombies(
        gameState.session!.id,
        currentPosition[0],
        currentPosition[1]
      );
      setDistantZombies(zombies);
    };
    
    loadDistantZombies();
    const interval = setInterval(loadDistantZombies, 2000); // обновлять каждые 2 секунды
    
    return () => clearInterval(interval);
  }, [flashlightActive, gameState?.session, currentPosition]);

  // Таймер выключения фонарика
  useEffect(() => {
    if (!flashlightEndTime) return;
    
    const checkFlashlight = setInterval(() => {
      if (Date.now() >= flashlightEndTime) {
        setFlashlightActive(false);
        setFlashlightEndTime(null);
        setDistantZombies([]);
      }
    }, 1000);
    
    return () => clearInterval(checkFlashlight);
  }, [flashlightEndTime]);

  // Загрузить инвентарь
  const loadInventory = useCallback(async () => {
    if (!gameState?.session) return;
    const inv = await InventoryService.getInventory(gameState.session.id);
    setInventory(inv);
    // Обновить количество книг
    const books = inv.filter(i => i.type === 'book').reduce((sum, i) => sum + i.quantity, 0);
    setBookCount(books);
  }, [gameState?.session]);

  useEffect(() => {
    if (gameState?.session) {
      loadInventory();
    }
  }, [gameState?.session, loadInventory]);

  // Автоудаление уведомлений через 7 секунд
  useEffect(() => {
    if (events.length === 0) return;
    
    const timer = setInterval(() => {
      const now = Date.now();
      setEvents(prev => prev.filter(event => now - event.timestamp < 7000));
    }, 1000);
    
    return () => clearInterval(timer);
  }, [events.length > 0]); // eslint-disable-line react-hooks/exhaustive-deps

  // Состояние для механики запаха
  const [lastSmellWarning, setLastSmellWarning] = useState<number>(0);
  const [isSmellActive, setIsSmellActive] = useState(false);

  // Механика "запаха" — зомби стягиваются к неподвижному игроку
  useEffect(() => {
    if (screen !== 'playing' || !gameState?.session) return;
    
    const checkSmell = async () => {
      const result = await GameService.checkSmellAttraction(vkId);
      
      if (result.isIdle) {
        setIsSmellActive(true);
        
        // Показать предупреждение раз в минуту
        const now = Date.now();
        if (now - lastSmellWarning >= GAME_CONSTANTS.SMELL_WARNING_INTERVAL_MS) {
          setLastSmellWarning(now);
          
          if (result.zombiesMoved > 0) {
            setEvents(prev => [{
              type: 'warning',
              message: `Зомби чуют вас! ${result.zombiesMoved} зомби подкрадываются...`,
              timestamp: now,
            }, ...prev].slice(0, 10));
          } else {
            setEvents(prev => [{
              type: 'warning',
              message: 'Вы слишком долго стоите на месте. Зомби начинают чуять вас!',
              timestamp: now,
            }, ...prev].slice(0, 10));
          }
        }
        
        // Обновить зомби на карте
        if (result.zombiesMoved > 0) {
          setGameState(prev => prev ? {
            ...prev,
            zombies: result.zombies,
          } : null);
        }
        
        // Добавить события атаки
        if (result.events.length > 0) {
          setEvents(prev => [...result.events, ...prev].slice(0, 10));
        }
        
        // Обновить HP
        if (result.damage > 0 && gameState?.session) {
          setGameState(prev => prev ? {
            ...prev,
            session: prev.session ? { ...prev.session, player_hp: result.newHP } : null,
          } : null);
        }
        
        // Проверить смерть
        if (result.isDead) {
          setDeathMessage('Зомби подкрались к вам пока вы стояли на месте...');
          setScreen('dead');
          const newStats = await StatsService.getStats(vkId);
          setStats(newStats);
        }
      } else {
        setIsSmellActive(false);
      }
    };
    
    // Проверять каждые 30 секунд
    const interval = setInterval(checkSmell, GAME_CONSTANTS.SMELL_CHECK_INTERVAL_MS);
    
    // Первая проверка через 30 секунд
    const initialTimeout = setTimeout(checkSmell, GAME_CONSTANTS.SMELL_CHECK_INTERVAL_MS);
    
    return () => {
      clearInterval(interval);
      clearTimeout(initialTimeout);
    };
  }, [screen, gameState?.session, vkId, lastSmellWarning]);

  // Начать новую игру
  const startGame = async () => {
    setIsLoading(true);
    try {
      const state = await GameService.startGame(vkId, userPosition[0], userPosition[1]);
      if (state.session) {
        setGameState(state);
        setEvents(state.events);
        setCurrentAP(GAME_CONSTANTS.INITIAL_AP);
        setScreen('playing');
      }
    } catch (error) {
      console.error('Error starting game:', error);
    }
    setIsLoading(false);
  };

  // Продолжить игру
  const resumeGame = async () => {
    setIsLoading(true);
    try {
      const state = await GameService.resumeGame(vkId);
      if (state?.session) {
        setGameState(state);
        setScreen('playing');
      } else {
        // Нет сохранённой игры, начать новую
        await startGame();
      }
    } catch (error) {
      console.error('Error resuming game:', error);
    }
    setIsLoading(false);
  };

  // Небольшая задержка для визуального эффекта
  const delay = (ms: number) => new Promise(resolve => setTimeout(resolve, ms));

  // Сделать ход
    const makeMove = async () => {
      if (!gameState?.session || currentAP < 1) return;
      
      setIsLoading(true);
      setMoveStep('gps');
      
      try {
        // Сохранить предыдущую позицию для сравнения
        const previousPosition = currentPosition;
        
        // Принудительно получить актуальную позицию перед ходом
        const freshPosition = await new Promise<[number, number]>((resolve) => {
          if (!('geolocation' in navigator)) {
            resolve(currentPosition);
            return;
          }
          
          navigator.geolocation.getCurrentPosition(
            (pos) => resolve([pos.coords.latitude, pos.coords.longitude]),
            () => resolve(currentPosition), // Fallback на текущую позицию если GPS недоступен
            { enableHighAccuracy: true, timeout: 5000, maximumAge: 0 }
          );
        });
        
        // Обновить позицию в состоянии
        setCurrentPosition(freshPosition);
        
        // Шаг 2: Сканирование местности
        setMoveStep('scanning');
        await delay(400);
        
        // Шаг 3: Зомби делают ход (основная логика)
        setMoveStep('zombies');
        const result = await GameService.makeMove(vkId, freshPosition[0], freshPosition[1]);
        
        // Шаг 4: Поиск ресурсов
        setMoveStep('resources');
        await delay(300);
      
      if (result.success) {
        setGameState(result);
        
        // Проверить, изменилась ли позиция (порог 5 метров)
        const distanceMoved = calculateDistance(
          previousPosition[0], previousPosition[1],
          freshPosition[0], freshPosition[1]
        );
        
        if (distanceMoved < 5) {
          // Позиция не изменилась — показать уведомление
          setEvents(prev => [{
            type: 'warning',
            message: 'Двигайтесь в реальном мире, чтобы изменить своё местоположение',
            timestamp: Date.now(),
          }, ...result.events, ...prev].slice(0, 10));
        } else {
          setEvents(prev => [...result.events, ...prev].slice(0, 10));
        }
        
        setCurrentAP(result.session?.action_points || 0);
        await loadInventory();
        
        // Проверить смерть
        if (result.session?.player_hp === 0) {
          setDeathMessage('Вы погибли от рук зомби!');
          setScreen('dead');
          const newStats = await StatsService.getStats(vkId);
          setStats(newStats);
        }
      }
      
      // Шаг 5: Готово
      setMoveStep('done');
      await delay(300);
      
    } catch (error) {
      console.error('Error making move:', error);
    }
    setMoveStep(null);
    setIsLoading(false);
  };
  
  // Вычислить расстояние между двумя точками в метрах
  const calculateDistance = (lat1: number, lon1: number, lat2: number, lon2: number): number => {
    const R = 6371e3; // Радиус Земли в метрах
    const φ1 = lat1 * Math.PI / 180;
    const φ2 = lat2 * Math.PI / 180;
    const Δφ = (lat2 - lat1) * Math.PI / 180;
    const Δλ = (lon2 - lon1) * Math.PI / 180;

    const a = Math.sin(Δφ / 2) * Math.sin(Δφ / 2) +
              Math.cos(φ1) * Math.cos(φ2) *
              Math.sin(Δλ / 2) * Math.sin(Δλ / 2);
    const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));

    return R * c;
  };

    // Использовать аптечку
    const useMedkit = async () => {
      if (!gameState?.session) return;
      
      const result = await GameService.useMedkit(vkId);
      if (result.success && result.newHP) {
        setGameState(prev => prev ? {
          ...prev,
          session: prev.session ? { ...prev.session, player_hp: result.newHP! } : null
        } : null);
        
        setEvents(prev => [{
          type: 'resource_found',
          message: result.message,
          timestamp: Date.now(),
        }, ...prev].slice(0, 10));
        
        await loadInventory();
        setSelectedItem(null);
        setShowInventory(false);
      }
    };

    // Использовать фонарик
    const useFlashlight = async () => {
      if (!gameState?.session || flashlightActive) return;
      
      const result = await InventoryService.useFlashlight(gameState.session.id);
      if (result.success) {
        const duration = result.duration || GAME_CONSTANTS.FLASHLIGHT_DURATION_S;
        setFlashlightActive(true);
        setFlashlightEndTime(Date.now() + duration * 1000);
        
        setEvents(prev => [{
          type: 'resource_found',
          message: `Фонарик активирован на ${duration} сек. Вы видите направления зомби!`,
          timestamp: Date.now(),
        }, ...prev].slice(0, 10));
        
        await loadInventory();
        setSelectedItem(null);
        setShowInventory(false);
      }
    };

    // Применить предмет из инвентаря
    const useItem = async (item: InventoryItem) => {
      switch (item.type) {
        case 'medkit':
          await useMedkit();
          break;
        case 'flashlight':
          await useFlashlight();
          break;
        case 'book':
          // Книги применяются через клик на зомби на карте
          setSelectedItem(null);
          setShowInventory(false);
          setEvents(prev => [{
            type: 'warning',
            message: 'Нажмите на зомби на карте, чтобы бросить книгу',
            timestamp: Date.now(),
          }, ...prev].slice(0, 10));
          break;
        default:
          setEvents(prev => [{
            type: 'warning',
            message: 'Этот предмет пока нельзя использовать',
            timestamp: Date.now(),
          }, ...prev].slice(0, 10));
      }
    };

    // Получить описание предмета
    const getItemDescription = (item: InventoryItem): { description: string; canUse: boolean; actionText: string } => {
      switch (item.type) {
        case 'medkit':
          return {
            description: `Восстанавливает ${item.effect_value} HP. Используйте, когда здоровье на исходе.`,
            canUse: (gameState?.session?.player_hp || 0) < GAME_CONSTANTS.MAX_HP,
            actionText: 'Использовать',
          };
        case 'flashlight':
          return {
            description: `Освещает местность на ${GAME_CONSTANTS.FLASHLIGHT_RANGE_M}м на ${item.effect_value || GAME_CONSTANTS.FLASHLIGHT_DURATION_S} секунд. Показывает направление и расстояние до зомби.`,
            canUse: !flashlightActive,
            actionText: flashlightActive ? 'Уже активен' : 'Включить',
          };
        case 'food':
          return {
            description: 'Еда для выживания. Восстанавливает силы.',
            canUse: false,
            actionText: 'Съесть',
          };
        case 'water':
          return {
            description: 'Чистая вода. Утоляет жажду.',
            canUse: false,
            actionText: 'Выпить',
          };
        case 'book':
          const bookInfo = BOOKS.find(b => b.id === item.book_id);
          return {
            description: bookInfo 
              ? `"${bookInfo.title}" — ${bookInfo.author}. Бросьте в зомби, чтобы просветить его. Нажмите на зомби на карте (до ${GAME_CONSTANTS.BOOK_THROW_RANGE_M}м).`
              : 'Классическая литература для просвещения зомби.',
            canUse: false,
            actionText: 'Выбрать зомби на карте',
          };
        default:
          return {
            description: 'Неизвестный предмет.',
            canUse: false,
            actionText: 'Нельзя использовать',
          };
      }
    };

  // Обработчик клика на зомби (для броска книги)
  const handleZombieClick = (zombie: Zombie) => {
    if (bookCount < 1) {
      setEvents(prev => [{
        type: 'warning',
        message: 'У вас нет книг! Найдите библиотеку или книжный магазин.',
        timestamp: Date.now(),
      }, ...prev].slice(0, 10));
      return;
    }
    
    // Вычислить расстояние
    const distance = calculateDistance(
      currentPosition[0], currentPosition[1],
      zombie.lat, zombie.lon
    );
    
    if (distance > GAME_CONSTANTS.BOOK_THROW_RANGE_M) {
      setEvents(prev => [{
        type: 'warning',
        message: `Зомби слишком далеко (${Math.round(distance)}м). Приблизьтесь до ${GAME_CONSTANTS.BOOK_THROW_RANGE_M}м.`,
        timestamp: Date.now(),
      }, ...prev].slice(0, 10));
      return;
    }
    
    setSelectedZombie(zombie);
    setShowBookDialog(true);
  };

  // Бросить книгу в зомби
  const throwBookAtZombie = async () => {
    if (!selectedZombie || !gameState?.session) return;
    
    setIsLoading(true);
    setShowBookDialog(false);
    
    const result = await GameService.educateZombie(
      vkId,
      selectedZombie.id,
      currentPosition[0],
      currentPosition[1]
    );
    
    if (result.success) {
      // Удалить зомби из локального состояния
      setGameState(prev => prev ? {
        ...prev,
        zombies: prev.zombies.filter(z => z.id !== selectedZombie.id),
      } : null);
      
      setEvents(prev => [{
        type: 'zombie_educated',
        message: result.message,
        timestamp: Date.now(),
      }, ...prev].slice(0, 10));
      
      await loadInventory();
      
      // Обновить статистику
      const newStats = await StatsService.getStats(vkId);
      setStats(newStats);
    } else {
      setEvents(prev => [{
        type: 'warning',
        message: result.message,
        timestamp: Date.now(),
      }, ...prev].slice(0, 10));
    }
    
    setSelectedZombie(null);
    setIsLoading(false);
  };

  // Обработчик клика на объект (для получения книги)
  const handleObjectClick = async (obj: WorldObject) => {
    if (obj.type !== 'library' && obj.type !== 'bookstore') return;
    
    setIsLoading(true);
    
    const result = await GameService.pickupBook(
      vkId,
      obj.id,
      currentPosition[0],
      currentPosition[1]
    );
    
    if (result.success) {
      setEvents(prev => [{
        type: 'book_received',
        message: result.message,
        timestamp: Date.now(),
      }, ...prev].slice(0, 10));
      
      await loadInventory();
    } else {
      setEvents(prev => [{
        type: 'warning',
        message: result.message,
        timestamp: Date.now(),
      }, ...prev].slice(0, 10));
    }
    
    setIsLoading(false);
  };

  // Эвакуироваться (безопасный выход с extraction camp)
  const handleExtract = async () => {
    setIsLoading(true);
    try {
      const result = await GameService.extractPlayer(vkId);
      if (result.success) {
        setSurvivalTime(result.survivalTime || 0);
        setScreen('extracted');
        const newStats = await StatsService.getStats(vkId);
        setStats(newStats);
      } else {
        setEvents(prev => [{
          type: 'warning',
          message: result.message,
          timestamp: Date.now(),
        }, ...prev].slice(0, 10));
      }
    } catch (error) {
      console.error('Error extracting:', error);
    }
    setIsLoading(false);
  };

  // Выход из игры
  const handleExit = async () => {
    if (gameState?.session && !gameState.isInSafeZone) {
      setScreen('exit_warning');
    } else {
      await GameService.endActiveSession(vkId);
      onExit();
    }
  };

  // Подтвердить выход (возможная смерть)
  const confirmExit = async () => {
    await GameService.endActiveSession(vkId);
    const newStats = await StatsService.getStats(vkId);
    setStats(newStats);
    onExit();
  };

  // Форматирование времени выживания
  const formatTime = (seconds: number, hasStarted: boolean = true) => {
    // Если таймер ещё не запущен (нет первого хода)
    if (!hasStarted) return '--:--';
    
    const h = Math.floor(seconds / 3600);
    const m = Math.floor((seconds % 3600) / 60);
    const s = seconds % 60;
    if (h > 0) return `${h}ч ${m}м`;
    if (m > 0) return `${m}м ${s}с`;
    return `${s}с`;
  };

  // Форматирование времени с днями для меню
  const formatTimeFull = (seconds: number) => {
    const d = Math.floor(seconds / 86400);
    const h = Math.floor((seconds % 86400) / 3600);
    const m = Math.floor((seconds % 3600) / 60);
    
    const parts = [];
    if (d > 0) parts.push(`${d} ${d === 1 ? 'день' : d < 5 ? 'дня' : 'дней'}`);
    if (h > 0) parts.push(`${h} ${h === 1 ? 'час' : h < 5 ? 'часа' : 'часов'}`);
    if (m > 0 || parts.length === 0) parts.push(`${m} ${m === 1 ? 'минута' : m < 5 ? 'минуты' : 'минут'}`);
    
    return parts.join(', ');
  };

  // Получить направление по градусам
  const getDirectionName = (degrees: number): string => {
    if (degrees >= 337.5 || degrees < 22.5) return 'С';
    if (degrees >= 22.5 && degrees < 67.5) return 'СВ';
    if (degrees >= 67.5 && degrees < 112.5) return 'В';
    if (degrees >= 112.5 && degrees < 157.5) return 'ЮВ';
    if (degrees >= 157.5 && degrees < 202.5) return 'Ю';
    if (degrees >= 202.5 && degrees < 247.5) return 'ЮЗ';
    if (degrees >= 247.5 && degrees < 292.5) return 'З';
    return 'СЗ';
  };

  // Главное меню
  if (screen === 'menu') {
    return (
      <motion.div
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        exit={{ opacity: 0 }}
        className="fixed inset-0 z-[200] bg-zinc-900 flex flex-col"
      >
        {/* Фон */}
        <div className="absolute inset-0 overflow-hidden">
          <div className="absolute top-0 left-1/4 w-96 h-96 bg-green-500/10 rounded-full blur-3xl" />
          <div className="absolute bottom-0 right-1/4 w-80 h-80 bg-red-500/10 rounded-full blur-3xl" />
        </div>
        
{/* Контент */}
          <div className="relative flex-1 flex flex-col items-center justify-center p-6">
            {/* Кнопка закрытия */}
            <button
              onClick={onExit}
              className="absolute top-4 right-4 w-10 h-10 bg-zinc-800 rounded-full flex items-center justify-center text-zinc-400"
            >
              <X className="w-5 h-5" />
            </button>
            
            {/* Кнопка админки (только для админов) */}
            {isAdmin && (
              <button
                onClick={() => setShowAdmin(true)}
                className="absolute top-4 left-4 w-10 h-10 bg-purple-500/20 rounded-full flex items-center justify-center text-purple-400"
              >
                <Settings className="w-5 h-5" />
              </button>
            )}
          
          {/* Лого */}
          <motion.div
            initial={{ scale: 0.8, opacity: 0 }}
            animate={{ scale: 1, opacity: 1 }}
            transition={{ delay: 0.2 }}
            className="mb-6"
          >
            <div className="w-28 h-28 bg-gradient-to-br from-green-600 to-lime-500 rounded-3xl flex items-center justify-center shadow-2xl shadow-green-500/30">
              <span className="text-5xl">🧟</span>
            </div>
          </motion.div>
          
          <motion.h1
            initial={{ y: 20, opacity: 0 }}
            animate={{ y: 0, opacity: 1 }}
            transition={{ delay: 0.3 }}
            className="text-3xl font-black text-white mb-2"
          >
            Режим Зомби
          </motion.h1>
          
          <motion.p
            initial={{ y: 20, opacity: 0 }}
            animate={{ y: 0, opacity: 1 }}
            transition={{ delay: 0.4 }}
            className="text-zinc-400 text-center mb-6 max-w-xs text-sm"
          >
            Выживи в зомби-апокалипсисе в своём городе
          </motion.p>
          
          {/* Карточка сохранённой сессии */}
          {canResume && savedSession && (
            <motion.div
              initial={{ y: 20, opacity: 0 }}
              animate={{ y: 0, opacity: 1 }}
              transition={{ delay: 0.45 }}
              className="w-full max-w-xs bg-zinc-800/80 rounded-2xl p-4 mb-6 border border-green-500/30"
            >
              <div className="flex items-center gap-2 mb-3">
                <Shield className="w-5 h-5 text-green-500" />
                <span className="text-green-400 font-bold text-sm">Сохранённая игра</span>
              </div>
              
              <div className="space-y-2">
                <div className="flex justify-between items-center">
                  <span className="text-zinc-400 text-xs">Выживаю:</span>
                  <span className="text-white font-bold text-sm">
                    {formatTimeFull(savedSession.survival_time_seconds)}
                  </span>
                </div>
                
                <div className="flex justify-between items-center">
                  <span className="text-zinc-400 text-xs">Здоровье:</span>
                  <div className="flex items-center gap-2">
                    <div className="w-16 h-2 bg-zinc-700 rounded-full overflow-hidden">
                      <div 
                        className="h-full bg-gradient-to-r from-red-500 to-red-400"
                        style={{ width: `${(savedSession.player_hp / savedSession.max_hp) * 100}%` }}
                      />
                    </div>
                    <span className="text-white text-xs font-bold">{savedSession.player_hp}</span>
                  </div>
                </div>
                
                <div className="flex justify-between items-center">
                  <span className="text-zinc-400 text-xs">Энергия:</span>
                  <div className="flex items-center gap-1">
                    {Array.from({ length: savedSession.max_action_points }).map((_, i) => (
                      <div 
                        key={i}
                        className={`w-1.5 h-3 rounded-sm ${i < savedSession.action_points ? 'bg-yellow-500' : 'bg-zinc-700'}`}
                      />
                    ))}
                    <span className="text-white text-xs font-bold ml-1">{savedSession.action_points}</span>
                  </div>
                </div>
                
                {savedCity && (
                  <div className="flex justify-between items-center">
                    <span className="text-zinc-400 text-xs">Локация:</span>
                    <div className="flex items-center gap-1">
                      <MapPin className="w-3 h-3 text-blue-400" />
                      <span className="text-blue-400 text-xs font-medium">{savedCity}</span>
                    </div>
                  </div>
                )}
              </div>
            </motion.div>
          )}
          
          {/* Статистика */}
          {stats && !canResume && (
            <motion.div
              initial={{ y: 20, opacity: 0 }}
              animate={{ y: 0, opacity: 1 }}
              transition={{ delay: 0.5 }}
              className="flex gap-4 mb-6"
            >
              <div className="bg-zinc-800/80 rounded-2xl p-4 text-center min-w-[100px]">
                <Skull className="w-6 h-6 text-red-500 mx-auto mb-2" />
                <span className="text-white font-black text-2xl block">{stats.total_deaths}</span>
                <span className="text-zinc-500 text-xs">смертей</span>
              </div>
              <div className="bg-zinc-800/80 rounded-2xl p-4 text-center min-w-[100px]">
                <Timer className="w-6 h-6 text-green-500 mx-auto mb-2" />
                <span className="text-white font-black text-xl block">
                  {StatsService.formatSurvivalTime(stats.best_survival_time_seconds)}
                </span>
                <span className="text-zinc-500 text-xs">рекорд</span>
              </div>
            </motion.div>
          )}
          
          {/* Кнопки */}
          <motion.div
            initial={{ y: 20, opacity: 0 }}
            animate={{ y: 0, opacity: 1 }}
            transition={{ delay: 0.6 }}
            className="flex flex-col gap-3 w-full max-w-xs"
          >
            {/* Если есть сохранение — Продолжить главная кнопка */}
            {canResume ? (
              <>
                <button
                  onClick={resumeGame}
                  disabled={isLoading}
                  className="w-full py-4 bg-gradient-to-r from-green-600 to-lime-500 rounded-2xl font-black text-white text-lg flex items-center justify-center gap-2 active:scale-95 transition-transform disabled:opacity-50"
                >
                  <Play className="w-5 h-5" />
                  {isLoading ? 'Загрузка...' : 'Продолжить'}
                </button>
                
                <button
                  onClick={startGame}
                  disabled={isLoading}
                  className="w-full py-3 bg-zinc-800 rounded-2xl font-bold text-zinc-400 text-sm flex items-center justify-center gap-2 active:scale-95 transition-transform disabled:opacity-50"
                >
                  Начать заново
                </button>
              </>
            ) : (
              <>
                <button
                  onClick={startGame}
                  disabled={isLoading}
                  className="w-full py-4 bg-gradient-to-r from-green-600 to-lime-500 rounded-2xl font-black text-white text-lg flex items-center justify-center gap-2 active:scale-95 transition-transform disabled:opacity-50"
                >
                  <Play className="w-5 h-5" />
                  {isLoading ? 'Загрузка...' : 'Новая игра'}
                </button>
              </>
)}
            </motion.div>
          </div>
          
          {/* Админ-панель */}
          <AnimatePresence>
            {showAdmin && <ZombieAdmin onClose={() => setShowAdmin(false)} />}
          </AnimatePresence>
        </motion.div>
      );
    }

    // Экран смерти
  if (screen === 'dead') {
    return (
      <motion.div
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        exit={{ opacity: 0 }}
        className="fixed inset-0 z-[200] bg-zinc-900 flex flex-col items-center justify-center p-6"
      >
        <div className="absolute inset-0 bg-red-900/20" />
        
        <motion.div
          initial={{ scale: 0.5, opacity: 0 }}
          animate={{ scale: 1, opacity: 1 }}
          transition={{ type: 'spring' }}
          className="relative text-center"
        >
          <div className="w-24 h-24 bg-red-500/20 rounded-full flex items-center justify-center mx-auto mb-6">
            <Skull className="w-12 h-12 text-red-500" />
          </div>
          
          <h1 className="text-3xl font-black text-red-500 mb-2">ВЫ ПОГИБЛИ</h1>
          <p className="text-zinc-400 mb-6 max-w-xs">{deathMessage}</p>
          
          {stats && (
            <div className="bg-zinc-800/50 rounded-2xl p-4 mb-6">
              <p className="text-zinc-500 text-sm mb-2">Ваш рекорд:</p>
              <p className="text-white font-black text-2xl">
                {StatsService.formatSurvivalTime(stats.best_survival_time_seconds)}
              </p>
            </div>
          )}
          
          <div className="flex flex-col gap-3">
            <button
              onClick={startGame}
              className="py-4 px-8 bg-gradient-to-r from-green-600 to-lime-500 rounded-2xl font-black text-white active:scale-95 transition-transform"
            >
              Попробовать снова
            </button>
            <button
              onClick={onExit}
              className="py-3 px-8 text-zinc-400 font-bold"
            >
              Выйти
            </button>
          </div>
        </motion.div>
      </motion.div>
    );
  }

  // Экран успешной эвакуации
  if (screen === 'extracted') {
    return (
      <motion.div
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        exit={{ opacity: 0 }}
        className="fixed inset-0 z-[200] bg-zinc-900 flex flex-col items-center justify-center p-6"
      >
        <div className="absolute inset-0 bg-cyan-900/20" />
        <div className="absolute inset-0 overflow-hidden">
          <div className="absolute top-1/4 left-1/4 w-96 h-96 bg-cyan-500/10 rounded-full blur-3xl animate-pulse" />
          <div className="absolute bottom-1/4 right-1/4 w-80 h-80 bg-teal-500/10 rounded-full blur-3xl animate-pulse" />
        </div>
        
        <motion.div
          initial={{ scale: 0.5, opacity: 0, y: 50 }}
          animate={{ scale: 1, opacity: 1, y: 0 }}
          transition={{ type: 'spring', damping: 15 }}
          className="relative text-center"
        >
          <motion.div 
            className="w-28 h-28 bg-gradient-to-br from-cyan-500 to-teal-400 rounded-full flex items-center justify-center mx-auto mb-6 shadow-2xl shadow-cyan-500/50"
            initial={{ rotate: -10 }}
            animate={{ rotate: 10 }}
            transition={{ repeat: Infinity, repeatType: 'reverse', duration: 2 }}
          >
            <span className="text-5xl">🚁</span>
          </motion.div>
          
          <h1 className="text-3xl font-black text-cyan-400 mb-2">ЭВАКУАЦИЯ УСПЕШНА!</h1>
          <p className="text-zinc-400 mb-6 max-w-xs">Вы успешно выжили и добрались до точки эвакуации!</p>
          
          <div className="bg-zinc-800/80 rounded-2xl p-4 mb-6 border border-cyan-500/30">
            <p className="text-zinc-500 text-sm mb-2">Время выживания:</p>
            <p className="text-cyan-400 font-black text-3xl">
              {formatTimeFull(survivalTime)}
            </p>
          </div>
          
          {stats && (
            <div className="bg-zinc-800/50 rounded-2xl p-4 mb-6">
              <p className="text-zinc-500 text-sm mb-2">Ваш лучший рекорд:</p>
              <p className="text-white font-black text-xl">
                {StatsService.formatSurvivalTime(stats.best_survival_time_seconds)}
              </p>
            </div>
          )}
          
          <div className="flex flex-col gap-3">
            <button
              onClick={startGame}
              className="py-4 px-8 bg-gradient-to-r from-cyan-600 to-teal-500 rounded-2xl font-black text-white active:scale-95 transition-transform shadow-lg shadow-cyan-500/30"
            >
              Играть снова
            </button>
            <button
              onClick={onExit}
              className="py-3 px-8 text-zinc-400 font-bold"
            >
              Выйти
            </button>
          </div>
        </motion.div>
      </motion.div>
    );
  }

  // Предупреждение о выходе
  if (screen === 'exit_warning') {
    return (
      <motion.div
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        exit={{ opacity: 0 }}
        className="fixed inset-0 z-[200] bg-zinc-900/95 flex items-center justify-center p-6"
      >
        <div className="bg-zinc-800 rounded-3xl p-6 max-w-sm text-center">
          <div className="w-16 h-16 bg-amber-500/20 rounded-full flex items-center justify-center mx-auto mb-4">
            <AlertTriangle className="w-8 h-8 text-amber-500" />
          </div>
          
          <h2 className="text-xl font-black text-white mb-2">Внимание!</h2>
          <p className="text-zinc-400 text-sm mb-6">
            Вы не в безопасной зоне! Если вы выйдете сейчас, зомби могут вас найти и съесть.
          </p>
          
          <div className="flex flex-col gap-2">
            <button
              onClick={() => setScreen('playing')}
              className="py-3 bg-green-600 rounded-xl font-bold text-white active:scale-95 transition-transform"
            >
              Остаться в игре
            </button>
            <button
              onClick={confirmExit}
              className="py-3 bg-red-600/20 rounded-xl font-bold text-red-400 active:scale-95 transition-transform"
            >
              Выйти (рискнуть)
            </button>
          </div>
        </div>
      </motion.div>
    );
  }

  // Игровой экран
  return (
    <motion.div
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0 }}
      className="fixed inset-0 z-[200] bg-zinc-900 flex flex-col"
      >
        {/* Карта */}
        <div className="flex-1 relative">
          {gameState?.session && (
                <ZombieMap
                  playerPos={currentPosition}
                  zombies={gameState.zombies}
                  worldObjects={gameState.worldObjects}
                  isInSafeZone={gameState.isInSafeZone}
                  playerAvatar={userPhoto}
                  onZombieClick={handleZombieClick}
                  onObjectClick={handleObjectClick}
                  extractionUnlocksIn={gameState.extractionUnlocksIn}
                />
              )}
              
          {/* Оверлей обработки хода */}
          <AnimatePresence>
            {moveStep && (
              <motion.div
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                exit={{ opacity: 0 }}
                className="absolute inset-0 bg-black/70 backdrop-blur-sm z-50 flex flex-col items-center justify-center"
              >
                <div className="bg-zinc-900/95 rounded-3xl p-6 mx-4 max-w-sm w-full border border-zinc-700 shadow-2xl">
                  {/* Заголовок */}
                  <div className="text-center mb-6">
                    <motion.div
                      animate={{ rotate: 360 }}
                      transition={{ duration: 2, repeat: Infinity, ease: "linear" }}
                      className="inline-block text-4xl mb-2"
                    >
                      {MOVE_STEPS.find(s => s.step === moveStep)?.icon || '⏳'}
                    </motion.div>
                    <h3 className="text-white font-bold text-lg">
                      {MOVE_STEPS.find(s => s.step === moveStep)?.label || 'Обработка...'}
                    </h3>
                  </div>
                  
                  {/* Прогресс шагов */}
                  <div className="space-y-3">
                    {MOVE_STEPS.map((step, index) => {
                      const currentIndex = MOVE_STEPS.findIndex(s => s.step === moveStep);
                      const isCompleted = index < currentIndex;
                      const isCurrent = step.step === moveStep;
                      const isPending = index > currentIndex;
                      
                      return (
                        <motion.div
                          key={step.step}
                          initial={{ opacity: 0, x: -20 }}
                          animate={{ 
                            opacity: isPending ? 0.4 : 1, 
                            x: 0,
                            scale: isCurrent ? 1.02 : 1
                          }}
                          transition={{ delay: index * 0.05 }}
                          className={`flex items-center gap-3 p-2 rounded-xl transition-colors ${
                            isCurrent ? 'bg-yellow-500/20 border border-yellow-500/50' : 
                            isCompleted ? 'bg-green-500/10' : ''
                          }`}
                        >
                          <div className={`w-8 h-8 rounded-full flex items-center justify-center text-lg ${
                            isCompleted ? 'bg-green-500/30' :
                            isCurrent ? 'bg-yellow-500/30' :
                            'bg-zinc-700/50'
                          }`}>
                            {isCompleted ? '✓' : step.icon}
                          </div>
                          <span className={`text-sm font-medium ${
                            isCompleted ? 'text-green-400' :
                            isCurrent ? 'text-yellow-400' :
                            'text-zinc-500'
                          }`}>
                            {step.label.replace('...', '')}
                          </span>
                          {isCurrent && (
                            <motion.div
                              animate={{ opacity: [0.5, 1, 0.5] }}
                              transition={{ duration: 1, repeat: Infinity }}
                              className="ml-auto"
                            >
                              <div className="w-2 h-2 bg-yellow-400 rounded-full" />
                            </motion.div>
                          )}
                        </motion.div>
                      );
                    })}
                  </div>
                </div>
              </motion.div>
            )}
          </AnimatePresence>
        
        {/* Верхний HUD */}
        <div className="absolute top-4 left-4 right-4 flex justify-between items-start">
          {/* HP и AP */}
          <div className="bg-zinc-900/90 backdrop-blur rounded-2xl p-3 space-y-2">
            {/* HP */}
            <div className="flex items-center gap-2">
              <Heart className="w-5 h-5 text-red-500" />
              <div className="w-24 h-2 bg-zinc-700 rounded-full overflow-hidden">
                <div 
                  className="h-full bg-gradient-to-r from-red-500 to-red-400 transition-all"
                  style={{ width: `${(gameState?.session?.player_hp || 0) / GAME_CONSTANTS.MAX_HP * 100}%` }}
                />
              </div>
              <span className="text-white text-sm font-bold">{gameState?.session?.player_hp || 0}</span>
            </div>
            
            {/* AP */}
            <div className="flex items-center gap-2">
              <Zap className="w-5 h-5 text-yellow-500" />
              <div className="flex gap-1">
                {Array.from({ length: GAME_CONSTANTS.MAX_AP }).map((_, i) => (
                  <div 
                    key={i}
                    className={`w-2 h-4 rounded-sm ${i < currentAP ? 'bg-yellow-500' : 'bg-zinc-700'}`}
                  />
                ))}
              </div>
              <span className="text-white text-sm font-bold">{currentAP}</span>
            </div>
          </div>
          
          {/* Кнопка выхода справа */}
          <button
            onClick={handleExit}
            className="w-12 h-12 bg-zinc-900/90 backdrop-blur rounded-xl flex items-center justify-center text-zinc-400"
          >
            <X className="w-5 h-5" />
          </button>
        </div>
        
        {/* Статус безопасной зоны */}
        {gameState?.isInSafeZone && (
          <div className={`absolute top-20 left-1/2 -translate-x-1/2 ${gameState.isExtractionCamp ? 'bg-cyan-500/90' : 'bg-green-500/90'} backdrop-blur px-4 py-2 rounded-full flex items-center gap-2`}>
            <Shield className="w-4 h-4 text-white" />
            <span className="text-white text-sm font-bold">
              {gameState.isExtractionCamp ? 'Точка эвакуации' : 'Безопасная зона'}
            </span>
          </div>
        )}
        
        {/* Индикатор extraction camp (если заблокирован) */}
        {gameState?.extractionLocked && gameState.extractionUnlocksIn !== undefined && gameState.extractionUnlocksIn > 0 && (
          <div className="absolute top-20 left-1/2 -translate-x-1/2 bg-zinc-800/90 backdrop-blur px-4 py-2 rounded-full flex items-center gap-2 border border-red-500/50">
            <span className="text-red-400 text-sm font-bold">
              Эвакуация через {gameState.extractionUnlocksIn} ходов
            </span>
          </div>
        )}
        
{/* Время выживания */}
            <div className="absolute bottom-24 left-4 bg-zinc-900/90 backdrop-blur rounded-xl px-3 py-2">
              <div className="flex items-center gap-2">
                <Timer className="w-4 h-4 text-green-500" />
                <span className="text-white text-sm font-bold">
                  {formatTime(survivalTime, !!gameState?.session?.first_move_at)}
                </span>
              </div>
            </div>
        
        {/* Лог событий (swipe to dismiss) */}
        <div className="absolute bottom-24 right-4 w-48">
          <AnimatePresence>
            {events.slice(0, 3).map((event, i) => (
              <motion.div
                key={event.timestamp + i}
                initial={{ opacity: 0, x: 20 }}
                animate={{ opacity: 1, x: 0 }}
                exit={{ opacity: 0, x: 100 }}
                drag="x"
                dragConstraints={{ left: 0, right: 0 }}
                dragElastic={0.5}
                onDragEnd={(_, info) => {
                  if (info.offset.x > 50) {
                    setEvents(prev => prev.filter(e => e.timestamp !== event.timestamp));
                  }
                }}
                className={`bg-zinc-900/90 backdrop-blur rounded-lg px-3 py-2 mb-2 text-xs cursor-grab active:cursor-grabbing ${
                  event.type === 'zombie_attack' ? 'border border-red-500/50' :
                  event.type === 'resource_found' ? 'border border-green-500/50' :
                  event.type === 'entered_safe_zone' ? 'border border-blue-500/50' :
                  event.type === 'warning' ? 'border border-amber-500/50' :
                  event.type === 'zombie_educated' ? 'border border-purple-500/50' :
                  event.type === 'book_received' ? 'border border-indigo-500/50' :
                  'border border-zinc-700/50'
                }`}
              >
                <span className="text-zinc-300">{event.message}</span>
              </motion.div>
            ))}
          </AnimatePresence>
        </div>
      </div>
      
      {/* Нижняя панель */}
          <div className="bg-zinc-900 border-t border-zinc-800 p-4 pb-8">
            <div className="flex gap-3">
              {/* Кнопка эвакуации (если в extraction camp и разблокировано) */}
              {gameState?.isExtractionCamp && !gameState.extractionLocked ? (
                <button
                  onClick={handleExtract}
                  disabled={isLoading}
                  className="flex-1 py-4 rounded-2xl font-black text-lg flex items-center justify-center gap-2 bg-gradient-to-r from-cyan-600 to-teal-500 text-white active:scale-95 transition-all shadow-lg shadow-cyan-500/30"
                >
                  <span className="text-xl">🚁</span>
                  {isLoading ? 'Эвакуация...' : 'Эвакуироваться'}
                </button>
              ) : (
                /* Кнопка хода */
                <div className="flex-1 relative">
                  <button
                    onClick={makeMove}
                    disabled={isLoading || currentAP < 1}
                    className={`w-full py-4 rounded-2xl font-black text-lg flex items-center justify-center gap-2 transition-all relative overflow-hidden ${
                      currentAP >= 1 
                        ? 'bg-gradient-to-r from-green-600 to-lime-500 text-white active:scale-95' 
                        : 'bg-zinc-800 text-zinc-500'
                    }`}
                  >
                    {/* Индикатор восстановления AP */}
                    {currentAP < GAME_CONSTANTS.MAX_AP && currentAP < 1 && (
                      <div 
                        className="absolute inset-0 bg-gradient-to-r from-yellow-500/30 to-amber-400/30 transition-all duration-1000"
                        style={{ width: `${apRegenProgress}%` }}
                      />
                    )}
                    <span className="relative z-10 flex items-center gap-2">
                      <Footprints className="w-5 h-5" />
                      {isLoading ? 'Ход...' : currentAP < 1 ? 'Восстановление...' : 'Сделать ход'}
                    </span>
                  </button>
                  {/* Прогресс бар под кнопкой */}
                  {currentAP < 1 && (
                    <div className="mt-2 h-1.5 bg-zinc-700 rounded-full overflow-hidden">
                      <motion.div 
                        className="h-full bg-gradient-to-r from-yellow-500 to-amber-400"
                        initial={{ width: 0 }}
                        animate={{ width: `${apRegenProgress}%` }}
                        transition={{ duration: 0.3 }}
                      />
                    </div>
                  )}
                </div>
              )}
              
              {/* Кнопка Инвентаря */}
              <button
                onClick={() => setShowInventory(true)}
                className="w-14 h-14 bg-zinc-800 rounded-2xl flex flex-col items-center justify-center text-zinc-300 active:scale-95 transition-transform"
              >
                <Package className="w-5 h-5" />
                <span className="text-[10px] font-bold">{inventory.length}</span>
              </button>
            </div>
          </div>
        
        {/* Индикаторы направления зомби (фонарик) */}
        <AnimatePresence>
          {flashlightActive && distantZombies.length > 0 && (
            <motion.div
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              className="absolute top-32 left-4 right-4"
            >
              <div className="bg-zinc-900/95 backdrop-blur rounded-2xl p-3 border border-yellow-500/30">
                <div className="flex items-center gap-2 mb-2">
                  <Flashlight className="w-4 h-4 text-yellow-400" />
                  <span className="text-yellow-400 text-xs font-bold">Обнаружены зомби ({distantZombies.length})</span>
                </div>
                <div className="space-y-1 max-h-32 overflow-y-auto">
                  {distantZombies.slice(0, 5).map((zombie, i) => (
                    <div key={zombie.id} className="flex items-center justify-between text-xs">
                      <div className="flex items-center gap-2">
                        <Navigation 
                          className="w-4 h-4 text-red-400" 
                          style={{ transform: `rotate(${zombie.direction}deg)` }}
                        />
                        <span className="text-zinc-300">
                          {getDirectionName(zombie.direction)} • {Math.round(zombie.distance)}м
                        </span>
                      </div>
                      <span className={`text-xs font-bold ${zombie.is_hunting ? 'text-red-400' : 'text-zinc-500'}`}>
                        {zombie.is_hunting ? 'Охотится!' : 'Бродит'}
                      </span>
                    </div>
                  ))}
                </div>
              </div>
            </motion.div>
          )}
        </AnimatePresence>
      
      {/* Модал инвентаря */}
      <AnimatePresence>
        {showInventory && !selectedItem && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="fixed inset-0 z-[210] bg-black/80 flex items-end justify-center"
            onClick={() => setShowInventory(false)}
          >
            <motion.div
              initial={{ y: '100%' }}
              animate={{ y: 0 }}
              exit={{ y: '100%' }}
              className="bg-zinc-900 rounded-t-3xl p-6 w-full max-w-md"
              onClick={e => e.stopPropagation()}
            >
              <div className="flex items-center justify-between mb-4">
                <h3 className="text-xl font-black text-white">Инвентарь</h3>
                <button onClick={() => setShowInventory(false)}>
                  <X className="w-6 h-6 text-zinc-400" />
                </button>
              </div>
              
              {inventory.length === 0 ? (
                <p className="text-zinc-500 text-center py-8">Инвентарь пуст</p>
              ) : (
                <div className="grid grid-cols-4 gap-3">
                  {inventory.map(item => {
                    // Для книг показываем эмодзи из BOOKS
                    let emoji = '📦';
                    if (item.type === 'medkit') emoji = '💊';
                    else if (item.type === 'food') emoji = '🥫';
                    else if (item.type === 'water') emoji = '💧';
                    else if (item.type === 'flashlight') emoji = '🔦';
                    else if (item.type === 'book' && item.book_id) {
                      const bookInfo = BOOKS.find(b => b.id === item.book_id);
                      emoji = bookInfo?.emoji || '📕';
                    }
                    
                    return (
                      <button 
                        key={item.id}
                        onClick={() => setSelectedItem(item)}
                        className={`bg-zinc-800 rounded-xl p-3 text-center active:scale-95 transition-transform ${item.type === 'book' ? 'border border-purple-500/30' : ''}`}
                      >
                        <span className="text-2xl block mb-1">{emoji}</span>
                        <span className="text-white text-xs font-bold block truncate">{item.name}</span>
                        <span className="text-zinc-400 text-[10px]">x{item.quantity}</span>
                      </button>
                    );
                  })}
                </div>
              )}
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>
      
      {/* Модал детального просмотра предмета */}
      <AnimatePresence>
        {selectedItem && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="fixed inset-0 z-[220] bg-black/80 flex items-center justify-center p-6"
            onClick={() => setSelectedItem(null)}
          >
            <motion.div
              initial={{ scale: 0.9, opacity: 0 }}
              animate={{ scale: 1, opacity: 1 }}
              exit={{ scale: 0.9, opacity: 0 }}
              className="bg-zinc-900 rounded-3xl p-6 w-full max-w-sm"
              onClick={e => e.stopPropagation()}
            >
              {(() => {
                const item = selectedItem;
                const { description, canUse, actionText } = getItemDescription(item);
                
                // Получить emoji
                let emoji = '📦';
                if (item.type === 'medkit') emoji = '💊';
                else if (item.type === 'food') emoji = '🥫';
                else if (item.type === 'water') emoji = '💧';
                else if (item.type === 'flashlight') emoji = '🔦';
                else if (item.type === 'book' && item.book_id) {
                  const bookInfo = BOOKS.find(b => b.id === item.book_id);
                  emoji = bookInfo?.emoji || '📕';
                }
                
                // Цвет в зависимости от типа
                const colorClass = item.type === 'medkit' ? 'bg-red-500/20 text-red-400' :
                  item.type === 'flashlight' ? 'bg-yellow-500/20 text-yellow-400' :
                  item.type === 'book' ? 'bg-purple-500/20 text-purple-400' :
                  item.type === 'food' ? 'bg-orange-500/20 text-orange-400' :
                  item.type === 'water' ? 'bg-blue-500/20 text-blue-400' :
                  'bg-zinc-700 text-zinc-300';
                
                return (
                  <div className="text-center">
                    <div className={`w-20 h-20 ${colorClass} rounded-full flex items-center justify-center mx-auto mb-4`}>
                      <span className="text-4xl">{emoji}</span>
                    </div>
                    
                    <h3 className="text-xl font-black text-white mb-1">{item.name}</h3>
                    <span className="text-zinc-500 text-sm">x{item.quantity}</span>
                    
                    <p className="text-zinc-400 text-sm mt-4 mb-6">{description}</p>
                    
                    <div className="flex gap-3">
                      <button
                        onClick={() => setSelectedItem(null)}
                        className="flex-1 py-3 bg-zinc-800 rounded-xl font-bold text-zinc-400 active:scale-95 transition-transform"
                      >
                        Назад
                      </button>
                      {(item.type === 'medkit' || item.type === 'flashlight') && (
                        <button
                          onClick={() => useItem(item)}
                          disabled={!canUse || isLoading}
                          className={`flex-1 py-3 rounded-xl font-bold active:scale-95 transition-transform disabled:opacity-50 ${
                            item.type === 'medkit' ? 'bg-gradient-to-r from-red-600 to-rose-500 text-white' :
                            item.type === 'flashlight' ? 'bg-gradient-to-r from-yellow-600 to-amber-500 text-white' :
                            'bg-zinc-700 text-zinc-300'
                          }`}
                        >
                          {isLoading ? '...' : actionText}
                        </button>
                      )}
                      {item.type === 'book' && (
                        <button
                          onClick={() => useItem(item)}
                          className="flex-1 py-3 bg-gradient-to-r from-purple-600 to-violet-500 rounded-xl font-bold text-white active:scale-95 transition-transform"
                        >
                          {actionText}
                        </button>
                      )}
                    </div>
                  </div>
                );
              })()}
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>
      
      {/* Диалог подтверждения броска книги */}
      <AnimatePresence>
        {showBookDialog && selectedZombie && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="fixed inset-0 z-[210] bg-black/80 flex items-center justify-center p-6"
            onClick={() => { setShowBookDialog(false); setSelectedZombie(null); }}
          >
            <motion.div
              initial={{ scale: 0.9, opacity: 0 }}
              animate={{ scale: 1, opacity: 1 }}
              exit={{ scale: 0.9, opacity: 0 }}
              className="bg-zinc-900 rounded-3xl p-6 w-full max-w-sm border border-purple-500/30"
              onClick={e => e.stopPropagation()}
            >
              <div className="text-center">
                <div className="w-16 h-16 bg-purple-500/20 rounded-full flex items-center justify-center mx-auto mb-4">
                  <BookOpen className="w-8 h-8 text-purple-400" />
                </div>
                
                <h3 className="text-xl font-black text-white mb-2">Бросить книгу?</h3>
                <p className="text-zinc-400 text-sm mb-6">
                  Вы кинете книгу в зомби и сделаете его умнее. Книга будет потрачена.
                </p>
                
                <div className="flex gap-3">
                  <button
                    onClick={() => { setShowBookDialog(false); setSelectedZombie(null); }}
                    className="flex-1 py-3 bg-zinc-800 rounded-xl font-bold text-zinc-400"
                  >
                    Отмена
                  </button>
                  <button
                    onClick={throwBookAtZombie}
                    disabled={isLoading}
                    className="flex-1 py-3 bg-gradient-to-r from-purple-600 to-violet-500 rounded-xl font-bold text-white active:scale-95 transition-transform disabled:opacity-50"
                  >
                    {isLoading ? '...' : 'Бросить!'}
                  </button>
                </div>
              </div>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>
    </motion.div>
  );
}
