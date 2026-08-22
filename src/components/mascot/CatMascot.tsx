type Expression = "calm" | "cheer" | "listen";

type Props = {
  expression?: Expression;
  size?: number;
  className?: string;
};

const EAR_TILT: Record<Expression, number> = { calm: 0, cheer: -8, listen: 6 };

/**
 * Mascot placeholder. Tên và visual identity chính thức là TBD (spec §12).
 * Thay asset thật CHỈ cần sửa file này.
 */
export function CatMascot({ expression = "calm", size = 72, className }: Props) {
  return (
    <svg
      width={size} height={size} viewBox="0 0 100 100"
      role="img" aria-label="Mèo đồng hành của ExamCalm"
      className={className}
    >
      <g transform={`rotate(${EAR_TILT[expression]} 50 50)`}>
        <path d="M22 34 L30 12 L46 26 Z" fill="#f6c9a8" />
        <path d="M78 34 L70 12 L54 26 Z" fill="#f6c9a8" />
      </g>
      <circle cx="50" cy="56" r="30" fill="#fbe0cd" />
      <circle cx="39" cy="52" r="4" fill="#3f3a36" />
      <circle cx="61" cy="52" r="4" fill="#3f3a36" />
      <path d="M44 64 Q50 70 56 64" stroke="#3f3a36" strokeWidth="3" fill="none" strokeLinecap="round" />
      <path d="M18 56 H32 M18 62 H32 M68 56 H82 M68 62 H82" stroke="#d9b49b" strokeWidth="2" strokeLinecap="round" />
    </svg>
  );
}
