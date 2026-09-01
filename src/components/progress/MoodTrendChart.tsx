"use client";

import { useState } from "react";
import { SCORE_MAX, SCORE_MIN, describeTrend, type TrendPoint } from "@/lib/mood-trend";

/**
 * Biểu đồ xu hướng cảm xúc tự báo cáo.
 *
 * MỘT chuỗi dữ liệu, đổi theo thời gian → biểu đồ đường, không cần chú giải
 * (tiêu đề đã gọi tên chuỗi).
 *
 * Về màu: bảng màu ExamCalm cố tình nhạt cho một ứng dụng về lo âu, nên
 * validator của skill dataviz chấm gần hết các màu thương hiệu là "đọc ra
 * xám" theo ngưỡng sắc độ. Ngưỡng đó dùng để phân biệt NHIỀU chuỗi với nhau —
 * chính skill ghi "scope: categorical palettes only". Ở đây một chuỗi nên tiêu
 * chí đúng là tương phản với nền, và aqua-600 đạt ≥3:1 (đã chạy validator),
 * đồng thời khớp mockup guideline trang 16.
 *
 * Nhãn trục nằm NGOÀI thẻ <svg>, dựng bằng HTML. Đặt bằng <text> bên trong thì
 * chữ phóng to thu nhỏ theo viewBox: ở desktop viewBox 640 render ra ~1100px
 * nên chữ 11px thành ~19px, còn ở mobile lại co xuống dưới mức đọc được.
 */
const LINE = "var(--ec-aqua-600)";

const W = 640;
const H = 180;

const dateFormatter = new Intl.DateTimeFormat("vi-VN", { day: "2-digit", month: "2-digit" });

function cungNgay(a: Date, b: Date): boolean {
  return a.toDateString() === b.toDateString();
}

