import { useState, useRef, useCallback, useEffect } from "react";

interface SwipeBackProps {
  onSwipeBack: () => void;
  children: React.ReactNode;
  threshold?: number;
  edgeThreshold?: number;
}

export function SwipeBack({ 
  onSwipeBack, 
  children, 
  threshold = 100,
  edgeThreshold = 50 
}: SwipeBackProps) {
  const [isSwiping, setIsSwiping] = useState(false);
  const [swipeProgress, setSwipeProgress] = useState(0);
  const startXRef = useRef(0);
  const containerRef = useRef<HTMLDivElement>(null);

  const handleTouchStart = useCallback((e: TouchEvent) => {
    const touch = e.touches[0];
    if (touch.clientX <= edgeThreshold) {
      startXRef.current = touch.clientX;
      setIsSwiping(true);
    }
  }, [edgeThreshold]);

  const handleTouchMove = useCallback((e: TouchEvent) => {
    if (!isSwiping) return;
    
    const touch = e.touches[0];
    const deltaX = touch.clientX - startXRef.current;
    
    if (deltaX > 0) {
      const progress = Math.min(deltaX / threshold, 1);
      setSwipeProgress(progress);
    }
  }, [isSwiping, threshold]);

  const handleTouchEnd = useCallback(() => {
    if (isSwiping && swipeProgress >= 0.5) {
      onSwipeBack();
    }
    setIsSwiping(false);
    setSwipeProgress(0);
  }, [isSwiping, swipeProgress, onSwipeBack]);

  useEffect(() => {
    const container = containerRef.current;
    if (!container) return;

    container.addEventListener("touchstart", handleTouchStart, { passive: true });
    container.addEventListener("touchmove", handleTouchMove, { passive: true });
    container.addEventListener("touchend", handleTouchEnd, { passive: true });

    return () => {
      container.removeEventListener("touchstart", handleTouchStart);
      container.removeEventListener("touchmove", handleTouchMove);
      container.removeEventListener("touchend", handleTouchEnd);
    };
  }, [handleTouchStart, handleTouchMove, handleTouchEnd]);

  return (
    <div ref={containerRef} className="swipe-back-container">
      <div 
        className={`swipe-back-indicator ${isSwiping ? "active" : ""}`}
        style={{ transform: `translateX(${swipeProgress * 100}%)` }}
      />
      {children}
    </div>
  );
}