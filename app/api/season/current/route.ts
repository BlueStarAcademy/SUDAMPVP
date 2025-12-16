import { NextResponse } from 'next/server';
import { getCurrentSeason } from '@/lib/season/seasonManager';

export async function GET() {
  try {
    const season = getCurrentSeason();
    return NextResponse.json({ season });
  } catch (error) {
    console.error('Get current season error:', error);
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    );
  }
}

