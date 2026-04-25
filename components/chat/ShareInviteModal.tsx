"use client";

import { useState } from "react";
import { createInviteLink } from "@/lib/firebase";

interface Props {
  sessionId: string;
  sessionTitle: string;
  fromUid: string;
  fromName: string;
  onClose: () => void;
}

export default function ShareInviteModal({
  sessionId,
  sessionTitle,
  fromUid,
  fromName,
  onClose,
}: Props) {
  const [inviteUrl, setInviteUrl] = useState<string | null>(null);
  const [isGenerating, setIsGenerating] = useState(false);
  const [copied, setCopied] = useState(false);

  const generateLink = async (): Promise<string> => {
    if (inviteUrl) return inviteUrl;

    setIsGenerating(true);
    try {
      const link = await createInviteLink(sessionId, sessionTitle, fromUid, fromName);
      const url = `${window.location.origin}/invite/${link.token}`;
      setInviteUrl(url);
      return url;
    } finally {
      setIsGenerating(false);
    }
  };

  const handleCopyLink = async () => {
    const url = await generateLink();
    await navigator.clipboard.writeText(url);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  const shareText = `${fromName}님이 Anima 대화에 초대했습니다.\n대화 주제: ${sessionTitle}`;

  const handleSMS = async () => {
    const url = await generateLink();
    const body = encodeURIComponent(`${shareText}\n\n참여하기: ${url}`);
    window.open(`sms:?body=${body}`, "_self");
  };

  const handleEmail = async () => {
    const url = await generateLink();
    const subject = encodeURIComponent(`[Anima] ${fromName}님의 대화 초대`);
    const body = encodeURIComponent(
      `${shareText}\n\n아래 링크를 클릭하여 대화에 참여하세요:\n${url}\n\n* 이 링크는 7일간 유효합니다.`
    );
    window.open(`mailto:?subject=${subject}&body=${body}`, "_self");
  };

  const handleKakao = async () => {
    const url = await generateLink();
    const Kakao = (window as unknown as Record<string, unknown>).Kakao as {
      isInitialized: () => boolean;
      Share: {
        sendDefault: (params: Record<string, unknown>) => void;
      };
    } | undefined;

    if (!Kakao || !Kakao.isInitialized()) {
      // 카카오 SDK 미설정 시 클립보드 복사 대체
      await navigator.clipboard.writeText(url);
      alert("카카오톡 공유가 설정되지 않았습니다. 초대 링크가 클립보드에 복사되었습니다.");
      return;
    }

    Kakao.Share.sendDefault({
      objectType: "feed",
      content: {
        title: "Anima 대화 초대",
        description: `${fromName}님이 "${sessionTitle}" 대화에 초대했습니다.`,
        imageUrl: `${window.location.origin}/og-image.png`,
        link: {
          mobileWebUrl: url,
          webUrl: url,
        },
      },
      buttons: [
        {
          title: "대화 참여하기",
          link: {
            mobileWebUrl: url,
            webUrl: url,
          },
        },
      ],
    });
  };

  const handleNativeShare = async () => {
    const url = await generateLink();
    if (navigator.share) {
      await navigator.share({
        title: "Anima 대화 초대",
        text: shareText,
        url,
      });
    }
  };

  const supportsNativeShare = typeof navigator !== "undefined" && !!navigator.share;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40">
      <div className="w-full max-w-sm rounded-2xl bg-white p-6 shadow-xl">
        {/* 헤더 */}
        <div className="flex items-center justify-between">
          <h2 className="text-lg font-bold text-gray-900">초대 링크 공유</h2>
          <button
            onClick={onClose}
            className="rounded-lg p-1 text-gray-400 hover:bg-gray-100 hover:text-gray-600"
          >
            <svg className="h-5 w-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
            </svg>
          </button>
        </div>

        <p className="mt-2 text-sm text-gray-500">
          초대 링크를 생성하여 다양한 방법으로 공유할 수 있습니다.
          <br />
          <span className="text-xs text-gray-400">링크는 7일간 유효합니다.</span>
        </p>

        {/* 공유 버튼 그리드 */}
        <div className="mt-5 grid grid-cols-2 gap-3">
          {/* 링크 복사 */}
          <button
            onClick={handleCopyLink}
            disabled={isGenerating}
            className="flex flex-col items-center gap-2 rounded-xl border border-gray-200 p-4 hover:bg-gray-50 transition-colors disabled:opacity-50"
          >
            <div className="flex h-12 w-12 items-center justify-center rounded-full bg-gray-100">
              {copied ? (
                <svg className="h-6 w-6 text-green-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
                </svg>
              ) : (
                <svg className="h-6 w-6 text-gray-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13.828 10.172a4 4 0 00-5.656 0l-4 4a4 4 0 105.656 5.656l1.102-1.101m-.758-4.899a4 4 0 005.656 0l4-4a4 4 0 00-5.656-5.656l-1.1 1.1" />
                </svg>
              )}
            </div>
            <span className="text-xs font-medium text-gray-700">
              {copied ? "복사됨!" : "링크 복사"}
            </span>
          </button>

          {/* 문자메시지 */}
          <button
            onClick={handleSMS}
            disabled={isGenerating}
            className="flex flex-col items-center gap-2 rounded-xl border border-gray-200 p-4 hover:bg-gray-50 transition-colors disabled:opacity-50"
          >
            <div className="flex h-12 w-12 items-center justify-center rounded-full bg-green-100">
              <svg className="h-6 w-6 text-green-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 10h.01M12 10h.01M16 10h.01M9 16H5a2 2 0 01-2-2V6a2 2 0 012-2h14a2 2 0 012 2v8a2 2 0 01-2 2h-5l-5 5v-5z" />
              </svg>
            </div>
            <span className="text-xs font-medium text-gray-700">문자메시지</span>
          </button>

          {/* 이메일 */}
          <button
            onClick={handleEmail}
            disabled={isGenerating}
            className="flex flex-col items-center gap-2 rounded-xl border border-gray-200 p-4 hover:bg-gray-50 transition-colors disabled:opacity-50"
          >
            <div className="flex h-12 w-12 items-center justify-center rounded-full bg-blue-100">
              <svg className="h-6 w-6 text-blue-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3 8l7.89 5.26a2 2 0 002.22 0L21 8M5 19h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v10a2 2 0 002 2z" />
              </svg>
            </div>
            <span className="text-xs font-medium text-gray-700">이메일</span>
          </button>

          {/* 카카오톡 */}
          <button
            onClick={handleKakao}
            disabled={isGenerating}
            className="flex flex-col items-center gap-2 rounded-xl border border-gray-200 p-4 hover:bg-gray-50 transition-colors disabled:opacity-50"
          >
            <div className="flex h-12 w-12 items-center justify-center rounded-full bg-yellow-100">
              <svg className="h-6 w-6 text-yellow-700" viewBox="0 0 24 24" fill="currentColor">
                <path d="M12 3C6.48 3 2 6.58 2 10.9c0 2.78 1.8 5.22 4.5 6.6-.2.72-.72 2.62-.82 3.02-.13.5.18.49.38.36.16-.1 2.46-1.67 3.46-2.35.48.07.97.1 1.48.1 5.52 0 10-3.58 10-7.9S17.52 3 12 3z" />
              </svg>
            </div>
            <span className="text-xs font-medium text-gray-700">카카오톡</span>
          </button>
        </div>

        {/* 네이티브 공유 (모바일) */}
        {supportsNativeShare && (
          <button
            onClick={handleNativeShare}
            disabled={isGenerating}
            className="mt-3 w-full rounded-xl border border-gray-200 py-3 text-sm font-medium text-gray-700 hover:bg-gray-50 transition-colors disabled:opacity-50"
          >
            {isGenerating ? "링크 생성 중..." : "다른 앱으로 공유하기"}
          </button>
        )}

        {/* 생성된 링크 표시 */}
        {inviteUrl && (
          <div className="mt-4 rounded-lg bg-gray-50 p-3">
            <p className="text-xs text-gray-500 mb-1">초대 링크</p>
            <p className="break-all text-xs font-mono text-gray-700">{inviteUrl}</p>
          </div>
        )}
      </div>
    </div>
  );
}
