import * as React from "react";
import { act, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { DecisionDialog } from "../src/DecisionDialog";
import { findAction } from "../src/dialogActions";
import { EligibleAuthorityOption, LifecycleError, loadEligibleAuthorities, runAction } from "../src/lifecycleApi";

const onward = findAction("slcrm_referralitem", "Onward")!;

const DANA: EligibleAuthorityOption = { id: "aaaaaaaa-0000-0000-0000-000000000001", name: "Dana Lee - Marine Hull", level: "Level 6", rank: 6 };
const SAM: EligibleAuthorityOption = { id: "aaaaaaaa-0000-0000-0000-000000000002", name: "Sam Roe - Marine Hull", level: "Level 7", rank: 7 };

function jsonResponse(status: number, body: unknown): Response {
    return { ok: status >= 200 && status < 300, status, json: async () => body } as unknown as Response;
}

function setup(authorities: () => Promise<EligibleAuthorityOption[]>, submit: (c: string, a?: string) => Promise<void> = async () => undefined) {
    const onFinished = jest.fn();
    const submitMock = jest.fn(submit);
    render(
        <DecisionDialog
            action={onward}
            loadContext={jest.fn().mockResolvedValue({ heading: "RFI-1", subheading: "REF-1", status: "Submitted" })}
            loadAuthorities={authorities}
            submit={submitMock}
            onFinished={onFinished}
        />
    );
    return { onFinished, submitMock };
}

const comment = () => screen.getByLabelText(/reason for routing onward/i) as HTMLTextAreaElement;
const send = () => screen.getByRole("button", { name: /send onward/i }) as HTMLButtonElement;

describe("Onward dialog (authority picker)", () => {
    test("lists only the authorities the server returned", async () => {
        setup(async () => [DANA, SAM]);

        expect(await screen.findByLabelText(/Dana Lee - Marine Hull/)).toBeTruthy();
        expect(screen.getByLabelText(/Sam Roe - Marine Hull/)).toBeTruthy();
        expect(screen.getAllByRole("radio")).toHaveLength(2);
    });

    test("nothing is preselected and confirming without a choice shows a message", async () => {
        const { submitMock } = setup(async () => [DANA]);
        await screen.findByLabelText(/Dana Lee/);
        fireEvent.change(comment(), { target: { value: "Needs level 6" } });

        fireEvent.click(send());

        expect((await screen.findByRole("alert")).textContent).toMatch(/choose the authority/i);
        expect(submitMock).not.toHaveBeenCalled();
    });

    test("a reason is still required", async () => {
        const { submitMock } = setup(async () => [DANA]);
        fireEvent.click(await screen.findByLabelText(/Dana Lee/));

        fireEvent.click(send());

        expect((await screen.findByRole("alert")).textContent).toMatch(/reason for routing onward/i);
        expect(submitMock).not.toHaveBeenCalled();
    });

    test("confirming sends the comment and the chosen authority", async () => {
        const { submitMock, onFinished } = setup(async () => [DANA, SAM]);
        fireEvent.click(await screen.findByLabelText(/Sam Roe/));
        fireEvent.change(comment(), { target: { value: "Needs level 7" } });

        fireEvent.click(send());

        await waitFor(() => expect(onFinished).toHaveBeenCalledWith(true));
        expect(submitMock).toHaveBeenCalledWith("Needs level 7", SAM.id);
    });

    test("when nobody is eligible it says so and the button stays disabled", async () => {
        setup(async () => []);

        expect(await screen.findByText(/no eligible higher authority/i)).toBeTruthy();
        expect(send().disabled).toBe(true);
    });

    test("when the list cannot be loaded the server's reason is shown and the button stays disabled", async () => {
        setup(async () => {
            throw new LifecycleError("SLR-AUTH-403", "Only the assigned approver can do this on the item.");
        });

        const alert = await screen.findByRole("alert");
        expect(alert.textContent).toContain("Only the assigned approver can do this on the item.");
        expect(alert.textContent).toContain("SLR-AUTH-403");
        expect(send().disabled).toBe(true);
    });

    test("while the list is loading the button is disabled", async () => {
        let release: (v: EligibleAuthorityOption[]) => void = () => undefined;
        setup(() => new Promise<EligibleAuthorityOption[]>((resolve) => { release = resolve; }));

        expect(screen.getByText(/loading eligible authorities/i)).toBeTruthy();
        expect(send().disabled).toBe(true);

        await act(async () => release([DANA]));
        await screen.findByLabelText(/Dana Lee/);
        expect(send().disabled).toBe(false);
    });

    test("a server refusal on submit keeps the choice and the comment", async () => {
        setup(
            async () => [DANA],
            async () => {
                throw new LifecycleError("SLR-ONWARD-RANK", "The authority you chose must be a higher level than the current one.");
            }
        );
        fireEvent.click(await screen.findByLabelText(/Dana Lee/));
        fireEvent.change(comment(), { target: { value: "x" } });

        fireEvent.click(send());

        expect((await screen.findByRole("alert")).textContent).toContain("SLR-ONWARD-RANK");
        expect((screen.getByLabelText(/Dana Lee/) as HTMLInputElement).checked).toBe(true);
        expect(comment().value).toBe("x");
    });
});

describe("authority API calls", () => {
    test("loadEligibleAuthorities posts to the read-only API and parses the JSON", async () => {
        const fetchFn = jest.fn().mockResolvedValue(jsonResponse(200, { AuthoritiesJson: JSON.stringify([DANA]) }));

        const result = await loadEligibleAuthorities(fetchFn, "https://org", "{11111111-1111-1111-1111-111111111111}");

        expect(result).toEqual([DANA]);
        const [url, init] = fetchFn.mock.calls[0];
        expect(url).toBe(
            "https://org/api/data/v9.2/slcrm_referralitems(11111111-1111-1111-1111-111111111111)/Microsoft.Dynamics.CRM.slcrm_GetEligibleAuthorities"
        );
        expect(init.method).toBe("POST");
    });

    test("an empty list is an empty array", async () => {
        const fetchFn = jest.fn().mockResolvedValue(jsonResponse(200, { AuthoritiesJson: "[]" }));

        expect(await loadEligibleAuthorities(fetchFn, "https://org", "1")).toEqual([]);
    });

    test("a server refusal becomes a LifecycleError", async () => {
        const fetchFn = jest.fn().mockResolvedValue(jsonResponse(400, { error: { message: "SLR-STATUS-409: Refresh and try again." } }));

        const failure = await loadEligibleAuthorities(fetchFn, "https://org", "1").catch((e) => e);

        expect(failure).toBeInstanceOf(LifecycleError);
        expect(failure.code).toBe("SLR-STATUS-409");
    });

    test("runAction sends the chosen authority as NewAuthorityId", async () => {
        const fetchFn = jest.fn().mockResolvedValue(jsonResponse(204, null));

        await runAction(fetchFn, "https://org", "slcrm_referralitem", "1", "Onward", "route", "{AAAAAAAA-0000-0000-0000-000000000001}");

        expect(JSON.parse(fetchFn.mock.calls[0][1].body)).toEqual({
            ActionName: "Onward",
            Comment: "route",
            NewAuthorityId: "AAAAAAAA-0000-0000-0000-000000000001",
        });
    });
});
