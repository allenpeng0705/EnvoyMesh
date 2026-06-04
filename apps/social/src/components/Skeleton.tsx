interface SkeletonProps {
  className?: string;
}

export function Skeleton({ className = "" }: SkeletonProps) {
  return (
    <div className={`skeleton ${className}`} />
  );
}

interface SkeletonAvatarProps {
  size?: "sm" | "md" | "lg";
  className?: string;
}

export function SkeletonAvatar({ size = "md", className = "" }: SkeletonAvatarProps) {
  const sizeClasses = {
    sm: "skeleton-avatar--sm",
    md: "skeleton-avatar--md",
    lg: "skeleton-avatar--lg",
  };
  
  return (
    <div className={`skeleton skeleton-avatar ${sizeClasses[size]} ${className}`} />
  );
}

interface SkeletonTextProps {
  lines?: number;
  className?: string;
}

export function SkeletonText({ lines = 3, className = "" }: SkeletonTextProps) {
  return (
    <div className={`skeleton-text ${className}`}>
      {Array.from({ length: lines }).map((_, i) => (
        <div key={i} className="skeleton skeleton-text-line" />
      ))}
    </div>
  );
}

interface SkeletonRowProps {
  className?: string;
}

export function SkeletonRow({ className = "" }: SkeletonRowProps) {
  return (
    <div className={`skeleton-row ${className}`}>
      <SkeletonAvatar size="md" />
      <div className="skeleton-row__content">
        <SkeletonText lines={2} />
      </div>
    </div>
  );
}