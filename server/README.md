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
