/**
 * futurePersona 를 Gemini 프롬프트에 주입할 때의 공통 길이 상한.
 *
 * 원래 소비처마다 280 이 중복 정의돼 있었으나, 온보딩이 7개 차원 답변을
 * composeFuturePersona() 로 합성하면서 280 으로는 앞 2개 차원만 프롬프트에
 * 들어가는 문제가 생겨 600 으로 상향 + 단일 상수로 통합했다.
 * (gemini-2.5-flash-lite 는 입력 단가가 낮아 비용 영향은 미미하고,
 *  600 초과분은 계속 잘라 폭주를 막는다.)
 */
export const FUTURE_PERSONA_TRUNC = 600;
