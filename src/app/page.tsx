'use client';

import { useState, useEffect, useMemo, useRef } from 'react';
import dynamic from 'next/dynamic';
import { motion, AnimatePresence } from 'framer-motion';
import {
  Trophy,
  Map as MapIcon,
  History as HistoryIcon,
  Users,
  UserPlus,
  RefreshCcw,
  Target,
  ChevronRight,
  ChevronUp,
  ChevronDown,
  CheckCircle2,
  School,
  Library,
  GraduationCap,
  Gem,
  LocateFixed,
  MapPin,
  Clock,
  Mic2,
  Palette,
  Eye,
  ShieldOff,
  ShieldCheck,
  UserMinus,
  Ban,
  Trash2,
  X,
  Bell,
  MessageCircle,
  Mail,
  Settings,
  Gamepad2,
  Pencil,
  Footprints,
  Info,
  Skull,
  Timer,
  BookOpen,
  Search,
  Radar,
  BookA,
  Landmark,
  Pyramid,
  Lock,
  EyeOff } from
'lucide-react';
import * as Switch from '@radix-ui/react-switch';
import bridge from '@vkontakte/vk-bridge';
import { useVKBridge, getRawLaunchParams } from '@/lib/vk-context';
import { UmnicoinService, UserStats, Location } from '@/lib/umnicoin-service';
import { FriendService, FriendProfile } from '@/lib/friend-service';
import { PermissionService } from '@/lib/permission-service';
import { StatsService, ZombieStats } from '@/lib/zombie';
import { clsx, type ClassValue } from 'clsx';
import { twMerge } from 'tailwind-merge';

function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}

/** "Имя Ф." — truncates long first names with ellipsis */
function formatName(firstName?: string, lastName?: string, maxFirstLen = 12): string {
  const first = firstName || '';
  const short = first.length > maxFirstLen ? first.slice(0, maxFirstLen - 1) + '…' : first;
  const lastInitial = lastName?.[0] ? ` ${lastName[0]}.` : '';
  return `${short}${lastInitial}`;
}

/** Full name if short enough, otherwise falls back to formatName */
function formatFullName(firstName?: string, lastName?: string, maxTotal = 20): string {
  const full = `${firstName || ''} ${lastName || ''}`.trim();
  return full.length <= maxTotal ? full : formatName(firstName, lastName);
}

const Map = dynamic(() => import('@/components/Map'), {
  ssr: false,
  loading: () => <div className="h-full w-full bg-zinc-100 animate-pulse flex items-center justify-center">Загрузка карты...</div>
});

const ZombieMode = dynamic(() => import('@/components/ZombieMode'), {
  ssr: false,
  loading: () => <div className="fixed inset-0 bg-black flex items-center justify-center z-[100]"><span className="text-green-500 text-xl">Загрузка зомби-режима...</span></div>
});

const RED_SQUARE: [number, number] = [55.7539, 37.6208];

type Tab = 'main' | 'quests' | 'history' | 'rating' | 'friends' | 'wallet';

const KNOWLEDGE_CATEGORIES = [
{
  id: 'Образовательные учреждения',
  name: 'Образование',
  desc: 'Школы, вузы, колледжи',
  icon: <GraduationCap className="w-6 h-6" />,
  reward: 5,
  gradient: 'from-blue-500 to-indigo-600',
  bg: 'bg-blue-50'
},
{
  id: 'Библиотека',
  name: 'Библиотеки',
  desc: 'Центры знаний и книг',
  icon: <BookA className="w-6 h-6" />,
  reward: 5,
  gradient: 'from-violet-500 to-purple-600',
  bg: 'bg-violet-50'
},
{
  id: 'Музей',
  name: 'Музеи',
  desc: 'История и культура',
  icon: <Landmark className="w-6 h-6" />,
  reward: 5,
  gradient: 'from-pink-500 to-rose-600',
  bg: 'bg-pink-50'
},
{
  id: 'Памятник',
  name: 'Памятники',
  desc: 'История и наследие',
  icon: <Pyramid className="w-6 h-6" />,
  reward: 5,
  gradient: 'from-orange-500 to-amber-600',
  bg: 'bg-orange-50'
}];


const AVATAR_PLACEHOLDER = 'https://slelguoygbfzlpylpxfs.supabase.co/storage/v1/render/image/public/project-uploads/7cd6342b-7128-4406-883d-82fa7d09a389/unnamed-1769990678038.jpg?width=8000&height=8000&resize=contain';

