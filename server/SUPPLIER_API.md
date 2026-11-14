# 상품 공급 API 연동 규격

현재는 실제 공급업체와 연결되지 않은 준비 단계입니다. 데이터 제공 권한이 있는 HTTPS API만 사용합니다.

## 요청

서버는 환경변수 `FOOD_UPSTREAM_URL`에 등록한 HTTPS 주소로 GET 요청을 보냅니다.
- 검색어는 쿼리 매개변수 `q`로 전달하며 앞뒤 공백을 제거하고 1~120자로 제한합니다.
- `FOOD_API_TOKEN`이 설정되면 `Authorization: Bearer <token>` 헤더를 보냅니다.
- `Accept: application/json`을 사용합니다.
- 리디렉션을 허용하지 않으며 응답 본문을 포함하여 8초 시간 제한과 1MiB 응답 크기 제한을 적용합니다.

## 응답 JSON 예시

```json
{
  "products": [
    {
      "name": "예시 사과",
      "price": 4500,
      "size": 1,
      "unit": "kg",
      "rating": 4.5,
      "reviews": 27,
      "seller": "예시 생산자",
      "url": "https://example.com/product/apple",
      "source": "공급업체 제공",
      "updatedAt": "2026-11-15",
      "origin": "국내산",
      "ingredients": "사과 100%"
    }
  ]
}
```

이 예시는 형식 설명용 가상 데이터이며 실제 상품이나 가격이 아닙니다.

## 필드 규칙

| 필드 | 필수 | 규칙 |
|---|---|---|
| `products` | 예 | 배열. 앞의 1,000개 항목을 정규화 |
| `name` | 예 | 공백이 아닌 문자열, 최대 200자 |
| `price` | 예 | 유한한 양수, 원 단위 |
| `size` 또는 `amount` | 예 | 유한한 양수 |
| `unit` 또는 `measure` | 예 | g, kg, mL, L (대소문자 무관). kg→g, L→mL |
| `rating` | 아니요 | 0~5. 범위를 벗어나면 0 |
| `reviews` | 아니요 | 0 이상의 정수. 아니면 0 |
| `seller` 또는 `manufacturer` | 아니요 | 문자열. 없거나 잘못된 형식이면 기본 판매자명 |
| `url` | 아니요 | 계정 정보가 없는 HTTPS 주소만 유지 |
| `source` | 아니요 | 출처 문자열, 최대 120자 |
| `updatedAt` | 아니요 | 문자열, 최대 40자. 날짜 형식 자체는 검증하지 않음 |
| `origin` | 아니요 | 원산지 문자열, 최대 200자 |
| `ingredients` | 아니요 | 원재료 문자열, 최대 1,000자 |

필수값이 잘못된 상품은 제외됩니다. 정규화 후 서버는 상품명에 검색어가 포함된 결과를 최대 100개 반환합니다. 상품 평점과 품질 정보는 외부 검증을 거치지 않았으므로 별도 검증된 사실처럼 표시해서는 안 됩니다.

## 오류와 점검

- `GET /health`: `ok`와 `providerConfigured` 반환. 실제 공급 API 동작 여부를 검증하지는 않음
- `GET /api/foods?q=...`: 정상 처리 시 `{"products":[...]}`
- HTTP 400: 검색어 오류
- HTTP 429: 요청 제한 초과
- HTTP 503: 공급 API 미설정
- HTTP 502: 공급업체 HTTP 오류, 응답 형식 오류 또는 통신 실패
- `RATE_LIMIT_PER_MINUTE`: IP별 기본 60회/분. 단일 프로세스 메모리 기준

공급업체 API의 필드명·인증 방식·약관이 위 규격과 다르면 연동 어댑터를 별도로 수정해야 합니다.
