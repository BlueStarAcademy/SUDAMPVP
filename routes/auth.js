const express = require('express');
const router = express.Router();
const userService = require('../services/userService');

// Register
router.post('/register', async (req, res) => {
  try {
    const { email, nickname, password } = req.body;

    console.log('=== REGISTRATION ATTEMPT ===');
    console.log('Email:', email);
    console.log('Nickname:', nickname);
    console.log('Password provided:', password ? 'Yes' : 'No');

    if (!email || !nickname || !password) {
      return res.status(400).json({ error: 'All fields are required' });
    }

    // Check if user exists
    console.log('Checking if email exists...');
    const existingEmail = await userService.findUserByEmail(email);
    if (existingEmail) {
      console.log('Email already exists:', email);
      return res.status(400).json({ error: 'Email already exists' });
    }

    console.log('Checking if nickname exists...');
    const existingNickname = await userService.findUserByNickname(nickname);
    if (existingNickname) {
      console.log('Nickname already exists:', nickname);
      return res.status(400).json({ error: 'Nickname already exists' });
    }

    console.log('Creating user...');
    const user = await userService.createUser(email, nickname, password);
    console.log('User created successfully:', user.id);

    // Set session
    console.log('Setting session...');
    req.session.userId = user.id;
    req.session.nickname = user.nickname;

    console.log('Registration successful for user:', user.id);
    res.json({
      success: true,
      user: {
        id: user.id,
        email: user.email,
        nickname: user.nickname,
        rating: user.rating,
      },
    });
  } catch (error) {
    console.error('Registration error:', error);
    console.error('Error name:', error.name);
    console.error('Error message:', error.message);
    console.error('Error stack:', error.stack);
    console.error('Error code:', error.code);
    
    // Check if it's a database connection error
    if (error.code === 'P1001' || error.message.includes('connect') || error.message.includes('database')) {
      return res.status(500).json({ 
        error: 'Database connection failed',
        message: process.env.NODE_ENV === 'development' ? error.message : '데이터베이스 연결에 실패했습니다.'
      });
    }
    
    // Check if it's a Prisma error
    if (error.code && error.code.startsWith('P')) {
      return res.status(500).json({ 
        error: 'Database error',
        message: process.env.NODE_ENV === 'development' ? error.message : '데이터베이스 오류가 발생했습니다.',
        code: error.code
      });
    }
    
    // Check for unique constraint violations
    if (error.code === 'P2002') {
      const field = error.meta?.target?.[0] || 'field';
      return res.status(400).json({ 
        error: `${field} already exists`,
        message: `이미 사용 중인 ${field === 'email' ? '이메일' : '닉네임'}입니다.`
      });
    }
    
    res.status(500).json({ 
      error: 'Internal server error',
      message: process.env.NODE_ENV === 'development' ? error.message : '서버 오류가 발생했습니다.'
    });
  }
});

