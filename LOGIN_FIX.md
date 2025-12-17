# 로그인 401 오류 해결

## 문제
테이블은 생성되었지만 로그인이 안됩니다 (401 오류).

## 원인
테이블이 방금 생성되어 **사용자가 없을 가능성**이 높습니다.

## 해결 방법

### 방법 1: 회원가입으로 사용자 생성 (가장 간단!)

1. 웹사이트에서 회원가입 페이지로 이동
2. 이메일, 사용자명, 비밀번호 입력
3. 회원가입 완료
4. 로그인 시도

### 방법 2: 관리자 계정 생성 스크립트 사용

Railway에서 관리자 계정을 생성하려면:

1. **Railway CLI 사용** (가장 확실):
   ```bash
   railway link
   # > Select a service: Sudam PVP
   railway run npx tsx scripts/create-admin.ts
   ```

2. **또는 Railway 대시보드에서**:
   - Sudam PVP 서비스 → Deployments → 최신 배포
   - Shell 또는 Run Command 찾기
   - 다음 명령 실행:
     ```
     npx tsx scripts/create-admin.ts
     ```

### 방법 3: 직접 SQL로 사용자 생성

Railway Postgres 서비스에서:
1. Database → Data 탭
2. User 테이블 확인
3. "+ New Row" 버튼으로 사용자 추가 (하지만 비밀번호 해시가 필요함)

## 확인

### 1. 사용자가 있는지 확인

Railway 대시보드 → Postgres → Database → Data → User 테이블 확인

### 2. 로그인 시도

- 이메일과 비밀번호가 올바른지 확인
- 회원가입을 먼저 했는지 확인

### 3. Railway 배포 로그 확인

**Deploy Logs**에서 에러 메시지 확인:
- "Login error:" 메시지 찾기
- 구체적인 에러 내용 확인

## 문제 해결

### 여전히 401 오류가 발생한다면

1. Railway 배포 로그 확인
2. 에러 메시지 확인
3. 사용자가 실제로 존재하는지 확인
4. 비밀번호가 올바른지 확인

### 에러 로그 확인 방법

Railway 대시보드 → Sudam PVP → Deployments → 최신 배포 → Deploy Logs

"Login error:" 또는 "Error details:" 메시지를 찾아서 알려주세요.

