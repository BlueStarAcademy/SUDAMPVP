import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { validateNickname } from '@/lib/validation/nickname';

export async function GET(request: NextRequest) {
  try {
    const url = new URL(request.url);
    const nickname = url.searchParams.get('nickname');

    if (!nickname) {
      return NextResponse.json(
        { error: '닉네임을 입력해주세요.' },
        { status: 400 }
      );
    }

    // 닉네임 형식 및 금지 단어 검증
    const nicknameValidation = validateNickname(nickname);
    if (!nicknameValidation.valid) {
      return NextResponse.json(
        { available: false, error: nicknameValidation.error },
        { status: 200 }
      );
    }

    // 중복 확인
    const existingUser = await prisma.user.findUnique({
      where: { nickname },
    });

    if (existingUser) {
      return NextResponse.json(
        { available: false, error: '이미 사용 중인 닉네임입니다.' },
        { status: 200 }
      );
    }

    return NextResponse.json({
      available: true,
    });
  } catch (error) {
    console.error('Check nickname error:', error);
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    );
  }
}

