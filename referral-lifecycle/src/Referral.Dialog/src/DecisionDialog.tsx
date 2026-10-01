import * as React from "react";
import { DialogAction, validateComment } from "./dialogActions";
import { LifecycleError, RecordContext } from "./lifecycleApi";

export interface DecisionDialogProps {
    action: DialogAction;
    /** Reads the item/referral details shown at the top. */
    loadContext: () => Promise<RecordContext>;
    /** Calls the server. Rejects with a LifecycleError when the server refuses. */
    submit: (comment: string) => Promise<void>;
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

export const DecisionDialog: React.FC<DecisionDialogProps> = ({ action, loadContext, submit, onFinished }) => {
    const [context, setContext] = React.useState<RecordContext | null>(null);
    const [contextFailed, setContextFailed] = React.useState(false);
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

    const confirm = async (): Promise<void> => {
        if (submitting.current || done) {
            return;
        }

        const problem = validateComment(action, comment);
        setValidation(problem);
        if (problem) {
            return;
        }

        submitting.current = true;
        setBusy(true);
        setFailure(null);
        try {
            await submit(comment);
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
                <button type="button" className="primary" onClick={confirm} disabled={busy || done}>
                    {action.confirmLabel}
                </button>
            </div>
        </div>
    );
};
