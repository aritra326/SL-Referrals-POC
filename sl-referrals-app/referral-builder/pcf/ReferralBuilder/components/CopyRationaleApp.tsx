import * as React from "react";
import {
    Badge,
    Button,
    FluentProvider,
    MessageBar,
    MessageBarBody,
    MessageBarTitle,
    Spinner,
    webLightTheme,
} from "@fluentui/react-components";
import { ChevronDownRegular, ChevronRightRegular, CopyRegular, DocumentAddRegular } from "@fluentui/react-icons";

import { useCopyRationaleStyles } from "./copyRationaleStyles";
import { DataverseService } from "../services/DataverseService";
import { RationaleService, RationaleOption, PolicyContext } from "../services/RationaleService";
import { Rational } from "../config/DataverseSchema";

export interface CopyRationaleAppProps {
    context: ComponentFramework.Context<unknown>;
    opportunityId: string;
    currentUserId: string;
}

const FIELD_LABELS: Record<string, string> = {
    slcrm_capacityconsiderations: "Capacity considerations",
    slcrm_captivearrangements: "Captive arrangements",
    slcrm_claimsexperience: "Claims experience",
    slcrm_licencelevel: "Licence level",
    slcrm_negotiationoutcomestext: "Negotiation outcomes",
    slcrm_overseasterritoryexposures: "Overseas territory exposures",
    slcrm_ppmcategory: "PPM category",
    slcrm_pricing: "Pricing",
    slcrm_qualityassessmenttext: "Quality assessment",
    slcrm_riskmanagementarrangements: "Risk management arrangements",
    slcrm_sanctionsconsiderations: "Sanctions considerations",
    slcrm_underwriteropinion: "Underwriter opinion",
};

