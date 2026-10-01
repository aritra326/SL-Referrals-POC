import { LifecycleError, loadContext, parseServerMessage, runAction } from "../src/lifecycleApi";

function jsonResponse(status: number, body: unknown): Response {
    return { ok: status >= 200 && status < 300, status, json: async () => body } as unknown as Response;
}

describe("parseServerMessage", () => {
    test("splits the code from the sentence", () => {
        expect(parseServerMessage("SLR-STATUS-409: Refresh and try again.")).toEqual({
            code: "SLR-STATUS-409",
            message: "Refresh and try again.",
        });
    });

    test("understands configuration errors", () => {
        expect(parseServerMessage("CONFIG-RANK-001: Set the rank direction.").code).toBe("CONFIG-RANK-001");
    });

    test("leaves other messages alone", () => {
        expect(parseServerMessage("Something else")).toEqual({ code: "", message: "Something else" });
    });
});

describe("runAction", () => {
    test("posts the action and comment to the bound Custom API", async () => {
        const fetchFn = jest.fn().mockResolvedValue(jsonResponse(200, { ResultRecordId: "{AAA}" }));

        const result = await runAction(
            fetchFn,
            "https://org",
            "slcrm_referralitem",
            "{11111111-1111-1111-1111-111111111111}",
            "Reject",
            "  No  "
        );

        expect(result).toBe("AAA");
        const [url, init] = fetchFn.mock.calls[0];
        expect(url).toBe(
            "https://org/api/data/v9.2/slcrm_referralitems(11111111-1111-1111-1111-111111111111)/Microsoft.Dynamics.CRM.slcrm_ExecuteReferralItemAction"
        );
        expect(init.method).toBe("POST");
        expect(JSON.parse(init.body)).toEqual({ ActionName: "Reject", Comment: "No" });
    });

    test("leaves the comment out when it is blank", async () => {
        const fetchFn = jest.fn().mockResolvedValue(jsonResponse(204, null));

        await runAction(fetchFn, "https://org", "slcrm_referralitem", "1", "Authorise", "   ");

        expect(JSON.parse(fetchFn.mock.calls[0][1].body)).toEqual({ ActionName: "Authorise" });
    });

    test("uses the referral API for referral actions", async () => {
        const fetchFn = jest.fn().mockResolvedValue(jsonResponse(204, null));

        await runAction(fetchFn, "https://org", "slcrm_referralrequest", "1", "Cancel", "x");

        expect(fetchFn.mock.calls[0][0]).toContain(
            "slcrm_referralrequests(1)/Microsoft.Dynamics.CRM.slcrm_ExecuteReferralRequestAction"
        );
    });

    test("turns a plug-in refusal into a LifecycleError with the code and message", async () => {
        const fetchFn = jest
            .fn()
            .mockResolvedValue(jsonResponse(400, { error: { message: "SLR-AUTH-403: Only the assigned approver can do this on the item." } }));

        const failure = await runAction(fetchFn, "https://org", "slcrm_referralitem", "1", "Authorise", "").catch((e) => e);

        expect(failure).toBeInstanceOf(LifecycleError);
        expect(failure.code).toBe("SLR-AUTH-403");
        expect(failure.userMessage).toBe("Only the assigned approver can do this on the item.");
    });

    test("gives a friendly message when the error has no body", async () => {
        const fetchFn = jest.fn().mockResolvedValue({
            ok: false,
            status: 500,
            json: async () => {
                throw new Error("no body");
            },
        } as unknown as Response);

        const failure = await runAction(fetchFn, "https://org", "slcrm_referralitem", "1", "Authorise", "").catch((e) => e);

        expect(failure.userMessage).toMatch(/could not be completed/i);
    });

    test("gives a friendly message when the server cannot be reached", async () => {
        const fetchFn = jest.fn().mockRejectedValue(new TypeError("Failed to fetch"));

        const failure = await runAction(fetchFn, "https://org", "slcrm_referralitem", "1", "Authorise", "").catch((e) => e);

        expect(failure.userMessage).toMatch(/could not be reached/i);
    });
});

describe("loadContext", () => {
    test("reads the item number, referral name and status", async () => {
        const fetchFn = jest.fn().mockResolvedValue(
            jsonResponse(200, {
                slcrm_referralitemnumber: "RI-0007",
                slcrm_Referral: { slcrm_name: "REF-001002" },
                "statuscode@OData.Community.Display.V1.FormattedValue": "Submitted",
            })
        );

        const context = await loadContext(fetchFn, "https://org", "slcrm_referralitem", "1");

        expect(context).toEqual({ heading: "RI-0007", subheading: "REF-001002", status: "Submitted" });
    });

    test("falls back to the summary when the item has no number", async () => {
        const fetchFn = jest.fn().mockResolvedValue(jsonResponse(200, { slcrm_itemsummary: "Limit increase" }));

        expect((await loadContext(fetchFn, "https://org", "slcrm_referralitem", "1")).heading).toBe("Limit increase");
    });
});
