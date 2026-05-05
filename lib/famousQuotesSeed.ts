/**
 * 안드로이드 위젯/메인 앱 노출용 큐레이션 명언 시드.
 *
 * - 카테고리: philosophy / entrepreneur / classic(한시·고전) / leader / scientist / literature / personal
 * - 입력 시점에 author 출처가 모호한 항목은 가장 널리 통용되는 귀속만 사용. (정확성 우려가 있는 흔한 오귀속은 제외)
 * - 이 파일을 수정하면 `POST /api/admin/seed-famous-quotes` (어드민 권한) 로 idempotent 동기화.
 */
import type { FamousQuoteCategory, FamousQuoteLang } from "@/types";

export interface FamousQuoteSeed {
  /** 안정 ID — 재시드해도 같은 항목이 갱신되도록 결정한 짧은 슬러그. */
  id: string;
  text: string;
  author?: string;
  category: FamousQuoteCategory;
  language: FamousQuoteLang;
  tags?: string[];
}

export const FAMOUS_QUOTES_SEED: ReadonlyArray<FamousQuoteSeed> = [
  // ── philosophy ──────────────────────────────────────
  {
    id: "ph_seneca_time",
    text: "사람이 가난한 것은 가진 것이 적어서가 아니라, 더 갖고 싶은 게 많기 때문이다.",
    author: "세네카",
    category: "philosophy",
    language: "ko",
  },
  {
    id: "ph_aurelius_obstacle",
    text: "행동을 가로막는 장애물이 곧 행동을 진전시킨다. 길을 막는 것이 길이 된다.",
    author: "마르쿠스 아우렐리우스",
    category: "philosophy",
    language: "ko",
  },
  {
    id: "ph_aurelius_today",
    text: "지금 너에게 주어진 이 시간 — 그것만이 너의 것이다. 나머지는 이미 지나갔거나 아직 오지 않았다.",
    author: "마르쿠스 아우렐리우스",
    category: "philosophy",
    language: "ko",
  },
  {
    id: "ph_socrates_examined",
    text: "성찰하지 않는 삶은 살 가치가 없다.",
    author: "소크라테스",
    category: "philosophy",
    language: "ko",
  },
  {
    id: "ph_kant_ought",
    text: "할 수 있다, 왜냐하면 해야 하기 때문이다.",
    author: "임마누엘 칸트",
    category: "philosophy",
    language: "ko",
  },
  {
    id: "ph_nietzsche_become",
    text: "너 자신이 되어라. 다른 모든 자리는 이미 차 있다.",
    author: "프리드리히 니체",
    category: "philosophy",
    language: "ko",
  },
  {
    id: "ph_nietzsche_why",
    text: "살아야 할 이유가 있는 사람은 거의 어떤 방식으로도 견딜 수 있다.",
    author: "프리드리히 니체",
    category: "philosophy",
    language: "ko",
  },
  {
    id: "ph_confucius_stop",
    text: "멈추지만 않는다면, 얼마나 천천히 가는가는 중요하지 않다.",
    author: "공자",
    category: "philosophy",
    language: "ko",
  },
  {
    id: "ph_laozi_step",
    text: "천 리 길도 한 걸음에서 시작된다.",
    author: "노자",
    category: "philosophy",
    language: "ko",
  },
  {
    id: "ph_zhuangzi_useful",
    text: "쓸모없음의 쓸모를 아는 자만이, 진짜 쓸모를 안다.",
    author: "장자",
    category: "philosophy",
    language: "ko",
  },

  // ── entrepreneur ────────────────────────────────────
  {
    id: "en_jobs_dots",
    text: "지금의 점들은 미래에서 돌아봐야 비로소 이어진다. 그러니 지금은 그 점들이 언젠가 이어질 것이라 믿어야 한다.",
    author: "스티브 잡스",
    category: "entrepreneur",
    language: "ko",
  },
  {
    id: "en_jobs_time",
    text: "너의 시간은 한정돼 있다. 다른 사람의 인생을 살며 낭비하지 마라.",
    author: "스티브 잡스",
    category: "entrepreneur",
    language: "ko",
  },
  {
    id: "en_bezos_regret",
    text: "후회 최소화 — 80세의 내가 돌아봤을 때 후회가 가장 적은 선택을 골라라.",
    author: "제프 베조스",
    category: "entrepreneur",
    language: "ko",
  },
  {
    id: "en_musk_persist",
    text: "포기는 옵션이 아니다. 죽거나 완전히 무력해질 때만 포기한다.",
    author: "일론 머스크",
    category: "entrepreneur",
    language: "ko",
  },
  {
    id: "en_buffett_compound",
    text: "인생은 눈덩이와 같다. 중요한 건 매우 축축한 눈과, 아주 긴 언덕을 찾는 것이다.",
    author: "워런 버핏",
    category: "entrepreneur",
    language: "ko",
  },
  {
    id: "en_buffett_reputation",
    text: "평판을 쌓는 데 20년이 걸리고, 망치는 데 5분이면 충분하다. 그 점을 생각하면 행동이 달라진다.",
    author: "워런 버핏",
    category: "entrepreneur",
    language: "ko",
  },
  {
    id: "en_munger_invert",
    text: "거꾸로 생각하라, 항상 거꾸로 생각하라.",
    author: "찰리 멍거",
    category: "entrepreneur",
    language: "ko",
  },
  {
    id: "en_thiel_secret",
    text: "어떤 중요한 진실에 대해, 사람들 대부분이 너와 동의하지 않는 것은 무엇인가?",
    author: "피터 틸",
    category: "entrepreneur",
    language: "ko",
  },
  {
    id: "en_ford_think",
    text: "할 수 있다고 믿든 할 수 없다고 믿든, 너는 옳다.",
    author: "헨리 포드",
    category: "entrepreneur",
    language: "ko",
  },
  {
    id: "en_jung_lee_byungchul",
    text: "사업은 사람이다. 사람을 알아보는 것이 사업의 절반이다.",
    author: "이병철",
    category: "entrepreneur",
    language: "ko",
  },
  {
    id: "en_chung_ju_yung_try",
    text: "이봐, 해 봤어?",
    author: "정주영",
    category: "entrepreneur",
    language: "ko",
  },
  {
    id: "en_chung_ju_yung_dawn",
    text: "새벽이 오기 전이 가장 어둡다. 견디는 자가 새벽을 본다.",
    author: "정주영",
    category: "entrepreneur",
    language: "ko",
  },

  // ── classic (한시·고전) ─────────────────────────────
  {
    id: "cl_dasan_diligence",
    text: "근면(勤)·검소(儉)·성실(誠), 이 셋이 평생을 지탱한다.",
    author: "정약용",
    category: "classic",
    language: "ko",
  },
  {
    id: "cl_yi_hwang_learn",
    text: "배움이란 그릇을 키우는 일이다. 그릇이 작으면 큰 것을 담을 수 없다.",
    author: "이황",
    category: "classic",
    language: "ko",
  },
  {
    id: "cl_yi_i_resolve",
    text: "뜻을 세우는 것이 학문의 시작이다. 뜻이 서지 않으면 만 권을 읽어도 헛되다.",
    author: "이이",
    category: "classic",
    language: "ko",
  },
  {
    id: "cl_yi_sunsin_remain",
    text: "신에게는 아직 열두 척의 배가 남아 있나이다.",
    author: "이순신",
    category: "classic",
    language: "ko",
  },
  {
    id: "cl_yi_sunsin_die",
    text: "죽고자 하면 살 것이고, 살고자 하면 죽을 것이다.",
    author: "이순신",
    category: "classic",
    language: "ko",
  },
  {
    id: "cl_dosan_time",
    text: "오늘 걸으면, 내일도 걷는다. 오늘 멈추면, 영영 멈춘다.",
    author: "안창호",
    category: "classic",
    language: "ko",
  },
  {
    id: "cl_kim_gu_wish",
    text: "나의 소원은 첫째도 우리나라의 완전한 자주독립, 둘째도 자주독립, 셋째도 자주독립이오.",
    author: "김구",
    category: "classic",
    language: "ko",
  },
  {
    id: "cl_dubo_pine",
    text: "세한연후지송백지후조 — 추운 겨울이 와야 소나무와 잣나무가 늦게 시드는 줄 안다.",
    author: "공자",
    category: "classic",
    language: "ko",
    tags: ["논어"],
  },
  {
    id: "cl_li_bai_climb",
    text: "오르고 또 오르면 못 오를 산이 없다.",
    author: "옛 한시",
    category: "classic",
    language: "ko",
  },
  {
    id: "cl_taegongmang_water",
    text: "물처럼 흘러라 — 멈추면 썩고, 흐르면 길을 찾는다.",
    category: "classic",
    language: "ko",
  },

  // ── leader ──────────────────────────────────────────
  {
    id: "ld_churchill_continue",
    text: "성공은 결정적인 것이 아니고 실패는 치명적인 것이 아니다. 중요한 건 계속할 용기다.",
    author: "윈스턴 처칠",
    category: "leader",
    language: "ko",
  },
  {
    id: "ld_lincoln_prepare",
    text: "나무를 베는 데 여섯 시간이 주어진다면, 나는 처음 네 시간을 도끼를 가는 데 쓰겠다.",
    author: "에이브러햄 링컨",
    category: "leader",
    language: "ko",
  },
  {
    id: "ld_mandela_impossible",
    text: "어떤 일이 끝나기 전까지는 항상 불가능해 보인다.",
    author: "넬슨 만델라",
    category: "leader",
    language: "ko",
  },
  {
    id: "ld_gandhi_change",
    text: "세상에서 보고 싶은 변화, 그 자체가 너 자신이 되어라.",
    author: "마하트마 간디",
    category: "leader",
    language: "ko",
  },
  {
    id: "ld_roosevelt_arena",
    text: "공로는 비평가에게 있는 것이 아니라, 실제로 경기장에 서 있는 자에게 있다.",
    author: "시어도어 루스벨트",
    category: "leader",
    language: "ko",
  },

  // ── scientist ───────────────────────────────────────
  {
    id: "sc_einstein_curious",
    text: "나는 특별한 재능이 없다. 다만 열정적으로 호기심을 가질 뿐이다.",
    author: "알베르트 아인슈타인",
    category: "scientist",
    language: "ko",
  },
  {
    id: "sc_einstein_simple",
    text: "더 단순하게 만들 수 없을 만큼 단순해야 한다 — 그 이상은 안 된다.",
    author: "알베르트 아인슈타인",
    category: "scientist",
    language: "ko",
  },
  {
    id: "sc_curie_understand",
    text: "삶에서 두려워해야 할 것은 없다. 다만 이해해야 할 것이 있을 뿐이다. 지금이 더 많이 이해할 시간이다.",
    author: "마리 퀴리",
    category: "scientist",
    language: "ko",
  },
  {
    id: "sc_feynman_fool",
    text: "첫 번째 원칙: 자기 자신을 속이지 마라. 그리고 자기 자신이야말로 속이기 가장 쉬운 사람이다.",
    author: "리처드 파인만",
    category: "scientist",
    language: "ko",
  },
  {
    id: "sc_darwin_adapt",
    text: "살아남는 것은 가장 강한 종도, 가장 똑똑한 종도 아니다. 변화에 가장 잘 적응하는 종이다.",
    author: "찰스 다윈",
    category: "scientist",
    language: "ko",
  },

  // ── literature ──────────────────────────────────────
  {
    id: "li_kafka_path",
    text: "길은 걸어가는 그 순간에만 존재한다. 멈추면 길도 사라진다.",
    author: "프란츠 카프카",
    category: "literature",
    language: "ko",
  },
  {
    id: "li_hemingway_strong",
    text: "세상은 모두를 부순다. 그리고 그 부서진 자리에서 강해지는 사람들이 있다.",
    author: "어니스트 헤밍웨이",
    category: "literature",
    language: "ko",
  },
  {
    id: "li_dostoevsky_small",
    text: "큰 결심보다 작은 한 걸음이 사람을 더 멀리 데려간다.",
    author: "표도르 도스토옙스키",
    category: "literature",
    language: "ko",
  },
  {
    id: "li_tolstoy_change",
    text: "모두가 세상을 바꾸려 하지만, 누구도 자기 자신을 바꾸려 하지 않는다.",
    author: "레프 톨스토이",
    category: "literature",
    language: "ko",
  },
  {
    id: "li_yoon_dongju_sky",
    text: "죽는 날까지 하늘을 우러러 한 점 부끄럼이 없기를.",
    author: "윤동주",
    category: "literature",
    language: "ko",
  },
  {
    id: "li_han_yongun_silence",
    text: "님은 갔지만, 나는 님을 보내지 아니하였습니다.",
    author: "한용운",
    category: "literature",
    language: "ko",
  },
  {
    id: "li_park_kyungri_river",
    text: "사람은 세월에 흘러가는 것이 아니라, 세월을 살아 통과하는 것이다.",
    author: "박경리",
    category: "literature",
    language: "ko",
  },
  {
    id: "li_goethe_now",
    text: "지금 시작하라. 새로운 시작이 곧 새로운 삶이다.",
    author: "괴테",
    category: "literature",
    language: "ko",
  },

  // ── personal (앵커용 — 본인이 채우거나 어드민이 보강) ─
  {
    id: "ps_self_today",
    text: "오늘 흘린 땀은, 10년 뒤의 내가 매일 마주할 풍경이다.",
    author: "10년 후의 나",
    category: "personal",
    language: "ko",
  },
  {
    id: "ps_self_silent",
    text: "조용히, 매일, 멈추지 않는 자가 결국 모든 것을 가진다.",
    author: "10년 후의 나",
    category: "personal",
    language: "ko",
  },
];
