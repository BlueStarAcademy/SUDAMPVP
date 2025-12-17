import { NextRequest, NextResponse } from 'next/server';
import { requireAuth } from '@/lib/middleware';
import { recoverGameTickets } from '@/lib/tickets/recovery';

export async function POST(request: NextRequest) {
  try {
    const user = requireAuth(request);
    if (!user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const result = await recoverGameTickets(user.userId);

    return NextResponse.json({
      recovered: result.recovered,
      currentTickets: result.currentTickets,
    });
  } catch (error) {
    console.error('Recover tickets error:', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}

