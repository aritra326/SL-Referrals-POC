/*
 * DEVELOPMENT ONLY - a pretend Xrm object so the pages can be opened on your own machine without Dataverse.
 * It is NOT uploaded to Dataverse. The data comes from /data-export/data (the JSON written by Export-Data.ps1).
 *
 * It understands just enough of the Web API for these pages: $select (ignored), $filter with "and", "eq" and "ne",
 * $orderby, $top and $expand. Anything else is ignored, so always confirm a new query against a real environment.
 *
 * Every call is recorded in window.__xrmLog so you can see what the page asked for and what it tried to save.
 * Type "FAIL" in a decision comment to see how the dialog shows a server error.
 */
(function () {
    "use strict";

    const FORMATTED = "@OData.Community.Display.V1.FormattedValue";
    const log = (window.__xrmLog = []);
    const tables = {}; // logical name -> array of rows
    const meta = {}; // logical name -> { idField }
    let loaded = null;

    const USER_ID = "{11111111-2222-3333-4444-555555555555}";

    /** Reads the exported JSON once and turns each record into the shape the Web API returns. */
    function load() {
        if (!loaded) {
            loaded = (async function () {
                const manifest = await (await fetch("/__data/manifest.json")).json();
                for (const logical of manifest.importOrder) {
                    const file = await (await fetch("/__data/" + logical + ".json")).json();
                    const idField = logical + "id";
                    meta[logical] = { idField: idField };
                    tables[logical] = file.records.map(function (record) {
                        const row = Object.assign({ statecode: 0, modifiedon: "2026-03-01T10:00:00Z" }, record.fields);
                        row[idField] = record.id;
                        row.__links = {}; // nav name -> { table, id }
                        record.lookups.forEach(function (l) {
                            row["_" + l.attr + "_value"] = l.id;
                            row.__links[l.nav] = { table: l.entity, id: l.id };
                        });
                        record.users.forEach(function (u) {
                            row["_" + u.attr + "_value"] = "user-" + u.email;
                            row.__links[u.nav] = { user: u.email };
                        });
                        return row;
                    });
                }
            })();
        }
        return loaded;
    }

    function findRow(logical, id) {
        const wanted = (id || "").replace(/[{}]/g, "").toLowerCase();
        return (tables[logical] || []).find(function (row) { return String(row[meta[logical].idField]).toLowerCase() === wanted; });
    }

    /** Copies a row for returning to the page and applies $expand. Internal fields are removed. */
    function present(logical, row, options) {
        const copy = Object.assign({}, row);
        const expand = /\$expand=([A-Za-z0-9_]+)\(/.exec(options || "");
        if (expand) {
            const link = row.__links[expand[1]];
            if (link && link.user) {
                copy[expand[1]] = { fullname: link.user.split("@")[0] };
            } else if (link) {
                const target = findRow(link.table, link.id);
                copy[expand[1]] = target ? Object.assign({}, target) : null;
            } else {
                copy[expand[1]] = null;
            }
        }
        delete copy.__links;
        return copy;
    }

    // ---- $filter ----

    function valueOf(row, path) {
        const parts = path.split("/");
        if (parts.length === 2) { // Nav/_column_value : look at the linked record
            const link = row.__links[parts[0]];
            const target = link && link.table ? findRow(link.table, link.id) : null;
            return target ? target[parts[1]] : undefined;
        }
        return row[path];
    }

    function literal(text) {
        if (text === "null") { return null; }
        if (text === "true") { return true; }
        if (text === "false") { return false; }
        if (/^'.*'$/.test(text)) { return text.slice(1, -1); }
        if (/^-?\d+(\.\d+)?$/.test(text)) { return Number(text); }
        return text; // a guid
    }

    function same(a, b) {
        if (a === undefined || a === null) { return b === null; }
        return String(a).toLowerCase() === String(b).toLowerCase();
    }

    function passes(row, filterText) {
        return filterText.split(/ and (?![^()]*\))/).every(function (term) {
            term = term.trim();
            const m = /^([A-Za-z0-9_\/]+) (eq|ne) (.+)$/.exec(term);
            if (!m) { return true; } // (a or b) groups and contains(...) are not evaluated
            const equal = same(valueOf(row, m[1]), literal(m[3]));
            return m[2] === "eq" ? equal : !equal;
        });
    }

    function runQuery(logical, options) {
        let rows = (tables[logical] || []).slice();
        const filter = /\$filter=([^&]*)/.exec(options || "");
        if (filter) { rows = rows.filter(function (row) { return passes(row, decodeURIComponent(filter[1])); }); }

        const order = /\$orderby=([^&]*)/.exec(options || "");
        if (order) {
            const keys = decodeURIComponent(order[1]).split(",").map(function (part) {
                const bits = part.trim().split(" ");
                return { column: bits[0], descending: bits[1] === "desc" };
            });
            rows.sort(function (a, b) {
                for (const key of keys) {
                    const x = a[key.column], y = b[key.column];
                    if (x === y) { continue; }
                    return (x > y ? 1 : -1) * (key.descending ? -1 : 1);
                }
                return 0;
            });
        }
        const top = /\$top=(\d+)/.exec(options || "");
        if (top) { rows = rows.slice(0, Number(top[1])); }
        return rows.map(function (row) { return present(logical, row, options); });
    }

    // ---- the Xrm object ----

    function guid() {
        return "xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx".replace(/[xy]/g, function (c) {
            const r = (Math.random() * 16) | 0;
            return (c === "x" ? r : (r & 3) | 8).toString(16);
        });
    }

    window.Xrm = {
        Utility: {
            getGlobalContext: function () {
                return { userSettings: { userId: USER_ID }, getClientUrl: function () { return location.origin; } };
            }
        },
        Navigation: {
            openForm: function (options) { log.push({ call: "openForm", options: options }); return Promise.resolve(); },
            navigateBack: function () { log.push({ call: "navigateBack" }); document.title = "[dialog closed]"; }
        },
        WebApi: {
            retrieveRecord: async function (logical, id, options) {
                await load();
                log.push({ call: "retrieveRecord", logical: logical, id: id, options: options });
                const row = findRow(logical, id);
                if (!row) { throw new Error("Fake Xrm: " + logical + " " + id + " not found"); }
                return present(logical, row, options);
            },
            retrieveMultipleRecords: async function (logical, options) {
                await load();
                log.push({ call: "retrieveMultipleRecords", logical: logical, options: options });
                return { entities: runQuery(logical, options), nextLink: undefined };
            },
            createRecord: async function (logical, data) {
                await load();
                log.push({ call: "createRecord", logical: logical, data: data });
                if (/FAIL-SAVE/.test(JSON.stringify(data))) { throw new Error("Duplicate record found (fake)"); }
                const id = guid();
                const idField = (meta[logical] && meta[logical].idField) || logical + "id";
                const number = "REF-" + String(1000 + (tables[logical] || []).length);
                (tables[logical] = tables[logical] || []).push(Object.assign({ [idField]: id, slcrm_name: number, __links: {} }, data));
                meta[logical] = { idField: idField };
                return { id: id, entityType: logical };
            },
            online: {
                execute: async function (request) {
                    await load();
                    const description = request.getMetadata();
                    const entry = { call: "execute", operation: description.operationName, bound: request.entity, params: {} };
                    Object.keys(description.parameterTypes).forEach(function (name) {
                        if (name !== "entity") { entry.params[name] = request[name]; }
                    });
                    log.push(entry);

                    if (description.operationName === "slcrm_GetEligibleAuthorities") {
                        const list = (tables.slcrm_underwriterauthority || []).slice(0, 3).map(function (row, index) {
                            const user = row.__links.slcrm_Underwriter;
                            return {
                                id: row.slcrm_underwriterauthorityid,
                                name: row.slcrm_name,
                                approver: user && user.user ? user.user.split("@")[0] : row.slcrm_name,
                                level: "Level " + (index + 4),
                                rank: index + 4,
                                licence: "Scheme A",
                                product: "Marine Hull"
                            };
                        });
                        return { ok: true, status: 200, json: async function () { return { AuthoritiesJson: JSON.stringify(list) }; } };
                    }

                    if (request.Comment && /FAIL/.test(request.Comment)) {
                        throw new Error("SLR-STATUS-409: The item was already decided. Refresh the form and try again.");
                    }
                    return { ok: true, status: 200, json: async function () { return { ResultRecordId: request.entity.id }; } };
                }
            }
        }
    };
})();
