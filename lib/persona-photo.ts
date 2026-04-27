// 페르소나 프로필 사진 유틸 — 클라이언트에서 이미지를 정사각 256px JPEG dataURL로 압축.
// Firestore 1MB 문서 제한 안에 안전하게 들어가도록 한다.

const PHOTO_MAX_PX = 256;
const PHOTO_QUALITY = 0.85;
const PHOTO_INPUT_LIMIT_BYTES = 8 * 1024 * 1024; // 원본 8MB까지만 받기

export async function compressPersonaPhoto(file: File): Promise<string> {
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
