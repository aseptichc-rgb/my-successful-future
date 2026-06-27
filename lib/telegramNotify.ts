/**
 * 텔레그램 봇 알림 — 운영자에게 즉시 푸시(환불 발생 등)를 보낸다.
 *
 * 설정(환경변수):
 *   TELEGRAM_BOT_TOKEN : @BotFather 로 만든 봇 토큰 (예: 123456:ABC-DEF...)
 *   TELEGRAM_CHAT_ID   : 메시지를 받을 대화/채널 chat_id (개인 채팅이면 본인 user id)
 *
 * 설계 원칙:
 *   - 알림 실패가 호출부(웹훅 ack)를 절대 깨뜨리지 않는다 — 모든 예외를 삼키고 boolean 반환.
 *   - 서버리스에서 응답 후 백그라운드 작업이 죽을 수 있어, 호출부는 이 함수를 await 해야 한다.
 *   - 외부 API 가 느려도 ack 가 막히지 않도록 짧은 타임아웃을 둔다.
 */
const BOT_TOKEN = (process.env.TELEGRAM_BOT_TOKEN || "").trim();
const CHAT_ID = (process.env.TELEGRAM_CHAT_ID || "").trim();

/** Pub/Sub ack 데드라인을 넘기지 않도록 외부 호출은 4초 안에 끊는다. */
const TELEGRAM_TIMEOUT_MS = 4000;

export function isTelegramConfigured(): boolean {
  return Boolean(BOT_TOKEN && CHAT_ID);
}

/**
 * 평문 메시지를 텔레그램으로 전송. 미설정/실패 시 false 반환(throw 안 함).
 */
export async function notifyTelegram(text: string): Promise<boolean> {
  if (!isTelegramConfigured()) return false;

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), TELEGRAM_TIMEOUT_MS);
  try {
    const res = await fetch(`https://api.telegram.org/bot${BOT_TOKEN}/sendMessage`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        chat_id: CHAT_ID,
        text,
        disable_web_page_preview: true,
      }),
      signal: controller.signal,
    });
    if (!res.ok) {
      console.error(`[telegram] 전송 실패: HTTP ${res.status}`);
      return false;
    }
    return true;
  } catch (err) {
    console.error(`[telegram] 전송 예외: ${err instanceof Error ? err.message : String(err)}`);
    return false;
  } finally {
    clearTimeout(timer);
  }
}
