# 웹에서 데이터베이스 설정하기

Railway 대시보드에 Shell 기능이 없으므로, 웹 API를 통해 데이터베이스를 설정할 수 있습니다.

## 방법 1: 웹 API 사용 (가장 간단!)

### 1단계: Railway에서 환경 변수 설정

1. Railway 대시보드 → **Sudam PVP** 서비스
2. **Variables** 탭 클릭
3. **New Variable** 클릭
4. 다음 추가:
   - **Name**: `DB_SETUP_KEY`
   - **Value**: 원하는 비밀 키 (예: `my-secret-setup-key-12345`)
5. **Add** 클릭

### 2단계: API 호출

브라우저나 curl로 다음 URL 호출:

```
POST https://your-app.railway.app/api/admin/setup-db?key=my-secret-setup-key-12345
```

**브라우저에서:**
1. 개발자 도구 열기 (F12)
2. Console 탭
3. 다음 코드 실행:

```javascript
fetch('https://your-app.railway.app/api/admin/setup-db?key=my-secret-setup-key-12345', {
  method: 'POST'
})
.then(r => r.json())
.then(console.log)
.catch(console.error);
```

**또는 curl 사용:**
```bash
curl -X POST "https://your-app.railway.app/api/admin/setup-db?key=my-secret-setup-key-12345"
```

### 3단계: 확인

성공 응답 예시:
```json
{
  "success": true,
  "message": "Database setup completed",
  "results": "✅ Prisma Client generated\n✅ Database schema pushed\n..."
}
```

## 방법 2: 코드 푸시 (자동 실행)

코드를 GitHub에 푸시하면 빌드 단계에서 자동으로 실행됩니다:

```bash
git add .
git commit -m "Add web-based database setup API"
git push origin main
```

Railway가 자동으로 재배포하면서 빌드 단계에서 데이터베이스 테이블이 생성됩니다.

## 확인

Railway 대시보드 → **Postgres** → **Database** → **Data** 탭에서 테이블 확인:
- ✅ User
- ✅ Game
- ✅ Rating
- ✅ Session
- ✅ Spectator
- ✅ AIProgress

## 보안 주의사항

- `DB_SETUP_KEY`는 강력한 랜덤 문자열로 설정하세요
- 설정 완료 후 필요시 환경 변수를 제거할 수 있습니다
- 프로덕션에서는 이 API를 비활성화하는 것을 권장합니다

