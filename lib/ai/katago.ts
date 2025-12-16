/**
 * KataGo AI integration
 * Communicates with KataGo server via HTTP/WebSocket
 */

const KATAGO_SERVER_URL = process.env.KATAGO_SERVER_URL || 'http://localhost:3002';

export interface KataGoMove {
  x: number;
  y: number;
  pass?: boolean;
  winRate?: number;
  scoreLead?: number;
}

export interface KataGoRequest {
  board: string[][]; // 'B', 'W', or null
  currentPlayer: 'black' | 'white';
  moveHistory?: Array<{ x: number; y: number; player: 'black' | 'white' }>;
  maxVisits?: number;
}

export interface KataGoScoringRequest {
  board: string[][];
  currentPlayer: 'black' | 'white';
  moveHistory?: Array<{ x: number; y: number; player: 'black' | 'white' }>;
}

export interface KataGoScoringResult {
  winner: 'black' | 'white';
  score: number; // Score difference (positive = black wins)
  territory: {
    black: number;
    white: number;
  };
}

/**
 * Get AI move from KataGo
 */
export async function getKataGoMove(request: KataGoRequest): Promise<KataGoMove | null> {
  try {
    const response = await fetch(`${KATAGO_SERVER_URL}/move`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(request),
      signal: AbortSignal.timeout(60000), // 60 second timeout (KataGo can be slower)
    });

    if (!response.ok) {
      throw new Error(`KataGo server error: ${response.statusText}`);
    }

    const data = await response.json();
    return data.move as KataGoMove;
  } catch (error) {
    console.error('KataGo request error:', error);
    return null;
  }
}

/**
 * Get scoring from KataGo (계가)
 */
export async function getKataGoScoring(
  request: KataGoScoringRequest
): Promise<KataGoScoringResult | null> {
  try {
    const response = await fetch(`${KATAGO_SERVER_URL}/score`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(request),
      signal: AbortSignal.timeout(120000), // 2 minute timeout for scoring
    });

    if (!response.ok) {
      throw new Error(`KataGo scoring error: ${response.statusText}`);
    }

    const data = await response.json();
    return data as KataGoScoringResult;
  } catch (error) {
    console.error('KataGo scoring error:', error);
    return null;
  }
}

/**
 * Check if KataGo server is available
 */
export async function checkKataGoServer(): Promise<boolean> {
  try {
    const response = await fetch(`${KATAGO_SERVER_URL}/health`, {
      method: 'GET',
      signal: AbortSignal.timeout(5000),
    });
    return response.ok;
  } catch (error) {
    return false;
  }
}

