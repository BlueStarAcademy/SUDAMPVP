# AI 서버 배포 가이드

GnuGo와 KataGo 서버를 별도로 배포하는 방법입니다.

## GnuGo 서버

### 로컬 실행

1. GnuGo 설치:
```bash
# Ubuntu/Debian
sudo apt-get install gnugo

# macOS
brew install gnugo

# Windows
# https://www.gnu.org/software/gnugo/ 에서 다운로드
```

2. 서버 실행:
```bash
cd servers/gnugo
npm install
npm start
```

서버는 `http://localhost:3001`에서 실행됩니다.

### Railway 배포

1. Railway에서 새 프로젝트 생성
2. GitHub 저장소 연결 (또는 `servers/gnugo` 디렉토리만 배포)
3. Dockerfile 사용하여 빌드
4. 환경 변수 설정:
   - `PORT=3001` (자동 설정됨)

### API 엔드포인트

- `GET /health` - 서버 상태 확인
- `POST /move` - AI 수 요청
  ```json
  {
    "board": [["B", "W", ""], ...],
    "currentPlayer": "black",
    "moveHistory": [...],
    "level": 5  // 1-10 (선택사항)
  }
  ```

## KataGo 서버

### 로컬 실행

1. KataGo 설치:
```bash
# Linux
wget https://github.com/lightvector/KataGo/releases/download/v1.13.0/katago-v1.13.0-linux-x64.zip
unzip katago-v1.13.0-linux-x64.zip
chmod +x katago
sudo mv katago /usr/local/bin/

# 모델 다운로드 (선택사항)
mkdir -p ~/katago-models
wget https://media.katagotraining.org/uploaded/networks/models/kata1/kata1-b40c256-s11101799168-d2715431527.bin.gz -O ~/katago-models/kata1.bin.gz
```

2. 서버 실행:
```bash
cd servers/katago
npm install
npm start
```

서버는 `http://localhost:3002`에서 실행됩니다.

### Railway 배포

1. Railway에서 새 프로젝트 생성
2. GitHub 저장소 연결 (또는 `servers/katago` 디렉토리만 배포)
3. Dockerfile 사용하여 빌드
4. 환경 변수 설정:
   - `PORT=3002` (자동 설정됨)
   - `KATAGO_MODEL_PATH=/katago-models/kata1.bin.gz` (선택사항)
   - `KATAGO_CONFIG_PATH=/katago-configs/gtp_example.cfg` (선택사항)

**주의**: KataGo는 GPU가 있으면 훨씬 빠릅니다. Railway의 GPU 인스턴스 사용을 고려하세요.

### API 엔드포인트

- `GET /health` - 서버 상태 확인
- `POST /move` - 힌트 (추천 수)
  ```json
  {
    "board": [["B", "W", ""], ...],
    "currentPlayer": "black",
    "moveHistory": [...],
    "maxVisits": 50  // 계산 깊이 (선택사항)
  }
  ```
- `POST /score` - 계가 (점수 계산)
  ```json
  {
    "board": [["B", "W", ""], ...],
    "currentPlayer": "black",
    "moveHistory": [...]
  }
  ```

## Railway에서 별도 서비스로 배포

### 방법 1: 별도 저장소로 배포

1. `servers/gnugo`와 `servers/katago`를 각각 별도 GitHub 저장소로 분리
2. Railway에서 각각 별도 프로젝트로 배포
3. 메인 앱의 환경 변수에 각 서버 URL 설정

### 방법 2: Monorepo로 배포

1. Railway에서 같은 저장소의 다른 디렉토리를 배포
2. 각 서비스를 별도 Railway 서비스로 설정
3. 환경 변수로 서비스 간 통신

### 방법 3: Docker Compose (로컬 개발용)

`docker-compose.yml` 파일 생성:

```yaml
version: '3.8'

services:
  gnugo:
    build: ./servers/gnugo
    ports:
      - "3001:3001"
    environment:
      - PORT=3001

  katago:
    build: ./servers/katago
    ports:
      - "3002:3002"
    environment:
      - PORT=3002
      - KATAGO_MODEL_PATH=/katago-models/kata1.bin.gz
```

실행:
```bash
docker-compose up
```

## 메인 앱 환경 변수 설정

메인 SUDAM 앱의 환경 변수에 다음을 추가:

```env
GNUGO_SERVER_URL=http://your-gnugo-server.railway.app
KATAGO_SERVER_URL=http://your-katago-server.railway.app
```

또는 로컬 개발 시:
```env
GNUGO_SERVER_URL=http://localhost:3001
KATAGO_SERVER_URL=http://localhost:3002
```

## 트러블슈팅

### GnuGo를 찾을 수 없음
- GnuGo가 시스템 PATH에 있는지 확인
- Dockerfile에서 `apt-get install gnugo` 확인

### KataGo 모델 로드 실패
- 모델 파일 경로 확인
- 모델 파일이 올바르게 다운로드되었는지 확인
- 환경 변수 `KATAGO_MODEL_PATH` 설정

### 포트 충돌
- 각 서버가 다른 포트 사용 확인
- Railway는 자동으로 포트 할당

