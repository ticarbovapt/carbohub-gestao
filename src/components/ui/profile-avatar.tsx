interface ProfileAvatarProps {
  avatarUrl?: string | null;
  fullName?: string | null;
  userId: string;
  size?: number;       // px — default 36
  square?: boolean;    // rounded-xl instead of rounded-full
  className?: string;
}

// DiceBear fun-emoji as illustrated fallback avatar (consistent per userId seed)
function diceBearUrl(seed: string) {
  return `https://api.dicebear.com/7.x/fun-emoji/svg?seed=${encodeURIComponent(seed)}&radius=0`;
}

export function ProfileAvatar({
  avatarUrl,
  fullName,
  userId,
  size = 36,
  square = false,
  className = "",
}: ProfileAvatarProps) {
  const shape = square ? "rounded-xl" : "rounded-full";
  const src   = avatarUrl || diceBearUrl(userId);

  return (
    <div
      className={`overflow-hidden bg-muted shrink-0 ${shape} ${className}`}
      style={{ width: size, height: size, minWidth: size }}
    >
      <img
        src={src}
        alt={fullName || "avatar"}
        className="w-full h-full object-cover"
      />
    </div>
  );
}
