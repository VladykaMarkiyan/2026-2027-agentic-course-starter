import { NextResponse } from 'next/server';
import { HealthResponse } from '../../../src/health';

/**
 * GET /api/health
 * Returns current server status and timestamp.
 * Implemented by: OpenCode (lab1/health-opencode branch)
 */
export async function GET(): Promise<NextResponse<HealthResponse>> {
  const body: HealthResponse = {
    status: 'ok',
    timestamp: new Date().toISOString(),
  };
  return NextResponse.json(body);
}
