/**
 * Local reproduction harness.
 *
 * Mounts the real ReferralBuilderApp against a canned in-memory host so the UI
 * can be exercised without a Dataverse sign-in. Used to reproduce and debug
 * render crashes (a React 16 tree unmounts wholesale on an uncaught error,
 * which presents as a blank page and tells you nothing on its own).
 *
 * Not deployed — build output stays under dev/dist, which is gitignored.
 */

import * as React from "react";
import * as ReactDOM from "react-dom";
import { ReferralBuilderApp } from "../../ReferralBuilder/components/ReferralBuilderApp";

const guid = (n: number) => `0000000${n}-0000-0000-0000-00000000000${n}`.slice(0, 36);

const ROWS: Record<string, Record<string, unknown>[]> = {
    slcrm_product: [
        { slcrm_productid: guid(1), slcrm_name: "Marine Hull" },
        { slcrm_productid: guid(2), slcrm_name: "Cargo" },
    ],
    slcrm_referralreason: [
        { slcrm_referralreasonid: guid(3), slcrm_name: "Limit above authority", slcrm_displayorder: 1 },
        { slcrm_referralreasonid: guid(4), slcrm_name: "Loss record", slcrm_displayorder: 2 },
    ],
    slcrm_coversection: [
        {
            slcrm_coversectionid: guid(5),
            slcrm_name: "Hull & Machinery",
            slcrm_covercode: "HM",
            _slcrm_product_value: guid(1),
        },
    ],
    slcrm_authoritylevel: [
        {
            slcrm_authoritylevelid: guid(6),
            slcrm_name: "Senior Underwriter",
            slcrm_comparisonrank: 20,
            slcrm_canapprovereferrals: true,
        },
    ],
    slcrm_underwriterauthority: [
        {
            slcrm_underwriterauthorityid: guid(7),
            slcrm_name: "A. Bhattacharya - Marine Hull",
            _slcrm_authoritylevel_value: guid(6),
            _slcrm_underwriter_value: guid(8),
        },
    ],
    opportunity: [
        { opportunityid: guid(9), name: "Pacific Freight renewal 2026" },
        { opportunityid: guid(10), name: "Northern Star fleet" },
    ],
    slcrm_country: [{ slcrm_countryid: guid(11), slcrm_name: "United Kingdom" }],
};

const webAPI = {
    retrieveMultipleRecords: (logicalName: string) => {
        console.log("[harness] retrieveMultipleRecords", logicalName);
        return Promise.resolve({ entities: ROWS[logicalName] ?? [], nextLink: "" });
    },
    retrieveRecord: (logicalName: string, id: string) => {
        console.log("[harness] retrieveRecord", logicalName, id);
        return Promise.resolve({
            opportunityid: id,
            name: "Pacific Freight renewal 2026",
            _parentaccountid_value: guid(12),
            "_parentaccountid_value@OData.Community.Display.V1.FormattedValue": "Pacific Freight Ltd",
        });
    },
    createRecord: (logicalName: string) => {
        console.log("[harness] createRecord", logicalName);
        return Promise.resolve({ id: guid(13), name: "", entityType: logicalName });
    },
    updateRecord: (logicalName: string, id: string) =>
        Promise.resolve({ id, name: "", entityType: logicalName }),
};

const context = {
    webAPI,
    userSettings: { userId: guid(8) },
    navigation: { openForm: (o: unknown) => console.log("[harness] openForm", o) },
} as unknown as ComponentFramework.Context<unknown>;

// Surface anything React swallows, so a blank screen still leaves a trail.
window.addEventListener("error", (e) => console.error("[harness] window error", e.error ?? e.message));
window.addEventListener("unhandledrejection", (e) => console.error("[harness] unhandled rejection", e.reason));

ReactDOM.render(
    React.createElement(ReferralBuilderApp, {
        context,
        sourceEntityName: "",
        sourceRecordId: "",
        mode: "create",
    }),
    document.getElementById("root")
);
