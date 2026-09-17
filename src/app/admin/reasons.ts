/**
 * 未対応キューに積まれた理由の表示定義。
 * 担当者が次に取るべき行動は理由ごとに違うので、ラベルもその行動で書く。
 */
export const REASON: Record<
  string,
  { label: string; hint: string; tone: "amber" | "blue" | "red" }
> = {
  no_evidence: {
    label: "FAQの情報が不足",
    hint: "近いFAQはあるが、この質問に答えるだけの記述がない。下のFAQに追記すれば、次回からは自動で答えられる。",
    tone: "amber",
  },
  no_candidate: {
    label: "該当するFAQが無い",
    hint: "守備範囲外の質問。答えるべき内容なら、FAQを新規に作る必要がある。",
    tone: "blue",
  },
  error: {
    label: "障害で判定できず",
    hint: "埋め込み・LLM・DBのいずれかが落ちていた。内容自体は自動で答えられた可能性がある。",
    tone: "red",
  },
};

export const REASON_ORDER = ["no_evidence", "no_candidate", "error"] as const;

// デモ画面（/）と同じ暖色系のトーンにそろえたうえで、
// 理由ごとの色の差だけは残す。担当者は色で仕分けるため。
export const TONE_CLASS: Record<string, string> = {
  amber: "bg-[#FBEFE3] text-[#9A6234] ring-[#EEDCC6]",
  blue: "bg-[#E8F0ED] text-[#3A7D6E] ring-[#CFE1DB]",
  red: "bg-[#FBE9E6] text-[#9A4A3F] ring-[#EED2CC]",
  gray: "bg-[#F2F1EE] text-[#6B6B6B] ring-[#E5E3DF]",
};

export function reasonBadgeClass(reason: string | null): string {
  const tone = reason ? REASON[reason]?.tone : undefined;
  return TONE_CLASS[tone ?? "gray"];
}

export function reasonLabel(reason: string | null): string {
  return (reason && REASON[reason]?.label) || "理由の記録なし";
}
