const express = require('express');
const router = express.Router();
const { requireAuth } = require('../middleware/auth');
const userService = require('../services/userService');
const prisma = require('../config/database');

// 닉네임 검증 함수 (한글 기준 1~6글자)
function validateNickname(nickname) {
  if (!nickname || typeof nickname !== 'string') {
    return { valid: false, error: '닉네임을 입력해주세요.' };
  }
  
  // 한글, 영문, 숫자만 허용
  const koreanRegex = /^[가-힣a-zA-Z0-9]+$/;
  if (!koreanRegex.test(nickname)) {
    return { valid: false, error: '닉네임은 한글, 영문, 숫자만 사용할 수 있습니다.' };
  }
  
  // 한글 기준 길이 계산 (한글 1글자 = 1, 영문/숫자 1글자 = 0.5)
  let length = 0;
  for (let i = 0; i < nickname.length; i++) {
    const char = nickname[i];
    if (/[가-힣]/.test(char)) {
      length += 1;
    } else if (/[a-zA-Z0-9]/.test(char)) {
      length += 0.5;
    }
  }
  
  if (length < 1) {
    return { valid: false, error: '닉네임은 한글 기준 최소 1글자 이상이어야 합니다.' };
  }
  
  if (length > 6) {
    return { valid: false, error: '닉네임은 한글 기준 최대 6글자까지 가능합니다.' };
  }
  
  return { valid: true };
}

// 닉네임 변경 (100젬 소모)
router.post('/change-nickname', requireAuth, async (req, res) => {
  try {
    const { nickname } = req.body;
    const userId = req.session.userId;

    if (!userId) {
      return res.status(401).json({ error: '로그인이 필요합니다.' });
    }

    if (!nickname || typeof nickname !== 'string') {
      return res.status(400).json({ error: '닉네임을 입력해주세요.' });
    }

    const trimmedNickname = nickname.trim();
    if (!trimmedNickname) {
      return res.status(400).json({ error: '닉네임을 입력해주세요.' });
    }

    // 닉네임 검증
    const validation = validateNickname(trimmedNickname);
    if (!validation.valid) {
      return res.status(400).json({ error: validation.error });
    }

    // 현재 사용자 정보 가져오기
    const user = await userService.findUserById(userId);
    if (!user) {
      return res.status(404).json({ error: '사용자를 찾을 수 없습니다.' });
    }

    // 젬 확인 (100젬 필요)
    const currentGem = user.gem || 0;
    if (currentGem < 100) {
      return res.status(400).json({ error: '젬이 부족합니다. (필요: 100젬)' });
    }

    // 닉네임 중복 확인 (현재 닉네임과 같으면 중복 체크 스킵)
    if (user.nickname !== trimmedNickname) {
      const existingUser = await userService.findUserByNickname(trimmedNickname);
      if (existingUser && existingUser.id !== userId) {
        return res.status(400).json({ error: '이미 사용 중인 닉네임입니다.' });
      }
    }

    // 닉네임 변경 및 젬 차감
    await prisma.user.update({
      where: { id: userId },
      data: {
        nickname: trimmedNickname,
        gem: { decrement: 100 }
      }
    });

    res.json({ success: true, message: '닉네임이 변경되었습니다.' });
  } catch (error) {
    console.error('Change nickname error:', error);
    console.error('Error details:', {
      message: error.message,
      stack: error.stack,
      name: error.name,
      code: error.code
    });
    res.status(500).json({ 
      error: '닉네임 변경 중 오류가 발생했습니다.',
      details: process.env.NODE_ENV === 'development' ? error.message : undefined
    });
  }
});

// 아바타 변경
router.post('/change-avatar', requireAuth, async (req, res) => {
  try {
    const { avatar } = req.body;
    const userId = req.session.userId;

    if (!userId) {
      return res.status(401).json({ error: '로그인이 필요합니다.' });
    }

    if (avatar === undefined || avatar === null) {
      return res.status(400).json({ error: '아바타를 선택해주세요.' });
    }

    // 문자열을 정수로 변환
    const avatarNumber = parseInt(avatar, 10);

    if (isNaN(avatarNumber) || avatarNumber < 1 || avatarNumber > 35) {
      return res.status(400).json({ error: '유효한 아바타를 선택해주세요. (1-35)' });
    }

    // 사용자 존재 확인
    const user = await userService.findUserById(userId);
    if (!user) {
      return res.status(404).json({ error: '사용자를 찾을 수 없습니다.' });
    }

    // 아바타 업데이트
    await prisma.user.update({
      where: { id: userId },
      data: { avatar: avatarNumber }
    });

    res.json({ success: true, message: '아바타가 변경되었습니다.', avatar: avatarNumber });
  } catch (error) {
    console.error('Change avatar error:', error);
    console.error('Error details:', {
      message: error.message,
      stack: error.stack,
      name: error.name,
      code: error.code
    });
    res.status(500).json({ 
      error: '아바타 변경 중 오류가 발생했습니다.',
      details: process.env.NODE_ENV === 'development' ? error.message : undefined
    });
  }
});

