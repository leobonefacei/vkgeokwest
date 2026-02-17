import crypto from 'node:crypto';

const VK_SECRET = process.env.VK_NOTIFICATION_SERVER_KEY || '';

export interface VerifiedUser {
  vk_user_id: number;
}

/**
 * Verifies VK Mini App launch parameters using HMAC-SHA256.
 * Returns the verified vk_user_id or null if invalid.
 */
export function verifyLaunchParams(searchParams: string): VerifiedUser | null {
  console.log('[vk-auth] VK_SECRET present:', !!VK_SECRET);
  console.log('[vk-auth] searchParams present:', !!searchParams);
  console.log('[vk-auth] searchParams length:', searchParams?.length);
  
  if (!VK_SECRET || !searchParams) {
    console.log('[vk-auth] Missing VK_SECRET or searchParams');
    return null;
  }

  try {
    const urlParams = new URLSearchParams(searchParams);
    const sign = urlParams.get('sign');
    console.log('[vk-auth] sign present:', !!sign);
    
    // Allow dev_mode in development
    if (sign === 'dev_mode' && process.env.NODE_ENV === 'development') {
      console.log('[vk-auth] Dev mode bypass');
      const vkUserId = urlParams.get('vk_user_id');
      if (vkUserId) {
        return { vk_user_id: Number(vkUserId) };
      }
      return null;
    }
    
    if (!sign) return null;

    // Filter only vk_ params, sort alphabetically
    const vkParams: { key: string; value: string }[] = [];
    urlParams.forEach((value, key) => {
      if (key.startsWith('vk_')) {
        vkParams.push({ key, value });
      }
    });

    if (vkParams.length === 0) return null;

    vkParams.sort((a, b) => a.key.localeCompare(b.key));

    const queryString = vkParams
      .map(({ key, value }) => `${encodeURIComponent(key)}=${encodeURIComponent(value)}`)
      .join('&');

    // HMAC-SHA256 with Base64URL encoding
    const hash = crypto
      .createHmac('sha256', VK_SECRET)
      .update(queryString)
      .digest('base64')
      .replace(/\+/g, '-')
      .replace(/\//g, '_')
      .replace(/=+$/, '');

    console.log('[vk-auth] hash matches sign:', hash === sign);
    if (hash !== sign) return null;

    const vkUserId = urlParams.get('vk_user_id');
    console.log('[vk-auth] vk_user_id present:', !!vkUserId);
    if (!vkUserId) return null;

    console.log('[vk-auth] Authentication successful for user:', vkUserId);
    return { vk_user_id: Number(vkUserId) };
  } catch (err) {
    console.log('[vk-auth] Error during verification:', err);
    return null;
  }
}
