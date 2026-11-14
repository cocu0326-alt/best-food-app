# 상품 데이터 연동 서버 (준비 단계)

이 디렉터리는 Android 앱의 '실제 상품 조회' 기능에 연결할 수 있는 서버의 기본 구조입니다. 실제 쇼핑몰 API 이용 권한과 자격증명은 아직 제공되지 않았습니다. 따라서 현재는 실제 상품 데이터를 반환하지 않습니다.

## 실행

Node.js 20 이상에서:

```bash
node server/index.mjs
```

기본 포트는 8787이며, `PORT` 환경변수로 변경할 수 있습니다.

- `GET /health`: 서버 상태
- `GET /api/foods?q=검색어`: 연동된 데이터 공급자가 없으면 HTTP 503과 안내 JSON 반환
- `FOOD_UPSTREAM_URL`: 합법적으로 접근 가능한 상품 공급 API URL. 검색어는 `q` 쿼리로 전달합니다.
- `FOOD_API_TOKEN`: 공급 API에 필요한 경우 서버 환경변수로만 설정. 앱에는 입력하지 않습니다.
- `ALLOWED_ORIGIN`: 허용할 브라우저 Origin (선택). Android WebView의 로컬 파일 출처는 배포 환경에서 별도 검토가 필요합니다.

공급 API는 `{ "products": [...] }` JSON을 반환해야 합니다. 상품은 `name, price, size, measure(g/mL), rating(0~5), reviews, seller, url` 형식을 따릅니다. 공급자의 실제 응답 필드가 다르면 별도의 매핑 구현이 필요합니다.

이 서버는 상품 데이터를 스크래핑하지 않고, 제공 권한이 있는 API만 연결하도록 설계했습니다. 운영 전 HTTPS 배포, 인증·속도 제한, 데이터 사용조건, CORS 정책 검토가 필요합니다.

공급업체 연동 시 요청·응답 예시와 필드별 검증 규칙은 [`SUPPLIER_API.md`](./SUPPLIER_API.md)를 참고하세요.

## 운영 전 확인 사항

- `FOOD_UPSTREAM_URL`은 자격증명과 URL 조각(`#...`)이 없는 HTTPS 주소만 허용합니다. 공급업체가 요구하는 인증 토큰은 `FOOD_API_TOKEN`에만 보관하세요.
- `ALLOWED_ORIGIN`을 사용하는 경우 경로나 쿼리가 없는 정확한 HTTPS Origin(예: `https://example.com`)만 지정하세요. `*`, HTTP 주소, 경로가 붙은 주소는 서버 시작 시 거부됩니다.
- `ALLOWED_ORIGIN`을 비워 두면 서버는 `Access-Control-Allow-Origin` 헤더를 내보내지 않습니다. Android WebView가 로컬 `file://` 페이지에서 HTTPS 서버에 접근할 때는 실제 앱 환경의 CORS 동작을 별도로 검증해야 합니다. 임의로 `*`를 허용하는 방식으로 우회하지 마세요.
- `/health`의 `providerConfigured:true`는 공급 API 주소가 설정됐다는 뜻이며, 상품 조회 성공을 의미하지 않습니다. `/api/foods?q=...`를 호출해 HTTP 200과 `products` 배열을 확인해야 합니다.
- 공급업체가 허용한 API만 사용하며, 공급업체 데이터의 가격·평점·원산지·원재료는 별도 검증되지 않은 정보로 취급합니다.

배포 및 실제 점검 절차는 [`DEPLOY.md`](./DEPLOY.md)를 참고하세요.
