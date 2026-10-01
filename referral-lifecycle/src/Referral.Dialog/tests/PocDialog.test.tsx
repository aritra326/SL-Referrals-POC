import * as React from "react";
import { fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { DecisionDialog } from "../src/DecisionDialog";
import { findAction } from "../src/dialogActions";
import { EligibleAuthorityOption } from "../src/lifecycleApi";

const onward = findAction("slcrm_referralitem", "Onward")!;

const DANA: EligibleAuthorityOption = {
    id: "aaaaaaaa-0000-0000-0000-000000000001",
    name: "Dana Lee - Marine Hull",
    approver: "Dana Lee",
    level: "Level 6",
    rank: 6,
    licence: "Lloyd's",
    product: "Marine Hull",
};
const SAM: EligibleAuthorityOption = { id: "aaaaaaaa-0000-0000-0000-000000000002", name: "Sam Roe - Marine Hull", level: "Level 7", rank: 7 };

function renderOnward(options: EligibleAuthorityOption[]) {
    const submit = jest.fn().mockResolvedValue(undefined);
    render(
        <DecisionDialog
            action={onward}
            loadContext={jest.fn().mockResolvedValue({ heading: "RFI-1", subheading: "REF-1", status: "Submitted" })}
            loadAuthorities={async () => options}
            submit={submit}
            onFinished={jest.fn()}
        />
    );
    return submit;
}

describe("Onward picker table", () => {
    test("shows approver, level, rank, licence/scheme and product for each eligible assignment", async () => {
        renderOnward([DANA]);

        const row = (await screen.findByLabelText("Dana Lee - Marine Hull")).closest("tr") as HTMLElement;
        const cells = within(row).getAllByRole("cell").map((c) => c.textContent);
        expect(cells).toEqual(["", "Dana Lee", "Level 6", "6", "Lloyd's", "Marine Hull"]);
        expect(screen.getByRole("columnheader", { name: /approver/i })).toBeTruthy();
        expect(screen.getByRole("columnheader", { name: /rank/i })).toBeTruthy();
        expect(screen.getByRole("columnheader", { name: /licence/i })).toBeTruthy();
        expect(screen.getByRole("columnheader", { name: /product/i })).toBeTruthy();
    });

    test("missing optional details show a dash, and the assignment name stands in for a missing approver", async () => {
        renderOnward([SAM]);

        const row = (await screen.findByLabelText("Sam Roe - Marine Hull")).closest("tr") as HTMLElement;
        const cells = within(row).getAllByRole("cell").map((c) => c.textContent);
        expect(cells).toEqual(["", "Sam Roe - Marine Hull", "Level 7", "7", "-", "-"]);
    });

    test("choosing a row sends that assignment's id", async () => {
        const submit = renderOnward([DANA, SAM]);
        fireEvent.click(await screen.findByLabelText("Sam Roe - Marine Hull"));
        fireEvent.change(screen.getByLabelText(/reason for routing onward/i), { target: { value: "Needs level 7" } });

        fireEvent.click(screen.getByRole("button", { name: /send onward/i }));

        await waitFor(() => expect(submit).toHaveBeenCalledWith("Needs level 7", SAM.id));
    });
});

describe("POC wording and limits", () => {
    test("Accept rejection asks for the acceptance comment in the agreed words", () => {
        const action = findAction("slcrm_referralrequest", "CompleteRejected")!;

        expect(action.title).toBe("Accept rejection");
        expect(action.commentRequired).toBe(true);
        expect(action.commentHint).toContain("Please confirm your acceptance of the rejected outcome and provide a comment.");
        expect(action.consequence).toContain("Please confirm your acceptance of the rejected outcome and provide a comment.");
    });

    test("Accept rejection refuses a whitespace-only comment", async () => {
        const submit = jest.fn();
        render(
            <DecisionDialog
                action={findAction("slcrm_referralrequest", "CompleteRejected")!}
                loadContext={jest.fn().mockResolvedValue({ heading: "REF-1", subheading: "", status: "Rejected - UW Action Required" })}
                submit={submit}
                onFinished={jest.fn()}
            />
        );
        fireEvent.change(screen.getByRole("textbox"), { target: { value: "   \n  " } });

        fireEvent.click(screen.getByRole("button", { name: /close as rejected/i }));

        expect((await screen.findByRole("alert")).textContent).toMatch(/comment/i);
        expect(submit).not.toHaveBeenCalled();
    });

    test("Complete partial outcome explains that rejected items stay as evidence", () => {
        const action = findAction("slcrm_referralrequest", "CompletePartial")!;

        expect(action.consequence).toMatch(/rejected items stay as historical evidence/i);
        expect(action.commentRequired).toBe(false);
    });

    test("Recommendations are limited to the 4000 characters the server accepts, so nothing is cut off silently", () => {
        const action = findAction("slcrm_referralitem", "AuthoriseWithRecommendations")!;
        render(
            <DecisionDialog
                action={action}
                loadContext={jest.fn().mockResolvedValue({ heading: "RFI-1", subheading: "", status: "Submitted" })}
                submit={jest.fn()}
                onFinished={jest.fn()}
            />
        );

        expect(action.commentMaxLength).toBe(4000);
        expect((screen.getByRole("textbox") as HTMLTextAreaElement).maxLength).toBe(4000);
    });

    test("an item can no longer be cancelled from the dialog", () => {
        expect(findAction("slcrm_referralitem", "Cancel")).toBeUndefined();
        expect(findAction("slcrm_referralrequest", "Cancel")).toBeDefined();
    });
});
