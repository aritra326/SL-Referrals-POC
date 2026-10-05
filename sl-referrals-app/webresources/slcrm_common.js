/*
 * SL CRM - shared helpers used by the web resource pages
 * (slcrm_referraldecision, slcrm_copyrationale, slcrm_referralbuilder).
 *
 * RULES FOR THIS FILE AND EVERY OTHER FILE IN THIS FOLDER
 *   - Plain JavaScript. No framework, no bundler, no minifier. What you read here is exactly what runs.
 *   - All Dataverse access goes through Xrm.WebApi. Never call fetch() or XMLHttpRequest directly.
 *     (tests/sourceRules.test.js fails if someone adds one.)
 *   - ASCII characters only. Write an ellipsis as \u2026 and a dash as \u2014 so no editor can corrupt the file.
 *   - Every file is uploaded to Dataverse as a web resource with the same name (see README.md).
 */
var SLCRM = window.SLCRM || {};
window.SLCRM = SLCRM;

SLCRM.common = (function () {
    "use strict";

    // ------------------------------------------------------------------------------------------------------------
    // 1. Getting hold of Xrm
    // ------------------------------------------------------------------------------------------------------------

    /**
     * A web resource page is shown inside an iframe, so Xrm lives on the parent window, not on this page.
     * We look on this window, then the parent, then the top window, and use the first one that has Xrm.WebApi.
     */
    function getXrm() {
        const candidates = [window, window.parent, window.top];
        for (let i = 0; i < candidates.length; i++) {
            try {
                if (candidates[i] && candidates[i].Xrm && candidates[i].Xrm.WebApi) {
                    return candidates[i].Xrm;
                }
            } catch (e) {
                // Reading a window from another domain throws. Skip it and try the next one.
            }
        }
        throw new Error("This page must be opened from inside the Referrals & Rationale app.");
    }

    /** The signed-in user's id, without braces. */
    function getCurrentUserId() {
        return cleanGuid(getXrm().Utility.getGlobalContext().userSettings.userId);
    }

    // ------------------------------------------------------------------------------------------------------------
    // 2. Small data helpers
    // ------------------------------------------------------------------------------------------------------------

    /** Dataverse sometimes gives ids as "{GUID}". The Web API wants them without the braces. */
    function cleanGuid(value) {
        return (value || "").replace(/[{}]/g, "");
    }

    /** Builds the value for an "@odata.bind" property, for example "/accounts(1234-...)". */
    function bindTo(entitySetName, id) {
        return "/" + entitySetName + "(" + cleanGuid(id) + ")";
    }

    /**
     * Reads a value that the command bar passed to the page.
     * The platform puts everything inside one "data" query string value: ?data=recordId%3D123%26entityName%3Dx
     * so we check the normal query string first, then look inside "data".
     */
    function getLaunchParam(name) {
        const query = new URLSearchParams(window.location.search);
        const direct = query.get(name);
        if (direct) {
            return direct;
        }
        const data = query.get("data");
        if (!data) {
            return "";
        }
        try {
            return new URLSearchParams(decodeURIComponent(data)).get(name) || "";
        } catch (e) {
            return "";
        }
    }

    /** Formats an ISO date for display, or an em dash when there is no usable date. */
    function formatDate(isoText) {
        if (!isoText) {
            return "\u2014";
        }
        const date = new Date(isoText);
        if (isNaN(date.getTime())) {
            return "\u2014";
        }
        return date.toLocaleDateString(undefined, { year: "numeric", month: "short", day: "numeric" });
    }

    // ------------------------------------------------------------------------------------------------------------
    // 3. Errors
    // ------------------------------------------------------------------------------------------------------------

    /**
     * Our plug-ins throw messages that start with a code, for example "SLR-STATUS-409: The item was already decided."
     * This splits that into the code (shown in small print) and the sentence (shown to the user).
     * Messages without a code are returned unchanged with an empty code.
     */
    function parseServerMessage(raw) {
        const text = raw || "";
        const match = /((?:SLR|CONFIG)-[A-Z0-9-]+):\s*([\s\S]*)/.exec(text);
        if (match) {
            return { code: match[1], message: match[2].trim() };
        }
        return { code: "", message: text };
    }

    /**
     * Turns any error into { message, code } for the screen.
     * `fallback` is used when the error has no text at all.
     */
    function describeError(error, fallback) {
        const raw = error && error.message ? error.message : "";
        const parsed = parseServerMessage(raw);
        return { message: parsed.message || fallback, code: parsed.code };
    }

    /**
     * Makes a raw Dataverse error readable for an underwriter. Used when saving a referral or a rationale.
     * `fallback` is the sentence to use when we do not recognise the error.
     */
    function friendlyError(error, fallback) {
        const raw = error && error.message ? error.message : typeof error === "string" ? error : "";
        let message = fallback;

        if (/privilege|access is denied|insufficient/i.test(raw)) {
            message =
                "You do not have permission to do this. Ask an administrator to check your security role " +
                "(Create, Read, Append and Append To are needed on the tables involved).";
        } else if (/duplicate/i.test(raw)) {
            message = "A matching referral item already exists on this referral. Change the reason or cover and try again.";
        } else if (/timeout|timed out/i.test(raw)) {
            message = "The request timed out before it finished. Check the Referrals list before trying again \u2014 it may have saved.";
        } else if (raw && raw.length < 240 && !/0x[0-9a-f]{8}/i.test(raw)) {
            // Short messages without a hex error code are usually already written for people.
            message = raw;
        }

        const friendly = new Error(message);
        friendly.originalError = error; // kept so a developer can see it in the console
        return friendly;
    }

    // ------------------------------------------------------------------------------------------------------------
    // 4. Calling a bound Custom API with Xrm.WebApi
    // ------------------------------------------------------------------------------------------------------------

    /**
     * Calls a Custom API that is bound to one record (for example slcrm_ExecuteReferralItemAction).
     *
     *   entityName    logical name of the record the API is bound to, e.g. "slcrm_referralitem"
     *   recordId      the record's id
     *   operationName unique name of the Custom API
     *   parameters    extra inputs, each as { type: "Edm.String", value: "text" }
     *
     * Xrm.WebApi.online.execute needs a "getMetadata" function on the request that describes the call.
     * Returns the Custom API's output properties as an object, e.g. { ResultRecordId: "..." }.
     */
    async function runBoundAction(entityName, recordId, operationName, parameters) {
        const request = { entity: { entityType: entityName, id: cleanGuid(recordId) } };
        const parameterTypes = { entity: { typeName: "mscrm." + entityName, structuralProperty: 5 } };

        const extra = parameters || {};
        Object.keys(extra).forEach(function (name) {
            request[name] = extra[name].value;
            parameterTypes[name] = { typeName: extra[name].type, structuralProperty: 1 };
        });

        request.getMetadata = function () {
            return {
                boundParameter: "entity",
                parameterTypes: parameterTypes,
                operationType: 0, // 0 = action (changes data), 1 = function (read only)
                operationName: operationName
            };
        };

        const response = await getXrm().WebApi.online.execute(request);
        if (!response.ok) {
            throw new Error("The server did not complete the request (status " + response.status + ").");
        }
        return response.status === 204 ? {} : await response.json();
    }

    // ------------------------------------------------------------------------------------------------------------
    // 5. Navigation
    // ------------------------------------------------------------------------------------------------------------

    /** Opens a record's form in the app. */
    function openRecord(entityName, recordId) {
        return getXrm().Navigation.openForm({ entityName: entityName, entityId: cleanGuid(recordId) });
    }

    /** Closes the dialog that the command bar opened with navigateTo. Falls back to window.close(). */
    function closeDialog() {
        try {
            getXrm().Navigation.navigateBack();
            return;
        } catch (e) {
            // Not running inside the app shell; fall through.
        }
        window.close();
    }

    // ------------------------------------------------------------------------------------------------------------
    // 6. Building the screen without a framework
    // ------------------------------------------------------------------------------------------------------------

    /**
     * Creates one HTML element.  el("div", { className: "box" }, "Hello", el("b", {}, "world"))
     *
     *   attributes   className, id, type ... are set as attributes. Names starting with "on" (onClick) add an event
     *                listener. disabled / checked / readOnly are set as properties. null, undefined and false are skipped.
     *   children     strings (shown as plain text, never as HTML, so user text cannot inject markup), other elements,
     *                or arrays of either.
     */
    function el(tagName, attributes, ...children) {
        const node = document.createElement(tagName);
        let valueToSet = null;

        Object.keys(attributes || {}).forEach(function (name) {
            const value = attributes[name];
            if (value === null || value === undefined || value === false) {
                return;
            }
            if (name === "className") {
                node.className = value;
            } else if (name.indexOf("on") === 0) {
                node.addEventListener(name.slice(2).toLowerCase(), value);
            } else if (name === "disabled" || name === "checked" || name === "readOnly") {
                node[name] = true;
            } else if (name === "value") {
                valueToSet = value; // set after the children exist, because a <select> needs its <option>s first
            } else {
                node.setAttribute(name, value === true ? "" : value);
            }
        });

        children.flat(Infinity).forEach(function (child) {
            if (child === null || child === undefined || child === false) {
                return;
            }
            node.appendChild(child.nodeType ? child : document.createTextNode(String(child)));
        });

        if (valueToSet !== null) {
            node.value = valueToSet;
        }
        return node;
    }

    /** Replaces everything inside `container` with `content`. */
    function setContent(container, content) {
        while (container.firstChild) {
            container.removeChild(container.firstChild);
        }
        container.appendChild(content);
    }

    /**
     * Redraws a page while keeping the cursor where the user was typing.
     * Any input that should keep focus across a redraw needs a data-focus-key that never changes between redraws.
     */
    function redraw(container, buildFunction) {
        const active = document.activeElement;
        const focusKey = active && active.getAttribute ? active.getAttribute("data-focus-key") : null;
        const selectionStart = active ? active.selectionStart : null;
        const selectionEnd = active ? active.selectionEnd : null;

        setContent(container, buildFunction());

        if (focusKey) {
            const same = container.querySelector('[data-focus-key="' + focusKey + '"]');
            if (same) {
                same.focus();
                if (typeof selectionStart === "number" && same.setSelectionRange) {
                    try {
                        same.setSelectionRange(selectionStart, selectionEnd);
                    } catch (e) {
                        // Some input types (for example date) do not support selection. Ignore.
                    }
                }
            }
        }
    }

    /** Shows a full-page error, used when the page cannot start at all. */
    function showFatal(container, message) {
        setContent(container, el("div", { className: "fatal", role: "alert" }, message));
    }

    /**
     * Runs `start()` and shows a readable error if it throws. Pages call this once, at the bottom of their file.
     */
    function startPage(containerId, startFunction, fatalMessage) {
        if (typeof document === "undefined") {
            return; // loaded by a test, not by a browser
        }
        const container = document.getElementById(containerId);
        if (!container) {
            return;
        }
        Promise.resolve()
            .then(function () {
                return startFunction(container);
            })
            .catch(function (error) {
                console.error("Page failed to start", error);
                showFatal(container, fatalMessage);
            });
    }

    return {
        getXrm: getXrm,
        getCurrentUserId: getCurrentUserId,
        cleanGuid: cleanGuid,
        bindTo: bindTo,
        getLaunchParam: getLaunchParam,
        formatDate: formatDate,
        parseServerMessage: parseServerMessage,
        describeError: describeError,
        friendlyError: friendlyError,
        runBoundAction: runBoundAction,
        openRecord: openRecord,
        closeDialog: closeDialog,
        el: el,
        setContent: setContent,
        redraw: redraw,
        showFatal: showFatal,
        startPage: startPage
    };
})();
