import { useState, useRef, type ReactNode, type TouchEvent as ReactTouchEvent, type MouseEvent as ReactMouseEvent } from "react";
import { RefreshCwIcon } from "../icons.js";

interface PullToRefreshProps {
  onRefresh: () => void;
  isRefreshing?: boolean;
  children: ReactNode;
}

export function PullToRefresh({ onRefresh, isRefreshing = false, children }: PullToRefreshProps) {
  const [pullDistance, setPullDistance] = useState(0);
  const [isDragging, setIsDragging] = useState(false);
  const startYRef = useRef(0);
  const containerRef = useRef<HTMLDivElement>(null);
  const threshold = 80;
  const maxDistance = 120;

  const handleTouchStart = (e: ReactTouchEvent) => {
    if (isRefreshing) return;
    const container = containerRef.current;
    if (!container) return;
    
    const scrollTop = container.scrollTop;
    if (scrollTop === 0) {
      startYRef.current = e.touches[0].clientY;
      setIsDragging(true);
    }
  };

  const handleTouchMove = (e: ReactTouchEvent) => {
    if (!isDragging || isRefreshing) return;
    
    const currentY = e.touches[0].clientY;
    const diff = currentY - startYRef.current;
    
    if (diff > 0) {
      const distance = Math.min(diff * 0.5, maxDistance);
      setPullDistance(distance);
    }
  };

  const handleTouchEnd = () => {
    if (!isDragging || isRefreshing) return;
    setIsDragging(false);
    
    if (pullDistance >= threshold) {
      onRefresh();
    }
    setPullDistance(0);
  };

  const handleMouseDown = (e: React.MouseEvent) => {
    if (isRefreshing) return;
    const container = containerRef.current;
    if (!container) return;
    
    const scrollTop = container.scrollTop;
    if (scrollTop === 0) {
      startYRef.current = e.clientY;
      setIsDragging(true);
    }
  };

  const handleMouseMove = (e: ReactMouseEvent) => {
    if (!isDragging || isRefreshing) return;
    
    const currentY = e.clientY;
    const diff = currentY - startYRef.current;
    
    if (diff > 0) {
      const distance = Math.min(diff * 0.5, maxDistance);
      setPullDistance(distance);
    }
  };

  const handleMouseUp = () => {
    if (!isDragging || isRefreshing) return;
    setIsDragging(false);
    
    if (pullDistance >= threshold) {
      onRefresh();
    }
    setPullDistance(0);
  };

  const progress = Math.min(pullDistance / threshold, 1);
  const isReady = pullDistance >= threshold;

  return (
    <div
      ref={containerRef}
      className="pull-to-refresh-container"
      onTouchStart={handleTouchStart}
      onTouchMove={handleTouchMove}
      onTouchEnd={handleTouchEnd}
      onMouseDown={handleMouseDown}
      onMouseMove={isDragging ? handleMouseMove : undefined}
      onMouseUp={handleMouseUp}
      onMouseLeave={handleMouseUp}
    >
      <div 
        className={`pull-to-refresh-indicator ${isReady ? "ready" : ""} ${isRefreshing ? "refreshing" : ""}`}
        style={{ transform: isRefreshing ? "translateY(0)" : `translateY(${pullDistance - 60}px)` }}
      >
        <RefreshCwIcon 
          size={20} 
          className={`pull-to-refresh-icon ${isRefreshing ? "spinning" : ""}`} 
        />
        <span className="pull-to-refresh-text">
          {isRefreshing ? "Refreshing..." : (isReady ? "Release to refresh" : "Pull down to refresh")}
        </span>
      </div>
      {children}
    </div>
  );
}