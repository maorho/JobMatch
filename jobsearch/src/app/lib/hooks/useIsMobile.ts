import { useState, useEffect } from "react";

export function useIsMobile(breakpoint: number = 770) {
  const [isMobile, setIsMobile] = useState(false);

  useEffect(() => {
    const checkWidth = () => setIsMobile(window.innerWidth < breakpoint);
    checkWidth();

    window.addEventListener("resize", checkWidth);
    return () => window.removeEventListener("resize", checkWidth);
  }, [breakpoint]);

  return isMobile;
}
