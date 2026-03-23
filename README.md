# Cross-Site ETag Length Leak

PortSwigger Top 10 Web Hacking Techniques of 2025 중 6위에 선정된 **Cross-Site ETag Length Leak** 기법을 주제로 한 웹 해킹 문제입니다.

비공개 메모 서비스 SecureNotes에서 관리자의 비밀 메모를 탈취하는 것이 목표입니다.

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
├── victim/               # 공격 대상 서비스 (Node.js, Express, SQLite) — 포트 3000
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

## 주의 사항

이 공격은 **타이밍 기반 side-channel**이므로 환경에 따라 결과가 불안정할 수 있습니다.

- 호스트 머신 부하 또는 Docker 네트워크 지연이 클 경우 oracle 오탐이 발생할 수 있습니다.
- 실패 시 봇을 재트리거하면 됩니다. exploit 내부에 재시도 로직이 포함되어 있습니다.
- Chromium 기반 브라우저에서만 동작합니다. (bot 컨테이너 내부 Chromium 사용)

<br>

## 참고

- https://blog.arkark.dev/2025/12/26/etag-length-leak
- https://portswigger.net/research/top-10-web-hacking-techniques-of-2025
