# Cross-Site ETag Length Leak

PortSwigger Top 10 Web Hacking Techniques of 2025 중 6위에 선정된 **Cross-Site ETag Length Leak** 기법을 주제로 한 웹 해킹 훈련 환경입니다.

<br>

## Challenge

SecureNotes는 비공개 메모를 안전하게 저장하는 서비스입니다.
관리자는 이 서비스에 중요한 비밀 메모를 남겨두었습니다.

당신은 관리자 계정도, 서버 접근 권한도 없습니다.
하지만 관리자가 당신의 페이지를 방문하게 만들 수는 있습니다.

브라우저가 HTTP 캐시를 처리하는 방식을 이용해, 관리자의 비밀 메모를 탈취하세요.

**Goal**: 관리자의 비공개 메모에 저장된 플래그를 획득하세요.

**Flag format**: `WSL{...}`

<br>

## 프로젝트 구조

```
etag-leak-ctf/
├── docker-compose.yml
├── .env                  # 환경변수 (FLAG, ADMIN_PASSWORD, SESSION_SECRET)
├── app/                  # 공격 대상 서비스 (Node.js, Express, SQLite) — 포트 3000
├── attacker/             # exploit 작성 편집기 — 포트 4000
├── bot/                  # admin 자동 로그인 및 exploit 실행 (Puppeteer) — 포트 3001
├── docs/                 # 기술 문서 및 풀이
└── solver/               # 풀이 스크립트 (스포일러 주의)
```

<br>

## 실행 방법

Docker와 Docker Compose가 설치된 환경에서 실행합니다.

```bash
docker compose up --build -d
```

| 서비스 | 기본 포트 | 설명 |
|---|---|---|
| victim | 3000 | 공격 대상 서비스 |
| attacker | 4000 | Exploit 편집기 |
| bot | 3001 | 봇 트리거 API |

포트 충돌 시 `docker-compose.yml`의 ports 항목을 수정하세요.

<br>

## 봇 트리거

http://localhost:4000 에서 exploit을 작성하고 저장한 뒤, 아래 명령으로 봇을 실행합니다.

```bash
curl -X POST http://localhost:3001/visit \
  -H "Content-Type: application/json" \
  -d '{"url":"http://attacker:4000/exploit.html"}'
```

봇 실행 후 결과는 attacker 서버 로그에서 확인합니다.

```bash
docker compose logs -f attacker
```

봇은 최대 25분간 동작하며, 재실행 간 15초 쿨다운이 있습니다.
재실행이 필요할 경우 `docker compose restart bot` 후 다시 트리거하세요.

<br>

## DB 초기화

`docker compose up --build` 또는 `docker compose restart victim` 실행 시 DB가 초기 상태로 리셋됩니다.
플레이어가 테스트 중 생성한 계정/메모는 재시작 후 사라집니다.

<br>

## 주의 사항

- 이 문제는 브라우저 동작에 의존하므로 호스트 환경에 따라 결과가 달라질 수 있습니다.
- **Chromium 전용**: bot 컨테이너는 Puppeteer (Chromium)을 사용합니다. Firefox, Safari에서는 동작하지 않습니다.
- 실패 시 봇을 재트리거하면 됩니다. 새 요청 시 기존 봇 세션은 자동 종료됩니다.
- 풀이자에게는 `app/server.js` 소스코드가 제공됩니다.

> 이 프로젝트는 학습을 위한 환경입니다. 문제 배포 시에는 `.env`, `seed.js`, `solver/`, `docs/writeup.md`를 비공개로 관리해야 합니다.

<br>

## 풀이

> **스포일러 주의**: 풀이를 시도한 후 참고하세요.

- [Writeup](docs/writeup.md) — 풀이 및 기술 분석
- [Solver](solver/exploit.html) — exploit PoC

<br>

## 참고

- https://blog.arkark.dev/2025/12/26/etag-length-leak
- https://portswigger.net/research/top-10-web-hacking-techniques-of-2025
