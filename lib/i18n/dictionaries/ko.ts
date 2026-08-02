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
  "common.done": "완료",
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

  // ── 부팅 스플래시 ────────────────────────────────
  // 앱을 켜면 가장 먼저 크게 보이는 한 문장 (components/ui/BootSplash).
  // lead(크림) + accent(골드 이탤릭) 로 쪼갠 이유: 강조할 조각의 위치가 언어마다 다르다.
  // 안드로이드(res/values/strings.xml 의 boot_*) 와 같은 문장을 유지할 것.
  "splash.eyebrow": "YOUR FUTURE IS WHAT YOU BELIEVE",
  "splash.lead": "당신의 미래는 당신이 믿는 대로",
  "splash.accent": "이루어진다.",

  // ── 언어 선택 ────────────────────────────────────
  "language.title": "언어를 선택하세요",
  "language.subtitle": "Choose your language · Selecciona tu idioma · 选择语言",
  "language.changeNote": "나중에 설정에서 언제든 바꿀 수 있어요.",
  "language.settings.title": "언어",
  "language.settings.subtitle": "앱 화면과 매일 도착하는 한 마디가 이 언어로 표시돼요.",
  "language.settings.note": "언어를 바꾸면 다음 카드부터 새 언어로 도착해요.",

  // ── 온보딩 ───────────────────────────────────────
  // "10년 후 나의 모습" 몰입형 질문 — 한 화면에 한 질문씩(키 순서 = lib/futureSelf.ts 차원 순서).
  "onboarding.futureSelf.sectionLabel": "내가 진짜 원하는 것",
  // 통합 진행바 라벨 (언어·미리보기 제외한 실제 입력 화면 기준).
  "onboarding.progress.remaining": "{remaining}개 남음",
  "onboarding.progress.lastStep": "마지막 단계",
  /* dream — 온보딩이 묻는 단 하나의 문항. 예시 칩을 두지 않으므로 placeholder 가
     "얼마나 크게, 얼마나 구체적으로 적어야 하는가"의 기준을 대신한다. 그래서 예시는
     기한·금액·규모·장면까지 넣어 원대하게 쓴다(소박한 예시는 답도 소박하게 만든다).
     hint 는 남의 시선을 지워 상투적인 답을 막고, why 는 구체성이 왜 필요한지(= AI
     재료)를 알려준다. 예시 길이는 FUTURE_SELF_FIELD_MAX(200자) 안에 들어와야 한다. */
  "onboarding.futureSelf.dream.q": "당신이 진정 이루고 싶은 꿈은 무엇인가요?",
  "onboarding.futureSelf.dream.hint": "딱 하나만 적어주세요. 남에게 보여줄 답이 아니에요.",
  "onboarding.futureSelf.dream.placeholder":
    "예: 2035년까지 내 이름을 건 브랜드를 연매출 100억 규모로 키워 팀원 20명과 함께 일하고, 바다가 보이는 집에서 가족과 아침을 먹은 뒤 주 4일만 일하며, 매년 한 달은 아이와 해외에서 지내는 것.",
  "onboarding.futureSelf.dream.why":
    "숫자·기한·사람까지 적을수록 좋아요. 이 문장이 매일 도착할 카드의 재료가 돼요.",
  "onboarding.futureSelf.daily.q": "10년 후, 당신의 평범한 하루는 어떻게 흘러가나요?",
  "onboarding.futureSelf.daily.placeholder":
    "아침에 눈뜨는 곳, 오전에 하는 일, 저녁을 보내는 방식까지 그려보세요.",
  "onboarding.futureSelf.work.q": "그때 당신은 어떤 일을 하고, 사람들 사이에서 어떤 위치에 있나요?",
  "onboarding.futureSelf.work.placeholder":
    "직업·역할, 팀에서의 위치, 사람들이 당신을 찾는 이유를 적어보세요.",
  "onboarding.futureSelf.wealth.q": "자산과 경제적 형편은 어느 정도인가요?",
  "onboarding.futureSelf.wealth.placeholder":
    "월 수입, 모은 자산, 사는 집, 돈 걱정 없이 할 수 있게 된 선택들.",
  "onboarding.futureSelf.family.q": "가족과 함께하는 삶은 어떤 모습인가요?",
  "onboarding.futureSelf.family.placeholder":
    "함께 보내는 시간, 해주고 있는 것, 관계의 온도를 적어보세요.",
  "onboarding.futureSelf.achievements.q": "그때까지 이루어낸 것들은 무엇인가요?",
  "onboarding.futureSelf.achievements.placeholder":
    "만든 것, 도달한 목표, 스스로 가장 자랑스러운 성취.",
  "onboarding.futureSelf.respect.q": "사람들은 당신을 어떻게 바라보고, 어떤 점을 존경하나요?",
  "onboarding.futureSelf.respect.placeholder":
    "주변이 당신에게 보내는 신뢰, 평판, 존경의 이유.",
  "onboarding.futureSelf.growth.q": "몸과 마음은 어떤 상태이고, 여전히 어떻게 성장하고 있나요?",
  "onboarding.futureSelf.growth.placeholder":
    "건강, 배우고 있는 것, 계속 나아가는 모습.",

  /* Step 2 맞춤 제안 — Step 1 의 꿈 문장에서 선언·목표 후보를 뽑아 칩을 채운다.
     생성 실패/짧은 꿈이면 아래 정적 example* 로 조용히 되돌아가므로, 두 문구 모두
     "제안이 있을 때만" 노출된다. */
  "onboarding.suggest.loading": "방금 적은 꿈을 읽고, 당신에게 맞는 문장을 고르고 있어요…",
  "onboarding.suggest.personalized": "당신이 적은 꿈에서 뽑았어요",

  // Step 2 위 칸 — 이미 이룬 상태의 1인칭 선언. 매일 이 문장을 그대로 전사한다.
  "onboarding.declaration.title": "그 꿈을 이룬 나를 한 줄로",
  "onboarding.declaration.subtitle":
    "이미 그렇게 된 사람처럼 적어요. 매일 이 한 줄을 새기게 돼요.",
  "onboarding.declaration.example1": "나는 돈에 쫓기지 않는 사람이다",
  "onboarding.declaration.example2": "나는 몸과 마음이 건강한 사람이다",
  "onboarding.declaration.example3": "나는 내 일로 누군가를 돕는 사람이다",
  "onboarding.declaration.placeholder": "나는 …한 사람이다",
  "onboarding.declaration.writeMyOwn": "직접 쓰기",

  // Step 2 아래 칸 — 그 사람이 되기 위해 오늘 옮기는 행동. 선언과 독립된 문장이다.
  "onboarding.goal.title": "그 사람이 되기 위해, 오늘 딱 하나",
  "onboarding.goal.subtitle":
    "하나면 충분해요. 꾸준히 지키면 담을 수 있는 목표가 하나씩 늘어나요.",
  "onboarding.goal.placeholder": "매일 책 30쪽을 읽고 한 줄을 남긴다",
  "onboarding.goal.hint": "“~한다”로 끝나는 행동 문장으로 적으면 매일 지켰는지 바로 알 수 있어요.",
  /* 목표 예시 — 맞춤 제안이 없을 때만 쓰는 정적 후보. 셋 다 수량·주기·단위를 갖춰
     lib/goalQuality 의 구체성 기준을 통과해야 한다(앱이 제안한 문장이 앱의 "더
     구체적으로" 힌트에 걸리면 안 된다). 길이는 GOAL_TEXT_MAX(56자) 안. */
  "onboarding.goal.example1": "매일 아침 30분 책을 읽고 한 줄 남긴다",
  "onboarding.goal.example2": "매일 밤 10분, 내일 할 일 3가지를 적는다",
  "onboarding.goal.example3": "주 4회 30분씩 걷고 기록한다",
  /* 여러 개를 고르게 두면 온보딩 첫날부터 실패가 예약된다 —
     "하나만" 을 제안 칩 바로 아래에서 한 번 더 못박는다. */
  "onboarding.goal.pickOne":
    "이 중 딱 하나만 고르세요. 처음부터 여러 개를 할 필요 없어요 — 고른 하나를 매일 반복하는 게 전부예요.",

  "onboarding.step4.cta": "오늘의 한 마디 받기 →",
  "onboarding.step4.preparing": "준비 중…",

  "onboarding.step5.titleLoading": "오늘의 한 마디를 만들고 있어요…",
  "onboarding.step5.titleDone": "매일 아침, 10년 후 나의 하루가 생생히 펼쳐져요.",
  "onboarding.step5.subtitleLoading": "잠시만 기다려주세요.",
  "onboarding.step5.subtitleDone":
    "잠금화면 위젯이 매일 다른 한 줄을 보여줍니다. 안드로이드 앱을 설치하면 위젯을 추가할 수 있어요.",
  "onboarding.step5.todayLabel": "오늘의 한 마디",
  "onboarding.step5.missionLabel": "오늘의 한 줄 미션",
  "onboarding.step5.missionIdentityPrefix": "나는",
  "onboarding.step5.missionFooter": "시작 후 홈에서 이 한 줄에 답하면 정체성이 한 걸음씩 쌓여요.",
  "onboarding.step5.previewError":
    "카드 미리보기를 만들지 못했어요. 시작 후 홈에서 다시 시도해 주세요.",
  "onboarding.step5.widgetTitle": "안드로이드에서 위젯 추가하는 법",
  "onboarding.step5.widgetStep1": "1. 홈 화면 빈 곳을 길게 누름",
  "onboarding.step5.widgetStep2": "2. “위젯” 메뉴 → Anima 검색",
  "onboarding.step5.widgetStep3": "3. 잠금화면에 추가하면 매일 자동으로 한 줄이 도착해요",
  "onboarding.step5.start": "시작하기",
  "onboarding.step5.finishing": "마무리 중…",
  "onboarding.step5.portraitLabel": "10년 후 나의 모습",
  "onboarding.step5.portraitLoading": "10년 후 당신의 모습을 그리고 있어요…",
  "onboarding.step5.portraitError":
    "10년 후 모습을 만들지 못했어요. 시작 후 홈에서 다시 만들 수 있어요.",

  "onboarding.saveError": "저장에 실패했어요.",
  "onboarding.category.philosophy": "철학",
  "onboarding.category.entrepreneur": "기업가",
  "onboarding.category.classic": "고전",
  "onboarding.category.leader": "지도자",
  "onboarding.category.scientist": "과학자",
  "onboarding.category.literature": "문학",

  // ── 홈 ───────────────────────────────────────────
  "home.title": "오늘의 동기부여",
  "home.subtitle": "매일 새로 도착하는 한 마디로 하루를 시작하세요.",
  "home.dateFormat": "{year}년 {month}월 {day}일",
  "home.settingsAria": "설정",

  "home.future.title": "10년 후의 나의 모습",
  "home.future.subtitle": "되고 싶은 모습이 구체적일수록, 매일 도착하는 한 마디도 더 명확해져요.",
  "home.future.empty": "아직 적어둔 모습이 없어요. 설정에서 작성할 수 있어요.",
  "home.future.saveAndRegen": "저장하고 카드 다시 받기",
  "home.future.saveFailed": "미래의 나 저장 실패",

  // ── "10년 후 나의 모습" 초상 카드 ─────────────────
  "futureSelf.portrait.headerLabel": "10년 후 나의 모습",
  "futureSelf.portrait.loading": "10년 후 당신의 모습을 그리고 있어요…",
  "futureSelf.portrait.error": "10년 후 모습을 그리지 못했어요.",
  "futureSelf.portrait.regenerate": "초상 다시 그리기",
  "futureSelf.portrait.regenerating": "다시 그리는 중…",

  "home.goals.title": "목표를 이루기 위한 오늘의 행동",
  "home.goals.subtitle":
    "성공한 나의 모습으로 다가가기 위해 오늘 옮겨볼 한 가지 행동.",
  "home.goals.todayProgress": "오늘 {done}/{total}",
  "home.goals.placeholder": "예: 매일 안 해본 일 1가지 도전하기",
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
  "motivation.regenerate": "오늘의 또 다른 한마디",
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

  // ── 미래 일상 비전 (꿈이 실현된 하루) ────────────
  "futureVision.headerLabel": "오늘, 그 꿈을 사는 하루",
  "futureVision.loading": "당신의 미래 하루를 그리고 있어요…",
  "futureVision.error": "미래 일상을 그리지 못했어요.",
  "futureVision.regenerate": "또 다른 하루 보기",
  "futureVision.regenerating": "다른 하루를 그리는 중…",
  "futureVision.reveal": "오늘의 하루 펼쳐보기",
  "futureVision.empty.title": "먼저 ‘미래의 나’를 그려주세요",
  "futureVision.empty.body":
    "10년 후 되고 싶은 모습을 한 단락 적으면, 매일 그 꿈이 실현된 하루를 눈앞에 그려 드릴게요.",
  "futureVision.empty.cta": "미래의 나 적기",

  // ── 설정 ─────────────────────────────────────────
  "settings.title": "설정",
  "settings.subtitle": "미래의 모습 · 매일 다짐 · 오늘의 행동 · 명언 큐레이션을 한곳에서 관리해요.",
  "settings.future.title": "10년 후의 나의 모습",
  "settings.future.subtitle": "매일 도착하는 동기부여 한 마디가 이 글을 바탕으로 만들어져요.",
  "settings.futureSelf.legacyNote":
    "이전에 적어둔 글이에요. 위 질문에 답하고 저장하면 이 글을 대체해요.",
  "settings.affirmations.title": "성공한 나에게 한 발 더",
  "settings.affirmations.subtitle":
    "매일 카드 위쪽에 흐린 글씨로 미리 보여드려요. 그 위에 똑같이 따라 적으면 연속일이 +1 됩니다.",
  "settings.goals.title": "목표를 이루기 위한 오늘의 행동",
  "settings.goals.subtitle":
    "성공한 나의 모습으로 다가가기 위해 오늘 옮겨볼 한 가지 행동.",
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
  "settings.account.delete": "계정 삭제",
  "settings.account.delete.subtitle": "내 정보·다짐·기록을 모두 영구 삭제합니다. 되돌릴 수 없어요.",
  "settings.account.delete.confirmTitle": "정말 계정을 삭제할까요?",
  "settings.account.delete.confirmBody":
    "10년 후의 나에게 적은 모습, 매일의 다짐, 잘한 일 기록이 모두 사라집니다.\n결제 영수증도 함께 정리되며, 같은 이메일로 다시 가입할 수는 있어요.",
  "settings.account.delete.confirmInputLabel": "확인을 위해 아래에 \"삭제\"를 입력해주세요.",
  "settings.account.delete.confirmInputKeyword": "삭제",
  "settings.account.delete.confirmCancel": "취소",
  "settings.account.delete.confirmConfirm": "영구 삭제",
  "settings.account.delete.deleting": "삭제 중…",
  "settings.account.delete.failed": "계정 삭제에 실패했어요. 잠시 후 다시 시도해주세요.",

  // ── 인증 ─────────────────────────────────────────
  "auth.email": "이메일",
  "auth.password": "비밀번호",
  "auth.displayName": "이름",
  "auth.signIn": "로그인",
  "auth.signUp": "회원가입",
  "auth.signInWithGoogle": "Google로 로그인",
  "auth.continueWithGoogle": "Google로 계속하기",
  "auth.continueWithApple": "Apple로 계속하기",
  "auth.or": "또는",
  "auth.noAccount": "처음이신가요?",
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
  "auth.error.emailInUse": "이미 가입된 이메일이에요. 아래 '로그인'으로 진행해주세요.",
  "auth.error.invalidCredentials": "이메일 또는 비밀번호가 올바르지 않아요.",
  "auth.error.tooManyRequests": "시도가 너무 많았어요. 잠시 후 다시 시도해주세요.",
  "auth.error.network": "네트워크 연결을 확인해주세요.",
  "auth.link.title": "Google 계정 연결",
  "auth.link.description": "{email} 은(는) 이미 이메일/비밀번호로 가입돼 있어요. 비밀번호를 입력하면 Google 계정과 연결돼 다음부턴 두 방식 모두 사용할 수 있어요.",
  "auth.link.submit": "연결하고 로그인",
  "auth.link.cancel": "취소",
  "auth.link.failed": "연결에 실패했어요. 비밀번호를 확인해주세요.",
  "auth.link.apple.title": "Apple 계정 연결",
  "auth.link.apple.description": "{email} 은(는) 이미 이메일/비밀번호로 가입돼 있어요. 비밀번호를 입력하면 Apple 계정과 연결돼 다음부턴 두 방식 모두 사용할 수 있어요.",
  "auth.password.placeholder": "최소 6자",
  "auth.displayName.placeholder": "표시 이름",

  // ── 잘한 일 히스토리 ─────────────────────────────
  "wins.history.title": "잘한 일 기록",
  "wins.history.subtitle": "매일 적은 한 줄이 모여 너만의 흔적이 돼요.",
  "wins.history.empty": "아직 적은 기록이 없어요.",
  "wins.history.back": "← 홈으로",
  "wins.history.loadFailed": "기록을 불러오지 못했어요.",

  // ── 다짐 에디터 ──────────────────────────────────
  "affirmations.editor.placeholder": "예: 나는 자산이 10억 달러가 넘는 성공한 기업가이다.",
  "affirmations.editor.add": "+ 다짐 추가",
  "affirmations.editor.removeAria": "다짐 줄 제거",
  "affirmations.editor.maxNote": "최대 {max}개까지 추가할 수 있어요. 한 줄당 {len}자까지.",

  // ── 결제 / 트라이얼 ───────────────────────────────
  "billing.trialBanner": "남은 무료 체험 {days}일",
  "billing.trialEnded": "무료 체험이 끝났어요.",
  "billing.upgrade": "업그레이드",

  // ── Apple iOS 리디자인 추가 키 (settings/auth/legal/common 보강) ─────
  "auth.signOut": "로그아웃",
  "common.deleting": "삭제하는 중…",
  "common.empty": "비어있음",
  "common.none": "없음",
  "common.set": "작성됨",
  "legal.privacy": "개인정보처리방침",
  "legal.terms": "이용약관",
  "settings.profile.header": "프로필",
  "settings.affirmations.header": "성공한 나의 모습 다짐",
  "settings.quote.header": "카드",
  "settings.quote.pinnedAuthor": "좋아하는 인물",
  "settings.language.header": "언어",
  "settings.account.header": "계정",
  "settings.account.deleteConfirm":
    "모든 데이터가 영구 삭제됩니다. 아래에 \"삭제\"를 입력해주세요.",
  "settings.streakLabel": "연속 {count}일",

  // ── 알림 설정 (로컬 리마인더) ─────────────────────
  "settings.notifications.header": "알림",
  "settings.notifications.row": "데일리 리마인더",
  "settings.notifications.off": "꺼짐",
  "settings.notifications.footer":
    "알림은 이 기기에서만 예약돼요. 하루 최대 2건 — 이미 한 일에는 보내지 않아요.",
  "settings.notifications.morning.title": "아침 다짐 리마인더",
  "settings.notifications.morning.desc": "성공 선언을 따라 쓰며 하루를 여는 신호예요.",
  "settings.notifications.evening.title": "저녁 기록 리마인더",
  "settings.notifications.evening.desc": "오늘 목표를 아직 체크하지 않았을 때만 도착해요.",
  "settings.notifications.weekly.title": "일요일 회고 알림",
  "settings.notifications.weekly.desc": "한 주를 닫는 회고가 준비되면 저녁에 알려드려요.",
  "settings.notifications.time": "시각",

  // ── 알림 문구 (iOS 로컬 알림 본문 — Android 는 네이티브 리소스) ──
  "notify.morning.title": "성공한 나에게 한 발 더",
  "notify.morning.body": "오늘도 다짐을 따라 적으며 하루를 시작해요.",
  "notify.evening.title": "오늘의 목표, 아직 남아 있어요",
  "notify.evening.body": "잠깐이면 돼요 — 오늘 한 걸음을 체크해 주세요.",
  "notify.weekly.title": "이번 주를 돌아볼 시간",
  "notify.weekly.body": "일주일의 기록이 정리됐어요. 잠깐 돌아보세요.",

  // ── Anima Pro (인앱결제) ──────────────────────────
  "settings.pro.header": "ANIMA PRO",
  "settings.pro.footerActive": "모든 기능이 활성화되어 있습니다.",
  "settings.pro.footerInactive": "1회 결제로 평생 사용 · 광고 없음",
  "settings.pro.active": "Anima Pro 이용 중",
  "settings.pro.buy": "평생 이용권 구매",
  "settings.pro.processing": "처리 중…",
  "settings.pro.restore": "구매 복원",
  "settings.pro.restoring": "복원 중…",
  "settings.pro.purchaseDone.title": "구매 완료",
  "settings.pro.purchaseDone.desc": "Anima Pro 구매가 완료되었습니다. 감사합니다!",
  "settings.pro.pending.title": "승인 대기 중",
  "settings.pro.pending.desc": "결제가 승인 대기 중입니다. 승인되면 자동으로 적용됩니다.",
  "settings.pro.purchaseFailed.title": "결제 실패",
  "settings.pro.purchaseFailed.desc": "결제에 실패했습니다.",
  "settings.pro.purchaseIncomplete.title": "결제가 완료되지 않았어요",
  "settings.pro.purchaseIncomplete.desc":
    "결제가 완료되지 않았습니다. 이미 구매하셨다면 아래 ‘구매 복원’을 눌러 주세요.",
  "settings.pro.restoreDone.title": "복원 완료",
  "settings.pro.restoreDone.desc": "구매를 복원했습니다.",
  "settings.pro.restoreNone.title": "복원할 내역 없음",
  "settings.pro.restoreNone.desc": "복원할 구매 내역이 없습니다.",

  // ── WOOP 실행 설계 (if-then) ──────────────────────
  "woop.section.title": "실행 설계 (if-then)",
  "woop.section.footer": "장애물을 미리 정해두면 실행 확률이 크게 올라가요.",
  "woop.section.designCta": "설계하기",
  "woop.sheet.title": "실행 설계",
  "woop.step.wish": "목표",
  "woop.step.outcome": "최상의 결과",
  "woop.step.obstacle": "내 안의 장애물",
  "woop.step.plan": "if-then 계획",
  "woop.wish.hint": "어떤 목표를 위한 설계인가요?",
  "woop.wish.empty": "먼저 설정에서 이번 달 목표를 추가해주세요.",
  "woop.outcome.hint": "이 목표를 이뤘을 때 가장 좋은 순간은 어떤 모습인가요?",
  "woop.outcome.placeholder": "예: 해낸 나를 떠올리면 가슴이 뛴다",
  "woop.obstacle.hint": "그 길을 막는 '내 안의' 장애물은 무엇인가요? 환경이 아니라 내 마음속에서 찾아보세요.",
  "woop.obstacle.placeholder": "예: 저녁이 되면 피곤해서 미루고 싶어진다",
  "woop.obstacle.suggest": "AI 제안 받기",
  "woop.obstacle.suggesting": "제안 만드는 중…",
  "woop.plan.ifLabel": "만약 (if)",
  "woop.plan.thenLabel": "그러면 (then)",
  "woop.plan.ifPlaceholder": "장애물 상황이 오면",
  "woop.plan.thenPlaceholder": "나는 이렇게 한다",
  "woop.identity.pickLabel": "이 실천이 강화할 정체성",
  "woop.save": "저장",
  "woop.saving": "저장 중…",
  "woop.delete": "삭제",
  "woop.saveFailed": "실행 설계를 저장하지 못했어요.",
  "woop.suggestFailed": "제안을 불러오지 못했어요.",

  // ── 설계 시트: "왜 미리 정해두나요?" 인트로 (기본 접힘) ──
  "woop.why.toggle": "왜 미리 정해두나요?",
  "woop.why.p1":
    "결정의 순간엔 의지력이 가장 약해요. 피곤한 저녁, 손에 잡힌 휴대폰 — 그때 무엇을 할지 고민하면 대개 져요.",
  "woop.why.p2":
    "'만약 A면, 나는 B 한다'를 미리 한 문장으로 정해두면 행동을 부르는 주체가 '나'에서 '상황'으로 바뀌어요. 뇌영상 연구에서도 실행의도를 세운 뒤에는 스스로 떠올리는 데 쓰이는 안쪽 전전두엽 대신, 단서에 반응하는 회로가 일을 맡았어요.",
  "woop.why.p3":
    "그래서 효과가 커요 — 94개 연구를 모은 메타분석에서 목표 달성 효과크기 d = 0.65였어요.",
  "woop.why.p4":
    "그리고 반드시 '내 안의 장애물'을 함께 적어요. 좋은 결과만 상상하면 오히려 실행 에너지가 떨어진다는 게 반복해서 확인됐어요.",
  "woop.why.source":
    "Gollwitzer 1999 · Gollwitzer & Sheeran 2006 · Gilbert et al. 2009 · Kappes & Oettingen 2011",

  // ── 오늘의 if-then 카드 (아침 모드) ───────────────
  "plan.today.title": "오늘의 if-then",
  "plan.today.if": "만약",
  "plan.today.then": "그러면",
  // 카드에 상시 남는 유일한 설명 — "이 두 줄이 뭔지" 한 문장. 근거는 woop.why.* 접힘 안.
  "plan.today.desc": "결정의 순간이 오기 전에 미리 정해둔 오늘의 행동이에요. 그 상황이 오면 고민하지 말고 그대로.",
  "plan.today.rotation": "설계해둔 계획 {count}개가 매일 하나씩 돌아가며 올라와요.",
  "plan.today.emptyCta": "오늘의 실행 설계를 만들어보세요",
  "plan.today.emptyDesc": "'만약 A면, 나는 B 한다' 한 문장 · AI 초안을 고르면 키보드 없이 끝나요",
  "plan.today.firstAction": "어젯밤의 내가 정한 첫 행동",
  /* 잠긴 기능은 이름도 설명도 밝히지 않는다 — 못 쓰는 기능의 목록을 미리 펼쳐두면
     기대가 아니라 결핍으로 읽힌다. 조건과 진행도만 알리고 정체는 열리는 날 몫으로 남긴다.
     실행 설계·잘한 일 기록이 이 한 벌을 공유한다 — 같은 규칙이라 문구도 하나다. */
  "unlock.teaser.title": "아직 열리지 않은 기능",
  "unlock.teaser.hint": "무엇이 열리는지는 그날 알려드릴게요.",
  "unlock.locked.body": "{days}일 연속이면 열려요 · 지금 {progress}일",

  // ── 저녁 모드: 내일 첫 행동 ───────────────────────
  "home.evening.firstAction.title": "내일 첫 행동 1개",
  "home.evening.firstAction.placeholder": "내일 눈 뜨면 가장 먼저 할 작은 행동",
  "home.evening.firstAction.footer": "적어두면 밤새 머릿속 걱정이 줄어요 · 자동 저장",

  // ── 진행 상황 (/progress) ─────────────────────────
  "progress.title": "진행 상황",
  "progress.back": "← 홈으로",
  "progress.chipAria": "진행 상황 보기",
  "progress.streak.current": "현재 연속",
  "progress.streak.days": "{count}일",
  "progress.streak.best": "최고 {count}일",
  "progress.goalDays": "목표 지킨 날 {count}일",
  "progress.freeze.label": "이번 달 남은 얼음",
  "progress.freeze.desc": "하루 놓쳐도 얼음이 자동으로 스트릭을 이어줘요 (월 {max}개)",
  "progress.heatmap.title": "최근 30일",
  "progress.consistency": "일관성 {pct}%",
  "progress.identity.title": "정체성 증거 장부",
  "progress.identity.subtitle": "행동 하나하나가 '나는 그런 사람'이라는 증거가 돼요.",
  "progress.identity.iAm": "나는 {label}",
  "progress.identity.votes": "{count}회",
  "progress.identity.empty": "아직 쌓인 증거가 없어요. 오늘 다짐 체크인부터 시작해보세요.",
  "progress.evidence.title": "최근 증거",
  "progress.source.checkin": "다짐",
  "progress.source.deep": "전체 새김",
  "progress.source.goal": "목표",
  "progress.source.win": "잘한 일",
  "progress.source.mission": "미션",
  "progress.loadFailed": "진행 상황을 불러오지 못했어요.",

  // ── 재약속 카드 (스트릭 끊김 자기연민 복귀) ───────
  "recommit.title": "다시 시작하기 좋은 날이에요",
  "recommit.body":
    "{prev}일을 이어온 기록은 사라지지 않았어요 · 최고 {best}일. 오늘 다시 시작할까요?",
  "recommit.freezeChip": "지금 체크인하면 얼음 {count}개가 스트릭을 이어줘요",
  "recommit.cta": "지금 체크인하기",
  "recommit.dismissAria": "닫기",

  // ── 다짐 코치 ─────────────────────────────────────
  "coach.buttonAria": "AI 코치 제안 받기",
  "coach.title": "코치 제안",
  "coach.loading": "제안 만드는 중…",
  "coach.style.process": "과정",
  "coach.style.question": "질문",
  "coach.style.identity": "정체성",
  "coach.failed": "제안을 불러오지 못했어요.",
  "coach.quota": "오늘의 코치 제안 한도를 다 썼어요. 내일 다시 만나요.",

  // ── 성공한 미래의 나 (하루 1줄 필수 + 전량은 선택) ───────
  "affirmations.focus.title": "성공한 미래의 나",
  "affirmations.focus.rotation": "{index}/{total}번째",
  "affirmations.focus.hint": "이미 꿈을 이룬 나의 모습을 생생히 적어주세요.",
  "affirmations.focus.placeholder": "적을수록 그 미래가 현실이 돼요…",
  "affirmations.focus.expand": "{count}줄 전체 새기기",
  "affirmations.focus.collapse": "오늘 한 줄만 쓰기",
  "affirmations.focus.deepHint": "전체를 새기면 정체성 증거가 한 표 더 쌓여요.",
  "affirmations.focus.mismatch": "위 문장과 한 글자씩 맞춰 적어주세요.",
  "affirmations.extra.mismatch": "다시 볼 문장이 있어요 — 오늘 체크인은 이미 완료됐어요.",

  // ── 체크인 직후 보상 ──────────────────────────────
  "checkin.reward.title": "오늘의 나로 살았어요",
  "checkin.reward.streak": "{count}일째 이어가는 중",
  "checkin.reward.evidence": "정체성 증거 +{count} · 나는 {label}",
  "checkin.reward.evidencePlain": "정체성 증거 +{count}",
  "checkin.reward.deepBadge": "전체 새김",
  "checkin.reward.freeze": "얼음 {count}개가 빈 날을 이어줬어요",

  // ── 7일 리듬 링 ───────────────────────────────────
  "rhythm.title": "이번 주 리듬",
  "rhythm.count": "{done}/{total}",
  "rhythm.footer": "지난 7일 중 {done}일 새겼어요.",
  "rhythm.startCaption": "여정을 시작한 날부터 세고 있어요.",
  "rhythm.todayAria": "오늘",

  // ── 주간 회고 카드 (일요일 저녁, 입력 없음) ─────────
  "weekly.title": "이번 주 회고",
  "weekly.checkinDays": "다짐 {count}일",
  "weekly.wins": "잘한 일 {count}개",
  "weekly.evidence": "증거 {count}표",
  "weekly.topIdentity": "이번 주 가장 많이 증명한 나 · {label}",
  "weekly.empty": "이번 주는 기록이 적었어요. 다음 주 첫 체크인부터 다시 세어요.",
  "weekly.footer": "적을 건 없어요 — 지난 7일을 한 번 보고 가세요.",

  // ── WOOP 빠른 설계 (키보드 없이 3탭) ────────────────
  "woop.quick.title": "빠른 설계",
  "woop.quick.pickGoal": "어떤 목표를 설계할까요?",
  "woop.quick.draftCta": "초안 3개 받기",
  "woop.quick.drafting": "초안 만드는 중…",
  "woop.quick.pickDraft": "마음에 드는 초안을 고르면 그대로 저장할 수 있어요.",
  "woop.quick.saveDraft": "이대로 저장",
  "woop.quick.manual": "직접 다듬기",
  "woop.quick.outcomeLabel": "최상의 결과",
  "woop.quick.obstacleLabel": "내 안의 장애물",
  "woop.section.moreCta": "설계 안 한 목표 {count}개 더",
  "woop.section.footerOne": "한 번에 하나씩 — 하나를 실천하는 게 셋을 적어두는 것보다 강해요.",

  // ── 홈 접이식 섹션 ────────────────────────────────
  "home.section.today": "오늘의 실행",
  "home.section.record": "오늘의 기록",
  "home.section.expandAria": "펼치기",
  "home.section.collapseAria": "접기",
  "home.wins.addRow": "한 줄 더 적기",
  "home.record.footer": "적은 내용은 자동으로 저장돼요.",
  "home.plans.manage": "실행 설계 관리",
  "home.plans.manageLocked": "목표 관리",
  // 홈에 남는 건 명언·오늘 카드·7일 링뿐 — 나머지는 전부 이 한 섹션 뒤로 접힌다.
  "home.section.more": "더 보기",
  "home.more.summary": "미래의 나 · 기록 · 실행 설계",
  // 접힌 요약도 아직 못 여는 기능의 이름을 흘리지 않는다 — 잠긴 게 있으면 이쪽을 쓴다.
  "home.more.summaryLocked": "미래의 나 · 목표 · 아직 잠긴 것",

  // ── 오늘의 목표 실행 체크 (전사 체크인과 같은 카드) ──
  "home.todayGoal.title": "오늘의 목표",
  "home.todayGoal.doneToday": "오늘 해냈어요",
  // 목표 줄 자체가 체크 버튼이라, 안내는 "무엇을 누르면 되는지" 한 줄이면 충분하다.
  "home.todayGoal.tapHint": "오늘 지켰다면 눌러 주세요",
  "home.todayGoal.undoHint": "다시 누르면 취소돼요",
  "home.todayGoal.empty": "아직 정한 목표가 없어요.",
  "home.todayGoal.setCta": "목표 정하기",
  "home.todayGoal.afterCheckin": "다짐을 새겼어요. 오늘 지켰다면 목표를 눌러 주세요.",

  // ── 미래의 나 한 줄 ────────────────────────────────
  "home.futureLine.label": "미래의 나",
  "home.futureLine.empty": "아직 적어둔 모습이 없어요.",
  "home.futureLine.write": "지금 적기",

  // ── 목표 슬롯 해금 ─────────────────────────────────
  "goalSlot.unlock.title": "목표 하나를 더 담을 수 있어요",
  "goalSlot.unlock.body":
    "{days}일을 이어왔어요. 새 목표를 더할지, 지금 목표를 더 또렷하게 만들지 골라보세요.",
  "goalSlot.unlock.bodyGoal":
    "목표를 {days}일 지켰어요. 새 목표를 더할지, 지금 목표를 더 또렷하게 만들지 골라보세요.",
  "goalSlot.unlock.addGoal": "새 목표 추가",
  "goalSlot.unlock.refine": "지금 목표를 더 구체적으로",
  "goalSlot.unlock.later": "나중에",
  "goalSlot.locked": "🔒 {days}일 연속이면 열려요",
  "goalSlot.lockedProgress": "지금 {progress}일",
  "goalSlot.maxed": "목표는 최대 {max}개까지예요. 하나에 집중할수록 잘 지켜져요.",
  "goalSlot.hint": "하나를 지키는 힘이 쌓이면 칸이 하나씩 열려요.",

  // ── 성장 단계 (누적 증거 표) ───────────────────────
  "growth.title": "성장 단계",
  "growth.subtitle": "체크인·전체 새김·목표 달성·잘한 일이 표가 되어 단계를 올려요.",
  "growth.votes": "{count}표",
  "growth.toNext": "다음 단계까지 {count}표",
  "growth.stage.0": "씨앗",
  "growth.stage.1": "새싹",
  "growth.stage.2": "줄기",
  "growth.stage.3": "가지",
  "growth.stage.4": "나무",
  "growth.stage.5": "숲",

  // ── 스텝업 제안 ────────────────────────────────────
  "stepUp.title": "요즘 잘 지키고 있어요",
  "stepUp.body": "조금 올려볼까요? 예: {draft}",
  "stepUp.apply": "설정으로 이동",
  "stepUp.later": "나중에",

  // ── 목표 구체화 ────────────────────────────────────
  "goal.specific.hint": "조금 더 구체적으로 적으면 지키기 쉬워요",
  "goal.specific.count": "숫자",
  "goal.specific.cadence": "얼마나 자주",
  "goal.specific.unit": "단위",
  "goal.specific.countExample": "30",
  "goal.specific.cadenceExample": "매일",
  "goal.specific.unitExample": "분",
  "goal.refine.title": "목표를 더 또렷하게",
  "goal.refine.subtitle": "빠진 조각을 눌러 넣어보세요. 그대로 두셔도 괜찮아요.",
  "goal.refine.apply": "이 목표로 바꾸기",

  "settings.futureSelf.moreDetail": "더 자세히 쓰기",

  // ── 파생 시절 계정에만 뜨는 1회성 안내 (홈 DeclarationNudgeCard) ───────
  "declarationNudge.title": "선언과 목표가 같은 문장이에요",
  "declarationNudge.body":
    "예전에는 목표에서 선언을 자동으로 만들었어요. 선언은 “이미 그렇게 된 나”로 바꾸면 매일 새기는 맛이 달라져요.",
  "declarationNudge.cta": "선언 바꾸기",
  "declarationNudge.dismiss": "괜찮아요",
} as const;

export type DictKey = keyof typeof dict;
export default dict;
