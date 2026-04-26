"use client";

import { useEffect, useState } from "react";
import type { CustomPersona, PersonaSchedule } from "@/types";
import PersonaRefDocsModal from "./PersonaRefDocsModal";
import PersonaScheduleModal from "./PersonaScheduleModal";
import { useAuth } from "@/lib/auth-context";
import { onPersonaScheduleSnapshot } from "@/lib/firebase";

interface CustomPersonaBuilderProps {
  initial?: CustomPersona;
  onSave: (
    data: Pick<CustomPersona, "name" | "icon" | "description" | "systemPromptAddition"> &
      Partial<Pick<CustomPersona, "photoUrl">>
  ) => Promise<void>;
  onClose: () => void;
  onDelete?: () => Promise<void>;
}

const PHOTO_MAX_PX = 256;
const PHOTO_QUALITY = 0.85;
const PHOTO_INPUT_LIMIT_BYTES = 8 * 1024 * 1024; // 원본 8MB까지만 받기

/**
 * 클라이언트에서 이미지를 정사각 256px JPEG로 줄여 dataURL로 변환.
 * Firestore 1MB 문서 제한 안에 안전하게 들어가도록 압축한다.
 */
async function compressImageToDataUrl(file: File): Promise<string> {
  if (file.size > PHOTO_INPUT_LIMIT_BYTES) {
    throw new Error("이미지 용량이 너무 커요. 8MB 이하로 올려주세요.");
  }
  const bitmap = await createImageBitmap(file);
  const size = Math.min(bitmap.width, bitmap.height);
  const sx = (bitmap.width - size) / 2;
  const sy = (bitmap.height - size) / 2;
  const canvas = document.createElement("canvas");
  canvas.width = PHOTO_MAX_PX;
  canvas.height = PHOTO_MAX_PX;
  const ctx = canvas.getContext("2d");
  if (!ctx) throw new Error("이미지 처리에 실패했어요.");
  ctx.drawImage(bitmap, sx, sy, size, size, 0, 0, PHOTO_MAX_PX, PHOTO_MAX_PX);
  return canvas.toDataURL("image/jpeg", PHOTO_QUALITY);
}

const ICON_CHOICES = ["✨", "💼", "🎨", "📚", "🧭", "🎯", "💡", "🌿", "🔮", "👨‍🏫", "👩‍⚕️", "🧙", "🦉", "🐉", "🪴", "⚔️", "🏛️", "🎭"];

const TEMPLATE_PROMPTS = [
  {
    label: "인생 멘토",
    text: "당신은 오래된 인생 멘토야. 내가 어떤 결정 앞에 있을 때 10년 앞을 보게 해주고, 감정에 휘둘리지 않도록 단단한 질문을 던져. 따뜻하지만 단호해.",
  },
  {
    label: "창업 선배",
    text: "당신은 같은 업계에서 먼저 창업해본 선배야. 낭만적인 조언은 하지 않고, 실제로 겪은 현금 흐름·파트너 갈등·제품 출시 같은 현실 문제를 짚어. 가끔 농담도 섞어서 말해.",
  },
  {
    label: "투자 자문역",
    text: "당신은 내 개인 투자 자문역이야. 종목 추천은 하지 않지만, 내가 가진 포지션에 대해 리스크·대안·타이밍을 같이 생각해줘. 숫자와 근거로 말해.",
  },
  {
    label: "회계사 아버지",
    text: "당신은 회계사인 아버지야. 말투는 무뚝뚝하지만 돈에 관한 일이라면 세심하게 봐줘. 불필요한 지출이나 세금 문제가 보이면 짧고 분명하게 지적해.",
  },
];

