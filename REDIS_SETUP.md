# Redis 설정 가이드 (Windows)

Bull 큐는 Redis가 필요합니다. Redis 없이도 AI가 작동하도록 폴백이 구현되어 있지만, 성능과 안정성을 위해 Redis를 사용하는 것을 권장합니다.

## Windows에서 Redis 설치 및 실행

### 방법 1: WSL2 사용 (권장)

1. WSL2가 설치되어 있다면:
   ```bash
   wsl
   sudo apt-get update
   sudo apt-get install redis-server
   sudo service redis-server start
   ```

2. WSL2에서 Redis가 실행되면 Windows에서 `localhost:6379`로 접근 가능합니다.

### 방법 2: Memurai 사용 (Windows 네이티브)

1. [Memurai](https://www.memurai.com/) 다운로드 (Redis 호환 Windows 서버)
2. 설치 후 서비스로 실행
3. 기본 포트 6379 사용

### 방법 3: Docker 사용

Docker가 설치되어 있다면:

```powershell
docker run -d -p 6379:6379 --name redis redis:7-alpine
```

### 방법 4: Redis 없이 사용 (폴백 모드)

Redis가 없어도 AI는 작동하지만, 큐 기능이 없어 성능이 떨어질 수 있습니다.

현재 코드는 Redis 연결 실패 시 자동으로 직접 AI를 호출하도록 폴백이 구현되어 있습니다.

## Redis 실행 확인

```powershell
# 포트 확인
Test-NetConnection -ComputerName localhost -Port 6379

# 또는 Redis CLI로 확인 (WSL2 또는 Docker에서)
redis-cli ping
# 응답: PONG
```

## 문제 해결

### Redis 연결 실패 시

서버 로그에서 다음과 같은 메시지를 확인하세요:
- `[AIQueue] Queue error: ...`
- `[AIService] Queue failed (Redis may not be running), calling AI directly`

이 경우 AI는 여전히 작동하지만 큐를 사용하지 않습니다.

### Redis 시작 스크립트 (WSL2)

`start-redis.ps1` 파일을 생성하여 사용할 수 있습니다:

```powershell
wsl sudo service redis-server start
```

