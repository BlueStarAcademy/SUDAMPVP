import { prisma } from '@/lib/prisma';

export interface SeasonInfo {
  season: number;
  year: number;
  quarter: 1 | 2 | 3 | 4;
  startDate: Date;
  endDate: Date;
  isActive: boolean;
}

/**
 * Get current season based on current date
 * Seasons: Q1 (Jan-Mar), Q2 (Apr-Jun), Q3 (Jul-Sep), Q4 (Oct-Dec)
 */
export function getCurrentSeason(): SeasonInfo {
  const now = new Date();
  const year = now.getFullYear();
  const month = now.getMonth() + 1; // 1-12

  let quarter: 1 | 2 | 3 | 4;
  let startMonth: number;
  let endMonth: number;

  if (month >= 1 && month <= 3) {
    quarter = 1;
    startMonth = 1;
    endMonth = 3;
  } else if (month >= 4 && month <= 6) {
    quarter = 2;
    startMonth = 4;
    endMonth = 6;
  } else if (month >= 7 && month <= 9) {
    quarter = 3;
    startMonth = 7;
    endMonth = 9;
  } else {
    quarter = 4;
    startMonth = 10;
    endMonth = 12;
  }

  const startDate = new Date(year, startMonth - 1, 1);
  const endDate = new Date(year, endMonth, 0, 23, 59, 59, 999);

  // Season number: year * 10 + quarter (e.g., 2025Q1 = 20251)
  const season = year * 10 + quarter;

  return {
    season,
    year,
    quarter,
    startDate,
    endDate,
    isActive: true,
  };
}

/**
 * Get season info for a specific season number
 */
export function getSeasonInfo(seasonNumber: number): SeasonInfo {
  const year = Math.floor(seasonNumber / 10);
  const quarter = (seasonNumber % 10) as 1 | 2 | 3 | 4;

  let startMonth: number;
  let endMonth: number;

  switch (quarter) {
    case 1:
      startMonth = 1;
      endMonth = 3;
      break;
    case 2:
      startMonth = 4;
      endMonth = 6;
      break;
    case 3:
      startMonth = 7;
      endMonth = 9;
      break;
    case 4:
      startMonth = 10;
      endMonth = 12;
      break;
  }

  const startDate = new Date(year, startMonth - 1, 1);
  const endDate = new Date(year, endMonth, 0, 23, 59, 59, 999);
  const currentSeason = getCurrentSeason();

  return {
    season: seasonNumber,
    year,
    quarter,
    startDate,
    endDate,
    isActive: seasonNumber === currentSeason.season,
  };
}

/**
 * Get all seasons (past and current)
 */
export async function getAllSeasons(limit: number = 10): Promise<SeasonInfo[]> {
  const currentSeason = getCurrentSeason();
  const seasons: SeasonInfo[] = [currentSeason];

  // Get past seasons
  for (let i = 1; i < limit; i++) {
    const pastSeason = currentSeason.season - i;
    if (pastSeason >= 20241) { // Minimum season (2024 Q1)
      seasons.push(getSeasonInfo(pastSeason));
    }
  }

  return seasons.sort((a, b) => b.season - a.season);
}

/**
 * Check if a date is within a season
 */
export function isDateInSeason(date: Date, season: number): boolean {
  const seasonInfo = getSeasonInfo(season);
  return date >= seasonInfo.startDate && date <= seasonInfo.endDate;
}

/**
 * Get or create rating for a user in a season and mode
 */
export async function getOrCreateRating(
  userId: string,
  season: number,
  mode: 'STRATEGY' | 'PLAY'
) {
  const rating = await prisma.rating.findUnique({
    where: {
      userId_season_mode: {
        userId,
        season,
        mode: mode as any,
      },
    },
  });

  if (rating) {
    return rating;
  }

  // Create new rating
  return await prisma.rating.create({
    data: {
      userId,
      season,
      mode: mode as any,
      rating: 1500, // Default ELO rating
      wins: 0,
      losses: 0,
      draws: 0,
    },
  });
}

/**
 * Get season leaderboard
 */
export async function getSeasonLeaderboard(
  season: number,
  mode: 'STRATEGY' | 'PLAY',
  limit: number = 100
) {
  return await prisma.rating.findMany({
    where: {
      season,
      mode: mode as any,
    },
    include: {
      user: {
        select: {
          id: true,
          username: true,
        },
      },
    },
    orderBy: {
      rating: 'desc',
    },
    take: limit,
  });
}

