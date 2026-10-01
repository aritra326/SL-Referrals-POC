import { findAction, validateAuthority, validateComment } from "../src/dialogActions";

describe("dialog actions", () => {
    test("Authorise does not require a comment", () => {
        const action = findAction("slcrm_referralitem", "Authorise")!;
        expect(action.commentRequired).toBe(false);
        expect(validateComment(action, "")).toBeNull();
    });

    test("Reject requires a reason and refuses a blank one", () => {
        const action = findAction("slcrm_referralitem", "Reject")!;
        expect(action.commentRequired).toBe(true);
        expect(validateComment(action, "   ")).toMatch(/rejection reason/i);
        expect(validateComment(action, "Outside appetite")).toBeNull();
    });

    test("action names are matched ignoring case", () => {
        expect(findAction("slcrm_referralitem", "reject")).toBeDefined();
    });

    test("Cancel exists for a referral but not for a single item", () => {
        expect(findAction("slcrm_referralrequest", "Cancel")).toBeDefined();
        expect(findAction("slcrm_referralitem", "Cancel")).toBeUndefined();
    });

    test("unknown actions are not found", () => {
        expect(findAction("slcrm_referralitem", "Approve")).toBeUndefined();
        expect(findAction("account", "Authorise")).toBeUndefined();
    });

    test("every item action tells the user what will happen", () => {
        for (const name of ["Authorise", "Reject", "AuthoriseWithRecommendations", "RequestInformation"]) {
            expect(findAction("slcrm_referralitem", name)!.consequence.length).toBeGreaterThan(10);
        }
    });

    test("Onward needs a comment and a chosen authority", () => {
        const action = findAction("slcrm_referralitem", "Onward")!;
        expect(action.requiresAuthority).toBe(true);
        expect(action.commentRequired).toBe(true);
        expect(validateAuthority(action, "")).toMatch(/choose the authority/i);
        expect(validateAuthority(action, "11111111-1111-1111-1111-111111111111")).toBeNull();
    });

    test("other actions never ask for an authority", () => {
        const reject = findAction("slcrm_referralitem", "Reject")!;
        expect(reject.requiresAuthority).toBeFalsy();
        expect(validateAuthority(reject, "")).toBeNull();
    });
});
