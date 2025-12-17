# 로그인 401 오류 디버깅

## 문제
POST /api/auth/login 401 (Unauthorized)

## 가능한 원인

1. **사용자가 없음** (가장 가능성 높음)
   - 테이블이 방금 생성되어 사용자가 없을 수 있음

2. **비밀번호가 틀림**
   - 입력한 비밀번호가 올바르지 않음

3. **로그인 API 에러**
   - 서버 측 에러가 발생했을 수 있음

## 확인 방법

### 1. Railway 배포 로그 확인 (가장 중요!)

Railway 대시보드에서:
1. **Sudam PVP** 서비스 클릭
2. **Deployments** 탭 → **최신 배포** 클릭
3. **Deploy Logs** 탭 확인
4. 다음 메시지 찾기:
   - "Login error:"
   - "Error details:"
   - 구체적인 에러 메시지

### 2. 사용자 존재 확인

Railway 대시보드에서:
1. **Postgres** 서비스 클릭
2. **Database** → **Data** 탭
3. **User** 테이블 확인
4. 사용자가 있는지 확인

### 3. 회원가입 시도

웹사이트에서:
1. 회원가입 페이지로 이동
2. 새 계정 생성
3. 생성한 계정으로 로그인 시도

## 해결 방법

### 방법 1: 회원가입으로 사용자 생성

1. 웹사이트에서 회원가입
2. 이메일, 사용자명, 비밀번호 입력
3. 회원가입 완료
4. 로그인 시도

### 방법 2: 관리자 계정 생성

Railway CLI로:
```bash
railway link
# > Select a service: Sudam PVP
railway run npx tsx scripts/create-admin.ts
```

기본 관리자 계정:
- Email: `admin@sudam.com`
- Username: `admin`
- Password: `admin123456`

### 방법 3: Railway 배포 로그 확인 후 수정

배포 로그에서 에러 메시지를 확인하고 알려주시면 정확한 해결 방법을 제시하겠습니다.

## 다음 단계

**먼저 Railway 배포 로그를 확인하세요:**
- "Login error:" 메시지 찾기
- 구체적인 에러 내용 확인
- 에러 메시지를 알려주시면 정확히 해결하겠습니다

또는 **회원가입을 먼저 시도**해보세요. 사용자가 없으면 로그인이 안 됩니다.

