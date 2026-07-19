import React from "react";
import { motion, AnimatePresence } from "motion/react";
import { useThemeTokens } from "../hooks/useThemeTokens";

const EMOJI_GROUPS: { label: string; items: string[] }[] = [
  {
    label: "Frequently used",
    items: ["😊", "😂", "❤️", "👍", "🔥", "😍", "🎉", "🙏", "💀", "😭", "✨", "🥺", "😅", "🤣", "💯", "😎"],
  },
  {
    label: "Smileys",
    items: ["😀", "😃", "😄", "😁", "😆", "😅", "🤣", "😂", "🙂", "😉", "😊", "😇", "🥰", "😍", "🤩", "😘", "😗", "😚", "😙", "🥲", "😋", "😛", "😜", "🤪", "😝", "🤑", "🤗", "🤭", "🫢", "🫣", "🤫", "🤔", "🫡", "🤐", "🤨", "😐", "😑", "😶", "🫥", "😏", "😒", "🙄", "😬", "😮‍💨", "🤥", "😌", "😔", "😪", "🤤", "😴", "😷", "🤒", "🤕", "🤢", "🤮", "🥴", "😵", "🤯", "🤠", "🥳", "🥸", "😎"],
  },
  {
    label: "Gestures & People",
    items: ["👍", "👎", "👊", "✊", "🤛", "🤜", "👏", "🙌", "👐", "🤲", "🤝", "🙏", "✍️", "💅", "🤳", "💪", "🦵", "🦶", "👂", "👃", "🧠", "🫀", "🫁", "👀", "👁️", "👅", "👄", "💋", "🫶"],
  },
  {
    label: "Objects",
    items: ["❤️", "🧡", "💛", "💚", "💙", "💜", "🖤", "🤍", "🤎", "💔", "❣️", "💕", "💞", "💓", "💗", "💖", "💘", "💝", "💟", "♥️", "💌", "💐", "🌸", "💮", "🏵️", "🌹", "🥀", "🌺", "🌻", "🌼", "🌷", "🌱", "🪴", "🌿", "☘️", "🍀", "🎁", "🎀", "🪄", "🔮", "💎", "🎯", "🏆", "🥇", "🥈", "🥉", "⚽", "🏀", "🏈", "🎮", "🎸", "🎵", "🎶", "🎤", "🎧", "📱", "💻", "⌚", "📸", "🔒", "🔓", "🔑", "🗝️", "🔔", "📌", "📍"],
  },
];

interface EmojiPickerProps {
  isOpen: boolean;
  onClose: () => void;
  onEmojiSelect: (emoji: string) => void;
}

export const EmojiPicker: React.FC<EmojiPickerProps> = ({ isOpen, onClose, onEmojiSelect }) => {
  const { cx, tokens } = useThemeTokens();

  return (
    <AnimatePresence>
      {isOpen && (
        <>
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="fixed inset-0 z-[45]"
            onClick={onClose}
          />
          <motion.div
            initial={{ opacity: 0, y: 12, scale: 0.95 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, y: 12, scale: 0.95 }}
            transition={{ type: "spring", damping: 25, stiffness: 300 }}
            className={cx(
              "absolute bottom-full left-0 right-0 mb-2 mx-2 z-50 rounded-2xl border shadow-2xl overflow-hidden",
              tokens.surface.card,
              tokens.border.accent
            )}
          >
            <div className="max-h-[260px] overflow-y-auto p-3 space-y-2">
              {EMOJI_GROUPS.map((group) => (
                <div key={group.label}>
                  <p className={cx("text-[10px] font-semibold uppercase tracking-wider mb-1", tokens.text.muted)}>
                    {group.label}
                  </p>
                  <div className="flex flex-wrap gap-1">
                    {group.items.map((emoji) => (
                      <button
                        key={emoji}
                        type="button"
                        onClick={() => {
                          onEmojiSelect(emoji);
                          onClose();
                        }}
                        className={cx("w-9 h-9 flex items-center justify-center text-lg rounded-lg transition-colors duration-150 cursor-pointer", tokens.hover.hoverSubtle)}
                      >
                        {emoji}
                      </button>
                    ))}
                  </div>
                </div>
              ))}
            </div>
          </motion.div>
        </>
      )}
    </AnimatePresence>
  );
};
