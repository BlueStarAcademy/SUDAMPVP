# Monorepo Prisma Client 오류 해결 가이드

## 문제
`TypeError: a.PrismaClient is not a constructor` 오류가 Next.js 빌드 중 발생합니다.

## 원인
monorepo 구조에서 Prisma Client가 올바른 위치에 생성되지 않거나, Next.js가 Prisma Client를 찾지 못하는 경우 발생합니다.

## 해결 방법

### 1. Prisma Schema 설정 확인

`packages/database/schema.prisma` 파일에서 `generator` 설정을 확인하세요:

```prisma
generator client {
  provider = "prisma-client-js"
  output   = "../../node_modules/.prisma/client"
}
```

또는 상대 경로를 사용:

```prisma
generator client {
  provider = "prisma-client-js"
  output   = "../node_modules/@prisma/client"
}
```

### 2. Dockerfile 수정

Prisma Client 생성 순서와 위치를 명확히 해야 합니다:

```dockerfile
# Prisma Client 생성 전에 모든 패키지 설치 완료
RUN pnpm install --no-frozen-lockfile

# Prisma Client 생성 (올바른 작업 디렉토리에서)
WORKDIR /app/packages/database
RUN prisma generate --schema ./schema.prisma

# 루트로 돌아가서 다시 생성 (Next.js가 찾을 수 있도록)
WORKDIR /app
RUN prisma generate --schema ./packages/database/schema.prisma

# 또는 루트에 Prisma 스키마를 복사하여 생성
COPY packages/database/schema.prisma ./prisma/schema.prisma
RUN prisma generate
```

### 3. package.json 설정 확인

`packages/database/package.json`에 Prisma 스크립트 추가:

```json
{
  "scripts": {
    "prisma:generate": "prisma generate --schema ./schema.prisma",
    "prisma:migrate": "prisma migrate dev --schema ./schema.prisma"
  }
}
```

### 4. Prisma Client Export 확인

`packages/database/src/index.ts` (또는 해당 파일)에서 Prisma Client를 올바르게 export:

```typescript
import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient({
  log: process.env.NODE_ENV === 'development' ? ['query', 'error', 'warn'] : ['error'],
});

export { prisma };
export { PrismaClient };
export default prisma;
```

### 5. tRPC에서 Prisma Client Import 확인

tRPC 라우터에서 Prisma Client를 올바르게 import:

```typescript
// ❌ 잘못된 방법
import { PrismaClient } from '@prisma/client';
const prisma = new PrismaClient();

// ✅ 올바른 방법 - database 패키지에서 import
import { prisma } from '@sudam/database';
// 또는
import prisma from '@sudam/database';
```

### 6. Next.js 빌드 전 Prisma Client 생성 보장

`app/package.json`의 빌드 스크립트 수정:

```json
{
  "scripts": {
    "build": "pnpm --filter @sudam/database prisma:generate && next build",
    "postinstall": "pnpm --filter @sudam/database prisma:generate"
  }
}
```

### 7. Dockerfile 최종 수정 예시

```dockerfile
FROM node:20-alpine

# Install dependencies
RUN apk add --no-cache python3 make g++ && \
    npm install -g pnpm@8.10.0

WORKDIR /app

# Copy package files
COPY package.json pnpm-lock.yaml* pnpm-workspace.yaml ./
COPY app/package.json ./app/
COPY packages/database/package.json ./packages/database/
COPY packages/game-logic/package.json ./packages/game-logic/
COPY packages/shared/package.json ./packages/shared/

# Install dependencies
RUN pnpm install --no-frozen-lockfile

# Copy Prisma schema
COPY packages/database/schema.prisma ./packages/database/schema.prisma

# Generate Prisma Client (중요: 모든 패키지 설치 후)
WORKDIR /app/packages/database
RUN npx prisma generate --schema ./schema.prisma

# Verify Prisma Client was generated
RUN ls -la ../../node_modules/.prisma/client || echo "Prisma client not found"

# Copy all source files
WORKDIR /app
COPY . .

# Build packages in order
RUN pnpm --filter @sudam/database build
RUN pnpm --filter @sudam/game-logic build

# Build Next.js app
WORKDIR /app/app
RUN pnpm build

# Start application
WORKDIR /app
CMD ["pnpm", "--filter", "@sudam/app", "start"]
```

### 8. 대안: 루트에 Prisma Schema 복사

Dockerfile에서 Prisma Schema를 루트로 복사하여 생성:

```dockerfile
# Prisma schema를 루트로 복사
COPY packages/database/schema.prisma ./prisma/schema.prisma

# 루트에서 Prisma Client 생성
RUN npx prisma generate

# 원래 위치로 복원
RUN cp -r node_modules/.prisma/client packages/database/node_modules/.prisma/client || true
```

### 9. 환경 변수 확인

빌드 시 `DATABASE_URL`이 필요할 수 있습니다 (스키마 검증용):

```dockerfile
ARG DATABASE_URL
ENV DATABASE_URL=${DATABASE_URL}
```

또는 더미 URL 사용:

```dockerfile
ENV DATABASE_URL="postgresql://dummy:dummy@localhost:5432/dummy"
```

### 10. 디버깅

빌드 실패 시 다음을 확인:

```dockerfile
# Prisma Client 생성 확인
RUN ls -la node_modules/.prisma/client
RUN ls -la node_modules/@prisma/client

# 생성된 파일 확인
RUN cat node_modules/.prisma/client/index.d.ts | head -20
```

## 권장 해결 순서

1. `packages/database/schema.prisma`의 `generator` 설정 확인
2. Dockerfile에서 Prisma Client 생성 순서 확인
3. 모든 패키지 설치 후 Prisma Client 생성
4. Prisma Client export 방식 확인
5. tRPC에서 올바른 import 경로 사용

## 추가 리소스

- [Prisma Monorepo 가이드](https://www.prisma.io/docs/guides/other/troubleshooting-development/troubleshooting#prisma-client-in-monorepos)
- [Next.js + Prisma](https://www.prisma.io/docs/guides/deployment/deployment-guides/deploying-to-vercel)

