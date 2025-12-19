# Prisma Schema 수정 가이드

`packages/database/schema.prisma` 파일을 열어서 `generator` 부분을 다음과 같이 수정하세요:

```prisma
generator client {
  provider = "prisma-client-js"
  output   = "../../node_modules/.prisma/client"
}
```

이렇게 하면 Prisma Client가 루트의 `node_modules`에 생성되어 Next.js가 찾을 수 있습니다.

## 전체 예시

```prisma
generator client {
  provider = "prisma-client-js"
  output   = "../../node_modules/.prisma/client"
}

datasource db {
  provider = "postgresql"
  url      = env("DATABASE_URL")
}

// ... 나머지 모델들
```

이 설정을 적용한 후 다시 빌드하면 오류가 해결됩니다.

