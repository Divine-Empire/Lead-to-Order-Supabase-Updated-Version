import React, { useState, useRef } from 'react';

const DragScrollTable = ({ children, className = "" }) => {
  const [isDragging, setIsDragging] = useState(false);
  const [startX, setStartX] = useState(0);
  const [scrollLeft, setScrollLeft] = useState(0);
  const containerRef = useRef(null);

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
      onMouseDown={(e) => {
        if (window.matchMedia("(pointer: coarse)").matches) return;
        handleMouseDown(e);
      }}
      onMouseLeave={handleMouseLeave}
      onMouseUp={handleMouseUp}
      onMouseMove={handleMouseMove}
      className={`overflow-x-auto overflow-y-auto flex-1 min-h-0 scrollbar-hide ${isDragging ? 'cursor-grabbing select-none' : 'cursor-grab'} ${className}`}
      style={{ WebkitOverflowScrolling: 'touch' }}
    >
      {children}
    </div>
  );
};

export default DragScrollTable;
