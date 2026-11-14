# 식품 검색 API 배포 안내

이 저장소의 `render.yaml`은 Render Blueprint로 Node.js 서버를 배포하기 위한 초안입니다. 실제 Render 계정 연결과 배포는 별도로 진행해야 합니다.

1. Render에서 New → Blueprint를 선택하고 이 GitHub 저장소를 연결합니다.
2. `render.yaml`을 확인하고 배포를 승인합니다. 무료 플랜 이용 가능 여부와 과금 조건은 Render 화면에서 확인합니다.
3. 상품 데이터 공급자에게 정식 이용 권한을 받은 경우에만 `FOOD_UPSTREAM_URL`을 HTTPS 주소로 설정합니다. 토큰이 필요하면 `FOOD_API_TOKEN`을 Render 환경변수에 등록합니다.
4. 배포된 주소의 `/health`에서 `ok: true`와 `providerConfigured` 상태를 확인합니다.
5. Android 앱의 API 주소에 `https://<배포-도메인>/api/foods`를 입력한 뒤 '연결 확인'을 누릅니다.

`providerConfigured: false`는 데이터 공급자 연결이 아직 없다는 뜻입니다. 이 경우 `/api/foods`는 HTTP 503을 반환합니다.

**주의:** 공급 API 주소·토큰을 GitHub 코드나 앱에 직접 기록하지 마세요. 운영 배포 전에 API 공급자 사용 조건, 인증, 속도 제한, HTTPS, 데이터 정확성, CORS와 WebView 접근 정책을 확인해야 합니다. Render의 무료 인스턴스는 휴면 후 첫 요청이 지연될 수 있습니다.

## 요청 제한 및 보안

- `RATE_LIMIT_PER_MINUTE` (기본 60): IP별 분당 상품 검색 요청 제한. 초과 시 HTTP 429 반환.
- 상품 검색과 상태 확인은 GET만 허용하며 다른 메서드는 HTTP 405 반환.
- 공급 API의 HTTP 리디렉션은 차단합니다. 공급 API는 최종 HTTPS 주소를 사용하세요.
- 현재 요청 제한은 단일 프로세스 메모리 기반입니다. 다중 인스턴스 운영에는 공유 저장소 기반 제한과 프록시 신뢰 설정이 필요합니다.
- `ALLOWED_ORIGIN`은 브라우저 CORS 응답만 제한하며 API 인증 수단이 아닙니다. 외부 공개 운영 시 별도 인증과 접근제어가 필요합니다.

- 외부 공급 API 요청은 응답 본문 수신을 포함하여 최대 8초 동안 허용하며, 지연 또는 중단 시 오류 응답을 반환합니다.

## 배포 후 실제 연결 점검

서버 주소가 발급되면 다음 순서로 확인합니다. `example.onrender.com`은 실제 배포 주소로 교체하세요.

```bash
curl -i https://example.onrender.com/health
curl -i 'https://example.onrender.com/api/foods?q=%EC%82%AC%EA%B3%BC'
```

- `/health`의 HTTP 200 및 `ok:true`는 서버 프로세스의 응답만 확인합니다. `providerConfigured:true`도 환경변수 등록 여부일 뿐 실제 공급업체 연결 성공을 보증하지 않습니다.
- `/api/foods`의 HTTP 200과 `products` 배열을 확인해야 검색 연결이 작동한다고 판단할 수 있습니다. 검색 결과가 0개일 수도 있습니다.
- HTTP 503이면 `FOOD_UPSTREAM_URL`이 설정되지 않은 상태입니다. HTTP 502이면 공급 API 주소, 접근 권한, 토큰, 공급업체 응답 형식을 서버 로그에서 점검하세요.
- HTTP 429이면 호출 횟수 제한에 걸린 것이므로 잠시 기다린 뒤 다시 확인합니다.
- 실제 공급업체와 계약하거나 이용 권한을 확보하기 전에는 가상 데이터로 테스트하되, 실제 상품 검색이 가능하다고 표시하지 마세요.
- 공급업체 응답에 포함된 가격·평점·원산지는 외부 검증되지 않은 정보입니다. 품질 점수와 제조정보 확인 상태는 앱에서 자동 확정하지 않습니다.

**Android 앱 연결:** 앱에 입력하는 주소는 `https://example.onrender.com/api/foods` 형식이어야 합니다. 서버 주소 뒤에 `/health`만 입력하거나 인증 토큰을 URL에 포함하지 마세요.