export function MoodTrendChart({ points }: { points: TrendPoint[] }) {
  const [hover, setHover] = useState<number | null>(null);

  if (points.length === 0) {
    return (
      <p className="rounded-[var(--ec-radius-md)] bg-subtle px-5 py-6 text-body">
        Chưa có lần ghi nhận nào trong khoảng này. Ghi một lần ở trang Nhật ký cảm xúc để
        bắt đầu.
      </p>
    );
  }

  // Một điểm duy nhất thì đặt giữa khung thay vì chia cho 0.
  const x = (i: number) => (points.length === 1 ? W / 2 : (i / (points.length - 1)) * W);
  // Trục y CỐ ĐỊNH 1-10 (xem SCORE_MIN/SCORE_MAX): tự co giãn sẽ biến một thay
  // đổi 6→7 thành cú vọt gần hết khung.
  const y = (score: number) => H - ((score - SCORE_MIN) / (SCORE_MAX - SCORE_MIN)) * H;

  const path = points.map((p, i) => `${i === 0 ? "M" : "L"} ${x(i)} ${y(p.score)}`).join(" ");
  const nhanXet = describeTrend(points);
  const diem = hover !== null ? points[hover] : undefined;
  const dau = points[0]!;
  const cuoi = points[points.length - 1]!;

  return (
    <div>
      <div className="flex gap-2">
        {/* Nhãn trục y neo TUYỆT ĐỐI theo đúng toạ độ y() của từng đường lưới.
            Xếp bằng justify-between thì chiều cao dòng chữ đẩy nhãn ở hai đầu
            lệch khỏi đường của nó — nhìn ra ngay ở mốc 10 và mốc 1. */}
        <div className="relative w-5 shrink-0" style={{ height: 180 }} aria-hidden>
          {[SCORE_MAX, 5, SCORE_MIN].map((s) => (
            <span
              key={s}
              className="absolute right-0 text-xs text-muted"
              style={{ top: y(s), transform: "translateY(-50%)" }}
            >
              {s}
            </span>
          ))}
        </div>

        <div className="min-w-0 flex-1">
          <svg
            viewBox={`0 0 ${W} ${H}`}
            preserveAspectRatio="none"
            style={{ height: 180 }}
            className="w-full"
            role="img"
            aria-label={`Biểu đồ điểm cảm xúc tự ghi nhận qua ${points.length} lần. Xem bảng số liệu bên dưới để biết chi tiết.`}
          >
            {[SCORE_MIN, 5, SCORE_MAX].map((s) => (
              <line
                key={s}
                x1={0} x2={W} y1={y(s)} y2={y(s)}
                stroke="var(--ec-border-default)"
                strokeWidth={1}
                vectorEffect="non-scaling-stroke"
              />
            ))}

            {/* non-scaling-stroke giữ nét đúng 2px ở mọi bề rộng; thiếu nó thì
                preserveAspectRatio="none" sẽ kéo nét dày ra theo chiều ngang. */}
            <path
              d={path} fill="none" stroke={LINE} strokeWidth={2}
              strokeLinecap="round" strokeLinejoin="round"
              vectorEffect="non-scaling-stroke"
            />

            {hover !== null && (
              <line
                x1={x(hover)} x2={x(hover)} y1={0} y2={H}
                stroke="var(--ec-border-strong)" strokeWidth={1}
                strokeDasharray="3 3" vectorEffect="non-scaling-stroke"
              />
            )}

            {/* Vùng bắt chuột rộng hơn hẳn marker để dễ trỏ trúng. */}
            {points.map((p, i) => (
              <rect
                key={`hit-${i}`}
                x={x(i) - W / Math.max(points.length, 2) / 2}
                y={0}
                width={W / Math.max(points.length, 2)}
                height={H}
                fill="transparent"
                onMouseEnter={() => setHover(i)}
                onMouseLeave={() => setHover(null)}
              />
            ))}
          </svg>

          {/* Marker vẽ bằng HTML chồng lên: hình tròn trong SVG bị
              preserveAspectRatio="none" kéo thành hình bầu dục. */}
          <div className="relative" style={{ height: 0 }}>
            {points.map((p, i) => (
              <span
                key={`dot-${i}`}
                aria-hidden
                className="absolute block rounded-full ring-2 ring-[var(--ec-bg-surface)]"
                style={{
                  left: `${(x(i) / W) * 100}%`,
                  top: y(p.score) - 180,
                  width: hover === i ? 12 : 9,
                  height: hover === i ? 12 : 9,
                  marginLeft: hover === i ? -6 : -4.5,
                  marginTop: hover === i ? -6 : -4.5,
                  background: LINE,
                }}
              />
            ))}
          </div>

          <div className="mt-2 flex justify-between text-xs text-muted">
            <span>{dateFormatter.format(dau.date)}</span>
            {/* Cùng một ngày thì chỉ hiện một nhãn — hai nhãn giống hệt nhau ở
                hai đầu trông như lỗi hiển thị. */}
            {points.length > 1 && !cungNgay(dau.date, cuoi.date) && (
              <span>{dateFormatter.format(cuoi.date)}</span>
            )}
          </div>
        </div>
      </div>

      {diem && (
        <p role="status" className="mt-2 text-sm text-body">
          {dateFormatter.format(diem.date)} · {diem.score}/{SCORE_MAX}
        </p>
      )}

      {nhanXet && <p className="mt-3 text-body">{nhanXet}</p>}

      {/* Bảng số liệu: bắt buộc theo bước 6 của quy trình dataviz, và cũng là
          đường đọc duy nhất cho người dùng trình đọc màn hình. */}
      <details className="mt-3">
        <summary className="cursor-pointer text-sm text-link underline">Xem dạng bảng</summary>
        <table className="mt-2 w-full text-sm">
          <caption className="sr-only">Điểm cảm xúc tự ghi nhận theo từng lần</caption>
          <thead>
            <tr>
              <th scope="col" className="py-1 text-left font-medium text-muted">Ngày</th>
              <th scope="col" className="py-1 text-left font-medium text-muted">Điểm</th>
            </tr>
          </thead>
          <tbody>
            {points.map((p, i) => (
              <tr key={i} className="border-t border-line">
                <td className="py-1 text-body">{dateFormatter.format(p.date)}</td>
                <td className="py-1 text-body">{p.score}/{SCORE_MAX}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </details>
    </div>
  );
}
