function requireAuth(req, res, next) {
  // originalUrl 또는 baseUrl + path를 사용하여 전체 경로 확인
  const fullPath = req.originalUrl || (req.baseUrl + req.path);
  const isApiRequest = fullPath.startsWith('/api/');
  
  // 게임 페이지는 HTML 요청으로 처리 (세션 유지)
  const isGamePage = fullPath.match(/^\/api\/game\/[^\/]+$/);
  
  // API 요청 처리 (게임 페이지 제외)
  if (isApiRequest && !isGamePage) {
    // 개발 환경에서만 디버깅 로그 출력
    if (process.env.NODE_ENV === 'development' && fullPath.includes('recovery-time')) {
      console.log('API Auth Check:', {
        path: fullPath,
        hasSession: !!req.session,
        userId: req.session?.userId,
        sessionID: req.sessionID,
        cookies: req.headers.cookie ? 'present' : 'missing'
      });
    }
    
    if (!req.session || !req.session.userId) {
      // 개발 환경에서만 상세 에러 정보 제공
      if (process.env.NODE_ENV === 'development') {
        console.log('Auth failed for API:', {
          path: fullPath,
          hasSession: !!req.session,
          sessionID: req.sessionID,
          cookies: req.headers.cookie ? 'present' : 'missing'
        });
      }
      return res.status(401).json({ error: 'Authentication required' });
    }
    next();
    return;
  }
  
  // 게임 페이지는 HTML 요청으로 처리 (세션 복구 시도)
  if (isGamePage) {
    if (!req.session || !req.session.userId) {
      // 세션이 없으면 로그인 페이지로 리다이렉트
      if (process.env.NODE_ENV === 'development') {
        console.log('Game page auth failed, redirecting to login:', {
          path: fullPath,
          hasSession: !!req.session,
          sessionID: req.sessionID,
          cookies: req.headers.cookie ? 'present' : 'missing'
        });
      }
      return res.redirect('/login');
    }
    next();
    return;
  }
  
  // HTML 요청 처리 (로그 최소화)
  if (!req.session || !req.session.userId) {
    // 개발 환경에서만 로그 출력
    if (process.env.NODE_ENV === 'development') {
      console.log('Authentication failed - Session details:', {
        path: fullPath,
        sessionExists: !!req.session,
        sessionId: req.sessionID,
        userId: req.session?.userId
      });
    }
    // HTML 요청인 경우 로그인 페이지로 리다이렉트
    return res.redirect('/login');
  }
  // 개발 환경에서만 로그 출력
  if (process.env.NODE_ENV === 'development') {
    console.log('Authentication passed:', { path: fullPath, userId: req.session.userId });
  }
  next();
}

module.exports = { requireAuth };

