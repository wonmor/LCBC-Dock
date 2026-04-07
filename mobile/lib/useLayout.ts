import { useState, useEffect } from "react";
import { Dimensions } from "react-native";

export function useIsWide(breakpoint = 600) {
  const [isWide, setIsWide] = useState(
    Dimensions.get("window").width >= breakpoint
  );

  useEffect(() => {
    const sub = Dimensions.addEventListener("change", ({ window }) => {
      setIsWide(window.width >= breakpoint);
    });
    return () => sub.remove();
  }, [breakpoint]);

  return isWide;
}
