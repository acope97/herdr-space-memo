# Herdr Space Memo 플러그인 (`acope.space-memo`)

Herdr의 사이드바 **Spaces(워크스페이스) 목록 바로 아래쪽에 각 Space별 메모를 상시 표시**하고, 언제든 단축키로 긴 메모를 열람/편집/스크롤할 수 있는 플러그인입니다.

---

## 🌟 주요 기능

1. **사이드바 Spaces 직하단 상시 노출**:
   - 각 Space의 이름 바로 아래에 작성된 메모 내용이 실시간 렌더링됩니다.
   - 1번째 줄(`$memo_1`), 2번째 줄(`$memo_2`), 3줄 이상일 경우 추가 줄 수 안내(`$memo_more`)가 깔끔하게 출력됩니다.
2. **원키 모달 팝업 에디터 (수시 편집)**:
   - 단축키(`prefix + m`)를 누르면 세션 모달 팝업으로 TUI 에디터가 열립니다.
   - 현재 활성화된 Space의 메모가 자동으로 로드됩니다.
3. **긴 메모 스크롤 & 자동 저장**:
   - 내용이 길어져도 방향키(↑/↓), `PageUp`, `PageDown`으로 자유롭게 스크롤됩니다.
   - `Ctrl+S`로 저장하거나 `ESC` / `Ctrl+Q`로 창을 닫으면 자동 저장 및 사이드바가 즉시 실시간 동기화됩니다.
4. **Herdr 재시작 후 완벽 복구 (`[[startup]]`)**:
   - Herdr를 껐다 켜도 저장된 모든 Space의 메모가 사이드바에 자동으로 재동기화됩니다.

---

## ⚙️ 설정 방법 (`config.toml`)

Herdr 설정 파일(`%APPDATA%\herdr\config.toml` 또는 `~/.config/herdr/config.toml`)에 아래 설정을 추가합니다.

### 1. 사이드바 Spaces 영역에 메모 토큰 추가
`[ui.sidebar.spaces]` 섹션의 `rows`에 `$memo_1`, `$memo_2`, `$memo_more` 토큰을 등록합니다:

```toml
[ui.sidebar.spaces]
# 각 Space 항목 아래에 표시될 행 구성
rows = [
  ["state_icon", "workspace"],
  ["branch", "git_status"],
  [{ token = "$memo_1", fg = "#a6e3a1", bold = true }],  # 1번째 줄 (연녹색 볼드)
  [{ token = "$memo_2", fg = "#cdd6f4", dim = true }],   # 2번째 줄 (서브 텍스트)
  [{ token = "$memo_more", fg = "#f5c2e7", dim = true }]  # 3줄 이상 시 (+N more)
]
```

### 2. 단축키 바인딩 (`prefix + m`)
`[keys]` 섹션 아래에 팝업 에디터를 호출할 단축키를 등록합니다:

```toml
[[keys.command]]
key = "prefix+m"
type = "popup"
command = "node C:/Users/acope/anti-chat/src/editor.js"
width = "75%"
height = "65%"
```

---

## ⌨️ 팝업 에디터 사용법

`prefix + m` (기본: `Ctrl+b` 누른 후 `m`)을 누르면 팝업 에디터가 열립니다:

| 키 | 동작 |
| :--- | :--- |
| **방향키 (↑, ↓, ←, →)** | 커서 이동 (화면을 벗어나면 자동 스크롤) |
| **PageUp / PageDown** | 이전 / 다음 페이지로 빠른 스크롤 |
| **Home / End** | 현재 줄의 맨 앞 / 맨 뒤로 이동 |
| **Shift + 방향키** | 정밀 텍스트 블록 선택 |
| **Ctrl + C (블록 없을 때)** | **현재 커서 위치의 라인(문장 전체) 클립보드 복사** |
| **Ctrl + C (블록 지정 시)** | 선택한 블록 텍스트 클립보드 복사 |
| **Ctrl + A** | 메모 전체 내용 클립보드 복사 |
| **Ctrl + Z** | 실행 취소 (Undo) |
| **Ctrl + S** | **명시적 저장 및 사이드바 메타데이터 실시간 반영** |
| **ESC / Ctrl + Q** | **저장하지 않고 안전하게 닫기** |
---

## 📁 저장소 및 데이터 위치

- 메모 데이터는 JSON 형식으로 저장됩니다:
  - Windows: `C:\Users\acope\.herdr\plugin-state\acope.space-memo\memos.json`
  - Linux/macOS: `~/.herdr/plugin-state/acope.space-memo/memos.json`
- 각 워크스페이스 ID(`w1`, `w2` 등)별로 메모 본문 및 수정 일시가 보관됩니다.

---

## 🔧 플러그인 관리 명령어

- **플러그인 목록 확인**:
  ```bash
  herdr plugin list
  ```
- **플러그인 링크 해제 (필요 시)**:
  ```bash
  herdr plugin unlink acope.space-memo
  ```
- **플러그인 다시 연결**:
  ```bash
  herdr plugin link C:\Users\acope\anti-chat
  ```
