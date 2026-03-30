# Writeup — Cross-Site ETag Length Leak

<br>

## 취약점 개요

브라우저의 ETag 캐싱 동작을 이용해 cross-site에서 타 도메인의 HTTP 응답 크기를 추론하는 기법입니다. 별도의 취약점을 추가하지 않고, 아래 세 가지 브라우저/HTTP 동작을 단일 체인으로 연결합니다.

1. 서버 응답 크기 변화 → ETag 길이 1바이트 차이 유발
2. URL padding으로 헤더 총량을 조절해 431 상태코드 발생 여부로 차이 증폭
3. 팝업 창의 `window.history.length` diff로 431 발생 여부를 cross-site에서 관찰

이를 통해 두 단계 oracle을 구성합니다.

- **Stage 1** — `/api/compare` 응답 크기 차이로 admin uid 이진탐색 (ETag **길이** 차이)
- **Stage 2** — `/admin/flag/search` 응답 유무로 플래그 prefix brute-force (ETag **존재 여부** 차이)

<br>

## 서비스 탐색

http://victim:3000 에 접속해 계정을 만들고 로그인합니다.
메모를 작성하면 HTTP 응답 헤더에 ETag가 포함됩니다.

```
HTTP/1.1 200 OK
ETag: W/"fff-aBcDeFg..."
Cache-Control: private, max-age=0, must-revalidate
```

<br>

## /api/compare 엔드포인트

메모 페이지의 "회원번호 비교" 기능에서 사용되는 API입니다.

```
GET /api/compare?target=<N>
```

target 값과 현재 세션의 userId를 비교한 결과에 따라 응답 body 크기가 달라집니다.

```
userId >= target → body ~4136 bytes → ETag: W/"1028-..."  (hex 4자리, 36바이트)
userId <  target → body ~4095 bytes → ETag: W/"fff-..."   (hex 3자리, 35바이트)
```

ETag는 응답 body의 해시값이므로 body 크기가 hex 자릿수 경계를 넘으면 ETag 길이가 1바이트 달라집니다.

<br>

## 431 임계치 탐색

브라우저는 같은 URL을 재방문할 때 캐싱된 ETag를 If-None-Match 헤더에 자동으로 포함합니다.
URL에 pad=X*N 파라미터를 추가해 헤더 총량을 조절하면, ETag 길이 1바이트 차이가 431 발생 여부로 증폭됩니다.

victim 서버는 `--max-http-header-size=8192` 옵션으로 실행되고 있습니다.

<br>

## history.length Oracle

Chromium에서 팝업 창이 동일 URL을 재방문할 때의 동작 차이를 이용합니다.

- 정상 응답(200/304) → history entry push → diff = 3
- 431 발생 → history entry replace → diff = 2

```javascript
const len1 = win.history.length;
win.location = url;        // 1차: ETag 캐싱
await sleep(200);
win.location = url;        // 2차: If-None-Match 포함 → 431 or 304
await sleep(200);
win.location = POPUP_HREF; // attacker 도메인으로 복귀

// diff === 2 → 431 (GTE/hit)
// diff === 3 → 정상 (LT/miss)
```

<br>

## Stage 1 — Admin uid 이진탐색

oracle을 이용해 admin uid를 이진탐색합니다.

```
탐색 범위: [1000, 9999]
oracle = true  → userId >= target → lo = mid + 1
oracle = false → userId <  target → hi = mid
결과: uid = lo - 1
```

<br>

## Stage 2 — 플래그 추출

`/admin/flag/search?uid=<uid>&q=<prefix>` 엔드포인트는 admin 세션에서만 접근 가능하며, prefix가 플래그와 일치하면 응답이 있고(ETag 캐싱), 불일치하면 빈 응답(ETag 없음)입니다.

Stage 1에서는 ETag **길이** 차이를 이용했지만, Stage 2에서는 ETag **존재 여부** 차이를 이용합니다. 동일한 history.length oracle이지만 oracle의 판단 근거가 다릅니다.

동일한 history.length oracle로 플래그를 한 글자씩 brute-force합니다.

```
WSL{ → WSL{c → WSL{cr → ... → WSL{cr0ss_s1te_3tag_l3ngth_le4k}
```

<br>

## Exploit 흐름

http://attacker:4000 편집기에서 exploit을 작성합니다.

```javascript
const pad1                  = await calibStage1();
const uid                   = await findUid(pad1);
const { basePad, baseQLen } = await calibStage2(uid);
const flag                  = await bruteFlag(uid, basePad, baseQLen);
```

전체 소요 시간은 약 15~20분이며, 네트워크 상태에 따라 달라질 수 있습니다.

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