// 프로필 조회
router.get('/profile/:userId', requireAuth, async (req, res) => {
  try {
    const { userId } = req.params;
    const currentUserId = req.session.userId;

    if (!userId) {
      return res.status(400).json({ error: '유저 ID가 필요합니다.' });
    }

    // 프로필 조회 대상 유저 정보 가져오기
    const targetUser = await userService.getUserProfile(userId);
    if (!targetUser) {
      return res.status(404).json({ error: '유저를 찾을 수 없습니다.' });
    }

    // 현재 로그인한 유저의 바둑MBTI 가져오기 (비교용)
    const currentUser = await userService.getUserProfile(currentUserId);
    const currentUserMBTI = currentUser?.badukMBTI || null;

    // 티어 계산
    const rating = targetUser.rating || 1500;
    let tier = 1;
    if (rating >= 3500) tier = 9; // 챌린저
    else if (rating >= 3000) tier = 8; // 마스터
    else if (rating >= 2400) tier = 7; // 다이아
    else if (rating >= 2000) tier = 6; // 플래티넘
    else if (rating >= 1700) tier = 5; // 골드
    else if (rating >= 1500) tier = 4; // 실버
    else if (rating >= 1400) tier = 3; // 브론즈
    else if (rating >= 1300) tier = 2; // 루키

    // 승률 계산
    const total = (targetUser.wins || 0) + (targetUser.losses || 0);
    const winRate = total > 0 ? Math.round(((targetUser.wins || 0) / total) * 100) : 0;

    res.json({
      success: true,
      profile: {
        id: targetUser.id,
        nickname: targetUser.nickname,
        rating: targetUser.rating,
        tier: tier,
        wins: targetUser.wins || 0,
        losses: targetUser.losses || 0,
        draws: targetUser.draws || 0,
        winRate: winRate,
        totalGames: total,
        mannerScore: targetUser.mannerScore || 1500,
        avatar: targetUser.avatar || 1,
        badukMBTI: targetUser.badukMBTI || null
      },
      currentUserMBTI: currentUserMBTI
    });
  } catch (error) {
    console.error('Get profile error:', error);
    res.status(500).json({ 
      error: '프로필 조회 중 오류가 발생했습니다.',
      details: process.env.NODE_ENV === 'development' ? error.message : undefined
    });
  }
});

// MBTI 설정 (최초 설정 시 100젬 지급)
router.post('/set-mbti', requireAuth, async (req, res) => {
  try {
    let { mbti } = req.body;
    const userId = req.session.userId;

    if (!userId) {
      return res.status(401).json({ error: '로그인이 필요합니다.' });
    }

    if (!mbti) {
      return res.status(400).json({ error: 'MBTI를 선택해주세요.' });
    }

    // MBTI를 문자열로 변환 후 대문자로 변환
    if (typeof mbti !== 'string') {
      mbti = String(mbti);
    }
    mbti = mbti.toUpperCase().trim();

    // 4글자 MBTI 검증
    if (mbti.length !== 4) {
      return res.status(400).json({ error: 'MBTI는 4글자여야 합니다.' });
    }

    const validMBTIs = ['INTJ', 'INTP', 'ENTJ', 'ENTP', 'INFJ', 'INFP', 'ENFJ', 'ENFP', 
                        'ISTJ', 'ISFJ', 'ESTJ', 'ESFJ', 'ISTP', 'ISFP', 'ESTP', 'ESFP'];
    if (!validMBTIs.includes(mbti)) {
      return res.status(400).json({ error: '유효한 MBTI를 선택해주세요.' });
    }

    const user = await userService.findUserById(userId);
    if (!user) {
      return res.status(404).json({ error: '사용자를 찾을 수 없습니다.' });
    }

    // 최초 설정인지 확인
    const isFirstTime = !user.badukMBTI || user.badukMBTI === null || user.badukMBTI === '';
    const gemReward = isFirstTime ? 100 : 0;

    // 데이터베이스 업데이트
    const updateData = {
      badukMBTI: mbti
    };
    
    if (gemReward > 0) {
      updateData.gem = { increment: gemReward };
    }

    await prisma.user.update({
      where: { id: userId },
      data: updateData
    });

    res.json({ 
      success: true, 
      message: isFirstTime ? 'MBTI가 설정되었습니다. (100젬 지급)' : 'MBTI가 변경되었습니다.',
      gemReward: gemReward
    });
  } catch (error) {
    console.error('Set MBTI error:', error);
    console.error('Error details:', {
      message: error.message,
      stack: error.stack,
      name: error.name
    });
    res.status(500).json({ 
      error: 'MBTI 설정 중 오류가 발생했습니다.',
      details: process.env.NODE_ENV === 'development' ? error.message : undefined
    });
  }
});