// Login
router.post('/login', async (req, res) => {
  try {
    const { email, password } = req.body;

    console.log('=== LOGIN ATTEMPT ===');
    console.log('Email:', email);
    console.log('Password provided:', password ? 'Yes' : 'No');
    console.log('Request body:', JSON.stringify(req.body));

    if (!email || !password) {
      console.log('Missing email or password');
      return res.status(400).json({ error: 'Email and password are required' });
    }

    console.log('Looking up user...');
    
    // 디버깅: 개발 환경에서만 모든 사용자 목록 확인
    if (process.env.NODE_ENV === 'development') {
      console.log('Searching for email:', JSON.stringify(email));
      try {
        const allUsers = await userService.findAllUsers();
        console.log('All users in database:', allUsers.map(u => ({ email: u.email, nickname: u.nickname })));
      } catch (debugError) {
        console.error('Error fetching all users for debugging:', debugError);
      }
    }
    
    const user = await userService.findUserByEmail(email);
    if (!user) {
      console.log('User not found for email:', email);
      if (process.env.NODE_ENV === 'development') {
        console.log('Email type:', typeof email);
        console.log('Email length:', email?.length);
      }
      return res.status(401).json({ error: 'Invalid credentials' });
    }

    console.log('User found:', user.email, user.nickname);
    console.log('Verifying password...');
    const isValid = await userService.verifyPassword(password, user.password);
    console.log('Password valid:', isValid);
    if (!isValid) {
      console.log('Invalid password for user:', email);
      return res.status(401).json({ error: 'Invalid credentials' });
    }

    console.log('Password verified, setting session...');
    // Set session
    req.session.userId = user.id;
    req.session.nickname = user.nickname;
    
    // 세션 저장 확인 - Promise로 래핑하여 에러 처리 개선
    try {
      await new Promise((resolve, reject) => {
        req.session.save((err) => {
          if (err) {
            console.error('Session save error:', err);
            console.error('Session save error details:', {
              message: err.message,
              stack: err.stack,
              code: err.code
            });
            reject(err);
            return;
          }
          
          console.log('Session saved successfully, userId:', req.session.userId);
          console.log('Session ID:', req.sessionID);
          console.log('Login successful for user:', user.id);
          
          // 세션이 제대로 저장되었는지 확인
          if (!req.session.userId) {
            console.error('WARNING: Session userId is missing after save!');
            reject(new Error('Session userId is missing after save'));
            return;
          }
          
          resolve();
        });
      });
      
      res.json({
        success: true,
        user: {
          id: user.id,
          email: user.email,
          nickname: user.nickname,
          rating: user.rating,
        },
        sessionId: req.sessionID // 디버깅용
      });
    } catch (sessionError) {
      console.error('Session save failed:', sessionError);
      return res.status(500).json({ 
        error: 'Failed to save session',
        message: process.env.NODE_ENV === 'development' ? sessionError.message : '세션 저장에 실패했습니다.'
      });
    }
  } catch (error) {
    console.error('Login error:', error);
    console.error('Error name:', error.name);
    console.error('Error message:', error.message);
    console.error('Error stack:', error.stack);
    
    // Check if it's a database connection error
    if (error.code === 'P1001' || error.message.includes('connect') || error.message.includes('database')) {
      return res.status(500).json({ 
        error: 'Database connection failed',
        message: process.env.NODE_ENV === 'development' ? error.message : '데이터베이스 연결에 실패했습니다.'
      });
    }
    
    // Check if it's a Prisma error
    if (error.code && error.code.startsWith('P')) {
      return res.status(500).json({ 
        error: 'Database error',
        message: process.env.NODE_ENV === 'development' ? error.message : '데이터베이스 오류가 발생했습니다.'
      });
    }
    
    res.status(500).json({ 
      error: 'Internal server error',
      message: process.env.NODE_ENV === 'development' ? error.message : '서버 오류가 발생했습니다.'
    });
  }
});

// Logout
router.post('/logout', (req, res) => {
  req.session.destroy((err) => {
    if (err) {
      return res.status(500).json({ error: 'Failed to logout' });
    }
    res.clearCookie('connect.sid');
    res.json({ success: true });
  });
});

// Check session
router.get('/me', async (req, res) => {
  if (!req.session.userId) {
    return res.status(401).json({ error: 'Not authenticated' });
  }

  try {
    const profile = await userService.getUserProfile(req.session.userId);
    if (!profile) {
      return res.status(404).json({ error: 'User not found' });
    }

    res.json({ user: profile });
  } catch (error) {
    console.error('Get user error:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// Get user statistics by game type
router.get('/stats', async (req, res) => {
  if (!req.session.userId) {
    return res.status(401).json({ error: 'Not authenticated' });
  }

  try {
    const stats = await userService.getUserStats(req.session.userId);
    res.json(stats);
  } catch (error) {
    console.error('Get user stats error:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

module.exports = router;

