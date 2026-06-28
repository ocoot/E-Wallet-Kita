import React, { useRef, useState, useCallback } from "react";

interface ScrollableTableWrapperProps {
  children: React.ReactNode;
  className?: string;
}

/**
 * Wraps a wide table in a horizontally-scrollable container and shows a
 * subtle gradient mask on the trailing edge whenever there's more content
 * to scroll to — the same affordance used in HistoryTable, now shared so
 * every data table (including admin tables) gives a consistent visual cue
 * on tablet/mobile widths instead of silently clipping columns.
 */
export const ScrollableTableWrapper: React.FC<ScrollableTableWrapperProps> = ({
  children,
  className = "",
}) => {
  const scrollRef = useRef<HTMLDivElement>(null);
  const [scrollState, setScrollState] = useState<"at-start" | "middle" | "at-end">("at-start");

  const onScroll = useCallback(() => {
    const el = scrollRef.current;
    if (!el) return;
    const isAtStart = el.scrollLeft <= 4;
    const isAtEnd = el.scrollLeft + el.clientWidth >= el.scrollWidth - 4;
    if (isAtStart && !isAtEnd) setScrollState("at-start");
    else if (isAtEnd) setScrollState("at-end");
    else setScrollState("middle");
  }, []);

  return (
    <div
      ref={scrollRef}
      onScroll={onScroll}
      className={`overflow-x-auto ${scrollState === "at-start" ? "" : "scroll-mask-x"} ${
        scrollState === "at-end" ? "scrolled-end" : ""
      } ${className}`}
    >
      {children}
    </div>
  );
};
