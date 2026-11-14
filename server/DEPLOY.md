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
