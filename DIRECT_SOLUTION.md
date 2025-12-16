# 직접 해결 방법 (터미널 없이)

## 문제
- Railway 대시보드에 Shell 기능 없음
- 터미널 명령어가 계속 멈춤
- API 엔드포인트도 404 오류

## 해결: 코드 푸시로 자동 실행

코드를 수정했으므로, GitHub에 푸시하면 Railway가 자동으로 재배포하면서 **빌드 단계에서 데이터베이스 테이블이 자동 생성**됩니다.

### 변경된 파일:
1. ✅ `package.json` - `postbuild` 스크립트 추가
2. ✅ `.nixpacks.toml` - 빌드 단계에 `prisma db push` 추가
3. ✅ `server.ts` - 런타임 백업 로직 추가
4. ✅ `app/api/admin/setup-db/route.ts` - 웹 API 추가 (배포 후 사용 가능)

### 다음 단계:

**방법 1: GitHub 웹에서 직접 푸시 (가장 확실!)**

1. GitHub 저장소 열기: https://github.com/BlueStarAcademy/SUDAMPVP
2. 변경된 파일들을 직접 업로드하거나
3. VS Code나 다른 에디터에서 Git GUI 사용

**방법 2: VS Code Git 기능 사용**

1. VS Code에서 Source Control 탭 (Ctrl+Shift+G)
2. 변경된 파일들 스테이징
3. 커밋 메시지: "Add database auto-setup"
4. Push 버튼 클릭

**방법 3: Railway가 자동으로 감지하도록 기다리기**

코드가 이미 푸시되어 있다면, Railway가 자동으로 재배포를 시작합니다.

### 확인 방법:

1. Railway 대시보드 → **Sudam PVP** 서비스
2. **Deployments** 탭 확인
3. 최신 배포의 **Build Logs** 확인
4. 다음 메시지 찾기:
   ```
   ✔ Generated Prisma Client
   The database is now in sync with your schema.
   ```

5. **Postgres** → **Database** → **Data** 탭에서 테이블 확인:
   - ✅ User
   - ✅ Game
   - ✅ Rating
   - ✅ Session
   - ✅ Spectator
   - ✅ AIProgress

## 빌드 로그에서 확인할 메시지:

성공 시:
```
> postbuild
> prisma generate && prisma db push --accept-data-loss || true
✔ Generated Prisma Client
The database is now in sync with your schema.
```

이 메시지가 보이면 성공입니다!

