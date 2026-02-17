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
  if (!VK_SECRET || !searchParams) return null;

  try {
    const urlParams = new URLSearchParams(searchParams);
    const sign = urlParams.get('sign');
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

    if (hash !== sign) return null;

    const vkUserId = urlParams.get('vk_user_id');
    if (!vkUserId) return null;

    return { vk_user_id: Number(vkUserId) };
  } catch {
    return null;
  }
}
