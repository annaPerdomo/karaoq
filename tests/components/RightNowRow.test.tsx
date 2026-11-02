import { describe, it, expect } from "vitest";
import { render, screen } from "@testing-library/react";
import RightNowRow from "../../components/admin/rooms/RightNowRow";
import styles from "../../styles/Admin.module.css";

describe("RightNowRow", () => {
  it("renders nothing without data", () => {
    const { container } = render(<RightNowRow data={null} />);
    expect(container).toBeEmptyDOMElement();
  });

  it("renders the summary line", () => {
    const { container } = render(<RightNowRow data={{ live: 4, created: 10, sang: 6 }} />);
    expect(container.textContent).toBe("Right now · 4 live rooms · 10 created in 2h · 6 of them sang");
  });

  it("stays plain below the Atlas M0 comfort ceiling", () => {
    render(<RightNowRow data={{ live: 24, created: 0, sang: 0 }} />);
    expect(screen.getByText("24 live rooms")).not.toHaveClass(styles.rightNowWarn);
  });

  it("warns at the Atlas M0 comfort ceiling", () => {
    render(<RightNowRow data={{ live: 25, created: 0, sang: 0 }} />);
    expect(screen.getByText("25 live rooms")).toHaveClass(styles.rightNowWarn);
  });
});
