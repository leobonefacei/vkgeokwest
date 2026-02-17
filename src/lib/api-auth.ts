import { NextRequest, NextResponse } from 'next/server';
import { verifyLaunchParams, VerifiedUser } from './vk-auth';

/**
 * Extracts and verifies VK launch params from request.
 * Returns verified user or a 401 NextResponse.
 */
export function authenticateRequest(req: NextRequest): VerifiedUser | NextResponse {
  const launchParams = req.headers.get('x-launch-params') || '';
  
  console.log('[api-auth] Launch params:', launchParams ? 'present' : 'missing');

  if (!launchParams) {
    return NextResponse.json({ error: 'Missing launch params' }, { status: 401 });
  }

  const user = verifyLaunchParams(launchParams);
  if (!user) {
    return NextResponse.json({ error: 'Invalid launch params signature' }, { status: 401 });
  }

  return user;
}

/**
 * Type guard: checks if the result is a NextResponse (error) or a VerifiedUser.
 */
export function isAuthError(result: VerifiedUser | NextResponse): result is NextResponse {
  return result instanceof NextResponse;
}
