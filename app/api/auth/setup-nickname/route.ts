import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { getTokenFromRequest, verifyToken } from '@/lib/auth';
import { validateNickname } from '@/lib/validation/nickname';
import { DEFAULT_AVATAR_ID } from '@/lib/constants/avatars';

export async function POST(request: NextRequest) {
  try {
    const token = getTokenFromRequest(request);
    if (!token) {
      return NextResponse.json(
        { error: 'Unauthorized' },
        { status: 401 }
      );
    }

    const payload = verifyToken(token);
    if (!payload) {
      return NextResponse.json(
        { error: 'Invalid token' },
        { status: 401 }
      );
    }

    const body = await request.json();
    const { nickname, avatarId } = body;

    // Validation
    if (!nickname) {
      return NextResponse.json(
        { error: '닉네임을 입력해주세요.' },
        { status: 400 }
      );
    }

    // 닉네임 검증
    const nicknameValidation = validateNickname(nickname);
    if (!nicknameValidation.valid) {
      return NextResponse.json(
        { error: nicknameValidation.error },
        { status: 400 }
      );
    }

    // 닉네임 중복 확인
    const existingNickname = await prisma.user.findUnique({
      where: { nickname },
    });

    if (existingNickname && existingNickname.id !== payload.userId) {
      return NextResponse.json(
        { error: '이미 사용 중인 닉네임입니다.' },
        { status: 409 }
      );
    }

    // 아바타 ID 검증 (기본값 사용)
    const finalAvatarId = avatarId || DEFAULT_AVATAR_ID;

    // 사용자 정보 업데이트
    const user = await prisma.user.update({
      where: { id: payload.userId },
      data: {
        nickname,
        avatarId: finalAvatarId,
        hasCompletedSetup: true,
      },
      select: {
        id: true,
        email: true,
        username: true,
        nickname: true,
        avatarId: true,
        hasCompletedSetup: true,
      },
    });

    return NextResponse.json({
      success: true,
      user,
    });
  } catch (error: any) {
    console.error('Setup nickname error:', error);
    
    // Prisma unique constraint error
    if (error.code === 'P2002') {
      return NextResponse.json(
        { error: '이미 사용 중인 닉네임입니다.' },
        { status: 409 }
      );
    }

    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    );
  }
}

