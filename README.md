# 전류, 전압, 저항의 관계 탐구하기

중학교 2학년 과학 수업에서 각 반의 1~6조가 실험 그래프를 공유하는 앱입니다.
2학년 1반부터 8반까지 반을 선택할 수 있으며, 전압·전류와 저항·전류 실험을 구분합니다.
학생은 로그인 없이 QR코드를 스캔하고 센서 앱에서 저장한 그래프 이미지나 화면 캡처를 올립니다.

## 배포 구성

- 화면: [GitHub Pages](https://danielan1120.github.io/circuit-class-lab/)
- 그래프 API·이미지 저장: [기존 수업 서버](https://circuit-class-lab-k8m4.tangyperch6.chatgpt.site/)
- GitHub Pages 게시 폴더: `main` 브랜치의 `/docs`

GitHub Pages는 정적 화면을 제공합니다. 그래프 목록·업로드·삭제·이미지 다운로드는
기존 서버의 Cloudflare D1/R2 저장소를 사용합니다. 기존 서버가 공개 상태로 운영되고
`https://danielan1120.github.io` 출처의 API 요청을 허용해야 모든 기능이 동작합니다.
서버용 비밀키나 GitHub 토큰을 브라우저에 넣지 않습니다.

두 화면에서 동일한 수업 코드와 반을 사용하면 같은 그래프를 봅니다.
삭제 권한은 그래프를 직접 올린 화면의 브라우저 저장소에 보관됩니다. 기존 서버
화면에서 받은 삭제 권한은 GitHub Pages 화면으로 자동 이전되지 않습니다.

## 설치와 실행

Node.js 22.13.0 이상과 npm이 필요합니다. 프로젝트 폴더에서 실행합니다.

```sh
npm run install:ci
npm run dev:pages
```

터미널에 표시되는 `http://127.0.0.1:5174/circuit-class-lab/` 주소를 엽니다.
개발 화면도 실제 수업 서버의 API를 사용하므로, 개발 출처가 서버에서 허용되어야
그래프 기능을 확인할 수 있습니다. 로컬 주소로 만든 QR은 다른 기기에서 접근할 수
없습니다. 학생에게는 GitHub Pages의 공개 주소와 QR을 공유합니다.

## GitHub Pages 빌드

```sh
npm run build:pages
```

`docs/`에 정적 HTML·CSS·JavaScript·아이콘과 `.nojekyll`이 생성됩니다.
소스를 수정한 뒤 다시 빌드하고, 변경된 소스와 `docs/`를 함께 GitHub에 올립니다.
GitHub 저장소의 **Settings → Pages → Deploy from a branch → main /docs**로 게시합니다.
이 구성은 GitHub Actions 워크플로를 사용하지 않습니다.

빌드한 결과를 로컬에서 확인하려면 다음 명령을 사용합니다.

```sh
npm run preview:pages
```

접속 주소는 `http://127.0.0.1:4174/circuit-class-lab/`입니다.

## 설정과 주요 파일

- `vite.pages.config.ts`: Pages 기본 경로와 외부 API 주소, `docs/` 빌드 설정
- `pages/`: 정적 화면의 HTML 및 React 시작 파일
- `app/page.tsx`: 수업 화면·QR·이미지 미리보기·업로드
- `lib/client-url.ts`: 화면 경로와 API·이미지 URL 구분
- `lib/classrooms.ts`: 반별 수업 코드와 링크
- `vendor/qrcode-generator/`: 외부 QR 서비스 없이 QR을 만드는 라이브러리와 라이선스

저장소 이름·도메인을 변경하면 `vite.pages.config.ts`의 `base`,
`__CIRCUIT_BASE_PATH__`, API 서버의 허용 출처를 함께 확인합니다.
API 서버를 변경하면 `__CIRCUIT_API_ORIGIN__`도 변경하고 다시 빌드합니다.
기본 경로가 QR·인쇄·화면 전환 링크에 함께 적용됩니다.

URL 변환 검증은 다음 명령으로 실행합니다.

```sh
node --experimental-strip-types --test scripts/client-url.test.mjs
```

## 기존 전체 서버 프로젝트

API 코드·DB 스키마·마이그레이션도 소스에 보관합니다. `npm run build`는 기존
Sites/Cloudflare 전체 앱을 빌드하고, `npm run build:pages`는 정적 화면만 빌드합니다.
전체 앱은 기본적으로 같은 출처의 상대 API 주소와 `/` 경로를 사용합니다.
원래 설치·D1 초기화·로컬 Worker 실행 안내는 [README-sites.md](./README-sites.md)에 있습니다.
실제 수업 DB와 이미지, 인증정보, `node_modules`는 이 저장소에 포함하지 않습니다.
