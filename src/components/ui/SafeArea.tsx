import React from "react";

type SafeAreaEdge = "top" | "bottom" | "left" | "right";
export type SafeAreaInset = SafeAreaEdge | "vertical" | "horizontal" | "all";

interface SafeAreaProps {
  children: React.ReactNode;
  /**
   * Sisi mana yang diberi padding safe-area.
   * - "top"     : padding-top: env(safe-area-inset-top)
   * - "bottom"  : padding-bottom: env(safe-area-inset-bottom)
   * - "vertical": padding-top + padding-bottom
   * - "horizontal": padding-left + padding-right
   * - "all"     : keempat sisi
   * Default: "bottom" (paling sering dipakai untuk tab bar / sheet)
   */
  inset?: SafeAreaInset;
  /**
   * Base padding tambahan (px) yang ditambahkan ke nilai safe-area.
   * Misal: `basePadding={16}` → `env(safe-area-inset-bottom) + 16px`
   * berguna untuk memberi jarak visual di atas safe area.
   */
  basePadding?: number;
  /**
   * Class Tailwind tambahan.
   */
  className?: string;
  as?: "div" | "section" | "nav" | "header" | "footer";
}

const insetMap: Record<SafeAreaInset, string[]> = {
  top: ["top"],
  bottom: ["bottom"],
  left: ["left"],
  right: ["right"],
  vertical: ["top", "bottom"],
  horizontal: ["left", "right"],
  all: ["top", "bottom", "left", "right"],
};

const cssVarName: Record<string, string> = {
  top: "env(safe-area-inset-top)",
  bottom: "env(safe-area-inset-bottom)",
  left: "env(safe-area-inset-left)",
  right: "env(safe-area-inset-right)",
};

/**
 * Wrapper yang memberikan padding safe-area konsisten.
 *
 * Sebelumnya `env(safe-area-inset-bottom)` dipakai inline di beberapa
 * komponen (MobileBottomNav, Sidebar) dengan nilai yang berbeda-beda.
 * Komponen ini memastikan safe-area handling seragam di seluruh app.
 *
 * Contoh:
 *   <SafeArea inset="bottom" basePadding={16}>
 *     <div>konten</div>
 *   </SafeArea>
 *
 *   <SafeArea inset="vertical" basePadding={12}>
 *     <div>konten dengan safe top & bottom</div>
 *   </SafeArea>
 */
export const SafeArea: React.FC<SafeAreaProps> = ({
  children,
  inset = "bottom",
  basePadding = 0,
  className = "",
  as: Tag = "div",
}) => {
  const edges = insetMap[inset];
  const style: React.CSSProperties = {};

  for (const edge of edges) {
    const envVar = cssVarName[edge];
    const cssProperty = `padding-${edge}` as const;

    if (basePadding > 0) {
      // env() + basePadding via calc()
      style[cssProperty] = `calc(${envVar} + ${basePadding}px)`;
    } else {
      style[cssProperty] = envVar;
    }
  }

  return (
    <Tag style={style} className={className}>
      {children}
    </Tag>
  );
};