export default function Home() {
  const { user, initialized } = useVKBridge();
  const [activeTab, setActiveTab] = useState<Tab>('main');
  const [stats, setStats] = useState<UserStats>(UmnicoinService.getDefaultStats());
  const [userPos, setUserPos] = useState<[number, number]>(RED_SQUARE);
  const [locations, setLocations] = useState<Location[]>([]);
  const [nearest, setNearest] = useState<{location: Location;distance: number;} | null>(null);
  const [message, setMessage] = useState<string | null>(null);
  const [messageType, setMessageType] = useState<'info' | 'error'>('info');
  const [isExpanded, setIsExpanded] = useState(true);
  const [showPermission, setShowPermission] = useState(false);
  const [showSuccess, setShowSuccess] = useState(false);
  const [isScanning, setIsScanning] = useState(false);
  const isScanningRef = useRef(false);
  const [scanResults, setScanResults] = useState<{id: string ; status: 'scanning' | 'success' | 'fail' | 'cooldown' ; message?: string ; remainingMin?: number ; }[]>([]) ; 
  const [showScanModal, setShowScanModal] = useState(false);
  const [scanTotalCoins, setScanTotalCoins] = useState(0);
  const [scanDone, setScanDone] = useState(false);
  const [mapPulse, setMapPulse] = useState(false);
  const [pendingCategory, setPendingCategory] = useState<string | null>(null);
  const [successData, setSuccessData] = useState<{message: string;coins: number;} | null>(null);
  const [geoPermissionGranted, setGeoPermissionGranted] = useState<boolean>(false);
  const [isGeoActive, setIsGeoActive] = useState(false);
  const [geoHint, setGeoHint] = useState<string | null>(null);
  const [following, setFollowing] = useState<FriendProfile[]>([]);
  const [followers, setFollowers] = useState<FriendProfile[]>([]);
  const [isRefreshingFriends, setIsRefreshingFriends] = useState(false);
  const [pendingUnfollowFriend, setPendingUnfollowFriend] = useState<FriendProfile | null>(null);
  const [selectedFriend, setSelectedFriend] = useState<FriendProfile | null>(null);
  const [selectedFriendStats, setSelectedFriendStats] = useState<{balance: number;history: any[];isPrivate?: boolean;} | null>(null);
  const [selectedLocation, setSelectedLocation] = useState<any | null>(null);
  const [selectedLocationStats, setSelectedLocationStats] = useState<{totalVisits: number; userHasVisited: boolean; recentVisitors: any[];} | null>(null);
  const [isLoadingLocation, setIsLoadingLocation] = useState(false);
  const [isPrivate, setIsPrivate] = useState(false);
  const [mapTarget, setMapTarget] = useState<[number, number] | undefined>(undefined);
  const [ranking, setRanking] = useState<{id: number;name: string;points: number;avatar?: string;isMe?: boolean;}[]>([]);
  const [isLoadingRanking, setIsLoadingRanking] = useState(false);
  const [isRefreshingHistory, setIsRefreshingHistory] = useState(false);
  const [showProfile, setShowProfile] = useState(false);
  const [notificationsEnabled, setNotificationsEnabled] = useState(false);
  const [isAppLoading, setIsAppLoading] = useState(true);
  const [loadingProgress, setLoadingProgress] = useState(0);
  const [showGoalDetails, setShowGoalDetails] = useState<'daily' | 'weekly' | null>(null);
  const [isClaimingGoal, setIsClaimingGoal] = useState(false);
  const [showZombieMode, setShowZombieMode] = useState(false);
  const [zombieStats, setZombieStats] = useState<ZombieStats | null>(null);
    const [zombieLeaderboard, setZombieLeaderboard] = useState<Array<{vk_id: number;first_name: string;last_name: string;photo_200?: string;best_survival_time_seconds: number;}>>([]);

    // GPS check states
    const [geoCheckProgress, setGeoCheckProgress] = useState(0);
    const [geoCheckPhase, setGeoCheckPhase] = useState('');
    const [geoError, setGeoError] = useState<string | null>(null);
    const [isGeoChecking, setIsGeoChecking] = useState(false);

    // Admin states
  const ADMIN_VK_ID = 35645976;
  const [editingUser, setEditingUser] = useState<{id: number;name: string;balance: number;avatar?: string;} | null>(null);
  const [newBalanceValue, setNewBalanceValue] = useState('');
  const [isSavingBalance, setIsSavingBalance] = useState(false);
  const isAdmin = user?.id === ADMIN_VK_ID;

  // Category widget states
  const [selectedCategory, setSelectedCategory] = useState<typeof KNOWLEDGE_CATEGORIES[0] | null>(null);
  const [showTutorial, setShowTutorial] = useState(false);
  const [now, setNow] = useState(0);

  useEffect(() => {
    setNow(Date.now());
    const interval = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(interval);
  }, []);

  useEffect(() => {
    if (typeof window !== 'undefined') {
      setShowTutorial(localStorage.getItem('knowledge_tutorial_dismissed') !== 'true');
    }
  }, []);

  useEffect(() => {
    if (user) {
      StatsService.getStats(user.id).then(setZombieStats);
      StatsService.getTop3Survivors().then(setZombieLeaderboard);
    }
  }, [user, showZombieMode]);

  const handleToggleNotifications = async () => {
    if (!user) return;
    try {
      if (notificationsEnabled) {
        setNotificationsEnabled(false);
        await PermissionService.setNotificationPermission(user.id, false);
        setMessage('Уведомления отключены');
        setMessageType('info');
      } else {
        console.log('[Home] Requesting notifications permission...');
        const data = await bridge.send('VKWebAppAllowNotifications');
        console.log('[Home] VK Bridge Response:', data);

        // VK returns { result: true } or { status: 'success' }
        if (data && (data.result === true || (data as any).status === 'success')) {
          setNotificationsEnabled(true);
          // Don't await this to keep UI snappy
          PermissionService.setNotificationPermission(user.id, true).catch(err => {
            console.error('[Home] Failed to save permission to DB:', err);
          });
          setMessage('Уведомления включены');
          setMessageType('info');
        } else {
          console.warn('[Home] Unexpected response from VK Bridge:', data);
          // If user clicked allow but we didn't get success, try to set true anyway if result is not false
          if (data && (data as any).result !== false) {
             setNotificationsEnabled(true);
             PermissionService.setNotificationPermission(user.id, true).catch(() => {});
          } else {
             setNotificationsEnabled(false);
          }
        }
      }
    } catch (err: any) {
      console.error('[Home] Failed to toggle notifications:', err);
      
      // Error code 1 usually means already allowed or system success
      if (err.error_data?.error_code === 1 || err.error_type === 'client_error' && err.error_data?.error_reason?.includes('already allowed')) {
        setNotificationsEnabled(true);
        PermissionService.setNotificationPermission(user.id, true).catch(() => {});
        setMessage('Уведомления активны');
        setMessageType('info');
      } else if (err.error_data?.error_code === 4 || err.error_data?.error_reason === 'User denied') {
        // User denied permission
        setNotificationsEnabled(false);
        setMessage('Доступ к уведомлениям отклонен');
        setMessageType('error');
      } else {
        // Other error
        setMessage('Не удалось включить уведомления');
        setMessageType('error');
      }
    }
    setTimeout(() => setMessage(null), 3000);
  };

  const handleToggleGeo = async () => {
    if (!user) return;
    const nextVal = !geoPermissionGranted;
    setGeoPermissionGranted(nextVal);
    await PermissionService.setGeoPermission(user.id, nextVal);

    if (nextVal) {
      const pos = await getUserLocation();
      setUserPos(pos);
      setGeoHint(null);
      setMessage('Геолокация включена');
      setMessageType('info');
    } else {
      setIsGeoActive(false);
      setMessage('Геолокация отключена');
      setMessageType('info');
    }
    setTimeout(() => setMessage(null), 3000);
  };

  const refreshData = async () => {
    if (!user) return;
    try {
      console.log('[Home] Refreshing data...');
      await UmnicoinService.syncUserVisits(user.id);
      const updatedStats = UmnicoinService.getUserData();
      console.log('[Home] Data synced, history entries:', updatedStats.history.length);
      setStats(updatedStats);
      const updatedLocations = UmnicoinService.getAllLocations();
      setLocations(updatedLocations);
    } catch (err) {
      console.error('Failed to refresh data:', err);
    }
  };

  const fetchRanking = async () => {
    setIsLoadingRanking(true);
    const data = await UmnicoinService.getRealRanking();
    setRanking(data as any);
    setIsLoadingRanking(false);
  };

  const refreshHistory = async () => {
    if (!user) return;
    setIsRefreshingHistory(true);
    await refreshData();
    setIsRefreshingHistory(false);
  };

  useEffect(() => {
    if (activeTab === 'rating') {
      fetchRanking();
    } else if (activeTab === 'history' || activeTab === 'main') {
      refreshData();
    }
  }, [activeTab]);

  const handleTogglePrivacy = async (val: boolean) => {
    if (!user) return;
    setIsPrivate(val);
    await FriendService.togglePrivacy(user.id, val);
  };

  const handleUnfollowClick = (e: React.MouseEvent, friend: FriendProfile) => {
    e.stopPropagation();
    setPendingUnfollowFriend(friend);
  };

  const confirmUnfollow = async () => {
    if (!user || !pendingUnfollowFriend) return;
    await FriendService.unfollow(user.id, pendingUnfollowFriend.vk_id);
    await refreshFriends();
    setPendingUnfollowFriend(null);
    setMessage('Пользователь удален из списка');
    setTimeout(() => setMessage(null), 3000);
  };

  const cancelUnfollow = () => {
    setPendingUnfollowFriend(null);
  };

  const handleToggleBlock = async (followerId: number, currentBlocked: boolean) => {
    if (!user) return;
    await FriendService.toggleBlockFollower(user.id, followerId, !currentBlocked);
    await refreshFriends();
    setMessage(!currentBlocked ? 'Просмотр запрещен' : 'Просмотр разрешен');
    setMessageType('info');
    setTimeout(() => setMessage(null), 3000);
  };

  const handleHistoryClick = (visit: any) => {
    if (visit.lat && visit.lon) {
      setMapTarget([visit.lat, visit.lon]);
      setActiveTab('main');
      setIsExpanded(true);
      // Clear target after a bit so map can be moved freely again
      setTimeout(() => setMapTarget(undefined), 1000);
    }
  };

  const handleFriendClick = async (friend: FriendProfile) => {
    setSelectedFriend(friend);
    try {
      const historyData = await FriendService.getFriendHistory(friend.vk_id);
      setSelectedFriendStats({
        balance: friend.points || 0,
        history: historyData?.data || [],
        isPrivate: historyData?.is_private || friend.is_private
      });
    } catch (err) {
      console.error('Failed to fetch friend details:', err);
    }
  };

  const handleLocationClick = async (location: any) => {
    setSelectedLocation(location);
    setSelectedLocationStats(null);
    setIsLoadingLocation(true);
    try {
      const headers: Record<string, string> = {};
      const lp = getRawLaunchParams();
      if (lp) headers['X-Launch-Params'] = lp;
      
      const res = await fetch(`/api/place/${location.id}`, { headers });
      const data = await res.json();
      
      if (data.place) {
        setSelectedLocationStats({
          totalVisits: data.totalVisits || 0,
          userHasVisited: data.userHasVisited || false,
          recentVisitors: data.recentVisitors || []
        });
      }
    } catch (err) {
      console.error('Failed to fetch location details:', err);
    } finally {
      setIsLoadingLocation(false);
    }
  };

  const refreshFriends = async () => {
    if (!user) return;
    setIsRefreshingFriends(true);
    try {
      const [followingData, followersData] = await Promise.all([
      FriendService.getFollowing(user.id),
      FriendService.getFollowers(user.id)]
      );
      setFollowing(followingData);
      setFollowers(followersData);
    } catch (err) {
      console.error('Failed to refresh friends:', err);
    } finally {
      setIsRefreshingFriends(false);
    }
  };

  const handleAddFriend = async () => {
    if (!user) return;
    try {
      const data = await bridge.send('VKWebAppGetFriends', { multi: true });
      if (data && data.users && data.users.length > 0) {
        // Get existing following IDs to filter duplicates
        const existingFollowingIds = new Set(following.map(f => f.vk_id));
        
        // Filter out already following friends
        const newFriends = data.users.filter((friend: any) => !existingFollowingIds.has(friend.id));
        const duplicateCount = data.users.length - newFriends.length;
        
        if (newFriends.length === 0) {
          setMessage(duplicateCount > 0 
            ? `${duplicateCount} друг(ей) уже в вашем списке` 
            : 'Нет новых друзей для добавления');
          setMessageType('info');
          setTimeout(() => setMessage(null), 3000);
          return;
        }
        
        // Create skeleton friends - show immediately as loading
        const skeletonFriends: FriendProfile[] = newFriends.map((friend: any) => ({
          vk_id: friend.id,
          first_name: friend.first_name,
          last_name: friend.last_name,
          photo_200: friend.photo_200,
          is_loading: true,
          points: 0,
          is_private: false
        }));
        
        // Add skeletons to list immediately
        setFollowing(prev => [...prev, ...skeletonFriends]);
        
        // Save in background
        (async () => {
          try {
            for (const friend of newFriends) {
              await FriendService.ensureProfile({
                vk_id: friend.id,
                first_name: friend.first_name,
                last_name: friend.last_name,
                photo_200: friend.photo_200,
                photo_100: friend.photo_100
              });
              await FriendService.followFriend(user.id, friend.id);
            }
            await refreshFriends();
          } catch (err) {
            console.error('Failed to save friends:', err);
          }
        })();
        
        let message = `Добавлено друзей: ${newFriends.length}`;
        if (duplicateCount > 0) {
          message += ` (${duplicateCount} уже был${duplicateCount === 1 ? '' : 'о'})`;
        }
        setMessage(message);
        setMessageType('info');
        setTimeout(() => setMessage(null), 3000);
      }
    } catch (err) {
      console.error('Failed to add friends via VK Bridge:', err);
    }
  };

  const getUserLocation = async (): Promise<[number, number]> => {
    // Helper for browser geolocation fallback
    const getBrowserLocation = (): Promise<[number, number]> => {
      return new Promise((resolve) => {
        if (typeof navigator !== 'undefined' && navigator.geolocation) {
          navigator.geolocation.getCurrentPosition(
            (pos) => {
              setIsGeoActive(true);
              resolve([pos.coords.latitude, pos.coords.longitude]);
            },
            () => {
              setIsGeoActive(false);
              resolve(RED_SQUARE);
            },
            { enableHighAccuracy: true, maximumAge: 0, timeout: 10000 }
          );
        } else {
          setIsGeoActive(false);
          resolve(RED_SQUARE);
        }
      });
    };

    try {
      // VK Bridge is the primary way for VK Mini Apps
      console.log('Requesting geodata via VK Bridge...');
      
      // Add timeout for VK Bridge - 5 seconds
      const vkPromise = bridge.send('VKWebAppGetGeodata', {});
      const timeoutPromise = new Promise((_, reject) => 
        setTimeout(() => reject(new Error('VK Bridge timeout')), 5000)
      );
      
      let data: any;
      try {
        data = await Promise.race([vkPromise, timeoutPromise]);
      } catch (vkErr) {
        console.warn('VK Bridge timeout or error, using browser fallback:', vkErr);
        setIsGeoActive(false);
        return getBrowserLocation();
      }

      if (data && data.available && typeof data.lat === 'number' && typeof data.long === 'number') {
        console.log('VK Geodata received:', data.lat, data.long);
        setIsGeoActive(true);
        return [data.lat, data.long];
      }

      console.warn('VK Geodata returned as unavailable:', data);
      setIsGeoActive(false);
      
      // Browser fallback - works on both mobile and desktop
      console.log('Using browser geolocation fallback...');
      return getBrowserLocation();
      
    } catch (err: any) {
      console.error('VK Bridge geodata error:', err);
      setIsGeoActive(false);
      
      // Special handling for user rejection
      if (err.error_data?.error_code === 4) {
        console.warn('User rejected geodata request');
      }
      
      // Try browser fallback as last resort
      return getBrowserLocation();
    }
  };

  useEffect(() => {
    setStats(UmnicoinService.getUserData());
  }, []);

  useEffect(() => {
    if (initialized && user) {
      // 1. Store user ID immediately
      localStorage.setItem('vk_user_id', user.id.toString());

      // 2. Initial setup sequence with progress tracking
      const initApp = async () => {
        setIsAppLoading(true);
        setLoadingProgress(10);

        // Ensure profile exists first (required for FK constraints in other tables)
        await FriendService.ensureProfile({
          vk_id: user.id,
          first_name: user.first_name,
          last_name: user.last_name,
          photo_200: user.photo_200,
          photo_100: user.photo_100
        });
        setLoadingProgress(30);

        // Sync stats and visits (creates stats if missing)
        await UmnicoinService.syncUserVisits(user.id);
        setStats(UmnicoinService.getUserData());
        setLoadingProgress(50);

        // Load privacy setting
        const p = await FriendService.getProfile(user.id);
        if (p) setIsPrivate(!!p.is_private);
        setLoadingProgress(65);

        // Load social data
        await refreshFriends();
        setLoadingProgress(80);

        // Load permissions
        const [notifPerm, geoPerm] = await Promise.all([
        PermissionService.getNotificationPermission(user.id),
        PermissionService.getGeoPermission(user.id)]
        );
        setNotificationsEnabled(notifPerm);
        setGeoPermissionGranted(geoPerm);
        setLoadingProgress(95);

        // Geolocation logic based on permission history
        if (geoPerm) {
          // Returning user who previously granted permission — auto-locate
          try {
            const pos = await getUserLocation();
            if (pos[0] !== RED_SQUARE[0] || pos[1] !== RED_SQUARE[1]) {
              setUserPos(pos);
            } else {
              // Failed to get location — use last known position
              const profile = await FriendService.getProfile(user.id);
              if (profile?.last_lat && profile?.last_lon) {
                setUserPos([profile.last_lat, profile.last_lon]);
              }
              setGeoHint('Не смогли определить Ваше новое местоположение');
            }
          } catch {
            const profile = await FriendService.getProfile(user.id);
            if (profile?.last_lat && profile?.last_lon) {
              setUserPos([profile.last_lat, profile.last_lon]);
            }
            setGeoHint('Не смогли определить Ваше новое местоположение');
          }
        } else {
          // First visit or permission not granted — stay at Moscow center
          setUserPos(RED_SQUARE);
          setGeoHint('Начните Поиск, чтобы обновить Вашу геопозицию');
        }

        // Load ranking if on that tab
        if (activeTab === 'rating') {
          fetchRanking();
        }

        setLoadingProgress(100);

        // Small delay before hiding to show complete state
        setTimeout(() => {
          setIsAppLoading(false);
        }, 300);
      };

      initApp();
    }
  }, [user, initialized]);

  useEffect(() => {
    const found = UmnicoinService.findNearestLocation(userPos[0], userPos[1]);
    setNearest(found);
  }, [userPos]);

  const handleCenterMap = async () => {
    const pos = await getUserLocation();
    setUserPos(pos);
    setActiveTab('main');
    setIsExpanded(true);
    setMapTarget(pos);
    setTimeout(() => setMapTarget(undefined), 1000);
  };

  const handleCheckIn = async () => {
    const result = await UmnicoinService.checkIn(userPos[0], userPos[1]);
    if (result.success) {
      setStats(UmnicoinService.getUserData());
    }
    setMessageType('error');
    setMessage(result.message);
    setTimeout(() => setMessage(null), 3000);
  };

  const startScan = async () => {
    if (!geoPermissionGranted) {
      setPendingCategory('Все категории');
      setShowPermission(true);
      return;
    }

    setGeoHint(null);
    setIsScanning(true);
    isScanningRef.current = true;
    // Pre-check cooldowns instantly (before any async work)
    const cooldownMap: Record<string, number> = {} ; 
    const initialResults = KNOWLEDGE_CATEGORIES.map((c) => {
      const cd = UmnicoinService.getCategoryCooldown(c.id) ; 
      if (cd.onCooldown) {
        cooldownMap[c.id] = cd.remainingMin ; 
        return { id: c.id, status: 'cooldown' as const, message: 'Уже посещено', remainingMin: cd.remainingMin } ; 
      }
      return { id: c.id, status: 'scanning' as const } ; 
    }) ; 
    setScanResults(initialResults) ; 
    setScanTotalCoins(0);
    setScanDone(false);
    setShowScanModal(true);

    const pos = await getUserLocation();
    const [lat, lon] = pos;
    setUserPos(pos);
    setMapTarget(pos);
    setTimeout(() => setMapTarget(undefined), 1000);

    if (!isScanningRef.current) return;

    // Fetch real locations from Overpass API before checking categories
    const fetchedLocations = await UmnicoinService.fetchNearbyRealLocations(lat, lon);
    setLocations(fetchedLocations);



    let totalCoins = 0 ; 
    let successMessages: string[] = [];

    for (let i = 0; i < KNOWLEDGE_CATEGORIES.length; i++) {
      if (!isScanningRef.current) return;

      const cat = KNOWLEDGE_CATEGORIES[i];

        // Skip cooldown categories — already resolved
        if (cooldownMap[cat.id] !== undefined) continue ; 
      await new Promise((r) => setTimeout(r, 300));

      if (!isScanningRef.current) return;

      // Identify nearest place in this category to pass to server
      const categoryMapping: Record<string, string[]> = {
        'Образовательные учреждения': ['Школа', 'Вуз', 'Колледж'],
      };
      const validSubCats = categoryMapping[cat.id] || [cat.id];
      const categoryPlaces = locations.filter(l => validSubCats.includes(l.category));
      
      let nearestOsmId: string | undefined;
      let minDist = 1000;
      
      for (const p of categoryPlaces) {
        const d = UmnicoinService.calculateDistance(lat, lon, p.lat, p.lon);
        if (d < minDist) {
          minDist = d;
          nearestOsmId = p.id.startsWith('osm-') ? p.id : undefined;
        }
      }

      const result = await UmnicoinService.checkInCategory(cat.id, lat, lon, nearestOsmId);

      setScanResults((prev) => prev.map((r) =>
      r.id === cat.id ?
      { id: cat.id, status: result.success ? 'success' : 'fail', message: result.message } :
      r
      ));

      if (result.success) {
        totalCoins += result.coins || 5;
        successMessages.push(result.message);
      }
      setScanTotalCoins(totalCoins);
    }

    await refreshData();
    setScanDone(true);
    setIsScanning(false);
    isScanningRef.current = false;
  };

  const closeScanModal = () => {
    setShowScanModal(false);
    isScanningRef.current = false;
    setIsScanning(false);
    // Trigger pulse echolocation on map
    setMapPulse(true);
    setTimeout(() => setMapPulse(false), 3000);
    // Show success if coins earned
    if (scanTotalCoins > 0) {
      setSuccessData({
        message: `Найдено мест: ${scanResults.filter((r) => r.status === 'success').length}`,
        coins: scanTotalCoins
      });
      setShowSuccess(true);
    }
  };

  const startCategoryVisit = (category: string) => {
    setPendingCategory(category);
    setShowPermission(true);
  };

  const confirmCategoryVisit = async () => {
    if (!pendingCategory || isGeoChecking) return;

    setGeoHint(null);
    setGeoError(null);
    setIsGeoChecking(true);
    setGeoCheckProgress(0);
    setGeoCheckPhase('Запрашиваем доступ...');

    try {
      // Phase 1: Request GPS access via VK Bridge (0-25%)
      const progressInterval = setInterval(() => {
        setGeoCheckProgress(prev => Math.min(prev + 2, 20));
      }, 100);

      let lat: number, lon: number;
      try {
        // Use VK Bridge for geodata (works in VK Mini App)
        const data = await bridge.send('VKWebAppGetGeodata', {});
        
        if (data.available && typeof data.lat === 'number' && typeof data.long === 'number') {
          lat = data.lat;
          lon = data.long;
          setIsGeoActive(true);
        } else {
          // VK says not available - try browser fallback
          throw new Error('VK geodata not available');
        }
      } catch (geoErr: any) {
        clearInterval(progressInterval);
        setIsGeoChecking(false);
        setGeoCheckProgress(0);
        
        // Try browser fallback as last resort
        if (typeof navigator !== 'undefined' && navigator.geolocation) {
          try {
            const pos = await new Promise<GeolocationPosition>((resolve, reject) => {
              navigator.geolocation.getCurrentPosition(resolve, reject, {
                enableHighAccuracy: true,
                timeout: 10000,
                maximumAge: 0
              });
            });
            lat = pos.coords.latitude;
            lon = pos.coords.longitude;
            setIsGeoActive(true);
            setGeoCheckProgress(10);
          } catch (browserErr: any) {
            if (browserErr?.code === 1) {
              setGeoError('Доступ к GPS запрещён. Разрешите доступ к местоположению в настройках браузера/приложения и попробуйте снова.');
            } else if (browserErr?.code === 3) {
              setGeoError('Время ожидания GPS истекло (10 сек). Убедитесь, что GPS включён и попробуйте снова.');
            } else {
              setGeoError('Не удалось определить местоположение. Проверьте, включён ли GPS на устройстве.');
            }
            return;
          }
        } else {
          setGeoError('Геолокация недоступна. Используйте VK Mini App.');
          return;
        }
      }

      clearInterval(progressInterval);
      setGeoCheckProgress(30);
      setGeoCheckPhase('Определяем местоположение...');

      setUserPos([lat, lon]);
      setMapTarget([lat, lon]);
      setTimeout(() => setMapTarget(undefined), 1000);

      // Phase 2: Fetch locations (30-60%)
      setGeoCheckProgress(40);
      setGeoCheckPhase('Проверяем ближайшие места...');
      const fetchedLocations = await UmnicoinService.fetchNearbyRealLocations(lat, lon);
      setLocations(fetchedLocations);
      setGeoCheckProgress(65);

      // Phase 3: Check in (60-90%)
      setGeoCheckPhase('Фиксируем посещение...');
      setGeoCheckProgress(75);
      
      // Find nearest OSM ID for this category
      const categoryMapping: Record<string, string[]> = {
        'Образовательные учреждения': ['Школа', 'Вуз', 'Колледж'],
      };
      const validSubCats = categoryMapping[pendingCategory!] || [pendingCategory!];
      const categoryPlaces = fetchedLocations.filter(l => validSubCats.includes(l.category));
      let nearestOsmId: string | undefined;
      let minDist = 1000;
      for (const p of categoryPlaces) {
        const d = UmnicoinService.calculateDistance(lat, lon, p.lat, p.lon);
        if (d < minDist) {
          minDist = d;
          nearestOsmId = p.id.startsWith('osm-') ? p.id : undefined;
        }
      }

      const result = await UmnicoinService.checkInCategory(pendingCategory!, lat, lon, nearestOsmId);
      setGeoCheckProgress(90);

      // Save permission to DB if granted successfully
      if (user) {
        PermissionService.setGeoPermission(user.id, true).then(() => {
          setGeoPermissionGranted(true);
        });
      }

      // Phase 4: Done (100%)
      setGeoCheckProgress(100);
      setGeoCheckPhase('Готово!');

      await new Promise(r => setTimeout(r, 400));

      setIsGeoChecking(false);
      setGeoCheckProgress(0);
      setShowPermission(false);

      if (result.success) {
        setSuccessData({ message: result.message, coins: result.coins || 5 });
        setShowSuccess(true);
        await refreshData();
      } else {
        setMessage(result.message);
        setMessageType('error');
        setTimeout(() => setMessage(null), 3000);
      }
      setPendingCategory(null);
    } catch (err) {
      setIsGeoChecking(false);
      setGeoCheckProgress(0);
      setGeoError('Произошла непредвиденная ошибка. Попробуйте ещё раз.');
    }
  };

  const handleClaimGoal = async (type: 'daily' | 'weekly') => {
    setIsClaimingGoal(true);
    const result = await UmnicoinService.claimGoal(type);
    setIsClaimingGoal(false);

    if (result.success) {
      await refreshData();
      setSuccessData({ message: result.message, coins: result.coins! });
      setShowGoalDetails(null);
      setShowSuccess(true);
    } else {
      setMessage(result.message);
      setMessageType('error');
      setTimeout(() => setMessage(null), 3000);
    }
  };

  const dailyProgress = Math.min(Math.round(stats.visitsToday / 8 * 100), 100);
  const weeklyProgress = Math.min(Math.round(stats.visitsThisWeek / 40 * 100), 100); // 8 * 5 = 40
  const dailyGoalReached = stats.visitsToday >= 8;
  const weeklyGoalReached = stats.visitsThisWeek >= 40;

  const categoryStats = useMemo(() => {
    const result: Record<string, {count: number;lastVisit: any | null;}> = {};
    const categoryMapping: Record<string, string> = {
      'Школа': 'Образовательные учреждения',
      'Вуз': 'Образовательные учреждения',
      'Колледж': 'Образовательные учреждения',
      'Библиотека': 'Библиотека',
      'Музей': 'Музей',
      'Памятник': 'Памятник'
    };

    const mainCategories = ['Образовательные учреждения', 'Библиотека', 'Музей', 'Памятник'];
    mainCategories.forEach((cat) => {
      result[cat] = { count: 0, lastVisit: null };
    });

    for (const visit of stats.history) {
      const mainCat = categoryMapping[visit.category] || visit.category;
      if (!result[mainCat]) {
        result[mainCat] = { count: 0, lastVisit: null };
      }
      result[mainCat].count += 1;
      if (!result[mainCat].lastVisit || visit.timestamp > result[mainCat].lastVisit.timestamp) {
        result[mainCat].lastVisit = visit;
      }
    }

    return result;
  }, [stats.history]);

  return (
    <div className="flex flex-col h-screen bg-[#F8F9FD] text-zinc-900 font-sans overflow-hidden">
      {/* Loading Progress Bar */}
      <AnimatePresence>
        {isAppLoading &&
        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          className="fixed top-0 left-0 right-0 z-[200]">

            <div className="h-1 bg-zinc-200/50 backdrop-blur-sm">
              <motion.div
              initial={{ width: 0 }}
              animate={{ width: `${loadingProgress}%` }}
              transition={{ duration: 0.3, ease: "easeOut" }}
              className="h-full bg-gradient-to-r from-blue-500 via-indigo-500 to-blue-600 shadow-[0_0_10px_rgba(59,130,246,0.5)]" />

            </div>
            <div className="absolute top-2 left-1/2 -translate-x-1/2">
              <motion.div
              initial={{ opacity: 0, y: -10 }}
              animate={{ opacity: 1, y: 0 }}
              className="bg-white/90 backdrop-blur-xl px-4 py-1.5 rounded-full shadow-lg border border-zinc-100 flex items-center gap-2">

                <div className="w-2 h-2 bg-blue-500 rounded-full animate-pulse" />
                <span className="text-[10px] font-black text-zinc-500 uppercase tracking-widest">
                  Загрузка {loadingProgress}%
                </span>
              </motion.div>
            </div>
          </motion.div>
        }
      </AnimatePresence>

      {/* Floating Header */}
      <div className="fixed top-8 left-4 right-4 z-40">
        <div className="bg-white/70 backdrop-blur-2xl border border-white/50 p-4 rounded-[32px] shadow-[0_8px_32px_rgba(0,0,0,0.08)] flex items-center gap-4">
          <button
            onClick={() => setShowProfile(true)}
            className="relative active:scale-95 transition-transform">

            <img
              src={user?.photo_200 || AVATAR_PLACEHOLDER}
              alt="Avatar"
              className="w-12 h-12 rounded-2xl shadow-inner border-2 border-white object-cover" />

            <div className="absolute -bottom-1 -right-1 bg-white rounded-full p-1 shadow-sm border border-zinc-100">
              <Settings className="w-3 h-3 text-zinc-400" />
            </div>
          </button>
            <div className="flex-1 min-w-0">
              <h2 className="font-extrabold text-zinc-900 leading-tight truncate">
                {user ? formatFullName(user.first_name, user.last_name) : 'Загрузка...'}
              </h2>
              <button
              onClick={() => setActiveTab('wallet')}
              className="flex items-center gap-2 mt-0.5 active:scale-95 transition-transform">

                <div className="flex items-center gap-1 px-2 py-0.5 bg-blue-50 rounded-lg border border-blue-100/50">
                  <Gem className="w-3 h-3 text-blue-600 fill-blue-600" />
                  <span className="text-xs font-black text-blue-700">{stats.balance}</span>
                </div>
              </button>
            </div>
          <div className="flex items-center gap-2">
            <div className={cn(
              "hidden sm:flex items-center gap-1.5 px-3 py-1.5 rounded-xl border transition-all duration-500",
              isGeoActive ?
              "bg-emerald-50 border-emerald-100 text-emerald-600" :
              "bg-rose-50 border-rose-100 text-rose-600"
            )}>
              <div className={cn(
                "w-1.5 h-1.5 rounded-full shadow-[0_0_8px_currentColor]",
                isGeoActive ? "bg-emerald-500 animate-pulse" : "bg-rose-500"
              )} />
              <span className="text-[9px] font-black uppercase tracking-wider">
                {isGeoActive ? 'GPS Активен' : 'GPS Поиск'}
              </span>
            </div>
            <button
              onClick={handleCenterMap}
              className="w-11 h-11 bg-white rounded-2xl flex items-center justify-center shadow-sm text-blue-600 active:scale-90 transition-all border border-blue-50 hover:bg-blue-50 group relative"
              title="Центрировать карту">

              <LocateFixed className="w-5 h-5 group-hover:rotate-12 transition-transform" />
              {!isGeoActive &&
              <span className="absolute -top-1 -right-1 flex h-3 w-3">
                  <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-rose-400 opacity-75"></span>
                  <span className="relative inline-flex rounded-full h-3 w-3 bg-rose-500"></span>
                </span>
              }
            </button>
          </div>
          </div>
          {geoHint &&
        <div className="mt-2 flex items-center gap-2 px-4 py-2 bg-blue-50/90 backdrop-blur-xl border border-blue-200/50 rounded-2xl shadow-sm">
              <MapPin className="w-3.5 h-3.5 text-blue-500 flex-shrink-0" />
              <span className="text-[11px] font-medium text-blue-700 leading-tight">{geoHint}</span>
              <button onClick={() => setGeoHint(null)} className="ml-auto text-blue-400 hover:text-blue-600">
                <X className="w-3.5 h-3.5" />
              </button>
            </div>
        }
        </div>
      <main className="flex-1 relative overflow-hidden flex flex-col pt-0">
        <AnimatePresence mode="wait">
          {activeTab === 'main' &&
          <motion.div
            key="main"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="flex-1 flex flex-col">

                {/* Map Section */}
                <motion.div
              animate={{ height: isExpanded ? '42%' : '8%' }}
              transition={{ type: "spring", damping: 25, stiffness: 200 }}
              className="relative z-0 overflow-hidden">

                  <Map
                userPos={userPos}
                locations={locations}
                friends={following.filter(f => !f.is_private)}
                offsetY={isExpanded ? 50 : 0}
                onFriendClick={handleFriendClick}
                onLocationClick={handleLocationClick}
                centerOn={mapTarget}
                pulse={mapPulse} />

                  
                    {/* Status messages */}
                    <div className="absolute top-32 left-0 right-0 pointer-events-none flex items-center justify-center px-6 z-50">
                      <AnimatePresence>
                        {message &&
                  <motion.div
                    key={message}
                    initial={{ opacity: 0, y: -20, scale: 0.9 }}
                    animate={{ opacity: 1, y: 0, scale: 1 }}
                    exit={{ opacity: 0, y: -20, scale: 0.9 }}
                    transition={{ type: "spring", damping: 20, stiffness: 300 }}
                    className="w-full max-w-sm bg-white/95 backdrop-blur-2xl rounded-[28px] p-5 shadow-[0_8px_40px_rgba(0,0,0,0.12)] border border-white/60 pointer-events-auto">

                      <div className="flex items-start gap-4">
                        <div className={`w-12 h-12 rounded-2xl flex items-center justify-center shrink-0 shadow-lg ${
                      messageType === 'error' ?
                      'bg-gradient-to-br from-red-400 to-orange-500 shadow-red-200/50' :
                      'bg-gradient-to-br from-blue-400 to-indigo-500 shadow-blue-200/50'}`
                      }>
                          {messageType === 'error' ?
                        <MapPin className="w-6 h-6 text-white" /> :
                        <CheckCircle2 className="w-6 h-6 text-white" />
                        }
                        </div>
                        <div className="flex-1 min-w-0">
                          <p className="text-[13px] font-bold text-zinc-800 leading-snug">{message}</p>
                          {messageType === 'error' &&
                        <p className="text-[11px] text-zinc-400 mt-1 font-medium">Подойдите ближе к месту знаний</p>
                        }
                        </div>
                        <button
                        onClick={() => setMessage(null)}
                        className="w-8 h-8 rounded-xl bg-zinc-100 flex items-center justify-center shrink-0 active:scale-90 transition-transform">

                          <X className="w-4 h-4 text-zinc-400" />
                        </button>
                      </div>
                      <motion.div
                      initial={{ scaleX: 1 }}
                      animate={{ scaleX: 0 }}
                      transition={{ duration: 3, ease: "linear" }}
                      className={`h-1 rounded-full mt-4 origin-left ${
                      messageType === 'error' ?
                      'bg-gradient-to-r from-red-400 to-orange-400' :
                      'bg-gradient-to-r from-blue-400 to-indigo-400'}`
                      } />

                    </motion.div>
                  }
                      </AnimatePresence>
                    </div>
                </motion.div>

                {/* Bottom Sheet */}
                <motion.div
              animate={{ height: isExpanded ? '58%' : '92%' }}
              transition={{ type: "spring", damping: 25, stiffness: 200 }}
              className="relative bg-white rounded-t-[48px] shadow-[0_-20px_60px_rgba(0,0,0,0.08)] z-20 flex flex-col min-h-0 border-t border-zinc-50">

                  {/* Start Scan Button */}
                  <div className="absolute -top-8 left-0 right-0 flex flex-col items-center z-30 pointer-events-none">
                    <button
                  onClick={startScan}
                  disabled={isScanning}
                  className={cn(
                    "pointer-events-auto px-12 py-5 rounded-[24px] font-black text-lg shadow-[0_20px_40px_rgba(16,185,129,0.3)] flex items-center gap-3 border transition-all active:scale-95 group",
                    isScanning ?
                    "bg-zinc-100 text-zinc-400 border-zinc-200" :
                    "bg-gradient-to-r from-[#00C853] via-[#00E676] to-[#00BFA5] text-white border-white/30 ring-8 ring-[#00E676]/10 hover:shadow-[0_25px_50px_rgba(0,200,83,0.5)] shadow-[inset_0_2px_4px_rgba(255,255,255,0.3)] drop-shadow-[0_0_15px_rgba(0,230,118,0.4)]"
                  )}>

                    {isScanning ?
                  <>
                        <Radar className="w-6 h-6 animate-spin" />
                        Сканирование...
                      </> :

                  <>
                        Начать поиск знаний
                        <ChevronRight className="w-6 h-6 group-hover:translate-x-1 transition-transform" />
                      </>
                  }
                    </button>

                    {/* Toggle Button */}
                    <button
                  onClick={() => setIsExpanded(!isExpanded)}
                  className="pointer-events-auto mt-3 bg-white/90 backdrop-blur-md px-4 py-1.5 rounded-full border border-zinc-200 shadow-sm flex items-center gap-2 text-[10px] font-black text-zinc-500 uppercase tracking-wider active:scale-95 transition-all hover:bg-zinc-50">

                      {isExpanded ?
                  <>Свернуть карту <ChevronUp className="w-3.5 h-3.5" /></> :

                  <>Развернуть карту <ChevronDown className="w-3.5 h-3.5" /></>
                  }
                    </button>
                  </div>

              {/* Scrollable Content */}
                   <div className="flex-1 overflow-y-auto px-6 pt-10 pb-48 min-h-0">
                    <div className="w-16 h-1.5 bg-zinc-100 rounded-full mx-auto mb-8" />
                    
                    <div className="space-y-8">
                      {/* Progress Section */}
                      <div className="grid grid-cols-2 gap-3">
                        <button
                      onClick={() => setShowGoalDetails('daily')}
                      className={cn(
                        "bg-gradient-to-br from-blue-50 to-indigo-50 p-4 rounded-[28px] border flex flex-col items-center text-center gap-3 transition-all active:scale-[0.98] relative overflow-hidden",
                        dailyGoalReached && !stats.dailyClaimed ? "border-blue-400 ring-2 ring-blue-200" : "border-blue-100/50"
                      )}>
                          {dailyGoalReached && !stats.dailyClaimed &&
                      <div className="absolute top-2 right-2 w-3 h-3 bg-blue-500 rounded-full animate-pulse" />
                      }
                          <div className="w-10 h-10 bg-white rounded-xl flex items-center justify-center shadow-sm">
                            <Target className="w-5 h-5 text-blue-600" />
                          </div>
                          <div className="w-full">
                            <h3 className="font-black text-zinc-900 text-sm">Цель дня</h3>
                            <div className="flex justify-between items-center mt-1 mb-1">
                              <span className="text-[10px] font-bold text-zinc-500 uppercase">{stats.visitsToday}/8</span>
                              <span className="text-xs font-black text-blue-600">{dailyProgress}%</span>
                            </div>
                            <div className="h-2 w-full bg-white/60 rounded-full overflow-hidden p-0.5 border border-white/50">
                              <motion.div
                            initial={{ width: 0 }}
                            animate={{ width: `${dailyProgress}%` }}
                            className="h-full bg-gradient-to-r from-blue-500 to-indigo-600 rounded-full" />

                            </div>
                          </div>
                        </button>

                        <button
                      onClick={() => setShowGoalDetails('weekly')}
                      className={cn(
                        "bg-gradient-to-br from-pink-50 to-rose-50 p-4 rounded-[28px] border flex flex-col items-center text-center gap-3 transition-all active:scale-[0.98] relative overflow-hidden",
                        weeklyGoalReached && !stats.weeklyClaimed ? "border-pink-400 ring-2 ring-pink-200" : "border-pink-100/50"
                      )}>
                          {weeklyGoalReached && !stats.weeklyClaimed &&
                      <div className="absolute top-2 right-2 w-3 h-3 bg-pink-500 rounded-full animate-pulse" />
                      }
                          <div className="w-10 h-10 bg-white rounded-xl flex items-center justify-center shadow-sm text-lg">
                            🏆
                          </div>
                          <div className="w-full">
                            <h3 className="font-black text-zinc-900 text-sm">Цель недели</h3>
                            <div className="flex justify-between items-center mt-1 mb-1">
                              <span className="text-[10px] font-bold text-zinc-500 uppercase">{stats.visitsThisWeek}/40</span>
                              <span className="text-xs font-black text-pink-500">{weeklyProgress}%</span>
                            </div>
                            <div className="h-2 w-full bg-white/60 rounded-full overflow-hidden p-0.5 border border-white/50">
                              <motion.div
                            initial={{ width: 0 }}
                            animate={{ width: `${weeklyProgress}%` }}
                            className="h-full bg-gradient-to-r from-pink-500 to-rose-500 rounded-full" />

                            </div>
                          </div>
                        </button>
                      </div>

                      {/* Categories Section (Widgets) - Carousel */}
                      <div>
                        <div className="flex items-center justify-between mb-3 px-2">
                          <h2 className="text-xl font-black text-zinc-900">Места знаний</h2>
                       {!showTutorial && <button
                          onClick={() => setShowTutorial(!showTutorial)}
                          className={`w-8 h-8 rounded-full flex items-center justify-center transition-colors ${
                          showTutorial ?
                          'bg-blue-500 text-white' :
                          'bg-blue-100 text-blue-700'}`
                          }>

                                <Info className="w-4 h-4" />
                              </button>}
                        </div>
                        
                        {/* Tutorial Banner */}
                        {showTutorial &&
                    <motion.div
                      initial={{ opacity: 0, height: 0 }}
                      animate={{ opacity: 1, height: 'auto' }}
                      exit={{ opacity: 0, height: 0 }}
                      className="mb-4 bg-gradient-to-r from-indigo-500 to-blue-500 rounded-[24px] p-4 text-white relative overflow-hidden">

                            <button
                        onClick={() => {
                          setShowTutorial(false);
                          localStorage.setItem('knowledge_tutorial_dismissed', 'true');
                        }}
                        className="absolute top-2 right-2 w-6 h-6 bg-white/20 rounded-full flex items-center justify-center">

                              <X className="w-3 h-3" />
                            </button>
                            <div className="flex items-start gap-3">
                              <div className="w-10 h-10 bg-white/20 rounded-xl flex items-center justify-center shrink-0">
                                <GraduationCap className="w-5 h-5" />
                              </div>
                              <div className="flex-1 pr-4">
                                <h3 className="font-black text-sm mb-1">Как это работает?</h3>
                                  <p className="text-[11px] opacity-90 leading-relaxed">
                                    Посещайте места знаний и получайте <span className="font-black">геотокены</span> за каждую категорию. 
                                    После посещения места нужно подождать <span className="font-black">2 часа</span> до следующей отметки в этой категории.
                                  </p>
                                  <a
                                    href="https://vk.me/join/ClQF8cb557n5YW3YYF9wcOIrUevgsOPYgDg="
                                    target="_blank"
                                    rel="noopener noreferrer"
                                    className="mt-3 inline-flex items-center gap-2 px-4 py-2 bg-white text-indigo-600 font-black text-xs rounded-xl shadow-lg active:scale-95 transition-transform"
                                  >
                                    <MessageCircle className="w-4 h-4" />
                                    Чат тестировщиков
                                  </a>
                              </div>
                            </div>
                          </motion.div>
                    }
                        
                        {/* Horizontal Carousel */}
                        <div className="overflow-x-auto pb-2 -mx-6 px-6 scrollbar-hide">
                          <div className="flex gap-3" style={{ width: 'max-content' }}>
                            {KNOWLEDGE_CATEGORIES.map((cat) => {
                          const lastVisit = stats.categoryCooldowns[cat.id] || 0;
                          const COOLDOWN = 2 * 3600000;
                          const isLocked = now - lastVisit < COOLDOWN;
                          const remainingMs = Math.max(0, COOLDOWN - (now - lastVisit));
                          const remainingMins = Math.ceil(remainingMs / 60000);
                          const progress = isLocked ? (COOLDOWN - remainingMs) / COOLDOWN * 100 : 100;

                          const catStats = categoryStats[cat.id] || { count: 0, lastVisit: null };

                          const scanStatus = scanResults.find((r) => r.id === cat.id)?.status;

                          return (
                            <motion.button
                              key={cat.id}
                              onClick={() => setSelectedCategory(cat)}
                              whileTap={{ scale: 0.97 }}
                              animate={{
                                scale: scanStatus === 'scanning' ? 1.02 : 1
                              }}
                              className={cn(
                                "relative w-[160px] h-[140px] rounded-[28px] p-4 flex flex-col text-left transition-all overflow-hidden shrink-0",
                                isLocked ?
                                "bg-zinc-100" :
                                `bg-gradient-to-br ${cat.gradient}`
                              )}>

                                  {/* Icon & Status */}
                                  <div className="flex items-start justify-between mb-2">
                                    <div className={cn(
                                  "w-11 h-11 rounded-[14px] flex items-center justify-center shadow-md",
                                  isLocked ? "bg-zinc-200 text-zinc-400" : (catStats.count > 0 ? "bg-green-400 text-white" : "bg-white/20 text-white")
                                )}>
                                      {cat.icon}
                                    </div>
                                    
                                    {/* Status indicator */}
                                    {(scanStatus === 'success' || (!isLocked && catStats.count > 0)) ?
                                    <motion.div
                                  initial={{ scale: 0 }}
                                  animate={{ scale: 1 }}
                                  className={cn("p-1 rounded-full", isLocked ? "bg-zinc-200 text-zinc-400" : "bg-green-400 text-white")}>

                                        <CheckCircle2 className="w-4 h-4" />
                                      </motion.div> :
                                null}
                                  </div>
                                  
                                  {/* Title */}
                                  <h4 className={cn(
                                "font-black text-sm leading-tight",
                                isLocked ? "text-zinc-500" : "text-white"
                              )}>
                                    {cat.name}
                                  </h4>
                                  
                                  {/* Stats or Timer */}
                                  <div className="mt-auto">
                                    {isLocked ?
                                <div className="space-y-1.5">
                                        <div className="flex items-center gap-1.5">
                                          <Clock className="w-3.5 h-3.5 text-zinc-400" />
                                          <span className="text-xs font-black text-zinc-500 tabular-nums">
                                            {Math.floor(remainingMins / 60)}:{String(remainingMins % 60).padStart(2, '0')}
                                          </span>
                                        </div>
                                        {/* Progress bar */}
                                        <div className="h-1.5 w-full bg-zinc-200 rounded-full overflow-hidden">
                                          <motion.div
                                      initial={{ width: 0 }}
                                      animate={{ width: `${progress}%` }}
                                      className={cn("h-full rounded-full bg-gradient-to-r", cat.gradient)} />

                                        </div>
                                      </div> :

                                <div className="flex items-center gap-2">
                                          <Footprints className="w-4 h-4 text-white/80" />
                                          <span className="text-white/90 text-[11px] font-black">
                                            {catStats.count}
                                          </span>
                                          <ChevronRight className="w-4 h-4 text-white/50" />
                                        </div>
                                }
                                  </div>
                                </motion.button>);

                        })}
                          </div>
                        </div>
                      </div>
                    </div>
                  </div>
                </motion.div>
            </motion.div>
          }

          {activeTab === 'quests' &&
          <motion.div
            key="quests"
            initial={{ opacity: 0, scale: 0.95 }}
            animate={{ opacity: 1, scale: 1 }}
            exit={{ opacity: 0, scale: 0.95 }}
            className="flex-1 p-6 overflow-y-auto pt-40 pb-44">

              <div className="w-full max-w-md mx-auto space-y-6">
                <h2 className="text-3xl font-black text-zinc-900 tracking-tighter text-center mb-8">Квесты</h2>
                
                {/* Zombie Mode Info Banner */}
                <div className="w-full text-left relative overflow-hidden bg-gradient-to-br from-zinc-900 via-zinc-800 to-zinc-900 rounded-[32px] p-6 shadow-xl border border-white/5">
                  {/* Glow effects */}
                  <div className="absolute -top-20 -left-20 w-40 h-40 bg-green-500/30 rounded-full blur-3xl" />
                  <div className="absolute -bottom-10 -right-10 w-32 h-32 bg-lime-500/20 rounded-full blur-2xl" />
                  
                  {/* Status Badge */}
                  <div className="absolute top-4 right-4 bg-zinc-700/50 backdrop-blur-md text-zinc-300 text-[10px] font-black px-4 py-2 rounded-full uppercase tracking-wider flex items-center gap-1.5 border border-white/5">
                    <Clock className="w-3.5 h-3.5" />
                    Скоро
                  </div>
                  
                  {/* Image with decorative frame */}
                  <div className="relative mb-6">
                    <div className="absolute inset-0 bg-gradient-to-r from-green-500 via-lime-400 to-green-500 rounded-2xl blur-sm opacity-40" />
                    <div className="relative rounded-2xl overflow-hidden border border-white/10">
                      <div className="w-full h-32 bg-gradient-to-br from-zinc-800 to-zinc-900 flex items-center justify-center">
                        <div className="relative">
                          <div className="w-16 h-16 bg-gradient-to-br from-green-600 to-lime-500 rounded-full flex items-center justify-center shadow-2xl shadow-green-500/30">
                            <span className="text-3xl opacity-80">🧟</span>
                          </div>
                        </div>
                      </div>
                    </div>
                  </div>
                  
                  <h3 className="text-2xl font-black text-white mb-3 tracking-tight">
                    Зомби-апокалипсис
                  </h3>
                  
                  <p className="text-zinc-400 text-sm leading-relaxed mb-6 font-medium">
                    Уважаемые сталкеры, спасибо за тестирование квеста. Квест "Зомби-апокалипсис" ждёт своих выживальщиков в 2026 году 1 сентября.
                  </p>
                  
                  <a
                    href="https://vk.me/join/ClQF8cb557n5YW3YYF9wcOIrUevgsOPYgDg="
                    target="_blank"
                    rel="noopener noreferrer"
                    className="w-full py-4 bg-gradient-to-r from-blue-600 to-indigo-600 text-white font-black text-xs uppercase tracking-widest rounded-2xl flex items-center justify-center gap-2 active:scale-[0.98] transition-all shadow-lg shadow-blue-900/20"
                  >
                    <MessageCircle className="w-4 h-4" />
                    Есть идеи?
                  </a>
                </div>
                
                {/* Secret Quest Banner - Coming Soon */}
                <div className="relative overflow-hidden bg-gradient-to-br from-indigo-900 via-purple-900 to-indigo-900 rounded-[32px] p-5 opacity-80">
                  {/* Glow effects */}
                  <div className="absolute -top-20 -left-20 w-40 h-40 bg-purple-500/30 rounded-full blur-3xl" />
                  <div className="absolute -bottom-10 -right-10 w-32 h-32 bg-indigo-500/20 rounded-full blur-2xl" />
                  
                  {/* Coming Soon Badge */}
                  <div className="absolute top-4 right-4 bg-gradient-to-r from-purple-500 to-indigo-400 text-white text-[10px] font-black px-4 py-2 rounded-full uppercase tracking-wider shadow-lg shadow-purple-500/30">
                    Скоро
                  </div>
                  
                  {/* Image with decorative frame */}
                  <div className="relative mb-4">
                    <div className="absolute inset-0 bg-gradient-to-r from-purple-500 via-indigo-400 to-purple-500 rounded-2xl blur-sm opacity-60" />
                    <div className="relative rounded-2xl overflow-hidden border-2 border-purple-500/50">
                      <div className="w-full h-36 bg-gradient-to-br from-indigo-900 to-purple-900 flex items-center justify-center">
                        <div className="relative">
                          <div className="w-20 h-20 bg-gradient-to-br from-purple-600 to-indigo-500 rounded-full flex items-center justify-center shadow-2xl shadow-purple-500/50">
                            <span className="text-4xl">🔮</span>
                          </div>
                          <div className="absolute -bottom-1 -right-1 w-8 h-8 bg-yellow-500 rounded-full flex items-center justify-center border-2 border-indigo-900">
                            <span className="text-sm">❓</span>
                          </div>
                        </div>
                      </div>
                    </div>
                  </div>
                  
                  {/* Title */}
                  <h3 className="text-2xl font-black text-white mb-2 tracking-tight">
                    Секретный квест
                  </h3>
                  
                  {/* Description */}
                  <p className="text-purple-300/70 text-sm leading-relaxed !whitespace-pre-line">Таинственное приключение ждёт Вас. Следите за обновлениями...

                </p>
                </div>

                <button
                onClick={() => setActiveTab('main')}
                className="w-full inline-flex items-center justify-center gap-2 text-indigo-600 font-black text-sm uppercase tracking-widest active:scale-95 transition-all mt-8">
                  <ChevronRight className="w-5 h-5 rotate-180" />
                  Вернуться на карту
                </button>
              </div>
            </motion.div>
          }

          {activeTab === 'history' &&
          <motion.div
            key="history"
            initial={{ opacity: 0, x: 20 }}
            animate={{ opacity: 1, x: 0 }}
            exit={{ opacity: 0, x: -20 }}
            className="flex-1 p-6 overflow-y-auto pt-40 pb-44">

              <div className="flex items-center justify-between mb-8 px-2">
                <h2 className="text-3xl font-black">История</h2>
                <button
                onClick={refreshHistory}
                disabled={isRefreshingHistory}
                className={cn(
                  "p-3 rounded-2xl border bg-white shadow-sm transition-all active:scale-90",
                  isRefreshingHistory ? "text-zinc-300" : "text-blue-600 hover:bg-blue-50"
                )}>

                  <RefreshCcw className={cn("w-5 h-5", isRefreshingHistory && "animate-spin")} />
                </button>
              </div>
              <div className="space-y-4">
                {stats.history.length > 0 ? stats.history.map((visit) =>
              <div
                key={visit.id}
                onClick={() => handleHistoryClick(visit)}
                className={cn(
                  "bg-white p-5 rounded-[32px] border border-zinc-100 flex items-center gap-5 shadow-sm transition-all",
                  visit.lat && visit.lon ? "active:scale-[0.98] active:bg-zinc-50 cursor-pointer" : "opacity-80"
                )}>

                    <div className="w-12 h-12 rounded-2xl bg-indigo-50 text-indigo-600 flex items-center justify-center font-black text-lg">
                      {visit.category[0]}
                    </div>
                    <div className="flex-1">
                      <h4 className="font-black text-sm text-zinc-900">{visit.locationName}</h4>
                      <p className="text-[10px] font-bold text-zinc-400 uppercase tracking-widest mt-1">
                        {new Date(visit.timestamp).toLocaleDateString('ru-RU', { day: 'numeric', month: 'long', hour: '2-digit', minute: '2-digit' })}
                      </p>
                    </div>
                    <div className="flex flex-col items-end gap-1">
                      <div className="bg-green-50 text-green-700 px-3 py-1.5 rounded-xl font-black text-sm flex items-center gap-1.5">
                        +{visit.coinsEarned} <Gem className="w-4 h-4 fill-current" />
                      </div>
                      {visit.lat && visit.lon &&
                  <span className="text-[8px] font-black text-blue-400 uppercase tracking-tighter">На карту →</span>
                  }
                    </div>
                  </div>
              ) :
              <div className="text-center py-20 bg-zinc-50 rounded-[40px] border border-dashed border-zinc-200">
                    <HistoryIcon className="w-12 h-12 text-zinc-300 mx-auto mb-4" />
                    <p className="font-bold text-zinc-400">Вы ещё нигде не отметились на карте</p>
                  </div>
              }
              </div>
            </motion.div>
          }

          {activeTab === 'rating' &&
          <motion.div
            key="rating"
            initial={{ opacity: 0, x: 20 }}
            animate={{ opacity: 1, x: 0 }}
            exit={{ opacity: 0, x: -20 }}
            className="flex-1 p-6 overflow-y-auto pt-40 pb-44">

              <div className="flex items-center justify-between mb-8 px-2">
                <h2 className="text-3xl font-black">Рейтинг</h2>
                <button
                onClick={fetchRanking}
                disabled={isLoadingRanking}
                className={cn(
                  "p-3 rounded-2xl border bg-white shadow-sm transition-all active:scale-90",
                  isLoadingRanking ? "text-zinc-300" : "text-blue-600 hover:bg-blue-50"
                )}>

                  <RefreshCcw className={cn("w-5 h-5", isLoadingRanking && "animate-spin")} />
                </button>
              </div>
              <div className="space-y-3">
                {isLoadingRanking ?
              <div className="flex flex-col gap-3">
                    {[1, 2, 3, 4, 5].map((i) =>
                <div key={i} className="h-24 bg-zinc-100 animate-pulse rounded-[32px]" />
                )}
                  </div> :
              ranking.length > 0 ? ranking.map((player, idx) =>
              <div key={player.id || `rank-${idx}`} className={cn(
                "p-5 rounded-[32px] border flex items-center gap-5 transition-all",
                player.isMe ?
                "bg-blue-600 border-blue-600 text-white shadow-lg shadow-blue-200" :
                "bg-white border-zinc-100 text-zinc-900 shadow-sm"
              )}>
                      <div className={cn(
                  "w-10 h-10 rounded-2xl flex items-center justify-center font-black text-lg",
                  idx === 0 ? "bg-yellow-400 text-white" :
                  idx === 1 ? "bg-zinc-200 text-zinc-600" :
                  idx === 2 ? "bg-orange-400 text-white" :
                  player.isMe ? "bg-white/20 text-white" : "bg-zinc-50 text-zinc-400"
                )}>
                        {idx + 1}
                      </div>
                      <img
                  src={player.avatar || AVATAR_PLACEHOLDER}
                  alt={player.name}
                  className={cn(
                    "w-12 h-12 rounded-2xl object-cover",
                    player.isMe ? "border-2 border-white/50" : "bg-zinc-100"
                  )} />

                      <div className="flex-1">
                        <h4 className="font-black text-sm">{player.name}</h4>
                        {player.isMe && <span className="text-[10px] font-bold uppercase tracking-widest opacity-70">Это вы</span>}
                      </div>
                      <div className={cn(
                  "font-black flex items-center gap-2 text-lg",
                  player.isMe ? "text-white" : "text-blue-600"
                )}>
                        {player.points} 
                        <Gem className={cn("w-5 h-5 fill-current", player.isMe ? "text-white" : "text-blue-500")} />
                      </div>
                      {isAdmin &&
                <button
                  onClick={() => {
                    setEditingUser({ id: player.id, name: player.name, balance: player.points, avatar: player.avatar });
                    setNewBalanceValue(player.points.toString());
                  }}
                  className={cn(
                    "w-10 h-10 rounded-xl flex items-center justify-center transition-all active:scale-90",
                    player.isMe ? "bg-white/20 text-white" : "bg-zinc-100 text-zinc-500"
                  )}>

                          <Pencil className="w-4 h-4" />
                        </button>
                }
                    </div>
              ) :
              <div className="text-center py-20 bg-zinc-50 rounded-[40px] border border-dashed border-zinc-200">
                    <Trophy className="w-12 h-12 text-zinc-300 mx-auto mb-4" />
                    <p className="font-bold text-zinc-400">Рейтинг пока пуст</p>
                  </div>
              }
              </div>
            </motion.div>
          }

          {activeTab === 'friends' &&
          <motion.div
            key="friends"
            initial={{ opacity: 0, x: 20 }}
            animate={{ opacity: 1, x: 0 }}
            exit={{ opacity: 0, x: -20 }}
            className="flex-1 p-6 overflow-y-auto pt-40 pb-44">

              <div className="flex items-center justify-between mb-8 px-2">
                <h2 className="text-3xl font-black">Друзья</h2>
                <div className="flex items-center gap-3">
                  <div className="flex items-center gap-2 mr-2">
                    {isPrivate ? <Lock className="w-4 h-4 text-zinc-400" /> : <EyeOff className="w-4 h-4 text-zinc-400" />}
                    <Switch.Root
                      checked={isPrivate}
                      onCheckedChange={handleTogglePrivacy}
                      className="w-11 h-6 bg-zinc-200 rounded-full relative data-[state=checked]:bg-blue-600 transition-colors outline-none cursor-pointer"
                    >
                      <Switch.Thumb className="block w-5 h-5 bg-white rounded-full shadow-md transition-transform duration-100 translate-x-0.5 will-change-transform data-[state=checked]:translate-x-[22px]" />
                    </Switch.Root>
                  </div>
                  <button
                  onClick={handleAddFriend}
                  className="w-12 h-12 bg-blue-600 rounded-2xl flex items-center justify-center shadow-lg shadow-blue-200 active:scale-90 transition-all text-white">

                    <UserPlus className="w-5 h-5" />
                  </button>
                  <button
                  onClick={refreshFriends}
                  disabled={isRefreshingFriends}
                  className={cn(
                    "p-3 rounded-2xl border bg-white shadow-sm transition-all active:scale-90",
                    isRefreshingFriends ? "text-zinc-300" : "text-blue-600 hover:bg-blue-50"
                  )}>

                    <RefreshCcw className={cn("w-5 h-5", isRefreshingFriends && "animate-spin")} />
                  </button>
                </div>
              </div>
              <div className="space-y-8">
                {/* My Following Section */}
                <div>
                  <h3 className="text-lg font-black text-zinc-900 mb-4 flex items-center gap-2">
                    <Eye className="w-5 h-5 text-indigo-500" />
                    Отслеживаю ({following.length})
                  </h3>
                  <div className="space-y-3">
                    {following.length > 0 ? following.map((friend, idx) =>
                  <div
                    key={friend.vk_id || `f-${idx}`}
                    onClick={() => !friend.is_loading && handleFriendClick(friend)}
                    className={cn(
                      "bg-white p-4 rounded-[28px] border border-zinc-100 flex items-center gap-4 shadow-sm transition-all cursor-pointer",
                      friend.is_loading ? "opacity-70" : "active:scale-[0.98]"
                    )}>

                        {friend.is_loading ? (
                          <>
                            <div className="w-12 h-12 rounded-2xl bg-zinc-200 animate-pulse" />
                            <div className="flex-1 min-w-0 space-y-2">
                              <div className="h-4 w-24 bg-zinc-200 rounded animate-pulse" />
                              <div className="h-3 w-32 bg-zinc-200 rounded animate-pulse" />
                            </div>
                          </>
                        ) : (
                          <>
                            <img
                          src={friend.photo_200 || AVATAR_PLACEHOLDER}
                          alt={friend.first_name}
                          className="w-12 h-12 rounded-2xl object-cover bg-zinc-100" />

                            <div className="flex-1 min-w-0">
                              <h4 className="font-black text-sm text-zinc-900 truncate flex items-center gap-2">
                                {formatName(friend.first_name, friend.last_name)}
                                {friend.is_private && <Lock className="w-3 h-3 text-zinc-400" />}
                              </h4>
                              <div className="flex items-center gap-2 mt-0.5">
                                {friend.is_private ? (
                                  <span className="text-[10px] font-bold text-zinc-400 uppercase tracking-wider">Приватный</span>
                                ) : (
                                  <>
                                    <Gem className="w-3 h-3 text-blue-500 fill-current" />
                                    <span className="text-xs font-black text-blue-600">{friend.points || 0}</span>
                                    <span className="text-[10px] font-bold text-zinc-400 uppercase tracking-wider ml-1">Нажмите для просмотра</span>
                                  </>
                                )}
                              </div>
                            </div>
                            <button
                          onClick={(e) => handleUnfollowClick(e, friend)}
                          className="w-10 h-10 bg-zinc-50 rounded-xl flex items-center justify-center text-zinc-400 active:scale-90 transition-all hover:bg-red-50 hover:text-red-500">

                              <UserMinus className="w-4 h-4" />
                            </button>
                          </>
                        )}
                      </div>
                  ) :
                  <div className="text-center py-10 bg-zinc-50 rounded-[32px] border border-dashed border-zinc-200">
                        <Users className="w-10 h-10 text-zinc-300 mx-auto mb-3" />
                        <p className="text-sm font-bold text-zinc-400">Вы никого не отслеживаете</p>
                        <p className="text-xs text-zinc-300 mt-1">Добавьте друзей через кнопку выше</p>
                      </div>
                  }
                  </div>
                </div>

                {/* My Followers Section */}
                <div>
                  <h3 className="text-lg font-black text-zinc-900 mb-4 flex items-center gap-2">
                    <Users className="w-5 h-5 text-pink-500" />
                    Мои подписчики ({followers.length})
                  </h3>
                  <div className="space-y-3">
                    {followers.length > 0 ? followers.map((follower, idx) =>
                  <div key={follower.vk_id || `fl-${idx}`} className="bg-white p-4 rounded-[28px] border border-zinc-100 flex items-center gap-4 shadow-sm">
                        <img
                      src={follower.photo_200 || AVATAR_PLACEHOLDER}
                      alt={follower.first_name}
                      className="w-12 h-12 rounded-2xl object-cover bg-zinc-100" />

                        <div className="flex-1 min-w-0">
                          <h4 className="font-black text-sm text-zinc-900 truncate">{formatName(follower.first_name, follower.last_name)}</h4>
                          <p className="text-[10px] font-bold text-zinc-400 uppercase tracking-wider">
                            {(follower as any).is_blocked ? 'Заблокирован' : 'Видит Ваш прогресс'}
                          </p>
                        </div>
                        <button
                      onClick={() => handleToggleBlock(follower.vk_id, !!(follower as any).is_blocked)}
                      className={cn(
                        "w-10 h-10 rounded-xl flex items-center justify-center active:scale-90 transition-all",
                        (follower as any).is_blocked ? "bg-red-50 text-red-500" : "bg-zinc-50 text-zinc-400 hover:bg-red-50 hover:text-red-500"
                      )}>

                          {(follower as any).is_blocked ? <ShieldOff className="w-4 h-4" /> : <ShieldCheck className="w-4 h-4" />}
                        </button>
                      </div>
                  ) :
                  <div className="text-center py-10 bg-zinc-50 rounded-[32px] border border-dashed border-zinc-200">
                        <Users className="w-10 h-10 text-zinc-300 mx-auto mb-3" />
                        <p className="text-sm font-bold text-zinc-400">Пока нет подписчиков</p>
                      </div>
                  }
                  </div>
                </div>
              </div>
            </motion.div>
          }

          {activeTab === 'wallet' &&
          <motion.div
            key="wallet"
            initial={{ opacity: 0, scale: 0.95 }}
            animate={{ opacity: 1, scale: 1 }}
            exit={{ opacity: 0, scale: 0.95 }}
            className="flex-1 p-6 overflow-y-auto pt-40 pb-44">

              <div className="w-full max-w-md mx-auto space-y-8">
                <h2 className="text-3xl font-black text-zinc-900 tracking-tighter text-center">Кошелек</h2>
                
                {/* Balance Card */}
                <div className="bg-gradient-to-br from-blue-600 via-indigo-600 to-purple-700 rounded-[40px] p-8 text-white shadow-2xl shadow-blue-300/30 relative overflow-hidden">
                  <div className="absolute top-0 right-0 w-40 h-40 bg-white/10 rounded-full blur-3xl -translate-y-1/2 translate-x-1/2" />
                  <div className="absolute bottom-0 left-0 w-32 h-32 bg-black/10 rounded-full blur-2xl translate-y-1/2 -translate-x-1/2" />
                  
                  <div className="relative">
                    <p className="text-white/60 text-[10px] font-black uppercase tracking-[0.3em] mb-2">Текущий баланс</p>
                    <div className="flex items-end gap-3 mb-6">
                      <span className="text-6xl font-black tracking-tight">{stats.balance}</span>
                      <Gem className="w-10 h-10 mb-2 fill-white/80" />
                    </div>
                    <div className="flex items-center gap-4 text-xs font-bold">
                      <div className="bg-white/10 backdrop-blur-xl px-4 py-2 rounded-2xl">
                        <span className="text-white/60">Добыто:</span>
                        <span className="ml-2 text-white">{stats.minedBalance}</span>
                      </div>
                      <div className="bg-white/10 backdrop-blur-xl px-4 py-2 rounded-2xl">
                        <span className="text-white/60">Получено:</span>
                        <span className="ml-2 text-white">{stats.giftedBalance}</span>
                      </div>
                    </div>
                  </div>
                </div>

                {/* Stats Grid */}
                <div className="grid grid-cols-2 gap-4">
                  <div className="bg-white p-5 rounded-[28px] border border-zinc-100 text-center shadow-sm">
                    <div className="w-12 h-12 bg-blue-50 rounded-2xl flex items-center justify-center mx-auto mb-3">
                      <MapPin className="w-6 h-6 text-blue-600" />
                    </div>
                    <p className="text-3xl font-black text-zinc-900">{stats.history.length}</p>
                    <p className="text-[10px] font-bold text-zinc-400 uppercase tracking-widest mt-1">Всего посещений</p>
                  </div>
                  <div className="bg-white p-5 rounded-[28px] border border-zinc-100 text-center shadow-sm">
                    <div className="w-12 h-12 bg-indigo-50 rounded-2xl flex items-center justify-center mx-auto mb-3">
                      <Trophy className="w-6 h-6 text-indigo-600" />
                    </div>
                    <p className="text-3xl font-black text-zinc-900">{ranking.findIndex((r) => r.isMe) + 1 || '—'}</p>
                    <p className="text-[10px] font-bold text-zinc-400 uppercase tracking-widest mt-1">Место в рейтинге</p>
                  </div>
                </div>

                <button
                onClick={() => setActiveTab('main')}
                className="w-full inline-flex items-center justify-center gap-2 text-indigo-600 font-black text-sm uppercase tracking-widest active:scale-95 transition-all">
                  <ChevronRight className="w-5 h-5 rotate-180" />
                  Вернуться на карту
                </button>
              </div>
            </motion.div>
          }
        </AnimatePresence>
      </main>

      {/* Profile Modal */}
      <AnimatePresence>
        {showProfile &&
        <div className="fixed inset-0 z-[100]">
            <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            onClick={() => setShowProfile(false)}
            className="absolute inset-0 bg-zinc-900/60 backdrop-blur-md" />

            <motion.div
            initial={{ y: '100%' }}
            animate={{ y: 0 }}
            exit={{ y: '100%' }}
            transition={{ type: 'spring', damping: 30, stiffness: 300 }}
            drag="y"
            dragConstraints={{ top: 0, bottom: 0 }}
            dragElastic={{ top: 0.1, bottom: 0.5 }}
            onDragEnd={(e, info) => {
              if (info.offset.y > 150 || info.velocity.y > 500) {
                setShowProfile(false) ; 
              }
            }}
            className="absolute bottom-0 left-0 right-0 bg-white rounded-t-[48px] p-8 max-h-[85vh] overflow-y-auto touch-none">

              <div className="w-12 h-1.5 bg-zinc-200 rounded-full mx-auto mb-8 cursor-grab active:cursor-grabbing pointer-events-none" />
              
              <div className="flex items-center justify-between mb-8">
                <h2 className="text-3xl font-black">Настройки</h2>
                <button
                onClick={() => setShowProfile(false)}
                className="w-12 h-12 rounded-2xl bg-zinc-50 flex items-center justify-center active:scale-90 transition-all cursor-pointer hover:bg-zinc-100 z-50 relative">

                  <X className="w-6 h-6" />
                </button>
              </div>

              <div className="space-y-8">
                <div className="flex items-center gap-4 p-4 bg-zinc-50 rounded-[32px]">
                  <img
                  src={user?.photo_200 || AVATAR_PLACEHOLDER}
                  alt="Profile"
                  className="w-16 h-16 rounded-2xl object-cover border-2 border-white" />

                  <div>
                    <h4 className="font-black text-lg leading-tight">{formatFullName(user?.first_name, user?.last_name)}</h4>
                    <p className="text-zinc-400 text-xs font-bold mt-1 uppercase tracking-wider">ID: {user?.id}</p>
                  </div>
                </div>

                <div className="space-y-4">
                  <button
                  onClick={handleToggleGeo}
                  className="w-full flex items-center justify-between p-6 bg-white border border-zinc-100 rounded-[32px] hover:bg-zinc-50 transition-colors group">

                    <div className="flex items-center gap-4">
                      <div className={cn(
                      "w-12 h-12 rounded-2xl flex items-center justify-center transition-colors",
                      geoPermissionGranted ? "bg-emerald-50 text-emerald-600" : "bg-zinc-100 text-zinc-400"
                    )}>
                        <MapPin className="w-5 h-5" />
                      </div>
                      <div className="text-left">
                        <h4 className="font-black text-sm">Геолокация</h4>
                        <p className="text-[10px] font-bold text-zinc-400 uppercase mt-0.5">{geoPermissionGranted ? 'Разрешена' : 'Запрещена'}</p>
                      </div>
                    </div>
                    <div className={cn(
                    "w-12 h-6 rounded-full relative transition-colors",
                    geoPermissionGranted ? "bg-emerald-600" : "bg-zinc-200"
                  )}>
                      <motion.div
                      animate={{ x: geoPermissionGranted ? 26 : 4 }}
                      className="w-4 h-4 bg-white rounded-full absolute top-1" />
                    </div>
                    </button>

                    <a
                      href="https://vk.me/schoolspaceru"
                      target="_blank"
                      rel="noopener noreferrer"
                      className="w-full flex items-center justify-between p-6 bg-white border border-zinc-100 rounded-[32px] hover:bg-zinc-50 transition-colors group"
                    >
                      <div className="flex items-center gap-4">
                        <div className="w-12 h-12 rounded-2xl flex items-center justify-center bg-purple-50 text-purple-600">
                          <MessageCircle className="w-5 h-5" />
                        </div>
                        <div className="text-left">
                          <h4 className="font-black text-sm">Чат-бот сообщества</h4>
                          <p className="text-[10px] font-bold text-zinc-400 uppercase mt-0.5">Написать в ЛС</p>
                        </div>
                      </div>
                      <ChevronRight className="w-6 h-6 text-zinc-300 group-hover:translate-x-1 transition-transform" />
                    </a>

                      <a
                      href="mailto:schoolspaceru@yandex.ru"
                      target="_blank"
                      rel="noopener noreferrer"
                      className="bg-white p-5 rounded-[32px] border border-zinc-100 flex items-center justify-between shadow-sm active:scale-[0.98] transition-all group">

                        <div className="flex items-center gap-4">
                          <div className="w-12 h-12 rounded-2xl flex items-center justify-center bg-zinc-50 text-zinc-600">
                            <Mail className="w-5 h-5" />
                          </div>
                          <div className="text-left">
                            <h4 className="font-black text-sm">Написать на почту</h4>
                            <p className="text-[10px] font-bold text-zinc-400 uppercase mt-0.5">schoolspaceru@yandex.ru</p>
                          </div>
                        </div>
                        <ChevronRight className="w-6 h-6 text-zinc-300 group-hover:translate-x-1 transition-transform" />
                      </a>
                  </div>

                  <div className="pt-8 border-t border-zinc-100">
                  <p className="text-[10px] font-black text-zinc-300 uppercase tracking-[0.3em] text-center">Умникоины v1.0.4</p>
                </div>
              </div>
            </motion.div>
          </div>
        }
      </AnimatePresence>

      {/* Modals and Overlays */}
      <AnimatePresence>
        {/* Permission Dialog */}
          {showPermission &&
          <div className="fixed inset-0 z-[150] flex items-center justify-center p-6">
              <motion.div
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              onClick={() => !isGeoChecking && (setShowPermission(false), setGeoError(null), setGeoCheckProgress(0))}
              className="absolute inset-0 bg-zinc-900/60 backdrop-blur-md" />

              <motion.div
              initial={{ opacity: 0, scale: 0.9, y: 20 }}
              animate={{ opacity: 1, scale: 1, y: 0 }}
              exit={{ opacity: 0, scale: 0.9, y: 20 }}
              className="relative w-full max-w-sm bg-white rounded-[40px] p-8 shadow-2xl text-center">

                <div className="w-20 h-20 bg-blue-50 rounded-[30px] flex items-center justify-center mx-auto mb-6">
                  <MapPin className="w-10 h-10 text-blue-600" />
                </div>
                <h3 className="text-2xl font-black mb-3">Нужен доступ к GPS</h3>
                <p className="text-zinc-500 text-sm leading-relaxed mb-4">
                  Чтобы зафиксировать посещение в местах знаний, нам нужно получить информацию о Вашем местоположении.
                </p>

                {/* GPS Instructions */}
                <div className="bg-blue-50 rounded-2xl p-4 mb-4 text-left">
                  <p className="text-xs font-bold text-blue-700 mb-2">Как включить GPS:</p>
                  <ol className="text-xs text-blue-600 space-y-1 list-decimal list-inside">
                    <li>Откройте <b>Настройки</b> телефона</li>
                    <li>Перейдите в <b>Местоположение</b> (Геолокация)</li>
                    <li>Включите GPS и разрешите доступ для <b>VK</b></li>
                  </ol>
                </div>

                {/* Progress bar */}
                {isGeoChecking && (
                  <div className="mb-4">
                    <div className="flex justify-between items-center mb-1.5">
                      <span className="text-xs font-semibold text-zinc-600">{geoCheckPhase}</span>
                      <span className="text-xs font-bold text-blue-600">{geoCheckProgress}%</span>
                    </div>
                    <div className="w-full h-2.5 bg-zinc-100 rounded-full overflow-hidden">
                      <motion.div
                        className="h-full bg-gradient-to-r from-blue-500 to-indigo-500 rounded-full"
                        initial={{ width: 0 }}
                        animate={{ width: `${geoCheckProgress}%` }}
                        transition={{ duration: 0.3, ease: 'easeOut' }}
                      />
                    </div>
                  </div>
                )}

                {/* Inline error */}
                {geoError && (
                  <div className="bg-red-50 border border-red-200 rounded-2xl p-4 mb-4 flex items-start gap-3 text-left">
                    <div className="w-8 h-8 bg-red-100 rounded-full flex items-center justify-center shrink-0 mt-0.5">
                      <X className="w-4 h-4 text-red-500" />
                    </div>
                    <p className="text-xs text-red-600 leading-relaxed">{geoError}</p>
                  </div>
                )}

                <div className="flex flex-col gap-3">
                  <button
                  onClick={confirmCategoryVisit}
                  disabled={isGeoChecking}
                  className="w-full py-5 bg-blue-600 text-white rounded-[24px] font-black text-sm uppercase tracking-widest shadow-lg shadow-blue-200 active:scale-95 transition-all disabled:opacity-60 disabled:active:scale-100 relative overflow-hidden">
                    {isGeoChecking ? (
                      <span className="flex items-center justify-center gap-2">
                        <motion.span animate={{ rotate: 360 }} transition={{ repeat: Infinity, duration: 1, ease: 'linear' }} className="inline-block w-4 h-4 border-2 border-white/30 border-t-white rounded-full" />
                        Проверяем...
                      </span>
                    ) : geoError ? 'Попробовать ещё раз' : 'Разрешить и проверить'}
                  </button>
                  <button
                  onClick={() => { setShowPermission(false); setGeoError(null); setGeoCheckProgress(0); }}
                  className="w-full py-4 text-zinc-400 font-black text-xs uppercase tracking-widest active:scale-95 transition-all">
                    Не сейчас
                  </button>
                </div>
              </motion.div>
            </div>
          }

        {/* Success Dialog */}
        {showSuccess && successData &&
        <div className="fixed inset-0 z-[200] flex items-center justify-center p-6">
            <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="absolute inset-0 bg-zinc-900/40 backdrop-blur-xl" />

            <motion.div
            initial={{ opacity: 0, scale: 0.5, rotate: -10 }}
            animate={{ opacity: 1, scale: 1, rotate: 0 }}
            exit={{ opacity: 0, scale: 0.5 }}
            className="relative w-full max-w-sm bg-white rounded-[50px] p-10 shadow-2xl text-center overflow-hidden">

              <div className="absolute top-0 left-0 w-full h-2 bg-gradient-to-r from-blue-500 via-indigo-500 to-purple-500" />
              
              <motion.div
              animate={{ rotate: [0, 15, -15, 0] }}
              transition={{ duration: 0.5, delay: 0.2 }}
              className="w-24 h-24 bg-gradient-to-br from-yellow-400 to-orange-500 rounded-[35px] flex items-center justify-center mx-auto mb-8 shadow-xl shadow-orange-200">

                <Gem className="w-12 h-12 text-white fill-white" />
              </motion.div>
              
              <h3 className="text-3xl font-black mb-4">Успех!</h3>
              <p className="text-zinc-500 text-sm leading-relaxed mb-8 whitespace-pre-line">
                {successData.message}
              </p>
              
              <div className="bg-blue-50 rounded-3xl p-6 mb-8 inline-block min-w-[160px]">
                <span className="text-blue-600 text-3xl font-black">+{successData.coins}</span>
                <span className="text-blue-400 text-[10px] font-black uppercase tracking-widest block mt-1">Геотокенов</span>
              </div>
              
              <button
              onClick={() => setShowSuccess(false)}
              className="w-full py-5 bg-zinc-900 text-white rounded-[24px] font-black text-sm uppercase tracking-widest active:scale-95 transition-all shadow-xl">

                Отлично
              </button>
            </motion.div>
          </div>
        }

        {/* Goal Details Dialog */}
        {showGoalDetails &&
        <div className="fixed inset-0 z-[150] flex items-center justify-center p-6">
            <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            onClick={() => setShowGoalDetails(null)}
            className="absolute inset-0 bg-zinc-900/60 backdrop-blur-md" />

            <motion.div
            layoutId={`goal-${showGoalDetails}`}
            drag="y"
            dragConstraints={{ top: 0, bottom: 0 }}
            dragElastic={{ top: 0.1, bottom: 0.5 }}
            onDragEnd={(e, info) => {
              if (info.offset.y > 150 || info.velocity.y > 500) {
                setShowGoalDetails(null) ; 
              }
            }}
            className={cn(
              "relative w-full max-w-sm rounded-[40px] p-8 shadow-2xl",
              showGoalDetails === 'daily' ?
              "bg-gradient-to-br from-blue-500 to-indigo-600" :
              "bg-gradient-to-br from-pink-500 to-rose-600"
            )}>

              <button
              onClick={() => setShowGoalDetails(null)}
              className="absolute top-4 right-4 w-10 h-10 bg-white/20 rounded-full flex items-center justify-center text-white">

                <X className="w-5 h-5" />
              </button>
              
              <div className="text-center text-white">
                <div className="w-20 h-20 bg-white/20 rounded-[30px] flex items-center justify-center mx-auto mb-6">
                  {showGoalDetails === 'daily' ?
                <Target className="w-10 h-10" /> :

                <span className="text-4xl">🏆</span>
                }
                </div>
                
                <h3 className="text-2xl font-black mb-2">
                  {showGoalDetails === 'daily' ? 'Ежедневная цель' : 'Недельная цель'}
                </h3>
                
                <p className="text-white/80 text-sm mb-6">
                  {showGoalDetails === 'daily' ?
                'Посетите 8 мест знаний за день' :
                'Посетите 40 мест знаний за неделю'}
                </p>
                
                <div className="bg-white/20 rounded-[24px] p-4 mb-6">
                  <div className="flex justify-between text-sm font-bold mb-2">
                    <span>Прогресс</span>
                    <span>
                      {showGoalDetails === 'daily' ? stats.visitsToday : stats.visitsThisWeek}/
                      {showGoalDetails === 'daily' ? 8 : 40}
                    </span>
                  </div>
                  <div className="h-3 bg-white/30 rounded-full overflow-hidden">
                    <motion.div
                    initial={{ width: 0 }}
                    animate={{ width: `${showGoalDetails === 'daily' ? dailyProgress : weeklyProgress}%` }}
                    className="h-full bg-white rounded-full" />

                  </div>
                </div>
                
                <div className="bg-white/10 rounded-[20px] p-4 mb-6">
                  <div className="flex items-center justify-center gap-2">
                    <Gem className="w-6 h-6 fill-white" />
                    <span className="text-2xl font-black">
                      +{showGoalDetails === 'daily' ? 20 : 100}
                    </span>
                  </div>
                  <p className="text-white/60 text-xs mt-1">Награда за выполнение</p>
                </div>
                
                {showGoalDetails === 'daily' && dailyGoalReached && !stats.dailyClaimed ||
              showGoalDetails === 'weekly' && weeklyGoalReached && !stats.weeklyClaimed ?
              <button
                onClick={() => handleClaimGoal(showGoalDetails)}
                disabled={isClaimingGoal}
                className="w-full py-4 bg-white text-zinc-900 rounded-[20px] font-black text-sm uppercase tracking-wider active:scale-95 transition-all shadow-lg">

                    {isClaimingGoal ? 'Получение...' : 'Забрать награду'}
                  </button> :
              showGoalDetails === 'daily' && stats.dailyClaimed ||
              showGoalDetails === 'weekly' && stats.weeklyClaimed ?
              <div className="w-full py-4 bg-white/20 rounded-[20px] font-black text-sm uppercase tracking-wider flex items-center justify-center gap-2">
                    <CheckCircle2 className="w-5 h-5" />
                    Награда получена
                  </div> :

              <div className="w-full py-4 bg-white/10 rounded-[20px] font-bold text-sm">
                    Продолжайте посещать места знаний
                  </div>
              }
              </div>
            </motion.div>
          </div>
        }

        {/* Scan Modal */}
        <AnimatePresence>
          {showScanModal &&
          <div className="fixed inset-0 z-[160] flex items-center justify-center p-6">
              <motion.div
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              onClick={scanDone ? closeScanModal : undefined}
              className="absolute inset-0 bg-zinc-900/60 backdrop-blur-md" />

              <motion.div
              initial={{ opacity: 0, scale: 0.85, y: 40 }}
              animate={{ opacity: 1, scale: 1, y: 0 }}
              exit={{ opacity: 0, scale: 0.85, y: 40 }}
              transition={{ type: "spring", damping: 22, stiffness: 260 }}
              className="relative w-full max-w-sm rounded-[40px] bg-gradient-to-br from-emerald-500 via-teal-500 to-cyan-600 p-8 shadow-2xl overflow-hidden">

                {/* Decorative glow */}
                <div className="absolute -top-20 -right-20 w-48 h-48 bg-white/10 rounded-full blur-3xl" />
                <div className="absolute -bottom-16 -left-16 w-40 h-40 bg-cyan-300/20 rounded-full blur-3xl" />

                <button
                onClick={closeScanModal}
                className="absolute top-4 right-4 w-10 h-10 bg-white/20 rounded-full flex items-center justify-center text-white z-50 cursor-pointer hover:bg-white/30 transition-colors">

                  <X className="w-5 h-5" />
                </button>

                <div className="text-center text-white relative z-10">
                  {/* Animated radar icon */}
                  <div className="w-20 h-20 mx-auto mb-6 relative">
                    <motion.div
                    className="absolute inset-0 bg-white/20 rounded-[30px]"
                    animate={!scanDone ? { scale: [1, 1.2, 1], opacity: [0.3, 0.1, 0.3] } : {}}
                    transition={{ duration: 1.5, repeat: Infinity, ease: "easeInOut" }} />

                    <div className="absolute inset-0 bg-white/20 rounded-[30px] flex items-center justify-center">
                      {scanDone ?
                    <motion.div initial={{ scale: 0 }} animate={{ scale: 1 }} transition={{ type: "spring" }}>
                          <CheckCircle2 className="w-10 h-10" />
                        </motion.div> :

                    <motion.div
                      animate={{ rotate: 360 }}
                      transition={{ duration: 2, repeat: Infinity, ease: "linear" }}>

                          <Radar className="w-10 h-10" />
                        </motion.div>
                    }
                    </div>
                  </div>

                  <h3 className="text-2xl font-black mb-1">
                    {scanDone ? 'Поиск завершён' : 'Поиск знаний'}
                  </h3>
                  <p className="text-white/70 text-sm mb-6">
                    {scanDone ?
                  scanTotalCoins > 0 ?
                  `Найдено ${scanResults.filter((r) => r.status === 'success').length} из ${KNOWLEDGE_CATEGORIES.length} категорий` :
                  'Рядом мест знаний не обнаружено' :
                  'Сканирование области вокруг Вас...'}
                  </p>

                  {/* Category list */}
                  <div className="space-y-2.5 mb-6">
                    {KNOWLEDGE_CATEGORIES.map((cat, i) => {
                    const result = scanResults.find((r) => r.id === cat.id);
                    const status = result?.status || 'scanning';
                    const isActive = status === 'scanning' && !scanDone;
                    const isChecked = status === 'success' || status === 'fail' || status === 'cooldown';

                    return (
                      <motion.div
                        key={cat.id}
                        initial={{ opacity: 0, x: -20 }}
                        animate={{ opacity: 1, x: 0 }}
                        transition={{ delay: i * 0.08 }}
                        className={cn(
                          "flex items-center gap-3 px-4 py-3 rounded-[20px] transition-all",
                          isActive ?
                          "bg-white/25 ring-2 ring-white/40" :
                            status === 'cooldown' ?
                            "bg-amber-900/20 ring-1 ring-amber-400/20" :
                            isChecked ?
                            "bg-white/10" :
                          "bg-white/5"
                        )}>

                          <div className={cn(
                          "w-10 h-10 rounded-[14px] flex items-center justify-center shrink-0 transition-all",
                            status === 'success' ?
                            "bg-green-400/30 text-green-200" :
                            status === 'cooldown' ?
                            "bg-amber-400/20 text-amber-200" :
                            status === 'fail' ?
                            "bg-white/10 text-white/40" :
                            "bg-white/15 text-white"
                        )}>
                            {cat.icon}
                          </div>
                          <div className="flex-1 text-left min-w-0">
                            <p className={cn(
                            "text-sm font-bold leading-tight",
                            status === 'fail' ? "text-white/40" : status === 'cooldown' ? "text-amber-200" : "text-white"
                          )}>
                              {cat.name}
                            </p>
                              {isChecked && result?.message && 
                            <p className={cn("text-[11px] mt-0.5 truncate", status === 'cooldown' ? "text-amber-300/70" : "text-white/50")}>
                              {status === 'cooldown' && result.remainingMin ? `\u23F3 ${result.remainingMin >= 60 ? Math.floor(result.remainingMin / 60) + " ч " + (result.remainingMin % 60) + " мин" : result.remainingMin + " мин"}` : result.message}
                            </p>
                            }
                          </div>
                          <div className="shrink-0">
                            {isActive ?
                          <div className="w-5 h-5 border-2 border-white/40 border-t-white rounded-full animate-spin" /> :
                          status === 'success' ?
                          <motion.div
                            initial={{ scale: 0 }}
                            animate={{ scale: 1 }}
                            transition={{ type: "spring", damping: 12 }}
                            className="w-7 h-7 bg-green-400 rounded-full flex items-center justify-center">

                                <CheckCircle2 className="w-4 h-4 text-white" />
                              </motion.div> :
                            status === 'cooldown' ?
                            <motion.div
                              initial={{ scale: 0 }}
                              animate={{ scale: 1 }}
                              transition={{ type: "spring", damping: 12 }}
                              className="w-7 h-7 bg-amber-400/30 rounded-full flex items-center justify-center">
                                  <Clock className="w-4 h-4 text-amber-200" />
                                </motion.div> :
                          status === 'fail' ?
                          <motion.div
                            initial={{ scale: 0 }}
                            animate={{ scale: 1 }}
                            className="w-7 h-7 bg-white/10 rounded-full flex items-center justify-center">

                                <X className="w-4 h-4 text-white/30" />
                              </motion.div> :

                          <div className="w-7 h-7 bg-white/5 rounded-full" />
                          }
                          </div>
                        </motion.div>);

                  })}
                  </div>

                  {/* Coins summary */}
                  {scanTotalCoins > 0 &&
                <motion.div
                  initial={{ opacity: 0, y: 10 }}
                  animate={{ opacity: 1, y: 0 }}
                  className="bg-white/15 rounded-[20px] p-4 mb-4">

                      <div className="flex items-center justify-center gap-2">
                        <Gem className="w-6 h-6 fill-white" />
                        <span className="text-2xl font-black">+{scanTotalCoins}</span>
                      </div>
                      <p className="text-white/50 text-xs mt-1">Заработано геотокенов</p>
                    </motion.div>
                }

                  {/* Close button */}
                  {scanDone &&
                <motion.button
                  initial={{ opacity: 0, y: 10 }}
                  animate={{ opacity: 1, y: 0 }}
                  onClick={closeScanModal}
                  className="w-full py-4 bg-white text-teal-700 rounded-[20px] font-black text-sm uppercase tracking-wider active:scale-95 transition-all shadow-lg">

                      Готово
                    </motion.button>
                }

                  {/* Progress bar during scan */}
                  {!scanDone &&
                <div className="h-2 bg-white/10 rounded-full overflow-hidden">
                      <motion.div
                    className="h-full bg-white/40 rounded-full"
                    animate={{
                      width: `${scanResults.filter((r) => r.status !== 'scanning').length / KNOWLEDGE_CATEGORIES.length * 100}%`
                    }}
                    transition={{ duration: 0.5 }} />

                    </div>
                }
                </div>
            </motion.div>
          </div>
        }

        {/* Unfollow Confirmation Dialog */}
        {pendingUnfollowFriend && 
        <div className="fixed inset-0 z-[150] flex items-center justify-center p-6">
            <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            onClick={cancelUnfollow}
            className="absolute inset-0 bg-zinc-900/60 backdrop-blur-md" />

            <motion.div
            initial={{ opacity: 0, scale: 0.9, y: 20 }}
            animate={{ opacity: 1, scale: 1, y: 0 }}
            exit={{ opacity: 0, scale: 0.9, y: 20 }}
            className="relative w-full max-w-sm bg-white rounded-[40px] p-8 shadow-2xl text-center">

              <div className="w-20 h-20 bg-red-50 rounded-[30px] flex items-center justify-center mx-auto mb-6">
                <UserMinus className="w-10 h-10 text-red-500" />
              </div>
              <h3 className="text-2xl font-black mb-3">Прекратить отслеживание?</h3>
              <p className="text-zinc-500 text-sm leading-relaxed mb-6">
                Вы уверены, что хотите перестать отслеживать {pendingUnfollowFriend.first_name}? Вы больше не будете видеть его посещения на карте.
              </p>

              <div className="flex gap-3">
                <button
                  onClick={cancelUnfollow}
                  className="flex-1 py-3 px-4 bg-zinc-100 text-zinc-700 font-bold rounded-2xl transition-colors hover:bg-zinc-200">
                  Отмена
                </button>
                <button
                  onClick={confirmUnfollow}
                  className="flex-1 py-3 px-4 bg-red-500 text-white font-bold rounded-2xl transition-colors hover:bg-red-600">
                  Отписаться
                </button>
              </div>
            </motion.div>
          </div>
        }
      </AnimatePresence>

        {/* Category Detail Modal */}
        {selectedCategory &&
        <div className="fixed inset-0 z-[150] flex items-center justify-center p-6">
            <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            onClick={() => setSelectedCategory(null)}
            className="absolute inset-0 bg-zinc-900/60 backdrop-blur-md" />

            <motion.div
            initial={{ opacity: 0, scale: 0.9, y: 20 }}
            animate={{ opacity: 1, scale: 1, y: 0 }}
            exit={{ opacity: 0, scale: 0.9, y: 20 }}
            drag="y"
            dragConstraints={{ top: 0, bottom: 0 }}
            dragElastic={{ top: 0.1, bottom: 0.5 }}
            onDragEnd={(e, info) => {
              if (info.offset.y > 150 || info.velocity.y > 500) {
                setSelectedCategory(null) ; 
              }
            }}
            className="relative w-full max-w-sm bg-white rounded-[40px] p-8 shadow-2xl">

              <button
              onClick={() => setSelectedCategory(null)}
              className="absolute top-4 right-4 w-10 h-10 bg-zinc-100 rounded-full flex items-center justify-center text-zinc-500">

                <X className="w-5 h-5" />
              </button>
              
              <div className={cn(
              "w-20 h-20 rounded-[30px] flex items-center justify-center mx-auto mb-6 text-white bg-gradient-to-br",
              selectedCategory.gradient
            )}>
                {selectedCategory.icon}
              </div>
              
              <h3 className="text-2xl font-black text-center mb-2">{selectedCategory.name}</h3>
              <p className="text-zinc-500 text-sm text-center mb-6">{selectedCategory.desc}</p>
              
              <div className="bg-zinc-50 rounded-[24px] p-4 mb-6">
                <div className="flex justify-between items-center">
                  <span className="text-zinc-500 text-sm font-bold">Всего посещений</span>
                  <span className="text-zinc-900 text-lg font-black">
                    {categoryStats[selectedCategory.id]?.count || 0}
                  </span>
                </div>
              </div>
              
                <button
                  onClick={() => {
                    setSelectedCategory(null) ; setActiveTab('history') ; }}
                  className="w-full py-4 rounded-[20px] font-black text-sm tracking-wider active:scale-95 transition-all bg-zinc-100 text-zinc-700 flex items-center justify-center gap-2 mb-3">
                    <HistoryIcon className="w-5 h-5" />
                    История посещений
                </button>

                <a
                  href="https://vk.me/join/ClQF8cb557n5YW3YYF9wcOIrUevgsOPYgDg="
                  target="_blank"
                  rel="noopener noreferrer"
                  className="w-full py-3 rounded-[20px] font-bold text-xs tracking-wide active:scale-95 transition-all border-2 border-dashed border-zinc-200 text-zinc-400 flex items-center justify-center gap-2 hover:border-zinc-300 hover:text-zinc-500">
                    <MessageCircle className="w-4 h-4" />
                    Место отсутствует? Напишите нам
                </a>
            </motion.div>
          </div>
        }

        {/* Friend Detail Modal */}
        {selectedFriend &&
        <div className="fixed inset-0 z-[150] flex items-center justify-center p-6">
            <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            onClick={() => {
              setSelectedFriend(null);
              setSelectedFriendStats(null);
            }}
            className="absolute inset-0 bg-zinc-900/60 backdrop-blur-md" />

            <motion.div
            initial={{ opacity: 0, scale: 0.9, y: 20 }}
            animate={{ opacity: 1, scale: 1, y: 0 }}
            exit={{ opacity: 0, scale: 0.9, y: 20 }}
            drag="y"
            dragConstraints={{ top: 0, bottom: 0 }}
            dragElastic={{ top: 0.1, bottom: 0.5 }}
            onDragEnd={(e, info) => {
              if (info.offset.y > 150 || info.velocity.y > 500) {
                setSelectedFriend(null) ; 
                setSelectedFriendStats(null) ; 
              }
            }}
            className="relative w-full max-w-sm bg-white rounded-[40px] p-8 shadow-2xl max-h-[80vh] overflow-y-auto">

              <button
              onClick={() => {
                setSelectedFriend(null);
                setSelectedFriendStats(null);
              }}
              className="absolute top-4 right-4 w-10 h-10 bg-zinc-100 rounded-full flex items-center justify-center text-zinc-500">

                <X className="w-5 h-5" />
              </button>
              
              <div className="text-center mb-6">
                <img
                src={selectedFriend.photo_200 || AVATAR_PLACEHOLDER}
                alt={selectedFriend.first_name}
                className="w-24 h-24 rounded-[32px] mx-auto mb-4 object-cover border-4 border-zinc-100" />

                <h3 className="text-2xl font-black">{formatName(selectedFriend.first_name, selectedFriend.last_name)}</h3>
              </div>
              
              {selectedFriendStats ?
            <>
                  <div className="bg-gradient-to-br from-blue-500 to-indigo-600 rounded-[24px] p-5 text-white text-center mb-6">
                    <div className="flex items-center justify-center gap-2 mb-1">
                      <Gem className="w-6 h-6 fill-white" />
                      <span className="text-3xl font-black">{selectedFriendStats.balance}</span>
                    </div>
                    <p className="text-white/60 text-xs font-bold uppercase tracking-wider">Геотокенов</p>
                  </div>
                  
                  <div>
                    <h4 className="font-black text-sm text-zinc-900 mb-3">Последние посещения</h4>
                    <div className="space-y-2 max-h-48 overflow-y-auto">
                      {selectedFriendStats.isPrivate ? (
                        <div className="flex items-center justify-center gap-2 p-4 bg-zinc-50 rounded-xl">
                          <Lock className="w-4 h-4 text-zinc-400" />
                          <p className="text-center text-zinc-400 text-sm">Приватная история</p>
                        </div>
                      ) : selectedFriendStats.history.length > 0 ? selectedFriendStats.history.slice(0, 5).map((visit: any, idx: number) =>
                  <div key={idx} className="flex items-center gap-3 p-3 bg-zinc-50 rounded-xl">
                          <div className="w-8 h-8 bg-indigo-100 rounded-lg flex items-center justify-center text-indigo-600 font-black text-xs">
                            {visit.category?.[0] || '?'}
                          </div>
                          <div className="flex-1 min-w-0">
                            <p className="text-sm font-bold text-zinc-900 truncate">{visit.location_name}</p>
                            <p className="text-[10px] text-zinc-400">
                              {new Date(visit.visited_at).toLocaleDateString('ru-RU', { day: 'numeric', month: 'short' })}
                            </p>
                          </div>
                        </div>
                  ) :
                  <p className="text-center text-zinc-400 text-sm py-4">Нет посещений</p>
                  }
                    </div>
                  </div>
                </> :

            <div className="flex items-center justify-center py-8">
                  <div className="w-8 h-8 border-2 border-blue-600 border-t-transparent rounded-full animate-spin" />
                </div>
            }
            </motion.div>
          </div>
        }

        {/* Location Detail Modal - Bottom Sheet Style */}
        {selectedLocation && (
        <motion.div 
          initial={{ opacity: 0, y: '100%' }}
          animate={{ opacity: 1, y: 0 }}
          exit={{ opacity: 0, y: '100%' }}
          transition={{ type: 'spring', damping: 25, stiffness: 200 }}
          className="fixed inset-0 z-[160] flex items-end justify-center pointer-events-none">
          
          <motion.div 
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            onClick={() => {
              setSelectedLocation(null);
              setSelectedLocationStats(null);
            }}
            className="absolute inset-0 bg-zinc-900/60 backdrop-blur-md pointer-events-auto" />

          <motion.div 
            initial={{ y: '100%' }}
            animate={{ y: 0 }}
            exit={{ y: '100%' }}
            drag="y"
            dragConstraints={{ top: 0, bottom: 0 }}
            dragElastic={{ top: 0.1, bottom: 0.5 }}
            onDragEnd={(e, info) => {
              if (info.offset.y > 150 || info.velocity.y > 500) {
                setSelectedLocation(null);
                setSelectedLocationStats(null);
              }
            }}
            className="relative w-full bg-white rounded-t-[48px] p-8 max-h-[85vh] overflow-y-auto pointer-events-auto">

            <div className="w-12 h-1.5 bg-zinc-200 rounded-full mx-auto mb-8 cursor-grab active:cursor-grabbing pointer-events-none" />

            <div className="flex items-center justify-between mb-8">
              <h2 className="text-2xl font-black">О месте</h2>
              <button
              onClick={() => {
                setSelectedLocation(null);
                setSelectedLocationStats(null);
              }}
                className="w-12 h-12 rounded-2xl bg-zinc-50 flex items-center justify-center active:scale-90 transition-all cursor-pointer hover:bg-zinc-100 z-50 relative">
                  <X className="w-6 h-6" />
              </button>
            </div>

            <div className="space-y-6">
              {/* Place Info */}
              <div className="flex items-center gap-4 p-5 bg-zinc-50 rounded-[32px]">
                <div className={cn(
                  "w-14 h-14 rounded-2xl flex items-center justify-center",
                  selectedLocation.category === 'Вуз' || selectedLocation.category === 'Школа' || selectedLocation.category === 'Колледж' ? "bg-blue-50 text-blue-600" :
                  selectedLocation.category === 'Библиотека' ? "bg-violet-50 text-violet-600" :
                  selectedLocation.category === 'Музей' ? "bg-pink-50 text-pink-600" :
                  "bg-orange-50 text-orange-600"
                )}>
                  {selectedLocation.category === 'Вуз' || selectedLocation.category === 'Школа' || selectedLocation.category === 'Колледж' ? <GraduationCap className="w-7 h-7" /> :
                   selectedLocation.category === 'Библиотека' ? <BookA className="w-7 h-7" /> :
                   selectedLocation.category === 'Музей' ? <Landmark className="w-7 h-7" /> :
                   <Pyramid className="w-7 h-7" />}
                </div>
                <div>
                  <h4 className="font-black text-lg leading-tight">{selectedLocation.name}</h4>
                  <p className="text-zinc-400 text-xs font-bold mt-1 uppercase tracking-wider">{selectedLocation.category}</p>
                </div>
              </div>

              {/* Not visited banner */}
              {selectedLocationStats && !selectedLocationStats.userHasVisited && (
                <div className="bg-orange-50 border border-orange-200 rounded-2xl p-4 flex items-center gap-3">
                  <div className="w-10 h-10 rounded-xl bg-orange-100 flex items-center justify-center">
                    <MapPin className="w-5 h-5 text-orange-600" />
                  </div>
                  <div>
                    <p className="font-black text-sm text-orange-800">Вы ещё здесь не были</p>
                    <p className="text-orange-600 text-xs">Зачекиньтесь, чтобы получить баллы</p>
                  </div>
                </div>
              )}

              {/* Stats */}
              {selectedLocationStats ? (
                <>
                  <div className="bg-gradient-to-br from-blue-500 to-indigo-600 rounded-[24px] p-5 text-white text-center">
                    <div className="flex items-center justify-center gap-2 mb-1">
                      <Users className="w-6 h-6" />
                      <span className="text-3xl font-black">{selectedLocationStats.totalVisits}</span>
                    </div>
                    <p className="text-white/60 text-xs font-bold uppercase tracking-wider">Всего посещений</p>
                  </div>

                  {/* Recent Visitors */}
                  <div>
                    <h4 className="font-black text-sm text-zinc-900 mb-3">Последние посетители</h4>
                    <div className="space-y-2">
                      {selectedLocationStats.recentVisitors.length > 0 ? 
                        selectedLocationStats.recentVisitors.map((visitor: any, idx: number) => (
                          <div key={idx} className="flex items-center gap-3 p-3 bg-zinc-50 rounded-xl">
                            <img
                              src={visitor.photo_200 || AVATAR_PLACEHOLDER}
                              alt={visitor.first_name}
                              className="w-10 h-10 rounded-xl object-cover" />
                            <div className="flex-1 min-w-0">
                              <p className="text-sm font-bold text-zinc-900 truncate">
                                {visitor.first_name} {visitor.last_name}
                              </p>
                              <p className="text-[10px] text-zinc-400">
                                {new Date(visitor.visited_at).toLocaleDateString('ru-RU', { day: 'numeric', month: 'short' })}
                              </p>
                            </div>
                          </div>
                        )) :
                        <p className="text-center text-zinc-400 text-sm py-4">Нет посетителей</p>
                      }
                    </div>
                  </div>
                </>
              ) : isLoadingLocation ? (
                <div className="flex items-center justify-center py-8">
                  <div className="w-8 h-8 border-2 border-blue-600 border-t-transparent rounded-full animate-spin" />
                </div>
              ) : null}
            </div>
          </motion.div>
        </motion.div>
        )}

        {/* Admin Balance Editor Modal */}
        {editingUser &&
        <div className="fixed inset-0 z-[150] flex items-center justify-center p-6">
            <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            onClick={() => setEditingUser(null)}
            className="absolute inset-0 bg-zinc-900/60 backdrop-blur-md" />

            <motion.div
            initial={{ opacity: 0, scale: 0.9, y: 20 }}
            animate={{ opacity: 1, scale: 1, y: 0 }}
            exit={{ opacity: 0, scale: 0.9, y: 20 }}
            drag="y"
            dragConstraints={{ top: 0, bottom: 0 }}
            dragElastic={{ top: 0.1, bottom: 0.5 }}
            onDragEnd={(e, info) => {
              if (info.offset.y > 150 || info.velocity.y > 500) {
                setEditingUser(null) ; 
              }
            }}
            className="relative w-full max-w-sm bg-white rounded-[40px] p-8 shadow-2xl">

              <button
              onClick={() => setEditingUser(null)}
              className="absolute top-4 right-4 w-10 h-10 bg-zinc-100 rounded-full flex items-center justify-center text-zinc-500">

                <X className="w-5 h-5" />
              </button>
              
              <div className="text-center mb-6">
                <img
                src={editingUser.avatar || AVATAR_PLACEHOLDER}
                alt={editingUser.name}
                className="w-20 h-20 rounded-[28px] mx-auto mb-4 object-cover border-4 border-zinc-100" />

                <h3 className="text-xl font-black">{editingUser.name}</h3>
                <p className="text-zinc-400 text-xs">ID: {editingUser.id}</p>
              </div>
              
              <div className="mb-6">
                <label className="block text-sm font-bold text-zinc-500 mb-2">Новый баланс</label>
                <input
                type="number"
                value={newBalanceValue}
                onChange={(e) => setNewBalanceValue(e.target.value)}
                className="w-full px-4 py-3 bg-zinc-50 border border-zinc-200 rounded-2xl font-black text-lg text-center focus:outline-none focus:ring-2 focus:ring-blue-500" />

              </div>
              
              <button
              onClick={async () => {
                if (!editingUser) return ;
                setIsSavingBalance(true) ;
                try {
                  const newVal = parseInt(newBalanceValue) || 0 ;
                  const result = await UmnicoinService.updateUserBalance(editingUser.id, newVal) ;
                  if (result.success) {
                    setMessage(`Баланс ${editingUser.name} обновлен`) ;
                    setMessageType('info') ;
                    setEditingUser(null) ;
                    fetchRanking() ;
                  } else {
                    setMessage(result.message || 'Ошибка при сохранении') ;
                    setMessageType('error') ;
                  }
                } catch (err) {
                  setMessage('Ошибка при сохранении') ;
                  setMessageType('error') ;
                } finally {
                  setIsSavingBalance(false) ;
                  setTimeout(() => setMessage(null), 3000) ;
                }
              }}
              disabled={isSavingBalance}
              className="w-full py-5 bg-blue-600 text-white rounded-[24px] font-black text-sm uppercase tracking-widest shadow-lg shadow-blue-200 active:scale-95 transition-all">

                {isSavingBalance ? 'Сохранение...' : 'Сохранить изменения'}
              </button>
            </motion.div>
          </div>
        }
      </AnimatePresence>

      {/* Navigation */}
      <nav className="fixed bottom-8 left-4 right-4 z-40">
        <div className="bg-white/80 backdrop-blur-2xl border border-white/50 p-3 rounded-[32px] shadow-[0_8px_32px_rgba(0,0,0,0.1)] flex items-center justify-between">
          {[
          { id: 'main', label: 'Карта', icon: <MapIcon className="w-4 h-4" /> },
          { id: 'friends', label: 'Друзья', icon: <Users className="w-4 h-4" /> },
          { id: 'quests', label: 'Квесты', icon: <Gamepad2 className="w-4 h-4" /> },
          { id: 'history', label: 'История', icon: <HistoryIcon className="w-4 h-4" /> },
          { id: 'rating', label: 'Рейтинг', icon: <Trophy className="w-4 h-4" /> }].
          map((tab) =>
          <button
            key={tab.id}
            onClick={() => {
              setActiveTab(tab.id as Tab);
              if (tab.id === 'main') setIsExpanded(true);
            }}
            className={cn(
              "flex-1 flex flex-col items-center gap-0.5 px-1 py-1.5 rounded-2xl transition-all active:scale-90",
              activeTab === tab.id ?
              "bg-blue-600 text-white shadow-lg shadow-blue-200" :
              "text-zinc-400 hover:text-zinc-600 hover:bg-zinc-50"
            )}>

              {tab.icon}
              <span className="text-[7px] font-black uppercase tracking-wider">{tab.label}</span>
            </button>
          )}
        </div>
      </nav>

      {/* Zombie Mode */}
      {showZombieMode && user &&
      <ZombieMode
        vkId={user.id}
        onExit={() => setShowZombieMode(false)}
        userPosition={userPos}
        userPhoto={user.photo_200} />

      }
    </div>);

}