import * as React from "react";

export function withStrong(text: string, placeholder: string, value: string): React.ReactNode {
  const pattern = new RegExp(`(\\{${placeholder}\\})`);
  return text.split(pattern).map((part, i) =>
    part === `{${placeholder}}` ? (
      <strong key={i}>{value}</strong>
    ) : (
      <React.Fragment key={i}>{part}</React.Fragment>
    )
  );
}
