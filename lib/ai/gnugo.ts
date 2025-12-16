/**
 * GnuGo AI integration
 * Communicates with GnuGo server via HTTP/WebSocket
 */

const GNUGO_SERVER_URL = process.env.GNUGO_SERVER_URL || 'http://localhost:3001';

export interface GnuGoMove {
  x: number;
  y: number;
  pass?: boolean;
}

export interface GnuGoRequest {
  board: string[][]; // 'B', 'W', or null
  currentPlayer: 'black' | 'white';
  moveHistory?: Array<{ x: number; y: number; player: 'black' | 'white' }>;
  level?: number; // 난이도 레벨 (1-10, 기본값: 5)
}

/**
 * Get AI move from GnuGo
 * @param request GnuGo request with optional level (1-10)
 */
export async function getGnuGoMove(request: GnuGoRequest): Promise<GnuGoMove | null> {
  try {
    // 기본 난이도는 5단계
    const requestWithLevel = {
      ...request,
      level: request.level || 5,
    };
    
    const response = await fetch(`${GNUGO_SERVER_URL}/move`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(requestWithLevel),
      signal: AbortSignal.timeout(30000), // 30 second timeout
    });

    if (!response.ok) {
      throw new Error(`GnuGo server error: ${response.statusText}`);
    }

    const data = await response.json();
    return data.move as GnuGoMove;
  } catch (error) {
    console.error('GnuGo request error:', error);
    return null;
  }
}

/**
 * Check if GnuGo server is available
 */
export async function checkGnuGoServer(): Promise<boolean> {
  try {
    const response = await fetch(`${GNUGO_SERVER_URL}/health`, {
      method: 'GET',
      signal: AbortSignal.timeout(5000),
    });
    return response.ok;
  } catch (error) {
    return false;
  }
}

