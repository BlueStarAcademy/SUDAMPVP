import { NextRequest, NextResponse } from 'next/server';
import { STRATEGY_GAME_TYPES, PLAY_GAME_TYPES } from '@/lib/game/types';

export async function GET(request: NextRequest) {
  try {
    return NextResponse.json({
      strategy: Object.values(STRATEGY_GAME_TYPES),
      play: Object.values(PLAY_GAME_TYPES),
    });
  } catch (error) {
    console.error('Get game types error:', error);
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    );
  }
}

