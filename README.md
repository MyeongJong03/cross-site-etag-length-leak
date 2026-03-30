# Cross-Site ETag Length Leak

PortSwigger Top 10 Web Hacking Techniques of 2025 중 6위에 선정된 **Cross-Site ETag Length Leak** 기법을 주제로 한 웹 해킹 문제입니다.

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

## 취약점 개요

브라우저의 ETag 캐싱 동작을 이용해 cross-site에서 타 도메인의 HTTP 응답 크기를 추론하는 기법입니다. 별도의 취약점을 추가하지 않고, 아래 세 가지 브라우저/HTTP 동작을 단일 체인으로 연결합니다.

1. 서버 응답 크기 변화 → ETag 길이 1바이트 차이 유발
2. URL padding으로 헤더 총량을 조절해 431 상태코드 발생 여부로 차이 증폭
3. 팝업 창의 `window.history.length` diff로 431 발생 여부를 cross-site에서 관찰

이를 통해 두 단계 oracle을 구성합니다.

- **Stage 1** — `/api/compare` 응답 크기 차이로 admin uid 이진탐색
- **Stage 2** — `/admin/flag/search` ETag 존재 여부로 플래그 prefix brute-force

<br>

## 프로젝트 구조

```
etag-leak-ctf/
├── docker-compose.yml
├── .env                  # 환경변수 (FLAG, ADMIN_PASSWORD, SESSION_SECRET)
├── app/                  # 공격 대상 서비스 (Node.js, Express, SQLite) — 포트 3000
├── attacker/             # exploit 작성 편집기 — 포트 4000
└── bot/                  # admin 자동 로그인 및 exploit 실행 (Puppeteer) — 포트 3001
```

<br>

## 실행 방법

Docker와 Docker Compose가 설치된 환경에서 실행합니다.

```
docker compose up --build -d
```

| 서비스 | 기본 포트 | 설명 |
|---|---|---|
| victim | 3000 | 공격 대상 서비스 |
| attacker | 4000 | Exploit 편집기 |
| bot | 3001 | 봇 트리거 API |

포트 충돌 시 docker-compose.yml의 ports 항목을 수정하세요. victim, attacker, bot 세 서비스 모두 변경해야 합니다.

<br>

## 봇 트리거

http://localhost:4000 에서 exploit을 작성하고 저장한 뒤, 아래 명령으로 봇을 실행합니다.

```
curl -X POST http://localhost:3001/visit \
  -H "Content-Type: application/json" \
  -d '{"url":"http://attacker:4000/exploit.html"}'
```

봇 실행 후 결과는 attacker 서버 로그에서 확인합니다.

```
docker compose logs -f attacker
```

봇은 1회 실행 후 60초 쿨다운이 있으며, 최대 20분간 동작합니다.
재실행이 필요할 경우 `docker compose restart bot` 후 다시 트리거하세요.

<br>

## DB 초기화

`docker compose up --build` 또는 `docker compose restart victim` 실행 시 DB가 초기 상태로 리셋됩니다.
플레이어가 테스트 중 생성한 계정/메모는 재시작 후 사라집니다. 이는 의도된 동작으로, 매 실행마다 깨끗한 환경을 보장합니다.

<br>

## 주의 사항

이 공격은 **타이밍 기반 side-channel**이므로 환경에 따라 결과가 불안정할 수 있습니다.

- 호스트 머신 부하 또는 Docker 네트워크 지연이 클 경우 oracle 오탐이 발생할 수 있습니다.
- 실패 시 봇을 재트리거하면 됩니다. exploit 내부에 재시도 로직이 포함되어 있습니다.
- **Chromium 전용**: 이 공격은 Chromium의 navigation history 동작(`window.history.length`)에 의존합니다. Firefox, Safari에서는 동작하지 않습니다. bot 컨테이너는 Puppeteer 21.6.1 (Chromium 119)을 사용합니다.

<br>

## GTE_PAD / LT_PAD 재산출

server.js의 `GTE_PAD`, `LT_PAD` 상수는 **Node.js 20 + Express 4.18** 기준으로 계산된 값입니다. Node.js 또는 Express 버전이 바뀌면 ETag 계산 방식이 달라질 수 있으므로 재산출이 필요합니다.

**원리**: Express weak ETag는 응답 body 크기를 hex로 인코딩합니다. `0xfff` (4095 bytes) 이하이면 hex 3자리, `0x1000` (4096 bytes) 이상이면 hex 4자리 ETag가 생성되며 헤더 길이가 1바이트 달라집니다. PAD 값은 각 분기의 응답 body가 이 경계 양쪽에 위치하도록 조정합니다.

**재산출 절차**:

1. 서버를 실행하고 일반 계정으로 로그인합니다.
2. 각 분기의 응답 body 크기를 확인합니다.
   ```bash
   # GTE 분기 (userId >= target)
   curl -s -o /dev/null -w "%{size_download}" \
     -b "connect.sid=<세션쿠키>" \
     "http://localhost:3000/api/compare?target=1"

   # LT 분기 (userId < target)
   curl -s -o /dev/null -w "%{size_download}" \
     -b "connect.sid=<세션쿠키>" \
     "http://localhost:3000/api/compare?target=9999"
   ```
3. GTE 분기 body가 4096 이상, LT 분기 body가 4095 이하가 되도록 `GTE_PAD`, `LT_PAD`의 repeat 인수를 조정합니다.
   - 현재 body 크기가 목표보다 N 작으면 PAD를 N 늘립니다.
   - 현재 body 크기가 목표보다 N 크면 PAD를 N 줄입니다.
4. 수정 후 서버를 재시작하고 ETag 헤더 길이를 확인합니다.
   ```bash
   curl -I -b "connect.sid=<세션쿠키>" \
     "http://localhost:3000/api/compare?target=1"
   # ETag: W/"1000-..." 이면 4자리(36바이트) — GTE 정상
   # ETag: W/"fff-..."  이면 3자리(35바이트) — LT  정상
   ```

<br>

## 참고

- https://blog.arkark.dev/2025/12/26/etag-length-leak
- https://portswigger.net/research/top-10-web-hacking-techniques-of-2025
- [Writeup](docs/writeup.md) — 스포일러 주의: 풀이를 시도한 후 참고하세요.
