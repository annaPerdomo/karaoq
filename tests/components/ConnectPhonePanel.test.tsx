import { describe, it, expect, vi } from "vitest";
import { render, screen, waitFor } from "@testing-library/react";
import { ConnectPhonePanel } from "../../components/display/ConnectPhonePanel";

describe("ConnectPhonePanel", () => {
  it("shows the formatted code and countdown while showing", () => {
    render(
      <ConnectPhonePanel stage="showing" code="48291765" secondsLeft={42} onClose={vi.fn()} onRetry={vi.fn()} />
    );
    expect(screen.getByText("4829 1765")).toBeInTheDocument();
    expect(screen.getByText(/42s/)).toBeInTheDocument();
  });

  it("shows the done message when claimed", () => {
    render(<ConnectPhonePanel stage="claimed" code="" secondsLeft={0} onClose={vi.fn()} onRetry={vi.fn()} />);
    expect(screen.getByText(/phone connected/i)).toBeInTheDocument();
  });

  it("shows an expired notice with a new-code button", () => {
    render(<ConnectPhonePanel stage="expired" code="" secondsLeft={0} onClose={vi.fn()} onRetry={vi.fn()} />);
    expect(screen.getByText(/that code expired/i)).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /get a new code/i })).toBeInTheDocument();
  });

  it("shows a generic error with a retry button", () => {
    render(<ConnectPhonePanel stage="error" code="" secondsLeft={0} onClose={vi.fn()} onRetry={vi.fn()} />);
    expect(screen.getByText(/something went wrong/i)).toBeInTheDocument();
  });

  it("always renders a close button", () => {
    render(<ConnectPhonePanel stage="showing" code="48291765" secondsLeft={5} onClose={vi.fn()} onRetry={vi.fn()} />);
    expect(screen.getByRole("button", { name: /close/i })).toBeInTheDocument();
  });

  it("focuses Close whenever the stage changes", async () => {
    const { rerender } = render(
      <ConnectPhonePanel stage="showing" code="48291765" secondsLeft={5} onClose={vi.fn()} onRetry={vi.fn()} />
    );
    await waitFor(() => expect(screen.getByRole("button", { name: /close/i })).toHaveFocus());

    rerender(<ConnectPhonePanel stage="expired" code="" secondsLeft={0} onClose={vi.fn()} onRetry={vi.fn()} />);
    await waitFor(() => expect(screen.getByRole("button", { name: /close/i })).toHaveFocus());
  });
});
