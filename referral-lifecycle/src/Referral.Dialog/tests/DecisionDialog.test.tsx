import * as React from "react";
import { act, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { DecisionDialog } from "../src/DecisionDialog";
import { findAction } from "../src/dialogActions";
import { LifecycleError } from "../src/lifecycleApi";

const reject = findAction("slcrm_referralitem", "Reject")!;
const authorise = findAction("slcrm_referralitem", "Authorise")!;

function setup(action = reject, submit: (c: string) => Promise<void> = async () => undefined) {
    const onFinished = jest.fn();
    const submitMock = jest.fn(submit);
    const loadContext = jest.fn().mockResolvedValue({ heading: "RI-0007", subheading: "REF-001002", status: "Submitted" });
    render(<DecisionDialog action={action} loadContext={loadContext} submit={submitMock} onFinished={onFinished} />);
    return { onFinished, submitMock };
}

const comment = () => screen.getByRole("textbox") as HTMLTextAreaElement;
const click = (name: RegExp) => fireEvent.click(screen.getByRole("button", { name }));

/** A submit that stays pending until the test releases it, to look at the in-progress screen. */
function pending() {
    const control = { release: () => undefined as void };
    const submit = () =>
        new Promise<void>((resolve) => {
            control.release = () => resolve();
        });
    return { control, submit };
}

describe("DecisionDialog", () => {
    test("shows the heading, the record context and the comment box", async () => {
        setup();

        expect(screen.getByRole("heading", { name: "Reject referral item" })).toBeTruthy();
        expect(await screen.findByText("RI-0007")).toBeTruthy();
        expect(screen.getByText("REF-001002")).toBeTruthy();
        expect(screen.getByLabelText(/rejection reason/i)).toBeTruthy();
    });

    test("still works when the record details cannot be loaded", async () => {
        const loadContext = jest.fn().mockRejectedValue(new Error("nope"));
        render(<DecisionDialog action={reject} loadContext={loadContext} submit={async () => undefined} onFinished={jest.fn()} />);

        expect(await screen.findByText(/could not be loaded/i)).toBeTruthy();
        expect(screen.getByRole("button", { name: /^reject$/i })).toBeTruthy();
    });

    test("Reject without a reason shows a message and does not call the server", async () => {
        const { submitMock, onFinished } = setup();

        click(/^reject$/i);

        expect((await screen.findByRole("alert")).textContent).toMatch(/rejection reason/i);
        expect(submitMock).not.toHaveBeenCalled();
        expect(onFinished).not.toHaveBeenCalled();
    });

    test("typing a reason clears the validation message", async () => {
        setup();
        click(/^reject$/i);
        await screen.findByRole("alert");

        fireEvent.change(comment(), { target: { value: "Outside appetite" } });

        expect(screen.queryByRole("alert")).toBeNull();
    });

    test("Authorise can be confirmed with an empty comment", async () => {
        const { submitMock } = setup(authorise);

        click(/^authorise$/i);

        await waitFor(() => expect(submitMock).toHaveBeenCalledWith(""));
    });

    test("Confirm sends the comment, then finishes with success", async () => {
        const { submitMock, onFinished } = setup();
        fireEvent.change(comment(), { target: { value: "Outside appetite" } });

        click(/^reject$/i);

        await waitFor(() => expect(onFinished).toHaveBeenCalledWith(true));
        expect(submitMock).toHaveBeenCalledWith("Outside appetite");
        expect(screen.getByText(/this window will close/i)).toBeTruthy();
    });

    test("it does not close or refresh until the server has answered", async () => {
        const { control, submit } = pending();
        const { onFinished, submitMock } = setup(reject, submit);
        fireEvent.change(comment(), { target: { value: "No" } });

        click(/^reject$/i);

        await waitFor(() => expect(submitMock).toHaveBeenCalled());
        expect(onFinished).not.toHaveBeenCalled();
        expect(screen.getByText(/working/i)).toBeTruthy();

        await act(async () => control.release());
        await waitFor(() => expect(onFinished).toHaveBeenCalledWith(true));
    });

    test("a double click sends only one request", async () => {
        const { control, submit } = pending();
        const { submitMock } = setup(reject, submit);
        fireEvent.change(comment(), { target: { value: "No" } });
        const button = screen.getByRole("button", { name: /^reject$/i });

        fireEvent.click(button);
        fireEvent.click(button);
        fireEvent.click(button);

        expect(submitMock).toHaveBeenCalledTimes(1);
        await act(async () => control.release());
    });

    test("the buttons and the box are disabled while the request is running", async () => {
        const { control, submit } = pending();
        setup(reject, submit);
        fireEvent.change(comment(), { target: { value: "No" } });

        click(/^reject$/i);

        await screen.findByText(/working/i);
        expect((screen.getByRole("button", { name: /^reject$/i }) as HTMLButtonElement).disabled).toBe(true);
        expect((screen.getByRole("button", { name: /cancel/i }) as HTMLButtonElement).disabled).toBe(true);
        expect(comment().disabled).toBe(true);
        await act(async () => control.release());
    });

    test("a refusal from the server is shown, the comment is kept, and the user can try again", async () => {
        const { onFinished, submitMock } = setup(reject, async () => {
            throw new LifecycleError("SLR-AUTH-403", "Only the assigned approver can do this on the item.");
        });
        fireEvent.change(comment(), { target: { value: "Outside appetite" } });

        click(/^reject$/i);

        const alert = await screen.findByRole("alert");
        expect(alert.textContent).toContain("Only the assigned approver can do this on the item.");
        expect(alert.textContent).toContain("SLR-AUTH-403");
        expect(comment().value).toBe("Outside appetite");
        expect(onFinished).not.toHaveBeenCalled();

        await waitFor(() => expect((screen.getByRole("button", { name: /^reject$/i }) as HTMLButtonElement).disabled).toBe(false));
        click(/^reject$/i);
        await waitFor(() => expect(submitMock).toHaveBeenCalledTimes(2));
    });

    test("an unexpected error shows a generic message", async () => {
        setup(reject, async () => {
            throw new Error("boom");
        });
        fireEvent.change(comment(), { target: { value: "No" } });

        click(/^reject$/i);

        expect((await screen.findByRole("alert")).textContent).toMatch(/something went wrong/i);
    });

    test("Cancel closes without calling the server", () => {
        const { submitMock, onFinished } = setup();

        click(/cancel/i);

        expect(onFinished).toHaveBeenCalledWith(false);
        expect(submitMock).not.toHaveBeenCalled();
    });
});