export const CopyRationaleApp: React.FC<CopyRationaleAppProps> = ({ context, opportunityId, currentUserId }) => {
    const s = useCopyRationaleStyles();

    const services = React.useMemo(() => {
        const dv = new DataverseService((context as unknown as { webAPI: ComponentFramework.WebApi }).webAPI);
        return { rational: new RationaleService(dv) };
    }, []);

    const [loading, setLoading] = React.useState(true);
    const [loadError, setLoadError] = React.useState("");
    const [policy, setPolicy] = React.useState<PolicyContext | null>(null);
    const [options, setOptions] = React.useState<RationaleOption[]>([]);
    const [expandedId, setExpandedId] = React.useState<string>("");
    const [selectedId, setSelectedId] = React.useState<string>("");
    const [busy, setBusy] = React.useState(false);
    const [saveError, setSaveError] = React.useState("");
    const [done, setDone] = React.useState<{ id: string } | null>(null);

    React.useEffect(() => {
        let cancelled = false;
        void (async () => {
            try {
                const pol = await services.rational.loadPolicyForOpportunity(opportunityId);
                if (cancelled) return;
                setPolicy(pol);

                if (pol) {
                    const opts = await services.rational.loadCopyableRationales(pol.policyId, opportunityId);
                    if (cancelled) return;
                    setOptions(opts);
                }
            } catch {
                if (!cancelled) setLoadError("Previous rationales could not be loaded. Refresh the page and try again.");
            } finally {
                if (!cancelled) setLoading(false);
            }
        })();
        return () => {
            cancelled = true;
        };
    }, [opportunityId]);

    const renewalYear = new Date().getFullYear();
    const selected = options.find((o) => o.id === selectedId);

    const openNewRationale = (id: string): void => {
        (context.navigation as unknown as { openForm: (o: { entityName: string; entityId: string }) => void }).openForm({
            entityName: "slcrm_rational",
            entityId: id,
        });
    };

    const copySelected = async (): Promise<void> => {
        if (!policy || !selected) return;
        setBusy(true);
        setSaveError("");
        try {
            const id = await services.rational.createRationale({
                targetOpportunityId: opportunityId,
                policy,
                renewalYear,
                currentUserId,
                source: selected,
            });
            setDone({ id });
        } catch (err) {
            setSaveError((err as Error)?.message ?? "The rationale could not be created.");
        } finally {
            setBusy(false);
        }
    };

    const startFromScratch = async (): Promise<void> => {
        if (!policy) return;
        setBusy(true);
        setSaveError("");
        try {
            const id = await services.rational.createRationale({
                targetOpportunityId: opportunityId,
                policy,
                renewalYear,
                currentUserId,
            });
            setDone({ id });
        } catch (err) {
            setSaveError((err as Error)?.message ?? "The rationale could not be created.");
        } finally {
            setBusy(false);
        }
    };

    if (loading) {
        return (
            <FluentProvider theme={webLightTheme} style={{ height: "100%" }}>
                <div className={s.root}>
                    <div className={s.centre}>
                        <Spinner label="Loading previous rationales…" />
                    </div>
                </div>
            </FluentProvider>
        );
    }

    return (
        <FluentProvider theme={webLightTheme} style={{ height: "100%" }}>
            <div className={s.root}>
                <div className={s.shell}>
                    <div className={s.head}>
                        <h1 className={s.title}>Copy Rationale</h1>
                        <p className={s.subtitle}>
                            Reuse a previous year&rsquo;s underwriting rationale for this policy, or start a new one from
                            scratch.
                        </p>
                        {policy && (
                            <p className={s.policyLine}>
                                <Badge appearance="tint" color="brand">
                                    {policy.policyReference || "No policy reference"}
                                </Badge>
                                {policy.customerName && <span>{policy.customerName}</span>}
                            </p>
                        )}
                    </div>

                    {loadError && (
                        <MessageBar intent="error" className={s.banner}>
                            <MessageBarBody>
                                <MessageBarTitle>Couldn&rsquo;t load rationales</MessageBarTitle>
                                {loadError}
                            </MessageBarBody>
                        </MessageBar>
                    )}
                    {saveError && (
                        <MessageBar intent="error" className={s.banner}>
                            <MessageBarBody>
                                <MessageBarTitle>Couldn&rsquo;t create the rationale</MessageBarTitle>
                                {saveError}
                            </MessageBarBody>
                        </MessageBar>
                    )}
                    {done && (
                        <MessageBar intent="success" className={s.banner}>
                            <MessageBarBody>
                                <MessageBarTitle>Rationale created</MessageBarTitle>
                                A new Draft rationale for {renewalYear} has been created.{" "}
                                <Button appearance="transparent" size="small" onClick={() => openNewRationale(done.id)}>
                                    Open it
                                </Button>
                            </MessageBarBody>
                        </MessageBar>
                    )}

                    {!policy && !loadError && (
                        <div className={s.empty}>
                            This opportunity isn&rsquo;t linked to a policy yet, so there is no policy history to copy
                            from. Link a policy to the opportunity first.
                        </div>
                    )}

                    {policy && options.length === 0 && (
                        <div className={s.empty}>
                            No previous Final rationale is available yet for {policy.policyReference || "this policy"}.
                            This is the first year&rsquo;s rationale — start it from scratch below.
                        </div>
                    )}

                    {policy && options.length > 0 && (
                        <div className={s.list}>
                            {options.map((opt) => {
                                const isExpanded = expandedId === opt.id;
                                const isSelected = selectedId === opt.id;
                                return (
                                    <div key={opt.id} className={isSelected ? `${s.card} ${s.cardSelected}` : s.card}>
                                        <div
                                            className={s.cardHead}
                                            onClick={() => setSelectedId(opt.id)}
                                            role="radio"
                                            aria-checked={isSelected}
                                            tabIndex={0}
                                        >
                                            <div className={s.cardYear}>{opt.renewalYear ?? "—"}</div>
                                            <div className={s.cardHeadInfo}>
                                                <h3 className={s.cardTitle}>{opt.name}</h3>
                                                <p className={s.cardMeta}>
                                                    {opt.underwriterName} · {opt.statusLabel} · last updated{" "}
                                                    {formatDate(opt.modifiedOn)}
                                                </p>
                                            </div>
                                            <Button
                                                appearance="transparent"
                                                size="small"
                                                icon={isExpanded ? <ChevronDownRegular /> : <ChevronRightRegular />}
                                                onClick={(e) => {
                                                    e.stopPropagation();
                                                    setExpandedId(isExpanded ? "" : opt.id);
                                                }}
                                            >
                                                Preview
                                            </Button>
                                        </div>
                                        {isExpanded && (
                                            <div className={s.cardBody}>
                                                {Rational.copyableFields.map((field) => {
                                                    const value = opt.fields[field];
                                                    return (
                                                        <div key={field} className={s.previewField}>
                                                            <span className={s.previewLabel}>{FIELD_LABELS[field] ?? field}</span>
                                                            <p className={value ? s.previewValue : `${s.previewValue} ${s.previewEmpty}`}>
                                                                {value || "Not recorded"}
                                                            </p>
                                                        </div>
                                                    );
                                                })}
                                            </div>
                                        )}
                                    </div>
                                );
                            })}
                        </div>
                    )}
                </div>

                {policy && !done && (
                    <div className={s.cmdBar}>
                        <div className={s.cmdBarInner}>
                            <span className={s.cmdStatus}>
                                {selected ? `Selected: ${selected.renewalYear ?? ""} rationale` : "Select a rationale to copy, or start from scratch"}
                            </span>
                            <div className={s.cmdButtons}>
                                <Button
                                    appearance="secondary"
                                    icon={<DocumentAddRegular />}
                                    disabled={busy}
                                    onClick={() => void startFromScratch()}
                                >
                                    Start from scratch
                                </Button>
                                <Button
                                    appearance="primary"
                                    icon={busy ? <Spinner size="tiny" /> : <CopyRegular />}
                                    disabled={busy || !selected}
                                    onClick={() => void copySelected()}
                                >
                                    Copy Selected Rationale
                                </Button>
                            </div>
                        </div>
                    </div>
                )}
            </div>
        </FluentProvider>
    );
};

function formatDate(iso: string): string {
    if (!iso) return "—";
    const d = new Date(iso);
    if (Number.isNaN(d.getTime())) return "—";
    return d.toLocaleDateString(undefined, { year: "numeric", month: "short", day: "numeric" });
}