export default function CustomPersonaBuilder({ initial, onSave, onClose, onDelete }: CustomPersonaBuilderProps) {
  const [name, setName] = useState(initial?.name || "");
  const [icon, setIcon] = useState(initial?.icon || "✨");
  const [photoUrl, setPhotoUrl] = useState<string | undefined>(initial?.photoUrl);
  const [photoError, setPhotoError] = useState<string | null>(null);
  const [photoProcessing, setPhotoProcessing] = useState(false);
  const [description, setDescription] = useState(initial?.description || "");
  const [systemPromptAddition, setSystemPromptAddition] = useState(initial?.systemPromptAddition || "");
  const [saving, setSaving] = useState(false);
  const [confirmDelete, setConfirmDelete] = useState(false);
  const [refDocsOpen, setRefDocsOpen] = useState(false);
  const [scheduleOpen, setScheduleOpen] = useState(false);
  const [schedule, setSchedule] = useState<PersonaSchedule | null>(null);

  const { firebaseUser } = useAuth();
  const uid = firebaseUser?.uid;

  useEffect(() => {
    if (!uid || !initial?.id) {
      setSchedule(null);
      return;
    }
    const unsub = onPersonaScheduleSnapshot(uid, initial.id, (cfg) => {
      setSchedule(cfg);
    });
    return unsub;
  }, [uid, initial?.id]);

  const canSave =
    !saving &&
    name.trim().length >= 1 &&
    name.trim().length <= 20 &&
    systemPromptAddition.trim().length >= 20;

  const isDirty =
    name !== (initial?.name || "") ||
    icon !== (initial?.icon || "✨") ||
    (photoUrl || "") !== (initial?.photoUrl || "") ||
    description !== (initial?.description || "") ||
    systemPromptAddition !== (initial?.systemPromptAddition || "");

  const handlePhotoSelect = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    e.target.value = ""; // 같은 파일 재선택 허용
    if (!file) return;
    setPhotoError(null);
    setPhotoProcessing(true);
    try {
      const dataUrl = await compressImageToDataUrl(file);
      setPhotoUrl(dataUrl);
    } catch (err) {
      console.error("프로필 사진 처리 실패:", err);
      setPhotoError(err instanceof Error ? err.message : "이미지 처리에 실패했어요.");
    } finally {
      setPhotoProcessing(false);
    }
  };

  const handlePhotoRemove = () => {
    setPhotoUrl(undefined);
    setPhotoError(null);
  };

  const handleBackdropClose = () => {
    if (isDirty && !window.confirm("작성 중인 내용이 사라집니다. 닫을까요?")) return;
    onClose();
  };

  const handleSave = async () => {
    if (!canSave) return;
    setSaving(true);
    try {
      await onSave({
        name: name.trim(),
        icon,
        photoUrl: photoUrl || "",
        description: description.trim(),
        systemPromptAddition: systemPromptAddition.trim(),
      });
      onClose();
    } finally {
      setSaving(false);
    }
  };

  const handleDelete = async () => {
    if (!onDelete) return;
    setSaving(true);
    try {
      await onDelete();
      onClose();
    } finally {
      setSaving(false);
    }
  };

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4"
      onClick={handleBackdropClose}
    >
      <div
        className="max-h-[90vh] w-full max-w-lg overflow-y-auto rounded-2xl bg-white p-6 shadow-xl"
        onClick={(e) => e.stopPropagation()}
      >
        <h2 className="mb-1 text-lg font-bold text-gray-900">
          {initial ? "내 멘토 편집" : "내 멘토 만들기"}
        </h2>
        <p className="mb-5 text-xs text-gray-500">
          본인만 대화할 수 있는 전용 전문가/멘토 페르소나예요. 말투와 관점을 자유롭게 설계할 수 있어요.
        </p>

        <div className="space-y-4">
          <div>
            <label className="mb-1.5 block text-sm font-medium text-gray-700">프로필 사진 (선택)</label>
            <div className="flex items-center gap-3">
              <div className="flex h-16 w-16 shrink-0 items-center justify-center overflow-hidden rounded-full bg-[#F0EDE6] text-2xl text-[#1E1B4B]">
                {photoUrl ? (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img src={photoUrl} alt="" className="h-full w-full object-cover" />
                ) : (
                  <span aria-hidden>{icon}</span>
                )}
              </div>
              <div className="flex flex-col gap-1.5">
                <label className="inline-flex w-fit cursor-pointer items-center rounded-md border border-gray-300 bg-white px-3 py-1.5 text-xs font-medium text-gray-700 hover:bg-gray-50">
                  <input
                    type="file"
                    accept="image/*"
                    className="hidden"
                    onChange={handlePhotoSelect}
                    disabled={photoProcessing || saving}
                  />
                  {photoProcessing ? "처리 중..." : photoUrl ? "사진 변경" : "사진 올리기"}
                </label>
                {photoUrl && (
                  <button
                    type="button"
                    onClick={handlePhotoRemove}
                    disabled={photoProcessing || saving}
                    className="w-fit text-[11px] text-gray-400 hover:text-red-600 disabled:opacity-50"
                  >
                    사진 제거
                  </button>
                )}
                <p className="text-[11px] text-gray-400">
                  사진을 올리면 채팅에서 아이콘 대신 사진이 보여요. 정사각으로 256px까지 자동 축소돼요.
                </p>
                {photoError && (
                  <p className="text-[11px] text-red-600">{photoError}</p>
                )}
              </div>
            </div>
          </div>

          <div>
            <label className="mb-1.5 block text-sm font-medium text-gray-700">이름</label>
            <input
              type="text"
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="예: 민호 선배, 회계사 아버지, 나만의 코치"
              maxLength={20}
              className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm text-gray-900 placeholder-gray-400 focus:border-violet-500 focus:outline-none focus:ring-1 focus:ring-violet-500"
            />
          </div>

          <div>
            <label className="mb-1.5 block text-sm font-medium text-gray-700">
              아이콘 <span className="text-[11px] font-normal text-gray-400">(사진이 없을 때 사용)</span>
            </label>
            <div className="flex flex-wrap gap-1.5">
              {ICON_CHOICES.map((c) => (
                <button
                  key={c}
                  type="button"
                  onClick={() => setIcon(c)}
                  className={`h-9 w-9 rounded-lg border text-xl transition-colors ${
                    icon === c
                      ? "border-violet-500 bg-violet-50"
                      : "border-gray-200 hover:bg-gray-50"
                  }`}
                >
                  {c}
                </button>
              ))}
            </div>
          </div>

          <div>
            <label className="mb-1.5 block text-sm font-medium text-gray-700">
              한 줄 설명 (선택)
            </label>
            <input
              type="text"
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              placeholder="예: 창업 10년차 선배, 사업 현실 얘기"
              maxLength={60}
              className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm text-gray-900 placeholder-gray-400 focus:border-violet-500 focus:outline-none focus:ring-1 focus:ring-violet-500"
            />
          </div>

          <div>
            <div className="mb-1.5 flex items-center justify-between">
              <label className="block text-sm font-medium text-gray-700">
                페르소나 지침
              </label>
              <span className="text-[11px] text-gray-400">
                {systemPromptAddition.length}/600
              </span>
            </div>
            <textarea
              value={systemPromptAddition}
              onChange={(e) => setSystemPromptAddition(e.target.value)}
              placeholder="이 멘토가 누구인지, 어떤 전문성을 가지고, 어떤 톤으로 말하는지 자유롭게 서술해보세요. 구체적일수록 응답이 살아있어요."
              rows={6}
              maxLength={600}
              className="w-full resize-none rounded-lg border border-gray-300 px-3 py-2 text-sm text-gray-900 placeholder-gray-400 focus:border-violet-500 focus:outline-none focus:ring-1 focus:ring-violet-500"
            />
            <div className="mt-2">
              <p className="mb-1 text-[11px] text-gray-500">템플릿으로 시작:</p>
              <div className="flex flex-wrap gap-1.5">
                {TEMPLATE_PROMPTS.map((t) => (
                  <button
                    key={t.label}
                    type="button"
                    onClick={() => setSystemPromptAddition(t.text)}
                    className="rounded-full border border-gray-200 bg-gray-50 px-2.5 py-0.5 text-[11px] text-gray-600 hover:bg-gray-100"
                  >
                    {t.label}
                  </button>
                ))}
              </div>
            </div>
          </div>

          <div className="rounded-lg border border-blue-100 bg-blue-50/40 p-3">
            <div className="flex items-start justify-between gap-3">
              <div className="min-w-0">
                <p className="text-sm font-medium text-gray-800">📘 참조 문서 (Google Docs)</p>
                <p className="mt-0.5 text-[11px] text-gray-500">
                  {initial
                    ? "이 멘토가 배경지식으로 참고할 Google Docs를 연결해요. 문서 내용은 답변에 반영됩니다."
                    : "멘토를 먼저 저장한 뒤 편집 화면에서 문서를 연결할 수 있어요."}
                </p>
              </div>
              <button
                type="button"
                onClick={() => setRefDocsOpen(true)}
                disabled={!initial}
                className="shrink-0 rounded-md border border-blue-200 bg-white px-2.5 py-1 text-[11px] font-medium text-blue-700 hover:bg-blue-50 disabled:cursor-not-allowed disabled:opacity-50"
              >
                문서 관리
              </button>
            </div>
          </div>

          <div className="rounded-lg border border-violet-100 bg-violet-50/40 p-3">
            <div className="flex items-start justify-between gap-3">
              <div className="min-w-0">
                <p className="text-sm font-medium text-gray-800">📰 정시 뉴스 알림</p>
                <p className="mt-0.5 text-[11px] text-gray-500">
                  {!initial
                    ? "멘토를 먼저 저장한 뒤 편집 화면에서 정시 뉴스 알림을 설정할 수 있어요."
                    : schedule?.enabled
                      ? `켜짐 · ${schedule.scheduledTimes.map((s) => s.time).join(", ") || "시간 미설정"} · 키워드 ${schedule.keywords[0] ?? ""}${(schedule.keywords.length || 0) > 1 ? ` 외 ${schedule.keywords.length - 1}` : ""}`
                      : "꺼짐 · 클릭해서 키워드와 발송 시각을 설정하세요"}
                </p>
              </div>
              <button
                type="button"
                onClick={() => setScheduleOpen(true)}
                disabled={!initial}
                className="shrink-0 rounded-md border border-violet-200 bg-white px-2.5 py-1 text-[11px] font-medium text-violet-700 hover:bg-violet-50 disabled:cursor-not-allowed disabled:opacity-50"
              >
                알림 설정
              </button>
            </div>
          </div>
        </div>

        {confirmDelete && onDelete && (
          <div className="mt-4 rounded-lg border border-red-200 bg-red-50 p-3">
            <p className="text-sm text-red-700">이 멘토를 삭제할까요? 관련 메모리는 유지됩니다.</p>
            <div className="mt-2 flex gap-2">
              <button
                type="button"
                onClick={handleDelete}
                disabled={saving}
                className="rounded-md bg-red-600 px-3 py-1 text-xs font-medium text-white hover:bg-red-700 disabled:opacity-50"
              >
                삭제
              </button>
              <button
                type="button"
                onClick={() => setConfirmDelete(false)}
                className="rounded-md border border-gray-300 px-3 py-1 text-xs text-gray-700 hover:bg-gray-50"
              >
                취소
              </button>
            </div>
          </div>
        )}

        <div className="mt-5 flex items-center justify-between gap-2">
          {onDelete && !confirmDelete ? (
            <button
              type="button"
              onClick={() => setConfirmDelete(true)}
              className="text-xs text-gray-400 hover:text-red-600"
            >
              삭제
            </button>
          ) : (
            <span />
          )}
          <div className="flex gap-2">
            <button
              type="button"
              onClick={onClose}
              disabled={saving}
              className="rounded-lg border border-gray-300 px-4 py-2 text-sm text-gray-700 hover:bg-gray-50 disabled:opacity-50"
            >
              취소
            </button>
            <button
              type="button"
              onClick={handleSave}
              disabled={!canSave}
              className="rounded-lg bg-violet-600 px-4 py-2 text-sm font-medium text-white hover:bg-violet-700 disabled:opacity-50"
            >
              {saving ? "저장 중..." : initial ? "수정 저장" : "멘토 만들기"}
            </button>
          </div>
        </div>
      </div>

      {refDocsOpen && initial && (
        <PersonaRefDocsModal
          personaId={initial.id}
          personaName={name || initial.name}
          personaIcon={icon || initial.icon}
          onClose={() => setRefDocsOpen(false)}
        />
      )}

      {scheduleOpen && initial && (
        <PersonaScheduleModal
          personaId={initial.id}
          personaName={name || initial.name}
          personaIcon={icon || initial.icon}
          onClose={() => setScheduleOpen(false)}
        />
      )}
    </div>
  );
}
