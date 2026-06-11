import { VelogClient } from "./velog-client.js";
import { loadTokens } from "./auth.js";

const postTitle = "NimbusShield: 대한민국 날씨 에이전트 커맨드 센터 개발기";

const postBody = `
대한민국의 특정 지역 날씨와 해수면 기상 상태를 실시간 및 과거 데이터와 비교하여 모니터링할 수 있는 독립형 모니터링 대시보드인 **NimbusShield(임버스실드)** 개발기를 소개합니다.

![NimbusShield Dashboard Header](https://images.unsplash.com/photo-1504608524841-42fe6f032b4b?auto=format&fit=crop&w=1200&q=80)
*대시보드 메인 콘셉트 이미지 (로컬에서 생성된 멋진 nimbusshield_dashboard 스크린샷으로 Velog 글 수정 시 업로드하여 변경할 수 있습니다.)*

---

## 💡 프로젝트 개요
**NimbusShield**는 자율형 날씨 에이전트를 가상으로 배치하고 대한민국 전역의 기상 및 해상 상황을 직관적인 다크 테마 UI를 통해 실시간 모니터링하는 프로젝트입니다. 내륙 지역의 일반 기상과 함께 삼면이 바다인 한국의 특성을 고려하여 해안 지역 에이전트 배치 시 실시간 해양 데이터(해수면 온도, 파고, 파주기 등)를 모니터링할 수 있도록 설계되었습니다.

---

## 🛠️ 기술 스택 (Tech Stack)
* **Frontend**: HTML5, Vanilla CSS (CSS Variables 기반 네온 다크 모드, Glassmorphism 테마), Vanilla JavaScript
* **Libraries**: Chart.js (시간별 예보 다중 Y축 그래프 시각화)
* **APIs**: Open-Meteo Weather API, Marine Forecast API, Geocoding API, Historical Weather Archive API
* **DevOps**: Docker, Nginx (정적 호스팅 및 프록시 설정), Python (통합 빌드 및 배포 무결성 검증 테스트)

---

## ⚡ 핵심 기능 및 구현 상세

### 1. 지오코딩 및 국내 좌표 지원
대한민국의 행정구역 기반 검색을 지원하며, 기상청/지오코딩 서비스에 등록되지 않은 특수 해상 좌표의 경우 사용자가 직접 **위도와 경도(예: \`37.217, 126.275\`)**를 수동 입력하여 에이전트를 배치할 수 있도록 좌표 파서(Coordinate Parser)를 구현했습니다.

### 2. 동적 해양 텔레메트리 패널 (Marine Telemetry Extension)
선택한 위치가 해안이나 바다 지역일 경우, API 응답 데이터를 분석하여 평균 해수면 온도(SST), 유의 파고(Wave Height), 평균 파주기 및 파향을 보여주는 **해양 전용 서브 패널**이 동적으로 활성화됩니다. 내륙 지역의 경우 불필요한 공간을 차지하지 않도록 레이아웃이 유연하게 숨김 처리됩니다.

### 3. 다중 Y축 기반의 24시간 예보 차트 (Hourly Charting)
Chart.js를 활용하여 기온(Temp), 풍속(Wind), 파고(Wave Height) 추이를 각각의 단위에 맞춰 다중 Y축(Dual/Triple Y-axes)으로 시각화했습니다.
* **메모리 누수 방지**: 사용자가 여러 카드의 차트를 열어볼 때 브라우저 메모리 오버헤드를 막기 위해, 새로운 차트 객체가 인스턴스화될 때 이전에 존재하던 차트 인스턴스를 소멸시키는 가비지 컬렉션(GC) 프록시 패턴을 적용했습니다.

### 4. 날씨 샌드박스 시뮬레이터 (Sandbox Simulator)
실시간 날씨뿐만 아니라 비상 기상 이벤트를 시뮬레이션하기 위해 **오버라이드 제어기**를 장착했습니다. 특정 에이전트에 대해 기온, 풍속, 강우량, 파고의 임계치를 수동 조절하면 화면 카드에 neon \`SIM\` 배지가 켜지고, 설정된 슬랙(Slack)/디스코드(Discord) 웹훅 채널로 브라우저 푸시 알림과 함께 기상 경보 웹훅 메시지가 즉시 전송됩니다.

### 5. 과거 동일 날짜와 기상 비교 (Historical Analysis)
기상 예보뿐만 아니라 Open-Meteo Archive API와 비동기 통신(Lazy loading)하여 1~3년 전 오늘 날짜의 실제 날씨 수치를 받아와 현재 예보치와의 온도 차이(Delta)를 뱃지 형태(▲ 더 따뜻함, ▼ 더 추움)로 한눈에 비교할 수 있게 지원합니다.

### 6. 통합 테스트 및 도커 패키징
통합 배포의 안정성을 위해 Python으로 작성된 \`test_build.py\` 스크립트를 포함했습니다. 이 스크립트는 임시 Docker 이미지 빌드 ➡️ 임시 포트로 컨테이너 런칭 ➡️ Nginx 헬스체크 및 의존성 라이브러리 검증 ➡️ 이미지 및 자원 회수 과정을 완전 자율적으로 수행합니다.

---

## 🎯 배운 점 & 회고
Vanilla CSS와 JS만을 사용하여 복잡한 기상 시뮬레이션과 30분 주기 백그라운드 스케줄러, 타사 연동 웹훅 제어 시스템을 구축하면서 라이브러리 의존성을 최소화한 순수 브라우저 API 활용 능력을 기를 수 있었습니다. 특히 Chart.js 캔버스 리소스 정리나 Lazy Loading API 캐싱과 같은 최적화 기법을 직접 디자인해보는 좋은 기회였습니다.

독립적으로 간편하게 기동시킬 수 있도록 Nginx 컨테이너로 묶어둔 배포 모델 또한 소규모 모니터링 환경에 매우 적합하다고 느꼈습니다.
`;

const tags = ["NimbusShield", "날씨대시보드", "VanillaJS", "개발기", "VelogMCP"];

async function publish() {
  const tokens = loadTokens();
  if (!tokens) {
    console.error("Authentication tokens not found. Please log in first.");
    process.exit(1);
  }

  const client = new VelogClient(tokens.accessToken, tokens.refreshToken);
  try {
    console.log("Publishing post to Velog...");
    const result = await client.writePost({
      title: postTitle,
      body: postBody,
      tags,
      is_private: false,
    });
    console.log("SUCCESS:", JSON.stringify(result, null, 2));
  } catch (err) {
    console.error("FAIL:", err);
    process.exit(1);
  }
}

publish();
