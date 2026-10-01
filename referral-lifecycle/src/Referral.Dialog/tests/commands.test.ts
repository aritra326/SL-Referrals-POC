import * as fs from "fs";
import * as path from "path";

/**
 * Loads the real command-bar script with a fake Xrm and checks which page each button opens and who may start it.
 * The script is plain JavaScript that runs inside Dynamics, so it is evaluated rather than imported.
 */
interface World {
    /** Teams that exist in the environment. Default: both demo teams. */
    teamsThatExist?: string[];
    /** Teams the signed-in user belongs to. Default: none. */
    memberOf?: string[];
    /** Make the team lookup fail. */
    lookupFails?: boolean;
    entityName?: string;
}

const REQUESTORS = "SL Referral Requestors";
const APPROVERS = "SL Referral Approvers";
const BOTH = [REQUESTORS, APPROVERS];

function loadCommands(world: World = {}) {
    const exists = world.teamsThatExist === undefined ? BOTH : world.teamsThatExist;
    const member = world.memberOf || [];
    const navigateTo = jest.fn().mockResolvedValue(undefined);
    const save = jest.fn().mockResolvedValue(undefined);
    const execute = jest.fn().mockResolvedValue({ ok: true, status: 204 });
    const openErrorDialog = jest.fn().mockResolvedValue(undefined);
    const openAlertDialog = jest.fn().mockResolvedValue(undefined);

    const form: any = {
        data: {
            entity: {
                getIsDirty: () => false,
                getId: () => "{11111111-1111-1111-1111-111111111111}",
                getEntityName: () => form.entityName,
            },
            refresh: jest.fn().mockResolvedValue(undefined),
            save,
        },
        ui: { refreshRibbon: jest.fn() },
        entityName: world.entityName || "slcrm_referralitem",
    };

    const retrieveMultipleRecords = jest.fn(async (_table: string, query: string) => {
        if (world.lookupFails) {
            throw new Error("no access to teams");
        }
        const wantsMembers = decodeURIComponent(query).includes("teammembership");
        const names = wantsMembers ? member : exists;
        return { entities: names.filter((n) => exists.includes(n)).map((name) => ({ name })) };
    });

    const fakeWindow: any = { sessionStorage: (global as any).window.sessionStorage };
    fakeWindow.sessionStorage.clear();
    const fakeXrm = {
        Navigation: { navigateTo, openErrorDialog, openAlertDialog, openConfirmDialog: jest.fn().mockResolvedValue({ confirmed: true }), openForm: jest.fn() },
        Utility: {
            showProgressIndicator: jest.fn(),
            closeProgressIndicator: jest.fn(),
            getGlobalContext: () => ({ userSettings: { userId: "{22222222-2222-2222-2222-222222222222}" } }),
        },
        WebApi: { online: { execute }, retrieveMultipleRecords },
    };

    const code = fs.readFileSync(path.join(__dirname, "..", "commands", "slcrm_ReferralCommands.js"), "utf8");
    new Function("window", "Xrm", "console", code + "\nwindow.SLCRM = SLCRM;")(fakeWindow, fakeXrm, { warn: jest.fn() });

    return { commands: fakeWindow.SLCRM.ReferralCommands, navigateTo, form, save, execute, openErrorDialog, openAlertDialog, retrieveMultipleRecords };
}

describe("command bar routing", () => {
    test("Authorise opens the decision dialog web resource for the item", async () => {
        const { commands, navigateTo, form } = loadCommands({ memberOf: [APPROVERS] });

        await commands.authorise(form);

        const [page, options] = navigateTo.mock.calls[0];
        expect(page.pageType).toBe("webresource");
        expect(page.webresourceName).toBe("slcrm_referraldecision.html");
        expect(page.data).toBe("recordId=11111111-1111-1111-1111-111111111111&entityName=slcrm_referralitem&actionName=Authorise");
        expect(options.target).toBe(2);
    });

    test("Reject opens the same dialog with its own action", async () => {
        const { commands, navigateTo, form } = loadCommands({ memberOf: [APPROVERS] });

        await commands.reject(form);

        expect(navigateTo.mock.calls[0][0].data).toContain("actionName=Reject");
    });

    test("Onward now opens the same dialog, which shows the authority picker", async () => {
        const { commands, navigateTo, form } = loadCommands({ memberOf: [APPROVERS] });

        await commands.onwardForApproval(form);

        const page = navigateTo.mock.calls[0][0];
        expect(page.pageType).toBe("webresource");
        expect(page.data).toContain("actionName=Onward");
    });

    test("cancelling a referral opens the dialog for the referral table", async () => {
        const { commands, navigateTo, form } = loadCommands({ memberOf: [REQUESTORS], entityName: "slcrm_referralrequest" });

        await commands.cancelReferral(form);

        expect(navigateTo.mock.calls[0][0].webresourceName).toBe("slcrm_referraldecision.html");
        expect(navigateTo.mock.calls[0][0].data).toContain("entityName=slcrm_referralrequest&actionName=Cancel");
    });

    test("the form is refreshed after the dialog closes", async () => {
        const { commands, form } = loadCommands({ memberOf: [APPROVERS] });

        await commands.authorise(form);

        expect(form.data.refresh).toHaveBeenCalled();
        expect(form.ui.refreshRibbon).toHaveBeenCalled();
    });
});

