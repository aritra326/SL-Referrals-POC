import * as React from "react";
import { DialogAction, validateAuthority, validateComment } from "./dialogActions";
import { EligibleAuthorityOption, LifecycleError, RecordContext } from "./lifecycleApi";

export interface DecisionDialogProps {
    action: DialogAction;
    /** Reads the item/referral details shown at the top. */
    loadContext: () => Promise<RecordContext>;
    /** Only for actions that send the item to someone: asks the server who is eligible. */
    loadAuthorities?: () => Promise<EligibleAuthorityOption[]>;
    /** Calls the server. Rejects with a LifecycleError when the server refuses. */
    submit: (comment: string, authorityId?: string) => Promise<void>;
    /** Called when the user cancels (false) or after the server accepted the action (true). The host closes the dialog and refreshes. */
    onFinished: (completed: boolean) => void;
}

/** What the user sees for a failed call: the server's sentence, plus its code in small print. */
function describeError(error: unknown): { message: string; code: string } {
    if (error instanceof LifecycleError) {
        return { message: error.userMessage, code: error.code };
    }
    return { message: "Something went wrong. Please try again.", code: "" };
}

type AuthorityList =
    | { state: "loading" }
    | { state: "ready"; options: EligibleAuthorityOption[] }
    | { state: "failed"; message: string; code: string };

export const DecisionDialog: React.FC<DecisionDialogProps> = ({ action, loadContext, loadAuthorities, submit, onFinished }) => {
    const [context, setContext] = React.useState<RecordContext | null>(null);
    const [contextFailed, setContextFailed] = React.useState(false);
    const [authorities, setAuthorities] = React.useState<AuthorityList>({ state: "loading" });
    const [authorityId, setAuthorityId] = React.useState("");
    const [comment, setComment] = React.useState("");
    const [validation, setValidation] = React.useState<string | null>(null);
    const [busy, setBusy] = React.useState(false);
    const [failure, setFailure] = React.useState<{ message: string; code: string } | null>(null);
    const [done, setDone] = React.useState(false);

    // A ref is updated immediately, so a fast double-click cannot start two submissions before state re-renders.
    const submitting = React.useRef(false);

    React.useEffect(() => {
        let cancelled = false;
        loadContext()
            .then((loaded) => !cancelled && setContext(loaded))
            .catch(() => !cancelled && setContextFailed(true));
        return () => {
            cancelled = true;
        };
    }, []);

    React.useEffect(() => {
        if (!loadAuthorities) {
            return;
        }
        let cancelled = false;
        loadAuthorities()
            .then((options) => !cancelled && setAuthorities({ state: "ready", options }))
            .catch((error) => !cancelled && setAuthorities({ state: "failed", ...describeError(error) }));
        return () => {
            cancelled = true;
        };
    }, []);

    const noOneToChoose = !!action.requiresAuthority && authorities.state === "ready" && authorities.options.length === 0;
    const cannotSubmit = busy || done || (!!action.requiresAuthority && authorities.state !== "ready") || noOneToChoose;

    const confirm = async (): Promise<void> => {
        if (submitting.current || done) {
            return;
        }

        const problem = validateAuthority(action, authorityId) || validateComment(action, comment);
        setValidation(problem);
        if (problem) {
            return;
        }

        submitting.current = true;
        setBusy(true);
        setFailure(null);
        try {
            if (action.requiresAuthority) {
                await submit(comment, authorityId);
            } else {
                await submit(comment);
            }
            setDone(true);
            onFinished(true);
        } catch (error) {
            setFailure(describeError(error));
        } finally {
            submitting.current = false;
            setBusy(false);
        }
    };

    const inputId = "decision-comment";

    return (
        <div className="dialog">
            <h1 className="title">{action.title}</h1>

            <div className="context" aria-label="Record">
                {context && (
                    <>
                        <div className="context-main">{context.heading}</div>
                        {context.subheading && <div className="context-sub">{context.subheading}</div>}
                        {context.status && <div className="context-sub">Status: {context.status}</div>}
                    </>
                )}
                {!context && !contextFailed && <div className="context-sub">Loading…</div>}
                {contextFailed && <div className="context-sub">Record details could not be loaded.</div>}
            </div>

            <p className="consequence">{action.consequence}</p>

            {action.requiresAuthority && (
                <fieldset className="authorities" disabled={busy || done}>
                    <legend className="label">Send to *</legend>
                    {authorities.state === "loading" && <div className="context-sub">Loading eligible authorities…</div>}
                    {authorities.state === "failed" && (
                        <div className="message error" role="alert">
                            The eligible authorities could not be loaded: {authorities.message}
                            {authorities.code && <span className="code"> ({authorities.code})</span>}
                        </div>
                    )}
                    {noOneToChoose && (
                        <div className="message" role="status">
                            No eligible higher authority is available for this item.
                        </div>
                    )}
                    {authorities.state === "ready" &&
                        authorities.options.map((option) => (
                            <label key={option.id} className="option">
                                <input
                                    type="radio"
                                    name="authority"
                                    value={option.id}
                                    checked={authorityId === option.id}
                                    onChange={() => {
                                        setAuthorityId(option.id);
                                        setValidation(null);
                                    }}
                                />
                                <span>
                                    {option.name} <span className="code">({option.level})</span>
                                </span>
                            </label>
                        ))}
                </fieldset>
            )}

            <label htmlFor={inputId} className="label">
                {action.commentLabel}
                {action.commentRequired && <span aria-hidden="true"> *</span>}
            </label>
            <textarea
                id={inputId}
                className="comment"
                rows={5}
                value={comment}
                placeholder={action.commentHint}
                disabled={busy || done}
                aria-required={action.commentRequired}
                aria-invalid={validation ? true : undefined}
                onChange={(e) => {
                    setComment(e.target.value);
                    if (validation) {
                        setValidation(null);
                    }
                }}
            />

            {validation && (
                <div className="message error" role="alert">
                    {validation}
                </div>
            )}
            {failure && (
                <div className="message error" role="alert">
                    {failure.message}
                    {failure.code && <span className="code"> ({failure.code})</span>}
                </div>
            )}
            {busy && (
                <div className="message" role="status">
                    Working…
                </div>
            )}
            {done && (
                <div className="message success" role="status">
                    Done. This window will close.
                </div>
            )}

            <div className="buttons">
                <button type="button" className="secondary" onClick={() => onFinished(false)} disabled={busy || done}>
                    Cancel
                </button>
                <button type="button" className="primary" onClick={confirm} disabled={cannotSubmit}>
                    {action.confirmLabel}
                </button>
            </div>
        </div>
    );
};
