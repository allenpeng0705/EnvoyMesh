import type { LocalizedExtAgentGuide } from "./types.js";

export const koExtAgentGuides: LocalizedExtAgentGuide[] = [
  {
    id: "homeclaw",
    name: "HomeClaw",
    summary: "내 컴퓨터에서 실행되는 개인 AI 어시스턴트로, 내장 채널을 통해 EnvoyMesh에 연결됩니다.",
    bestFor: "일상 채팅 및 어시스턴트 응답(권장 기본값).",
    defaultPort: 8010,
    installSteps: [
      "이 컴퓨터에 HomeClaw를 설치하세요(EnvoyMesh 홈 노드와 같은 기기). HomeClaw 설치 가이드를 따르세요.",
      "HomeClaw 설정에서 EnvoyMesh / mesh 채널을 켜고 수신 포트를 8010(기본값)으로 설정하세요.",
      "방화벽에서 로컬 연결(127.0.0.1만)을 허용하세요.",
    ],
    runSteps: [
      "HomeClaw를 시작하고 백그라운드에서 실행 상태로 두세요.",
      "HomeClaw는 http://127.0.0.1:8010/message 에서 수신합니다 — 브라우저에서 열 필요 없습니다.",
      "EnvoyMesh: 설정 → AI → AI 엔진에서 HomeClaw를 활성 백엔드로 선택하세요. 약 30초 내 상태가 실행 중으로 표시됩니다.",
    ],
    verifySteps: [
      "표에서 HomeClaw 행의 상태가 실행 중입니다.",
      "외부 에이전트 브리지 배지가 접근 가능을 표시합니다.",
      "이 노드 또는 EnvoyGo의 Ext Agent 채팅에서 테스트 메시지를 보내세요.",
    ],
    troubleshooting: [
      "상태가 중지됨? HomeClaw가 실행 중이고 EnvoyMesh 채널이 8010 포트에서 활성화되어 있는지 확인하세요.",
      "여전히 접근 불가? 8010 포트 사용 여부를 확인하고 HomeClaw를 재시작한 뒤 상태 새로고침을 클릭하세요.",
    ],
  },
  {
    id: "hermes",
    name: "Hermes",
    summary: "대체 외부 어시스턴트입니다. EnvoyMesh에 Hermes(또는 테스트 에코)를 브리지에 연결하는 작은 헬퍼가 포함되어 있습니다.",
    bestFor: "HomeClaw와 함께 Hermes를 시험하거나 개발/테스트용.",
    defaultPort: 8020,
    installSteps: [
      "선택: 실제 Hermes 응답을 원하면 Hermes CLI 또는 앱을 설치하세요(테스트 에코만이 아닌 경우).",
      "이 컴퓨터에 Node.js가 필요합니다(EnvoyMesh 데스크톱 앱에 포함).",
      "필요하면 bridge-config.json에 Hermes를 추가하세요 — EnvoyMesh 설치 폴더의 bridge-config.multi-agent.example.json을 참고하세요.",
    ],
    runSteps: [
      "터미널(Mac/Linux) 또는 명령 프롬프트 / PowerShell(Windows)을 엽니다.",
      "EnvoyMesh 설치 폴더(tools/ext-agent-adapters 포함)로 이동합니다.",
      { code: "node tools/ext-agent-adapters/hermes/server.mjs" },
      "Hermes 사용 중 해당 창을 열어 두세요. 8020 포트에서 수신합니다.",
      "설정 → AI → AI 엔진에서 Hermes를 활성 백엔드로 선택하세요.",
    ],
    verifySteps: [
      "등록표에서 Hermes 행이 실행 중으로 표시됩니다.",
      "테스트 에코 모드(Hermes CLI 없음)에서는 [Hermes echo] 메시지 형태로 응답합니다.",
    ],
    troubleshooting: [
      "포트가 사용 중? 다른 헬퍼 인스턴스를 닫거나 PORT=8021 node tools/ext-agent-adapters/hermes/server.mjs 를 실행하고 bridge-config.json을 맞게 수정하세요.",
    ],
  },
  {
    id: "openhuman",
    name: "OpenHuman",
    summary: "OpenHuman은 데스크톱 AI 앱입니다. EnvoyMesh는 HomeClaw와 동일한 프로토콜의 로컬 헬퍼를 통해 연결됩니다.",
    bestFor: "이미 이 컴퓨터에서 OpenHuman을 사용하는 경우.",
    defaultPort: 8021,
    installSteps: [
      "이 컴퓨터에 OpenHuman 데스크톱 앱을 설치하고 실행하세요.",
      "필요하면 다중 에이전트 예제 파일을 사용해 bridge-config.json에 OpenHuman(포트 8021)을 추가하세요.",
      "전체 통합에는 로컬 RPC 헬퍼(고급)가 필요합니다. 첫 테스트는 포함된 에코 헬퍼를 사용할 수 있습니다.",
    ],
    runSteps: [
      "터미널을 열고 EnvoyMesh 설치 폴더로 이동합니다.",
      { code: "node tools/ext-agent-adapters/openhuman/server.mjs" },
      "창을 열어 두세요. 헬퍼는 8021 포트에서 수신합니다.",
      "설정 → AI → AI 엔진에서 OpenHuman을 선택하세요.",
    ],
    verifySteps: [
      "OpenHuman 행이 실행 중으로 표시됩니다.",
      "에코 테스트 모드는 [OpenHuman echo] … 형태로 응답하며, OPENHUMAN_RPC_URL 설정 후 실제 OpenHuman 채팅이 가능합니다.",
    ],
    troubleshooting: [
      "OpenHuman 앱은 홈 노드와 같은 기기에서 계속 실행되어야 합니다.",
      "실제 채팅(에코 아님)을 위해 OPENHUMAN_RPC_URL을 OpenHuman 로컬 JSON-RPC 헬퍼로 설정하세요.",
    ],
  },
  {
    id: "pi",
    name: "Pi (코딩)",
    summary: "Pi는 코딩 중심 어시스턴트입니다. Pi CLI가 설치되면 EnvoyMesh가 메시지를 전달하거나 간단한 에코 테스트를 사용합니다.",
    bestFor: "코딩 도움만 — 가정 채팅 기본 에이전트로는 권장하지 않습니다.",
    defaultPort: 8022,
    installSteps: [
      "pi-mono 프로젝트에서 Pi CLI를 설치하세요(개발자용).",
      "필요하면 bridge-config.json에 Pi(포트 8022)를 추가하세요.",
    ],
    runSteps: [
      "Pi 없이 테스트 — EnvoyMesh 폴더에서 터미널을 열고 실행:",
      { code: "PI_ECHO=1 node tools/ext-agent-adapters/pi/server.mjs" },
      { code: '$env:PI_ECHO="1"; node tools/ext-agent-adapters/pi/server.mjs' },
      "Pi 설치됨: node tools/ext-agent-adapters/pi/server.mjs 실행(PI_ECHO 없음) 후 창을 열어 두세요.",
      "설정 → AI → AI 엔진에서 Pi (코딩)를 활성 백엔드로 선택하세요.",
    ],
    verifySteps: [
      "Pi 행이 실행 중으로 표시됩니다.",
      "에코 모드는 [Pi echo] … 형태로 응답합니다.",
    ],
    troubleshooting: [
      "Pi가 없으면 PI_ECHO=1로 테스트하거나 HomeClaw/Hermes를 선택하세요.",
    ],
  },
];
