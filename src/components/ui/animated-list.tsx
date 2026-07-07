import { useEffect, useState } from "react";

interface AnimatedListProps {
  children: React.ReactNode;
  className?: string;
}

export function AnimatedList({ children, className }: AnimatedListProps) {
  return (
    <div className={className}>
      {children}
    </div>
  );
}

interface AnimatedListItemProps {
  children: React.ReactNode;
  index: number;
  className?: string;
}

export function AnimatedListItem({ children, index, className }: AnimatedListItemProps) {
  const [isVisible, setIsVisible] = useState(false);

  useEffect(() => {
    const timer = setTimeout(() => {
      setIsVisible(true);
    }, index * 50);

    return () => clearTimeout(timer);
  }, [index]);

  return (
    <div
      className={`transition-all duration-300 ease-out transform ${
        isVisible
          ? "opacity-100 translate-x-0"
          : "opacity-0 -translate-x-4"
      } ${className}`}
    >
      {children}
    </div>
  );
}
