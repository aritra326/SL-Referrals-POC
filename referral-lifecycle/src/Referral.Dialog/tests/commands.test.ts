import * as fs from "fs";
import * as path from "path";

/**
 * Loads the real command-bar script with a fake Xrm and checks which page each button opens.
 * The script is plain JavaScript that runs inside Dynamics, so it is evaluated rather than imported.
 */
function loadCommands() {
    const navigateTo = jest.fn().mockResolvedValue(undefined);
    const form = {
        data: {
            entity: {
                getIsDirty: () => false,
                getId: () => "{11111111-1111-1111-1111-111111111111}",
                getEntityName: () => (form as any).entityName,
            },
            refresh: jest.fn().mockResolvedValue(undefined),
            save: jest.fn(),
        },
        ui: { refreshRibbon: jest.fn() },
        entityName: "slcrm_referralitem",
    };
    const fakeWindow: any = {};
    const fakeXrm = {
        Navigation: { navigateTo, openErrorDialog: jest.fn(), openConfirmDialog: jest.fn(), openForm: jest.fn() },
        Utility: { showProgressIndicator: jest.fn(), closeProgressIndicator: jest.fn() },
        WebApi: { online: { execute: jest.fn() } },
    };

    const code = fs.readFileSync(path.join(__dirname, "..", "commands", "slcrm_ReferralCommands.js"), "utf8");
    new Function("window", "Xrm", code + "\nwindow.SLCRM = SLCRM;")(fakeWindow, fakeXrm);

    return { commands: fakeWindow.SLCRM.ReferralCommands, navigateTo, form };
}

describe("command bar routing", () => {
    test("Authorise opens the decision dialog web resource for the item", async () => {
        const { commands, navigateTo, form } = loadCommands();

        await commands.authorise(form);

        const [page, options] = navigateTo.mock.calls[0];
        expect(page.pageType).toBe("webresource");
        expect(page.webresourceName).toBe("slcrm_referraldecision.html");
        expect(page.data).toBe("recordId=11111111-1111-1111-1111-111111111111&entityName=slcrm_referralitem&actionName=Authorise");
        expect(options.target).toBe(2);
    });

    test("Reject opens the same dialog with its own action", async () => {
        const { commands, navigateTo, form } = loadCommands();

        await commands.reject(form);

        expect(navigateTo.mock.calls[0][0].data).toContain("actionName=Reject");
    });

    test("cancelling a referral opens the dialog for the referral table", async () => {
        const { commands, navigateTo, form } = loadCommands();
        form.entityName = "slcrm_referralrequest";

        await commands.cancelReferral(form);

        expect(navigateTo.mock.calls[0][0].webresourceName).toBe("slcrm_referraldecision.html");
        expect(navigateTo.mock.calls[0][0].data).toContain("entityName=slcrm_referralrequest&actionName=Cancel");
    });

    test("Onward still uses the custom page because it needs an authority picker", async () => {
        const { commands, navigateTo, form } = loadCommands();

        await commands.onwardForApproval(form);

        const page = navigateTo.mock.calls[0][0];
        expect(page.pageType).toBe("custom");
        expect(page.name).toBe("slcrm_ReferralLifecycleDialog");
    });

    test("the form is refreshed after the dialog closes", async () => {
        const { commands, form } = loadCommands();

        await commands.authorise(form);

        expect(form.data.refresh).toHaveBeenCalled();
        expect(form.ui.refreshRibbon).toHaveBeenCalled();
    });
});
