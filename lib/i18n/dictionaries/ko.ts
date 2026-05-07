/**
 * 한국어(기본) 번역 사전.
 * 다른 언어 사전은 이 파일의 키 구조를 그대로 따라야 한다.
 * 키는 점(.) 으로 그룹을 구분 — UI 컴포넌트별로 묶어 검색·번역 누락 점검을 쉽게 한다.
 */
const dict = {
  // ── 공통 ─────────────────────────────────────────
  "common.save": "저장",
  "common.saving": "저장 중…",
  "common.saved": "저장됐어요",
  "common.cancel": "취소",
  "common.close": "닫기",
  "common.next": "다음",
  "common.prev": "이전",
  "common.skip": "건너뛰기",
  "common.add": "추가",
  "common.edit": "수정",
  "common.write": "작성",
  "common.delete": "삭제",
  "common.remove": "제거",
  "common.loading": "불러오는 중…",
  "common.error": "오류",
  "common.retry": "다시 시도",
  "common.unsavedChanges": "저장되지 않은 변경이 있어요",
  "common.savedState": "저장된 상태예요",
  "common.saveFailed": "저장에 실패했습니다.",
  "common.tryAgainLater": "잠시 후 다시 시도해주세요.",

  // ── 언어 선택 ────────────────────────────────────
  "language.title": "언어를 선택하세요",
  "language.subtitle": "Choose your language · Selecciona tu idioma · 选择语言",
  "language.changeNote": "나중에 설정에서 언제든 바꿀 수 있어요.",
  "language.settings.title": "언어",
  "language.settings.subtitle": "앱 화면과 매일 도착하는 한 마디가 이 언어로 표시돼요.",
  "language.settings.note": "언어를 바꾸면 다음 카드부터 새 언어로 도착해요.",

  // ── 온보딩 ───────────────────────────────────────
  "onboarding.step1.title": "10년 후의 너의 모습은 어떤가요?",
  "onboarding.step1.subtitle":
    "되고 싶은 모습을 한 단락으로 적어보세요. 매일 도착하는 동기부여 한 마디가 이 글을 바탕으로 만들어져요.",
  "onboarding.step1.placeholder":
    "예: 10년 뒤 나는 매일 아침 운동과 독서로 하루를 시작하고, 가족과 충분한 시간을 보내며 좋아하는 일로 안정적인 수익을 만든다.",
  "onboarding.step1.example1":
    "5년 뒤 월 1,000만 원을 벌며 원하는 시간에 원하는 일을 하고 있다. 매일 아침 운동과 독서로 하루를 시작한다.",
  "onboarding.step1.example2":
    "10년 뒤 분야에서 손꼽히는 전문가가 되어, 강연과 집필로도 영향력을 넓히고 있다.",
  "onboarding.step1.example3":
    "7년 뒤 가족과 보내는 시간이 최우선인 삶을 살고 있다. 일은 하루 5시간만 하고, 주말은 무조건 비워둔다.",

  "onboarding.step2.title": "지금 향하고 있는 목표를 적어주세요",
  "onboarding.step2.subtitle":
    "앞 3개 목표가 매일 동기부여 카드와 잠금화면에 함께 표시돼요. 우선순위대로.",
  "onboarding.step2.placeholder": "예: 매일 30분 책 읽기",
  "onboarding.step2.addGoal": "+ 목표 추가",
  "onboarding.step2.removeGoalAria": "목표 줄 제거",

  "onboarding.step3.title": "성공한 나의 모습을 한 줄씩 적어주세요",
  "onboarding.step3.subtitle":
    "여기 적은 다짐이 매일 카드의 “오늘의 한 줄 미션” 영역에 placeholder 로 그대로 노출돼요. 매일 그대로 다시 적어 연속일을 쌓아가세요. 비워둬도 좋아요 — 나중에 설정에서 추가할 수 있어요.",

  "onboarding.step4.title": "매일 누구의 한 마디를 듣고 싶나요?",
  "onboarding.step4.subtitle":
    "한 명을 정해두면 주 4일은 그 인물의 명언이 우선 도착해요. 나머지 요일과 자동 회전은 큐레이션이 골라줍니다. 비워둬도 좋아요.",
  "onboarding.step4.autoTitle": "자동 회전",
  "onboarding.step4.autoSubtitle": "매주 8명 안팎의 멘토가 결정론적으로 바뀝니다.",
  "onboarding.step4.changeLater": "나중에 설정에서 언제든 바꾸거나 끌 수 있어요.",
  "onboarding.step4.cta": "오늘의 한 마디 받기 →",
  "onboarding.step4.preparing": "준비 중…",

  "onboarding.step5.titleLoading": "오늘의 한 마디를 만들고 있어요…",
  "onboarding.step5.titleDone": "이게 매일 너에게 도착해요.",
  "onboarding.step5.subtitleLoading": "잠시만 기다려주세요.",
  "onboarding.step5.subtitleDone":
    "잠금화면 위젯이 매일 다른 한 줄을 보여줍니다. 안드로이드 앱을 설치하면 위젯을 추가할 수 있어요.",
  "onboarding.step5.todayLabel": "오늘의 한 마디",
  "onboarding.step5.missionLabel": "오늘의 한 줄 미션",
  "onboarding.step5.missionIdentityPrefix": "나는",
  "onboarding.step5.missionFooter": "시작 후 홈에서 이 한 줄에 답하면 정체성 카드가 채워져요.",
  "onboarding.step5.previewError":
    "카드 미리보기를 만들지 못했어요. 시작 후 홈에서 다시 시도해 주세요.",
  "onboarding.step5.widgetTitle": "안드로이드에서 위젯 추가하는 법",
  "onboarding.step5.widgetStep1": "1. 홈 화면 빈 곳을 길게 누름",
  "onboarding.step5.widgetStep2": "2. “위젯” 메뉴 → Anima 검색",
  "onboarding.step5.widgetStep3": "3. 잠금화면에 추가하면 매일 자동으로 한 줄이 도착해요",
  "onboarding.step5.start": "시작하기",
  "onboarding.step5.finishing": "마무리 중…",

  "onboarding.saveError": "저장에 실패했어요.",
  "onboarding.author.steveJobs": "스티브 잡스",
  "onboarding.author.steveJobs.tag": "비전 · 단순함",
  "onboarding.author.steveJobs.tone": "단호하고 직관적",
  "onboarding.author.einstein": "앨버트 아인슈타인",
  "onboarding.author.einstein.tag": "호기심 · 사고",
  "onboarding.author.einstein.tone": "위트와 깊이",
  "onboarding.author.aurelius": "마르쿠스 아우렐리우스",
  "onboarding.author.aurelius.tag": "스토아 · 자기절제",
  "onboarding.author.aurelius.tone": "차분한 자기성찰",
  "onboarding.author.angelou": "마야 안젤루",
  "onboarding.author.angelou.tag": "내면 · 회복",
  "onboarding.author.angelou.tone": "따뜻하고 단단함",
  "onboarding.author.buffett": "워런 버핏",
  "onboarding.author.buffett.tag": "투자 · 인내",
  "onboarding.author.buffett.tone": "현실적이고 유머있게",
  "onboarding.author.leeOryeong": "이어령",
  "onboarding.author.leeOryeong.tag": "사유 · 한국어",
  "onboarding.author.leeOryeong.tone": "한국어로 깊게",

  // ── 홈 ───────────────────────────────────────────
  "home.title": "오늘의 동기부여",
  "home.subtitle": "매일 새로 도착하는 한 마디로 하루를 시작하세요.",
  "home.dateFormat": "{year}년 {month}월 {day}일",
  "home.settingsAria": "설정",

  "home.future.title": "10년 후의 나의 모습",
  "home.future.subtitle": "되고 싶은 모습이 구체적일수록, 매일 도착하는 한 마디도 더 명확해져요.",
  "home.future.empty": "아직 적어둔 모습이 없어요. 눌러서 작성해 보세요.",
  "home.future.saveAndRegen": "저장하고 카드 다시 받기",
  "home.future.saveFailed": "미래의 나 저장 실패",

  "home.goals.title": "목표를 이루기 위한 오늘의 행동",
  "home.goals.subtitle":
    "성공한 나의 모습으로 다가가기 위해 오늘 옮겨볼 한 가지 행동. 앞 3개가 잠금화면 이미지에도 함께 표시돼요.",
  "home.goals.todayProgress": "오늘 {done}/{total}",
  "home.goals.placeholder": "예: 매일 30분 책 읽기",
  "home.goals.maxAlert": "목표는 최대 {max}개까지 추가할 수 있어요.",
  "home.goals.deleteAria": "목표 삭제",
  "home.goals.toggleAchievedAria": "오늘 달성으로 표시",
  "home.goals.toggleUnachievedAria": "달성 취소",
  "home.goals.toggleAchievedTitle": "오늘 달성으로 표시",
  "home.goals.toggleUnachievedTitle": "오늘 달성함 — 취소하려면 클릭",
  "home.goals.saveFailed": "목표 저장에 실패했습니다.",

  "home.wins.title": "오늘 잘한 일 {max}가지",
  "home.wins.subtitle": "아주 작은 일이어도 좋아요. 적은 뒤 저장하면 날짜별로 다시 볼 수 있어요.",
  "home.wins.history": "지난 기록 보기",
  "home.wins.placeholder1": "예: 미루던 메일에 답장했다.",
  "home.wins.placeholder2": "예: 아침에 10분 산책했다.",
  "home.wins.placeholder3": "예: 가족에게 따뜻한 말 한마디를 했다.",
  "home.wins.saveFailed": "저장에 실패했어요. 잠시 후 다시 시도해주세요.",

  // ── MotivationCard ──────────────────────────────
  "motivation.wallpaper.goalsLabel": "나의 목표",
  "motivation.wallpaper.watermark": "Anima · 미래의 나",
  "motivation.wallpaper.download": "배경화면으로 저장",
  "motivation.wallpaper.downloading": "저장 중…",
  "motivation.wallpaper.downloadFailed": "이미지 저장에 실패했습니다.",
  "motivation.regenerating": "다시 받는 중…",
  "motivation.headerTodayLabel": "오늘의 한 마디",
  "motivation.responseEmpty": "한 줄 적어 주세요.",
  "motivation.responsePlaceholder": "한 줄로 적어보세요 (60자)",
  "motivation.responseEdited": "응답을 수정했어요",
  "motivation.responseToast": "+1 — 당신은 [{tag}]입니다",
  "motivation.preparingCard": "동기부여 카드를 준비 중이에요. 잠시만요…",
  "motivation.loading": "오늘의 한 마디를 만들고 있어요…",
  "motivation.error.title": "카드를 만들지 못했어요",
  "motivation.regenerate": "다시 받기",
  "motivation.todayLabel": "오늘의 한 마디",
  "motivation.missionLabel": "오늘의 한 줄 미션",
  "motivation.missionPlaceholder": "한 줄로 답해보세요…",
  "motivation.submit": "기록하기",
  "motivation.submitting": "기록 중…",
  "motivation.alreadyAnsweredToday": "오늘 답을 남기셨어요 — 내일 다시 한 줄을 받아보세요.",
  "motivation.firstResponseToast": "정체성 \"나는 {tag}\"가 오늘로 1걸음 쌓였어요.",
  "motivation.editResponse": "응답 수정",
  "motivation.identityPrefix": "나는",
  "motivation.affirmations.title": "성공한 나에게 한 발 더",
  "motivation.affirmations.streak": "{count}일째 연속",
  "motivation.affirmations.placeholder": "위 글 그대로 따라 적어보세요",
  "motivation.affirmations.checkin": "오늘 다짐 새기기",
  "motivation.affirmations.checkingIn": "새기는 중…",
  "motivation.affirmations.matched": "오늘 다짐을 새겼어요. {count}일째 이어가는 중!",
  "motivation.affirmations.mismatched": "한 글자라도 다르면 안 돼요. 위 글을 그대로 옮겨 적어주세요.",
  "motivation.affirmations.alreadyToday": "오늘은 이미 새기셨어요. 내일 다시 만나요.",
  "motivation.affirmations.empty":
    "설정에서 “성공한 나의 모습” 다짐을 적어두면 매일 따라 적으며 연속일을 쌓을 수 있어요.",

  // ── 설정 ─────────────────────────────────────────
  "settings.title": "설정",
  "settings.subtitle": "미래의 모습 · 매일 다짐 · 오늘의 행동 · 명언 큐레이션을 한곳에서 관리해요.",
  "settings.future.title": "10년 후의 나의 모습",
  "settings.future.subtitle": "매일 도착하는 동기부여 한 마디가 이 글을 바탕으로 만들어져요.",
  "settings.affirmations.title": "성공한 나에게 한 발 더",
  "settings.affirmations.subtitle":
    "매일 카드 위쪽에 흐린 글씨로 미리 보여드려요. 그 위에 똑같이 따라 적으면 연속일이 +1 됩니다.",
  "settings.goals.title": "목표를 이루기 위한 오늘의 행동",
  "settings.goals.subtitle":
    "성공한 나의 모습으로 다가가기 위해 오늘 옮겨볼 한 가지 행동. 앞 3개가 잠금화면에도 함께 표시돼요.",
  "settings.goals.empty": "홈 화면에서 목표를 추가하면 여기서도 편집할 수 있어요.",
  "settings.quote.title": "오늘의 명언 큐레이션",
  "settings.quote.subtitle":
    "비워두면 매주 자동 회전. 핀할 인물과 노출 빈도를 직접 설정할 수도 있어요.",
  "settings.quote.pinAuthor": "핀할 인물",
  "settings.quote.noPin": "— 지정 안 함 (주간 자동 회전) —",
  "settings.quote.daysLabel": "주당 핀 인물 노출 일수:",
  "settings.quote.daysOff": "꺼짐",
  "settings.quote.daysEveryday": "매일",
  "settings.quote.daysPerWeek": "주 {n}일",
  "settings.account.title": "계정",
  "settings.account.signOut": "로그아웃",

  // ── 인증 ─────────────────────────────────────────
  "auth.email": "이메일",
  "auth.password": "비밀번호",
  "auth.displayName": "이름",
  "auth.signIn": "로그인",
  "auth.signUp": "회원가입",
  "auth.signInWithGoogle": "Google로 로그인",
  "auth.signingIn": "로그인 중…",
  "auth.signingUp": "가입 중…",
  "auth.signIn.title": "다시 만나서 반가워요",
  "auth.signIn.subtitle": "10년 후의 너에게서 매일 한 마디가 도착하는 곳.",
  "auth.signIn.noAccount": "처음이신가요?",
  "auth.signIn.toSignUp": "회원가입",
  "auth.signUp.title": "10년 후의 너를 만나러 가요",
  "auth.signUp.subtitle": "지금 바로 매일 도착하는 한 마디를 받아보세요.",
  "auth.signUp.haveAccount": "이미 계정이 있으신가요?",
  "auth.signUp.toSignIn": "로그인",
  "auth.error.invalidEmail": "이메일 형식을 확인해주세요.",
  "auth.error.invalidPassword": "비밀번호는 6자 이상이어야 해요.",
  "auth.error.requireDisplayName": "이름을 입력해주세요.",
  "auth.error.generic": "다시 시도해주세요.",
  "auth.password.placeholder": "최소 6자",
  "auth.displayName.placeholder": "표시 이름",

  // ── 잘한 일 히스토리 ─────────────────────────────
  "wins.history.title": "잘한 일 기록",
  "wins.history.subtitle": "매일 적은 한 줄이 모여 너만의 흔적이 돼요.",
  "wins.history.empty": "아직 적은 기록이 없어요.",
  "wins.history.back": "← 홈으로",
  "wins.history.loadFailed": "기록을 불러오지 못했어요.",

  // ── 다짐 에디터 ──────────────────────────────────
  "affirmations.editor.placeholder": "예: 나는 매일 한 시간 글을 쓰는 사람이다.",
  "affirmations.editor.add": "+ 다짐 추가",
  "affirmations.editor.removeAria": "다짐 줄 제거",
  "affirmations.editor.maxNote": "최대 {max}개까지 추가할 수 있어요. 한 줄당 {len}자까지.",

  // ── 결제 / 트라이얼 ───────────────────────────────
  "billing.trialBanner": "남은 무료 체험 {days}일",
  "billing.trialEnded": "무료 체험이 끝났어요.",
  "billing.upgrade": "업그레이드",
} as const;

export type DictKey = keyof typeof dict;
export default dict;
