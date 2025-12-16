import { NextRequest, NextResponse } from 'next/server';
import { requireAuth } from '@/lib/middleware';
import { getCurrentSeason } from '@/lib/season/seasonManager';
import { getUserRating } from '@/lib/rating/ratingManager';

export async function GET(request: NextRequest) {
  try {
    const user = requireAuth(request);
    if (!user) {
      return NextResponse.json(
        { error: 'Unauthorized' },
        { status: 401 }
      );
    }

    const searchParams = request.nextUrl.searchParams;
    const mode = searchParams.get('mode') as 'STRATEGY' | 'PLAY' | null;
    const seasonParam = searchParams.get('season');

    const currentSeason = getCurrentSeason();
    const season = seasonParam ? parseInt(seasonParam) : currentSeason.season;

    if (!mode || (mode !== 'STRATEGY' && mode !== 'PLAY')) {
      return NextResponse.json(
        { error: 'Invalid mode. Must be STRATEGY or PLAY' },
        { status: 400 }
      );
    }

    const rating = await getUserRating(user.userId, season, mode);

    return NextResponse.json({ rating });
  } catch (error) {
    console.error('Get rating error:', error);
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    );
  }
}

