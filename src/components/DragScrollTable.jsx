import React, { useState, useRef } from 'react';

/**
 * Horizontally/vertically scrolling container with mouse drag-to-scroll on desktop.
 * Drag-to-scroll only starts from the header row (or empty space around the table,
 * or with Alt held), so text in the body cells stays selectable with a normal
 * text cursor. It is keyboard focusable (arrow keys scroll) and announced as a labelled region.
 */
const DragScrollTable = ({ children, className = "", ariaLabel = "Scrollable table" }) => {
  const [isDragging, setIsDragging] = useState(false);
  const [startX, setStartX] = useState(0);
  const [scrollLeft, setScrollLeft] = useState(0);
  const containerRef = useRef(null);

  // Where a drag may start: thead / empty space, never on body text or controls.
  const canStartDrag = (e) => {
    if (e.button !== 0) return false;
    if (e.altKey) return true;
    const target = e.target;
    if (!(target instanceof Element)) return false;
    if (target.closest("a, button, input, select, textarea, label")) return false;
    return target === containerRef.current || !!target.closest("thead");
  };

  const handleMouseDown = (e) => {
    setIsDragging(true);
    // pageX is the mouse position relative to the left edge of the document
    // offsetLeft is the container position relative to its offset parent
    setStartX(e.pageX - containerRef.current.offsetLeft);
    setScrollLeft(containerRef.current.scrollLeft);
  };

  const handleMouseLeave = () => {
    setIsDragging(false);
  };

  const handleMouseUp = () => {
    setIsDragging(false);
  };

  const handleMouseMove = (e) => {
    if (!isDragging) return;

    // Only prevent default if we are actually dragging a significant amount
    // and not trying to scroll vertically. However, on mobile, native scroll is better.
    // So we'll check if it's a touch-capable device and avoid interfering.
    if (window.matchMedia("(pointer: coarse)").matches) return;

    e.preventDefault();
    const x = e.pageX - containerRef.current.offsetLeft;
    const walk = (x - startX) * 2;
    containerRef.current.scrollLeft = scrollLeft - walk;
  };

  return (
    <div
      ref={containerRef}
      role="region"
      aria-label={ariaLabel}
      tabIndex={0}
      onMouseDown={(e) => {
        if (window.matchMedia("(pointer: coarse)").matches) return;
        if (!canStartDrag(e)) return;
        handleMouseDown(e);
      }}
      onMouseLeave={handleMouseLeave}
      onMouseUp={handleMouseUp}
      onMouseMove={handleMouseMove}
      className={`overflow-x-auto overflow-y-auto flex-1 min-h-0 scrollbar-hide ${isDragging ? 'cursor-grabbing select-none' : '[&_thead]:cursor-grab'} ${className}`}
      style={{ WebkitOverflowScrolling: 'touch' }}
    >
      {children}
    </div>
  );
};

export default DragScrollTable;
