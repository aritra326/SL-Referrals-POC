import * as React from "react";

/**
 * Catches render-time exceptions and shows them instead of unmounting.
 *
 * Without this, React 16 tears down the whole tree on an uncaught error and the
 * user is left staring at a blank page with no indication that anything failed
 * — which is both useless to them and undiagnosable without opening dev tools.
 * The details block is deliberately verbose: this runs in a hosted iframe where
 * getting at the browser console is awkward.
 */

interface Props {
    children: React.ReactNode;
}

interface State {
    error: Error | null;
    componentStack: string;
}

const box: React.CSSProperties = {
    fontFamily: "'Segoe UI', system-ui, sans-serif",
    maxWidth: 760,
    margin: "48px auto",
    padding: 24,
    border: "1px solid #f3d6d6",
    borderRadius: 8,
    background: "#fdf6f6",
    color: "#3b3a39",
};

export class ErrorBoundary extends React.Component<Props, State> {
    public state: State = { error: null, componentStack: "" };

    public static getDerivedStateFromError(error: Error): Partial<State> {
        return { error };
    }

    public componentDidCatch(error: Error, info: React.ErrorInfo): void {
        // Keep the console trail too — it has the full stack with source maps.
        console.error("Referral Builder crashed", error, info.componentStack);
        this.setState({ componentStack: info.componentStack ?? "" });
    }

    private reload = (): void => {
        window.location.reload();
    };

    public render(): React.ReactNode {
        const { error, componentStack } = this.state;
        if (!error) return this.props.children;

        return (
            <div style={box}>
                <h2 style={{ margin: "0 0 8px", fontSize: 18, color: "#a80000" }}>
                    The referral builder hit an error
                </h2>
                <p style={{ margin: "0 0 16px", lineHeight: 1.5 }}>
                    Nothing has been saved. Reload to try again — if it keeps happening, send the
                    details below to whoever supports this app.
                </p>
                <button
                    onClick={this.reload}
                    style={{
                        padding: "6px 14px",
                        border: "1px solid #8a8886",
                        borderRadius: 4,
                        background: "#fff",
                        cursor: "pointer",
                        marginBottom: 16,
                    }}
                >
                    Reload
                </button>
                <pre
                    style={{
                        whiteSpace: "pre-wrap",
                        wordBreak: "break-word",
                        fontSize: 12,
                        lineHeight: 1.45,
                        background: "#fff",
                        border: "1px solid #edebe9",
                        borderRadius: 4,
                        padding: 12,
                        margin: 0,
                        maxHeight: 320,
                        overflow: "auto",
                    }}
                >
                    {`${error.name}: ${error.message}\n\n${error.stack ?? ""}${
                        componentStack ? `\n\nComponent stack:${componentStack}` : ""
                    }`}
                </pre>
            </div>
        );
    }
}
