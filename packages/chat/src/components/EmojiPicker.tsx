// Seletor de emoji leve (sem dependência): grade rolável de emojis comuns.
const EMOJIS = [
  "😀","😃","😄","😁","😆","😅","🤣","😂","🙂","🙃","😉","😊","😇","🥰","😍","🤩",
  "😘","😗","😚","😙","😋","😛","😜","🤪","😝","🤗","🤭","🤫","🤔","😐","😑","😶",
  "😏","😒","🙄","😬","😌","😔","😪","🤤","😴","😷","🤒","🤕","🥵","🥶","😵","🤯",
  "🤠","🥳","😎","🤓","🧐","😕","😟","🙁","😮","😯","😲","😳","🥺","😦","😧","😨",
  "😰","😢","😭","😱","😖","😞","😓","😩","😫","🥱","😤","😡","😠","🤬","😈","💀",
  "👍","👎","👌","🤌","🤏","✌️","🤞","🤟","🤘","🤙","👈","👉","👆","👇","☝️","✋",
  "🤚","🖐️","🖖","👋","🤝","🙏","💪","👏","🙌","👐","🤲","🫶","👀","🫡","🫠","🤝",
  "❤️","🧡","💛","💚","💙","💜","🖤","🤍","🤎","💔","❣️","💕","💞","💓","💗","💖",
  "💘","💝","✨","⭐","🌟","🔥","💯","✅","❌","⚠️","🎉","🎊","🎁","🎯","📌","🔔",
];

export function EmojiPicker({ onPick, onClose }: { onPick: (emoji: string) => void; onClose: () => void }) {
  return (
    <>
      <div className="fixed inset-0 z-30" onClick={onClose} />
      <div className="absolute bottom-full left-2 z-40 mb-2 w-72 rounded-xl border bg-popover p-2 shadow-lg">
        <div className="grid max-h-56 grid-cols-8 gap-0.5 overflow-y-auto">
          {EMOJIS.map((e, i) => (
            <button key={i} onClick={() => onPick(e)} type="button"
              className="rounded-md p-1 text-xl leading-none hover:bg-muted">{e}</button>
          ))}
        </div>
      </div>
    </>
  );
}