// 바둑MBTI 비교
router.get('/compare-mbti', requireAuth, async (req, res) => {
  try {
    const { myMBTI, opponentMBTI } = req.query;

    if (!myMBTI || !opponentMBTI) {
      return res.status(400).json({ error: 'MBTI 정보가 필요합니다.' });
    }

    const mbtiService = require('../services/mbtiService');
    const comparison = mbtiService.compareBadukMBTI(myMBTI, opponentMBTI);

    if (!comparison) {
      return res.status(400).json({ error: '유효한 MBTI를 입력해주세요.' });
    }

    res.json({
      success: true,
      comparison: comparison
    });
  } catch (error) {
    console.error('Compare MBTI error:', error);
    res.status(500).json({ 
      error: 'MBTI 비교 중 오류가 발생했습니다.',
      details: process.env.NODE_ENV === 'development' ? error.message : undefined
    });
  }
});

// 전체 전적 초기화 (300젬 소모)
router.post('/reset-all-stats', requireAuth, async (req, res) => {
  try {
    const userId = req.session.userId;
    const user = await userService.findUserById(userId);
    
    if (!user) {
      return res.status(404).json({ error: '사용자를 찾을 수 없습니다.' });
    }

    if (user.gem < 300) {
      return res.status(400).json({ error: '젬이 부족합니다. (필요: 300젬)' });
    }

    await prisma.user.update({
      where: { id: userId },
      data: {
        wins: 0,
        losses: 0,
        draws: 0,
        gem: { decrement: 300 }
      }
    });

    res.json({ success: true, message: '전체 전적이 초기화되었습니다.' });
  } catch (error) {
    console.error('Reset all stats error:', error);
    res.status(500).json({ error: '전적 초기화 중 오류가 발생했습니다.' });
  }
});

// 전략바둑 전적 초기화 (200젬 소모)
router.post('/reset-strategy-stats', requireAuth, async (req, res) => {
  try {
    const userId = req.session.userId;
    const user = await userService.findUserById(userId);
    
    if (!user) {
      return res.status(404).json({ error: '사용자를 찾을 수 없습니다.' });
    }

    if (user.gem < 200) {
      return res.status(400).json({ error: '젬이 부족합니다. (필요: 200젬)' });
    }

    // 전략바둑 게임만 필터링하여 전적 계산
    const strategyGames = await prisma.game.findMany({
      where: {
        OR: [{ blackId: userId }, { whiteId: userId }],
        isAiGame: false,
        result: { not: null },
        mode: { in: ['CLASSIC', 'CAPTURE', 'SPEED', 'BASE', 'HIDDEN', 'MISSILE', 'MIX'] }
      }
    });

    const strategyWins = strategyGames.filter(game => {
      if (game.blackId === userId) return game.result === 'black_win';
      if (game.whiteId === userId) return game.result === 'white_win';
      return false;
    }).length;

    const strategyLosses = strategyGames.filter(game => {
      if (game.blackId === userId) return game.result === 'white_win';
      if (game.whiteId === userId) return game.result === 'black_win';
      return false;
    }).length;

    const strategyDraws = strategyGames.filter(game => game.result === 'draw').length;

    // 전체 전적에서 전략바둑 전적 빼기
    const newWins = Math.max(0, (user.wins || 0) - strategyWins);
    const newLosses = Math.max(0, (user.losses || 0) - strategyLosses);
    const newDraws = Math.max(0, (user.draws || 0) - strategyDraws);

    await prisma.user.update({
      where: { id: userId },
      data: {
        wins: newWins,
        losses: newLosses,
        draws: newDraws,
        gem: { decrement: 200 }
      }
    });

    res.json({ success: true, message: '전략바둑 전적이 초기화되었습니다.' });
  } catch (error) {
    console.error('Reset strategy stats error:', error);
    res.status(500).json({ error: '전적 초기화 중 오류가 발생했습니다.' });
  }
});