describe("demo authorization layer (team membership decides who may start a command)", () => {
    test.each([
        ["authorise", "slcrm_referralitem"],
        ["authoriseWithRecommendations", "slcrm_referralitem"],
        ["reject", "slcrm_referralitem"],
        ["requestInformation", "slcrm_referralitem"],
        ["onwardForApproval", "slcrm_referralitem"],
        ["startReview", "slcrm_referralitem"],
    ])("a requestor cannot start %s", async (command, entity) => {
        const { commands, navigateTo, execute, save, openErrorDialog, form } = loadCommands({ memberOf: [REQUESTORS], entityName: entity });

        await commands[command](form);

        expect(openErrorDialog.mock.calls[0][0].message).toContain(APPROVERS);
        expect(navigateTo).not.toHaveBeenCalled();
        expect(execute).not.toHaveBeenCalled();
        expect(save).not.toHaveBeenCalled();
    });

    test.each([
        ["submitReferral", "slcrm_referralrequest"],
        ["submitRevisions", "slcrm_referralrequest"],
        ["cancelReferral", "slcrm_referralrequest"],
        ["completePartialOutcome", "slcrm_referralrequest"],
        ["completeRejectedOutcome", "slcrm_referralrequest"],
        ["resubmitItem", "slcrm_referralitem"],
        ["createRevision", "slcrm_referralitem"],
    ])("an approver cannot start %s", async (command, entity) => {
        const { commands, navigateTo, execute, openErrorDialog, form } = loadCommands({ memberOf: [APPROVERS], entityName: entity });

        await commands[command](form);

        expect(openErrorDialog.mock.calls[0][0].message).toContain(REQUESTORS);
        expect(navigateTo).not.toHaveBeenCalled();
        expect(execute).not.toHaveBeenCalled();
    });

    test("a requestor can submit and an approver can authorise", async () => {
        const requestor = loadCommands({ memberOf: [REQUESTORS], entityName: "slcrm_referralrequest" });
        await requestor.commands.submitReferral(requestor.form);
        expect(requestor.execute).toHaveBeenCalled();

        const approver = loadCommands({ memberOf: [APPROVERS] });
        await approver.commands.authorise(approver.form);
        expect(approver.navigateTo).toHaveBeenCalled();
    });

    test("a member of both teams can start everything", async () => {
        const w = loadCommands({ memberOf: BOTH });
        await w.commands.authorise(w.form);
        await w.commands.resubmitItem(w.form);

        expect(w.openErrorDialog).not.toHaveBeenCalled();
    });

    test("a member of neither team is refused with the name of the team to ask for", async () => {
        const { commands, openErrorDialog, form } = loadCommands({ memberOf: [] });

        await commands.reject(form);

        expect(openErrorDialog.mock.calls[0][0].message).toContain("SL Referral Approvers");
    });

    test("nobody is locked out while the teams do not exist yet", async () => {
        const { commands, navigateTo, openErrorDialog, form } = loadCommands({ teamsThatExist: [], memberOf: [] });

        await commands.authorise(form);

        expect(openErrorDialog).not.toHaveBeenCalled();
        expect(navigateTo).toHaveBeenCalled();
    });

    test("when only the approver team exists, requestor-only commands are not enforced", async () => {
        const { commands, openErrorDialog, form } = loadCommands({ teamsThatExist: [APPROVERS], memberOf: [APPROVERS] });
        form.entityName = "slcrm_referralitem";

        await commands.createRevision(form);

        expect(openErrorDialog).not.toHaveBeenCalled();
    });

    test("a failed team lookup never blocks the user, because the server still enforces the real rules", async () => {
        const { commands, navigateTo, form } = loadCommands({ lookupFails: true });

        await commands.authorise(form);

        expect(navigateTo).toHaveBeenCalled();
    });

    test("team membership is looked up once and then remembered", async () => {
        const { commands, retrieveMultipleRecords, form } = loadCommands({ memberOf: [APPROVERS] });

        await commands.authorise(form);
        await commands.reject(form);

        expect(retrieveMultipleRecords).toHaveBeenCalledTimes(2); // existence + membership, once
    });

    test("the denial happens before anything is saved or called", async () => {
        const { commands, save, execute, form } = loadCommands({ memberOf: [REQUESTORS] });
        form.data.entity.getIsDirty = () => true;

        await commands.authorise(form);

        expect(save).not.toHaveBeenCalled();
        expect(execute).not.toHaveBeenCalled();
    });

    test("Authorise with Conditions is approver-only like the other approver actions", async () => {
        const { commands, navigateTo, form } = loadCommands({ memberOf: [REQUESTORS] });

        await commands.authoriseWithConditions(form);

        expect(navigateTo).not.toHaveBeenCalled();
    });
});

describe("item-level cancel is not supported", () => {
    test("Cancel Item on an item explains that the referral must be cancelled instead, and calls nothing", async () => {
        const { commands, navigateTo, execute, openAlertDialog, form } = loadCommands({ memberOf: BOTH, entityName: "slcrm_referralitem" });

        await commands.cancelItem(form);

        expect(openAlertDialog.mock.calls[0][0].text).toMatch(/cannot be cancelled.*Cancel Referral/i);
        expect(navigateTo).not.toHaveBeenCalled();
        expect(execute).not.toHaveBeenCalled();
    });

    test("the same handler still cancels a referral through the dialog", async () => {
        const { commands, navigateTo, openAlertDialog, form } = loadCommands({ memberOf: [REQUESTORS], entityName: "slcrm_referralrequest" });

        await commands.cancelItem(form);

        expect(openAlertDialog).not.toHaveBeenCalled();
        expect(navigateTo.mock.calls[0][0].data).toContain("entityName=slcrm_referralrequest&actionName=Cancel");
    });

    test("there is no item-level Cancel in the demo access table, so no team is asked for", async () => {
        const { commands, openErrorDialog, form } = loadCommands({ memberOf: [], entityName: "slcrm_referralitem" });

        await commands.cancelItem(form);

        expect(openErrorDialog).not.toHaveBeenCalled();
    });
});
