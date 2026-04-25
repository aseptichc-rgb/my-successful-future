import Image from "next/image";

type Variant = "mark" | "mark-2ring" | "mark-3ring" | "lockup";
type Tone = "light" | "dark";

interface LogoProps {
  variant?: Variant;
  tone?: Tone;
  size?: number; // 정사각형 마크의 한 변(px). lockup은 height(px).
  className?: string;
  priority?: boolean;
  alt?: string;
}

const SRC: Record<`${Variant}-${Tone}`, string> = {
  "mark-light": "/icons/anima-mark-light.svg",
  "mark-dark": "/icons/anima-mark-dark.svg",
  "mark-2ring-light": "/icons/anima-mark-2ring.svg",
  "mark-2ring-dark": "/icons/anima-mark-dark.svg",
  "mark-3ring-light": "/icons/anima-mark-3ring.svg",
  "mark-3ring-dark": "/icons/anima-mark-dark.svg",
  "lockup-light": "/icons/anima-lockup-light.svg",
  "lockup-dark": "/icons/anima-lockup-dark.svg",
};

export default function Logo({
  variant = "mark",
  tone = "light",
  size = 32,
  className,
  priority,
  alt = "Anima",
}: LogoProps) {
  const src = SRC[`${variant}-${tone}` as keyof typeof SRC];
  const isLockup = variant === "lockup";
  // 락업 비율 100:30 → width = height * (10/3)
  const width = isLockup ? Math.round((size * 10) / 3) : size;
  const height = size;
  return (
    <Image
      src={src}
      width={width}
      height={height}
      alt={alt}
      className={className}
      priority={priority}
    />
  );
}
