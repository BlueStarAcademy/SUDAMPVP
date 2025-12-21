function requireAuth(req, res, next) {
  console.log('requireAuth check:', {
    path: req.path,
    hasSession: !!req.session,
    userId: req.session?.userId,
    sessionID: req.sessionID,
    cookies: req.headers.cookie
  });
  
  if (!req.session || !req.session.userId) {
    console.log('Authentication failed - Session details:', {
      sessionExists: !!req.session,
      sessionId: req.sessionID,
      cookies: req.headers.cookie,
      userId: req.session?.userId
    });
    // API 요청인 경우 JSON 응답
    if (req.path.startsWith('/api/')) {
      return res.status(401).json({ error: 'Authentication required' });
    }
    // HTML 요청인 경우 로그인 페이지로 리다이렉트
    return res.redirect('/login');
  }
  console.log('Authentication passed');
  next();
}

module.exports = { requireAuth };