// 놀이바둑 전적 초기화 (200젬 소모)
router.post('/reset-casual-stats', requireAuth, async (req, res) => {
  try {
    const userId = req.session.userId;
    const user = await userService.findUserById(userId);
    
    if (!user) {
      return res.status(404).json({ error: '사용자를 찾을 수 없습니다.' });
    }

    if (user.gem < 200) {
      return res.status(400).json({ error: '젬이 부족합니다. (필요: 200젬)' });
    }

    // 놀이바둑 게임만 필터링하여 전적 계산
    const casualGames = await prisma.game.findMany({
      where: {
        OR: [{ blackId: userId }, { whiteId: userId }],
        result: { not: null },
        mode: { in: ['DICE', 'COPS', 'OMOK', 'TTAK', 'ALKKAGI', 'CURLING'] }
      }
    });

    const casualWins = casualGames.filter(game => {
      if (game.blackId === userId) return game.result === 'black_win';
      if (game.whiteId === userId) return game.result === 'white_win';
      return false;
    }).length;

    const casualLosses = casualGames.filter(game => {
      if (game.blackId === userId) return game.result === 'white_win';
      if (game.whiteId === userId) return game.result === 'black_win';
      return false;
    }).length;

    const casualDraws = casualGames.filter(game => game.result === 'draw').length;

    // 전체 전적에서 놀이바둑 전적 빼기
    const newWins = Math.max(0, (user.wins || 0) - casualWins);
    const newLosses = Math.max(0, (user.losses || 0) - casualLosses);
    const newDraws = Math.max(0, (user.draws || 0) - casualDraws);

    await prisma.user.update({
      where: { id: userId },
      data: {
        wins: newWins,
        losses: newLosses,
        draws: newDraws,
        gem: { decrement: 200 }
      }
    });

    res.json({ success: true, message: '놀이바둑 전적이 초기화되었습니다.' });
  } catch (error) {
    console.error('Reset casual stats error:', error);
    res.status(500).json({ error: '전적 초기화 중 오류가 발생했습니다.' });
  }
});

// 부분 전적 초기화 (100젬 소모) - 특정 모드의 최근 10게임 제외
router.post('/reset-partial-stats', requireAuth, async (req, res) => {
  try {
    const { mode } = req.body;
    const userId = req.session.userId;
    const user = await userService.findUserById(userId);
    
    if (!user) {
      return res.status(404).json({ error: '사용자를 찾을 수 없습니다.' });
    }

    if (user.gem < 100) {
      return res.status(400).json({ error: '젬이 부족합니다. (필요: 100젬)' });
    }

    const modeNames = {
      'CLASSIC': '클래식바둑',
      'CAPTURE': '따내기바둑',
      'SPEED': '스피드바둑',
      'BASE': '베이스바둑',
      'HIDDEN': '히든바둑',
      'MISSILE': '미사일바둑',
      'MIX': '믹스룰바둑',
      'DICE': '주사위바둑',
      'COPS': '경찰과도둑',
      'OMOK': '오목',
      'TTAK': '따목',
      'ALKKAGI': '알까기',
      'CURLING': '바둑컬링'
    };

    const modeName = modeNames[mode] || mode || '선택한 모드';

    // 특정 모드의 최근 10게임 가져오기
    const recentGames = await prisma.game.findMany({
      where: {
        OR: [{ blackId: userId }, { whiteId: userId }],
        result: { not: null },
        mode: mode || undefined
      },
      orderBy: { endedAt: 'desc' },
      take: 10
    });

    const recentGameIds = recentGames.map(g => g.id);

    // 특정 모드의 최근 10게임을 제외한 나머지 게임의 전적 계산
    const allGames = await prisma.game.findMany({
      where: {
        OR: [{ blackId: userId }, { whiteId: userId }],
        result: { not: null },
        mode: mode || undefined,
        id: { notIn: recentGameIds }
      }
    });

    const partialWins = allGames.filter(game => {
      if (game.blackId === userId) return game.result === 'black_win';
      if (game.whiteId === userId) return game.result === 'white_win';
      return false;
    }).length;

    const partialLosses = allGames.filter(game => {
      if (game.blackId === userId) return game.result === 'white_win';
      if (game.whiteId === userId) return game.result === 'black_win';
      return false;
    }).length;

    const partialDraws = allGames.filter(game => game.result === 'draw').length;

    // 전체 전적에서 부분 전적 빼기
    const newWins = Math.max(0, (user.wins || 0) - partialWins);
    const newLosses = Math.max(0, (user.losses || 0) - partialLosses);
    const newDraws = Math.max(0, (user.draws || 0) - partialDraws);

    await prisma.user.update({
      where: { id: userId },
      data: {
        wins: newWins,
        losses: newLosses,
        draws: newDraws,
        gem: { decrement: 100 }
      }
    });

    res.json({ success: true, message: `${modeName} 부분 전적이 초기화되었습니다. (최근 10게임 제외)` });
  } catch (error) {
    console.error('Reset partial stats error:', error);
    res.status(500).json({ error: '전적 초기화 중 오류가 발생했습니다.' });
  }
});

module.exports = router;

