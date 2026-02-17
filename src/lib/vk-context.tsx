'use client';

import { createContext, useContext, useEffect, useState, ReactNode } from 'react';
import bridge, { UserInfo, LaunchParams, parseURLSearchParamsForGetLaunchParams } from '@vkontakte/vk-bridge';
import { useSearchParams } from 'next/navigation';

interface VKContextType {
  launchParams: LaunchParams | null;
  rawLaunchParams: string;
  user: UserInfo | null;
  initialized: boolean;
}

const VKContext = createContext<VKContextType | null>(null);

// Global accessor for raw launch params (used by services that don't have React context)
let _rawLaunchParams = '';
export function getRawLaunchParams(): string {
  return _rawLaunchParams;
}

export function VKProvider({ children }: { children: ReactNode }) {
  const searchParams = useSearchParams();
  const [launchParams, setLaunchParams] = useState<LaunchParams | null>(null);
  const [rawLaunchParams, setRawLaunchParams] = useState('');
  const [user, setUser] = useState<UserInfo | null>(null);
  const [initialized, setInitialized] = useState(false);

  useEffect(() => {
    const rawParams = searchParams.toString();
    _rawLaunchParams = rawParams;
    setRawLaunchParams(rawParams);

    const params = parseURLSearchParamsForGetLaunchParams(rawParams);
    setLaunchParams(params);

    bridge.send('VKWebAppInit')
      .then(() => {
        setInitialized(true);
        return bridge.send('VKWebAppGetUserInfo');
      })
      .then((userData) => {
        setUser(userData);
      })
      .catch((err) => {
        console.error('VK Bridge Init Error:', err);
        // Fallback for development outside VK
        if (typeof window !== 'undefined' && (process.env.NODE_ENV === 'development' || !window.location.href.includes('vk.com'))) {
          console.log('Using fallback user for development');
          setUser({
            id: 1,
            first_name: 'Иван',
            last_name: 'Иванов',
            photo_200: 'https://vk.com/images/camera_200.png',
            city: { id: 1, title: 'Москва' },
            country: { id: 1, title: 'Россия' },
            timezone: 3,
            sex: 2,
            bdate: '01.01.1990'
          } as any);
          
          // Create mock launch params for development (will bypass signature check in dev mode)
          const mockParams = 'vk_user_id=1&vk_app_id=53317461&vk_platform=desktop_web&sign=dev_mode';
          _rawLaunchParams = mockParams;
          setRawLaunchParams(mockParams);
          console.log('[VKContext] Set mock launch params for development');
        }
        setInitialized(true);
      });
  }, [searchParams]);

  return (
    <VKContext.Provider value={{ launchParams, rawLaunchParams, user, initialized }}>
      {children}
    </VKContext.Provider>
  );
}

export const useVKBridge = () => {
  const ctx = useContext(VKContext);
  if (!ctx) throw new Error('useVKBridge must be used within VKProvider');
  return ctx;
};
