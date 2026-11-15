# 식품 검색 API 배포 안내

이 저장소의 `render.yaml`은 Render Blueprint로 Node.js 서버를 배포하기 위한 초안입니다. 실제 Render 계정 연결과 배포는 별도로 진행해야 합니다.

1. Render에서 New → Blueprint를 선택하고 이 GitHub 저장소를 연결합니다.
2. `render.yaml`을 확인하고 배포를 승인합니다. 무료 플랜 이용 가능 여부와 과금 조건은 Render 화면에서 확인합니다.
3. 상품 데이터 공급자에게 정식 이용 권한을 받은 경우에만 `FOOD_UPSTREAM_URL`을 HTTPS 주소로 설정합니다. 토큰이 필요하면 `FOOD_API_TOKEN`을 Render 환경변수에 등록합니다.
4. 배포된 주소의 `/health`에서 `ok: true`와 `providerConfigured` 상태를 확인합니다.
5. Android 앱의 API 주소에 `https://<배포-도메인>/api/foods`를 입력한 뒤 '연결 확인'을 누릅니다.

`providerConfigured: false`는 데이터 공급자 연결이 아직 없다는 뜻입니다. 이 경우 `/api/foods`는 HTTP 503을 반환합니다.

**주의:** 공급 API 주소·토큰을 GitHub 코드나 앱에 직접 기록하지 마세요. 운영 배포 전에 API 공급자 사용 조건, 인증, 속도 제한, HTTPS, 데이터 정확성, CORS와 WebView 접근 정책을 확인해야 합니다. Render의 무료 인스턴스는 휴면 후 첫 요청이 지연될 수 있습니다.

## 네이버쇼핑 API로 실제 상품 검색 연결

네이버 개발자센터에서 검색 API 사용 신청 후 발급받은 **Client ID**와 **Client Secret**을 Render 서비스의 환경변수 `NAVER_CLIENT_ID`, `NAVER_CLIENT_SECRET`에 각각 등록합니다. 인증정보는 GitHub 저장소나 Android 앱에 넣지 않습니다.

`FOOD_UPSTREAM_URL`이 비어 있고 네이버 인증정보 두 가지가 모두 등록되어 있으면 서버는 네이버쇼핑 검색 API(`https://openapi.naver.com/v1/search/shop.json`)를 사용합니다. 기존 공급업체 API가 설정되어 있으면 해당 공급업체가 우선합니다.

서버 배포 후 `/health`에서 `providerConfigured:true`를 확인하고 `/api/foods?q=만두`를 호출합니다. 네이버 모드의 응답은 `products:[]`와 `candidates` 배열로 구성됩니다. `candidates`에는 상품명·가격·판매처·상품 링크만 담고, 네이버가 제공하지 않는 용량·평점·리뷰 수는 임의로 생성하지 않습니다. 앱은 이를 **검색 결과 미리보기**로 표시하며 종합 평가에 자동 등록하지 않습니다.

Android WebView에서 호출하려면 아래 CORS 설정도 필요합니다. `providerConfigured:true`만으로 실제 조회 성공을 보증하지 않으므로 반드시 실제 검색어로 검증하세요. 네이버 API 이용 조건, 호출량 및 표시·보관 제한은 운영 전에 개발자센터의 최신 정책을 확인해야 합니다.

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

## 실제 상품 공급자 연결 전 확인표

실제 데이터를 제공하는 공급업체가 정해지면 아래 항목을 확인한 뒤 운영 설정을 진행합니다.

1. 공급업체 명칭, 공식 API 문서, 상업적 사용·재배포 허용 범위 및 이용 계약
2. HTTPS 검색 엔드포인트, 검색어 파라미터(`q`) 지원 여부, 인증 방식 및 호출 한도
3. 상품명·가격·중량/용량·단위·판매처를 응답에서 어떻게 제공하는지 (`server/SUPPLIER_API.md` 참조)
4. 가격 갱신 주기, 품절/판매 중단 표시, 배송비·할인 적용 조건
5. 원산지·원재료·제조사 정보의 출처와 누락 처리 정책
6. 실제 응답을 이용한 `/api/foods?q=...` 검색 테스트 및 Android 앱에서의 연결 확인

**중요:** 현재 서버는 공급업체별 응답을 자동으로 임의 변환하지 않습니다. 공급업체 응답이 `server/SUPPLIER_API.md`의 계약과 다르면 별도 변환 어댑터를 구현하고 테스트해야 합니다. API 문서·인증정보 없이 임의의 공개 웹사이트를 상품 공급 API로 간주하지 않습니다.

## Android WebView 파일 출처의 CORS 설정

현재 Android 앱은 `file:///android_asset/index.html`에서 실행됩니다. 이 페이지가 HTTPS 상품 API를 `fetch`할 때 브라우저의 Origin이 `null`일 수 있습니다. 서버 기본 설정은 이 출처를 허용하지 않으므로, 실제 앱에서 API 요청이 CORS 오류로 실패할 수 있습니다.

신뢰할 수 있는 공개 읽기 전용 API이고 호출 제한 및 운영 보안 검토를 마친 경우에 한해 서버 환경변수 `ALLOW_ANDROID_FILE_ORIGIN=true`를 설정할 수 있습니다. 그러면 `Origin: null` 요청에 `Access-Control-Allow-Origin: null`을 반환합니다. **이 설정은 Android 앱만 식별하거나 인증하지 않습니다.** 샌드박스 페이지와 다른 로컬 파일 페이지도 `null` 출처를 사용할 수 있으므로 비공개 상품정보, 사용자별 데이터, 인증이 필요한 API에는 적용하지 마세요. 공급업체 인증 토큰은 중계 서버 내부에만 두며 클라이언트로 노출하지 않습니다.

서버 설정 후 Android 실기기에서 `연결 확인` 및 `실제 상품 조회`를 각각 시험해야 합니다. 장기적으로는 앱 화면을 신뢰할 수 있는 HTTPS 앱 자산 출처로 이전하고 그 출처만 허용하는 방식이 더 적절합니다.
