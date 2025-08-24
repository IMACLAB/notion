# IMaC Static Site (Notion API → HTML)

React 없이 Notion API로 데이터를 가져와 정적 HTML을 생성하는 프로젝트입니다.
- `fetch-notion.mjs` : Notion API 호출 → JSON/이미지 캐시
- `build.mjs` : JSON → HTML 생성
- `public/styles.css` : 테마/레이아웃 커스터마이즈

## 1) 준비
1. Node.js 20+ 설치
2. Notion에서 integration 만들고 **NOTION_TOKEN** 확보
3. `site.config.json`에 Notion **page/database ID** 입력 (하이픈 제거 32자 형식 권장)

## 2) 실행
```bash
# 의존성
npm i

# 환경변수
# PowerShell
$env:NOTION_TOKEN="secret_xxx"
# mac/Linux
# export NOTION_TOKEN=secret_xxx

# 데이터 가져오기
npm run fetch

# HTML 생성
npm run build

# 미리보기
npm run preview   # http://localhost:4173
```

## 3) 구조
- `site.config.json` : 사이트 전역 설정, Notion 리소스, 필드 맵핑 후보
- `tools/` : 레이아웃/블록/리스트 템플릿과 공통 맵퍼
- `notion-data/` : fetch 산출물(JSON)
- `images/` : 만료 방지를 위한 이미지 캐시
- `dist/` : 최종 정적 산출물

## 4) 배포
- GitHub Pages: dist 폴더를 artifact로 배포하거나 Actions 워크플로 구성
- Cloudflare Pages: Build command → `npm ci && npm run fetch && npm run build`, Output → `dist`

## 5) 커스터마이즈
- 색/타이포/카드 모양: `public/styles.css`
- 헤더/푸터/히어로: `tools/render/layout.mjs`
- 블록 렌더: `tools/render/block.mjs`
- 목록(카드/테이블): `tools/render/list.mjs`

## 6) 확장
- 블로그 상세 본문이 필요하면 `fetch-notion.mjs`에서 `p.blocks = await listBlocks(p.id)` 주석 해제 후, `build.mjs`에서 `renderBlocks` 사용.
- Research/Publication/Teaching 섹션은 `site.config.json`과 빌드 스크립트를 유사하게 확장.
