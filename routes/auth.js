const express = require('express');
const router = express.Router();
const userService = require('../services/userService');

// Register
router.post('/register', async (req, res) => {
  try {
    const { email, nickname, password } = req.body;

    if (!email || !nickname || !password) {
      return res.status(400).json({ error: 'All fields are required' });
    }

    // Check if user exists
    const existingEmail = await userService.findUserByEmail(email);
    if (existingEmail) {
      return res.status(400).json({ error: 'Email already exists' });
    }

    const existingNickname = await userService.findUserByNickname(nickname);
    if (existingNickname) {
      return res.status(400).json({ error: 'Nickname already exists' });
    }

    const user = await userService.createUser(email, nickname, password);

    // Set session
    req.session.userId = user.id;
    req.session.nickname = user.nickname;

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
    res.status(500).json({ error: 'Internal server error' });
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
    const user = await userService.findUserByEmail(email);
    if (!user) {
      console.log('User not found for email:', email);
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
    
    // 세션 저장 확인
    req.session.save((err) => {
      if (err) {
        console.error('Session save error:', err);
        console.error('Session save error details:', {
          message: err.message,
          stack: err.stack
        });
        return res.status(500).json({ 
          error: 'Failed to save session',
          message: process.env.NODE_ENV === 'development' ? err.message : '세션 저장에 실패했습니다.'
        });
      }
      
      console.log('Session saved successfully, userId:', req.session.userId);
      console.log('Login successful for user:', user.id);
      res.json({
        success: true,
        user: {
          id: user.id,
          email: user.email,
          nickname: user.nickname,
          rating: user.rating,
        },
      });
    });
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

module.exports = router;

