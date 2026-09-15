import * as React from "react";
import { IInputs, IOutputs } from "./generated/ManifestTypes";
import { ReferralBuilderApp } from "./components/ReferralBuilderApp";
import { ErrorBoundary } from "./components/ErrorBoundary";

export class ReferralBuilder implements ComponentFramework.ReactControl<IInputs, IOutputs> {
    public init(context: ComponentFramework.Context<IInputs>): void {
        // The builder fills its host container, so it needs to know the size it has.
        context.mode.trackContainerResize(true);
    }

    public updateView(context: ComponentFramework.Context<IInputs>): React.ReactElement {
        // Wrapped so a render fault shows the error rather than tearing the
        // control down to an empty container.
        return React.createElement(
            ErrorBoundary,
            null,
            React.createElement(ReferralBuilderApp, {
                context: context as unknown as ComponentFramework.Context<unknown>,
                sourceEntityName: context.parameters.SourceEntityName?.raw ?? "",
                sourceRecordId: context.parameters.SourceRecordId?.raw ?? "",
                mode: context.parameters.Mode?.raw ?? "create",
            })
        );
    }

    public getOutputs(): IOutputs {
        return {};
    }

    public destroy(): void {
        // No subscriptions held.
    }
}
