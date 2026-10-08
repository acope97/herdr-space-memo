# Herdr Space Memo 플러그인 개발 조사 및 설계 문서

## 1. 개요 (Overview)

Herdr(AI 코딩 에이전트 전용 터미널 워크스페이스 매니저) 환경에서, 사이드바의 **Spaces(워크스페이스) 영역 아래쪽에 각 Space별로 참고할 내용을 기록하고 실시간으로 확인할 수 있는 메모 기능**을 제공하기 위한 기술 조사 및 개발 설계서입니다.

---

## 2. Herdr 내부 아키텍처 조사 결과

### 2.1 사이드바 렌더링 구조 (`src/ui/sidebar.rs`)
- Herdr의 UI는 Rust + `ratatui` 라이브러리로 렌더링됩니다.
- 사이드바는 `expanded_sidebar_sections` 함수에 의해 상단 **`Spaces` (`workspace_height`)** 영역과 하단 **`Agents` (`detail_height`)** 영역의 정확한 **2분할 구조**로 하드코딩되어 있습니다.
- 사이드바 중간의 구분선은 `sidebar_section_divider_rect`에 의해 단일 구분선으로 처리됩니다.

### 2.2 사이드바 토큰 렌더링 시스템 (`src/ui/sidebar/tokens.rs`)
- `[ui.sidebar.spaces]` 설정의 `rows` 배열을 통해 각 Space 행에 표시될 토큰들을 선언적으로 구성할 수 있습니다.
- 기본 토큰: `state_icon`, `state_text`, `workspace`, `branch`, `git_status`
- **커스텀 토큰**: `$name` 형태(예: `$memo`, `$memo_1`, `$memo_2`)로 워크스페이스 메타데이터에 등록된 키를 직접 렌더링할 수 있습니다.
- 토큰 스타일 지원: `{ token = "$memo_1", fg = "#a6e3a1", dim = true }` 와 같이 색상, 볼드, 딤(dim) 스타일 적용 가능.

### 2.3 메타데이터 리포팅 API (`herdr workspace report-metadata`)
- 워크스페이스별 커스텀 메타데이터는 CLI 또는 IPC 소켓 API를 통해 실시간으로 주입할 수 있습니다.
  ```bash
  herdr workspace report-metadata --source space-memo <WORKSPACE_ID> --token memo_1="내용1" --token memo_2="내용2"
  ```
- 메타데이터가 갱신되면 Herdr TUI 사이드바에 즉각 반영됩니다.

### 2.4 Herdr 플러그인 v1 규격 (`herdr-plugin.toml`)
- 플러그인은 매니페스트 파일(`herdr-plugin.toml`)로 정의되며, 바이너리나 스크립트(Node.js, Python, Shell 등)를 프로세스로 실행합니다.
- 지원 진입점:
  - `[[startup]]`: Herdr 서버 기동 시 1회 비동기 실행되는 초기화 훅.
  - `[[panes]]`: 터미널 분할창(`split`), 전체화면(`overlay`), 모달 팝업(`popup`) 등으로 실행되는 TUI 창.
  - `[[actions]]`: 단축키나 명령 팔레트로 호출 가능한 동작.
  - `[[events]]`: `workspace_focused`, `workspace_created` 등 소켓 이벤트 구독.
- 환경 변수 주입: `HERDR_BIN_PATH`, `HERDR_SOCKET_PATH`, `HERDR_PLUGIN_STATE_DIR`, `HERDR_WORKSPACE_ID` 등.

---

## 3. 구현 방안 비교 및 선정

| 비교 항목 | 방안 A: 공식 플러그인 기반 (선정) | 방안 B: Herdr 소스(Rust) 포크/수정 |
| :--- | :--- | :--- |
| **위치** | **Spaces 목록 내부 각 Space 바로 아래 행** | **Spaces와 Agents 사이에 독립된 사각 위젯** |
| **방식** | `herdr-plugin.toml` + `[ui.sidebar.spaces]` 토큰 | `sidebar.rs` 3단 분할 레이아웃 수정 및 자체 빌드 |
| **업데이트 호환성** | **완전 보장** (`herdr update` 시에도 영구 유지) | **취약** (업데이트 시 바이너리가 덮어씌워짐) |
| **긴 메모 지원** | 사이드바에는 상위 요약 표시 + 팝업에서 스크롤/편집 | 사이드바 박스 내부에서 직접 스크롤 |
| **개발/배포 용이성** | Node.js 기반 초경량 스크립트로 즉시 연동 가능 | Rust 컴파일 환경 및 재빌드 파이프라인 필요 |

### 📌 방안 A 채택 사유
사용자가 공식 Herdr 환경을 안정적으로 사용하면서 업데이트 시에도 커스텀 기능이 깨지지 않고 영구 보존되는 **방안 A(공식 플러그인 규격 기반)**를 채택하여 구현합니다.

---

## 4. 방안 A 아키텍처 상세 설계

### 4.1 동작 흐름

1. **상시 표시 (Sidebar)**:
   - 각 Space의 이름 바로 아래에 1~2줄의 메모 요약(`$memo_1`, `$memo_2`)이 항상 표시됩니다.
2. **수시 편집 (Popup Editor)**:
   - 단축키(`prefix+m`)를 누르면 세션 모달 팝업 창이 열립니다.
   - 현재 활성화된 Space의 기존 메모 전문이 로드됩니다.
   - 방향키/페이지 스크롤로 긴 내용을 자유롭게 확인 및 편집합니다.
   - 저장(`Ctrl+S` 또는 `Enter`/`ESC`) 시 로컬 파일에 영구 저장되고, 사이드바 메타데이터가 즉시 갱신됩니다.
3. **재시작 복구 (`[[startup]]` Hook)**:
   - Herdr가 새로 켜질 때 `startup.js`가 실행되어, 저장된 모든 Space의 메모를 읽어 Herdr 사이드바에 일괄 재동기화합니다.

### 4.2 파일 구조
```text
C:/Users/acope/anti-chat/
├── herdr-plugin.toml          # Herdr 플러그인 매니페스트
├── package.json               # Node.js 프로젝트 설정
├── HERDR_SPACE_MEMO_SPEC.md   # 본 조사 및 설계 문서
├── README.md                  # 사용자 설치 및 사용 가이드
└── src/
    ├── storage.js             # 메모 JSON 영구 저장소 (CRUD)
    ├── herdr-api.js           # herdr CLI / 소켓 호출 래퍼
    ├── editor.js              # 팝업 TUI 메모 에디터 (스크롤 & 편집)
    └── startup.js             # Herdr 기동 시 전체 메모 사이드바 동기화
```

### 4.3 저장소 데이터 스키마 (`memos.json`)
```json
{
  "w1": {
    "title": "main-api",
    "content": "1. JWT 토큰 만료 로직 수정\n2. CasaOS vLLM 엔드포인트 확인\n3. 마이그레이션 스크립트 실행 필요",
    "updated_at": 1728345600000
  }
}
```
- 사이드바 표시 시: 내용의 첫 줄/둘째 줄을 잘라 `$memo_1`, `$memo_2`로 등록.
- 팝업 에디터 열람 시: `content` 전체 텍스트를 로드하여 상하 스크롤 에디터 제공.
