# 모바일 테스트 가이드

같은 네트워크(와이파이)에 있는 모바일 기기에서 게임을 테스트하는 방법입니다.

## 1. 서버 시작

```bash
npm run dev
# 또는
npm start
```

서버가 시작되면 콘솔에 다음과 같은 정보가 표시됩니다:

```
Server running on port 3000
Local access: http://localhost:3000

=== 네트워크 접속 정보 ===
Network access: http://192.168.75.100:3000
같은 네트워크의 모바일 기기에서 위 주소로 접속하세요.
```

## 2. PC와 모바일을 같은 Wi-Fi에 연결

- PC와 모바일 기기가 같은 Wi-Fi 네트워크에 연결되어 있어야 합니다.
- 공용 Wi-Fi나 회사 네트워크의 경우 방화벽이 연결을 차단할 수 있습니다.

## 3. 모바일 브라우저에서 접속

모바일 브라우저(Chrome, Safari 등)에서 콘솔에 표시된 네트워크 주소로 접속합니다.

예: `http://192.168.75.100:3000`

## 4. Windows 방화벽 설정 (필요시)

Windows 방화벽이 연결을 차단할 수 있습니다. 다음 명령어로 방화벽 규칙을 추가할 수 있습니다:

### PowerShell을 관리자 권한으로 실행 후:

```powershell
New-NetFirewallRule -DisplayName "Node.js Server" -Direction Inbound -LocalPort 3000 -Protocol TCP -Action Allow
```

또는 Windows 방화벽 설정에서:
1. Windows 설정 > 네트워크 및 인터넷 > Windows 방화벽
2. 고급 설정
3. 인바운드 규칙 > 새 규칙
4. 포트 선택 > TCP > 특정 로컬 포트: 3000
5. 연결 허용 > 다음 > 완료

## 5. 네트워크 IP 주소 확인 방법

네트워크 IP 주소를 확인하려면:

### Windows (CMD/PowerShell):
```bash
ipconfig | findstr IPv4
```

### Windows (PowerShell):
```powershell
Get-NetIPAddress -AddressFamily IPv4 | Where-Object {$_.InterfaceAlias -notlike "*Loopback*"}
```

## 6. 문제 해결

### 연결이 안 될 때:
1. PC와 모바일이 같은 Wi-Fi에 연결되어 있는지 확인
2. Windows 방화벽에서 포트 3000이 열려있는지 확인
3. 서버가 `0.0.0.0`에 바인딩되어 있는지 확인 (기본값)
4. 네트워크 IP 주소가 올바른지 확인

### Socket.IO 연결 오류:
- 모바일 브라우저에서도 WebSocket이 지원되는지 확인
- HTTPS가 아닌 HTTP로 접속하는지 확인 (개발 환경)
- 네트워크가 WebSocket을 차단하지 않는지 확인

## 참고사항

- 개발 환경에서는 HTTP를 사용합니다 (보안상 프로덕션에서는 HTTPS 사용 권장)
- 같은 네트워크에 있는 모든 기기에서 접속이 가능합니다
- 세션 쿠키는 각 브라우저/기기마다 독립적으로 관리됩니다

