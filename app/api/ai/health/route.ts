import { NextResponse } from 'next/server';
import { checkAIServers } from '@/lib/ai/aiManager';

export async function GET() {
  try {
    const servers = await checkAIServers();
    return NextResponse.json({ servers });
  } catch (error) {
    console.error('AI health check error:', error);
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    );
  }
}

