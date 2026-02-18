import { type ClassValue, clsx } from "clsx"
import { twMerge } from "tailwind-merge"

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs))
}

const VK_PHOTO_DOMAINS = [
  'vk.com',
  'userapi.com',
  'vk-cdn.net',
  'vkontakte.ru',
  'vk.me',
  'pp.vk.me',
  'vkmessenger.com',
  'm.vk.com',
  'static.vk.com',
]

export function isAllowedPhotoUrl(url: string | null | undefined): boolean {
  if (!url || typeof url !== 'string') return false;
  
  try {
    const parsed = new URL(url);
    const protocol = parsed.protocol;
    
    if (protocol !== 'https:' && protocol !== 'http:') return false;
    
    const host = parsed.hostname.toLowerCase();
    
    for (const domain of VK_PHOTO_DOMAINS) {
      if (host === domain || host.endsWith('.' + domain)) {
        return true;
      }
    }
    
    return false;
  } catch {
    return false;
  }
}
