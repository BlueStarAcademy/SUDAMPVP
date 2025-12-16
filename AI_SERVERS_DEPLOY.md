# AI 서버 배포 가이드 (GnuGo & KataGo)

## 개요

SUDAM PVP 프로젝트는 두 개의 별도 AI 서버를 사용합니다:
- **GnuGo 서버**: 대결용 AI (단계별 난이도 1-10)
- **KataGo 서버**: 계가 및 힌트 기능

각 서버는 Railway에서 별도 서비스로 배포할 수 있습니다.

## 빠른 시작

### 1. GnuGo 서버 배포

#### Railway 배포
1. Railway 대시보드에서 "New Project" 클릭
2. "Deploy from GitHub repo" 선택
3. 저장소에서 `servers/gnugo` 디렉토리 선택 또는 별도 저장소로 분리
4. Dockerfile 사용하여 빌드
5. 환경 변수:
   - `PORT=3001` (Railway가 자동 설정)

#### 로컬 테스트
```bash
cd servers/gnugo
npm install
npm start
```

### 2. KataGo 서버 배포

#### Railway 배포
1. Railway 대시보드에서 "New Project" 클릭
2. "Deploy from GitHub repo" 선택
3. 저장소에서 `servers/katago` 디렉토리 선택 또는 별도 저장소로 분리
4. Dockerfile 사용하여 빌드
5. 환경 변수:
   - `PORT=3002` (Railway가 자동 설정)
   - `KATAGO_MODEL_PATH=/katago-models/kata1.bin.gz` (선택사항)

**주의**: KataGo는 GPU가 있으면 훨씬 빠릅니다. Railway Pro 플랜에서 GPU 인스턴스 사용 가능.

#### 로컬 테스트
```bash
cd servers/katago
npm install
npm start
```

## 메인 앱 환경 변수 설정

Railway에서 메인 SUDAM 앱의 환경 변수에 추가:

```env
GNUGO_SERVER_URL=https://your-gnugo-service.railway.app
KATAGO_SERVER_URL=https://your-katago-service.railway.app
```

## API 스펙

### GnuGo 서버

**POST /move**
```json
{
  "board": [["B", "W", ""], ...],  // 19x19 배열
  "currentPlayer": "black",         // "black" or "white"
  "moveHistory": [                 // 선택사항
    {"x": 3, "y": 3, "player": "black"},
    ...
  ],
  "level": 5                        // 1-10 (선택사항, 기본값: 5)
}
```

**응답:**
```json
{
  "move": {
    "x": 3,
    "y": 15,
    "pass": false
  }
}
```

### KataGo 서버

**POST /move** (힌트)
```json
{
  "board": [["B", "W", ""], ...],
  "currentPlayer": "black",
  "moveHistory": [...],
  "maxVisits": 50  // 선택사항, 기본값: 50
}
```

**POST /score** (계가)
```json
{
  "board": [["B", "W", ""], ...],
  "currentPlayer": "black",
  "moveHistory": [...]
}
```

**응답:**
```json
{
  "winner": "black",
  "score": 3.5,
  "territory": {
    "black": 184.0,
    "white": 180.5
  }
}
```

## 배포 옵션

### 옵션 1: 별도 Railway 서비스 (권장)
- 각 서버를 별도 Railway 서비스로 배포
- 독립적인 스케일링 및 모니터링
- 비용: 서비스당 별도 과금

### 옵션 2: 같은 서비스 내 여러 컨테이너
- Railway의 Docker Compose 사용
- 하나의 서비스로 관리
- 비용: 단일 서비스 과금

### 옵션 3: 외부 서버
- 자체 서버에 배포
- 더 많은 제어권
- 유지보수 필요

## 모니터링

각 서버는 `/health` 엔드포인트를 제공합니다:

```bash
curl https://your-gnugo-service.railway.app/health
curl https://your-katago-service.railway.app/health
```

## 트러블슈팅

### GnuGo 서버가 응답하지 않음
1. GnuGo가 설치되어 있는지 확인
2. Dockerfile에서 `apt-get install gnugo` 확인
3. 로그 확인: Railway 대시보드 → Deploy Logs

### KataGo 서버가 느림
1. CPU 전용 모드이므로 GPU보다 느릴 수 있음 (정상)
2. `maxVisits` 값 줄이기 (힌트용, 기본값: 30)
3. 작은 모델 사용 중 (kata1-b40c256)
4. 힌트는 빠르게, 계가는 더 많은 시간 허용

### 연결 오류
1. 환경 변수 `GNUGO_SERVER_URL`, `KATAGO_SERVER_URL` 확인
2. CORS 설정 확인
3. Railway 서비스 URL 확인

## 비용 최적화

- **GnuGo**: CPU만 필요, 저렴한 인스턴스 사용 가능
- **KataGo**: CPU 전용 모드, GPU 불필요, 저렴한 인스턴스 사용 가능
- **메인 앱**: 항상 실행 필요

## 보안

- 각 서버는 내부 네트워크에서만 접근 가능하도록 설정 권장
- Railway의 Private Networking 사용
- API 키 또는 인증 토큰 추가 고려

