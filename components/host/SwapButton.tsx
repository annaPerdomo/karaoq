import * as React from "react";
import styles from "./SwapButton.module.css";
import { Icons } from "./icons";

/** `row` matches the queue row's 36px .actionBtn. */
export function SwapButton({
  label,
  onClick,
  size = "compact",
}: {
  label: string;
  onClick: () => void;
  size?: "compact" | "row";
}) {
  return (
    <button
      type="button"
      className={`${styles.swap} ${size === "row" ? styles.row : ""}`}
      onClick={onClick}
      title={label}
      aria-label={label}
    >
      {Icons.swap}
    </button>
  );
}
