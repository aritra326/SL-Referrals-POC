import * as React from "react";
import {
    Badge,
    Button,
    Dropdown,
    Field,
    FluentProvider,
    Input,
    Link,
    MessageBar,
    MessageBarBody,
    MessageBarTitle,
    Option,
    Spinner,
    Textarea,
    webLightTheme,
} from "@fluentui/react-components";
import {
    AddRegular,
    BriefcaseRegular,
    CheckmarkCircleRegular,
    CircleRegular,
    ClipboardTaskListLtrRegular,
    InfoRegular,
    SaveRegular,
    ShieldTaskRegular,
} from "@fluentui/react-icons";

import { useStyles } from "./styles";
import { ReferralItemCard } from "./ReferralItemCard";
import { DataverseService } from "../services/DataverseService";
import { ReferenceDataService } from "../services/ReferenceDataService";
import { ReferralService } from "../services/ReferralService";
import { Choices } from "../config/DataverseSchema";
import {
    LookupOption,
    ReferralDraft,
    ReferralItemDraft,
    SaveResult,
    ValidationErrors,
    newItemDraft,
} from "../models/ReferralModels";

export interface ReferralBuilderAppProps {
    context: ComponentFramework.Context<unknown>;
    sourceEntityName: string;
    sourceRecordId: string;
    mode: string;
}

const PRIORITIES = [
    { id: String(Choices.priority.high), label: "High" },
    { id: String(Choices.priority.medium), label: "Medium" },
    { id: String(Choices.priority.low), label: "Low" },
];
const POLICY_TYPES = [
    { id: String(Choices.policyType.annual), label: "Annual" },
    { id: String(Choices.policyType.project), label: "Project" },
    { id: String(Choices.policyType.lta), label: "LTA" },
];

const emptyDraft = (): ReferralDraft => ({
    priority: Choices.priority.medium,
    policyType: Choices.policyType.annual,
    description: "",
    items: [newItemDraft()],
});

export const ReferralBuilderApp: React.FC<ReferralBuilderAppProps> = ({
    context,
    sourceEntityName,
    sourceRecordId,
}) => {
    const s = useStyles();

    const services = React.useMemo(() => {
        const dv = new DataverseService((context as unknown as { webAPI: ComponentFramework.WebApi }).webAPI);
        return { dv, ref: new ReferenceDataService(dv), referral: new ReferralService(dv) };
    }, []);

    const [draft, setDraft] = React.useState<ReferralDraft>(emptyDraft);
    const [opportunities, setOpportunities] = React.useState<LookupOption[]>([]);
    const [products, setProducts] = React.useState<LookupOption[]>([]);
    const [countries, setCountries] = React.useState<LookupOption[]>([]);
    const [reasons, setReasons] = React.useState<LookupOption[]>([]);
    const [allCovers, setAllCovers] = React.useState<LookupOption[]>([]);
    const [levels, setLevels] = React.useState<LookupOption[]>([]);
    const [approversByKey, setApproversByKey] = React.useState<Record<string, LookupOption[]>>({});
    const [approversLoading, setApproversLoading] = React.useState<Record<string, boolean>>({});

    const [customerName, setCustomerName] = React.useState<string>("");
    const [loading, setLoading] = React.useState(true);
    const [loadError, setLoadError] = React.useState<string>("");
    const [busy, setBusy] = React.useState<"" | "draft">("");
    const [saveError, setSaveError] = React.useState<string>("");
    const [result, setResult] = React.useState<SaveResult | null>(null);
    const [showErrors, setShowErrors] = React.useState(false);

    const currentUserId = React.useMemo(
        () => (context as unknown as { userSettings?: { userId?: string } }).userSettings?.userId?.replace(/[{}]/g, "") ?? "",
        [context]
    );

    /* ---------------- initial load ---------------- */
    React.useEffect(() => {
        let cancelled = false;
        void (async () => {
            try {
                const [prod, reas, cov, lev, opps, ctry] = await Promise.all([
                    services.ref.loadProducts(),
                    services.ref.loadReferralReasons(),
                    services.ref.loadCoverSections(),
                    services.ref.loadAuthorityLevels(),
                    services.ref.loadOpportunities(),
                    services.ref.loadCountries(),
                ]);
                if (cancelled) return;
                setProducts(prod); setReasons(reas); setAllCovers(cov);
                setLevels(lev); setOpportunities(opps); setCountries(ctry);

                // Launched from a record (e.g. Opportunity -> Create Referral): prefill.
                if (sourceEntityName === "opportunity" && sourceRecordId) {
                    const ctx = await services.ref.loadOpportunityContext(sourceRecordId);
                    if (cancelled) return;
                    setCustomerName(ctx.customerName ?? "");
                    setDraft((d) => ({
                        ...d,
                        opportunityId: ctx.opportunityId,
                        customerId: ctx.customerId,
                    }));
                }
            } catch (e) {
                if (!cancelled)
                    setLoadError(
                        "Reference data could not be loaded. Check that you have Read access to Referral Reason, " +
                            "Cover / Section, Authority Level, Product and Opportunity, then refresh."
                    );
            } finally {
                if (!cancelled) setLoading(false);
            }
        })();
        return () => { cancelled = true; };
    }, []);

    /* ---------------- derived ---------------- */
    const coversForProduct = React.useMemo(
        () => (draft.productId ? allCovers.filter((c) => !c.parentId || c.parentId === draft.productId) : []),
        [allCovers, draft.productId]
    );

    const errors: ValidationErrors = React.useMemo(() => {
        const e: ValidationErrors = { context: {}, items: {} };
        if (!draft.opportunityId) e.context.opportunityId = "Opportunity is required.";
        if (!draft.productId) e.context.productId = "Product is required.";
        if (!draft.description.trim()) e.context.description = "A short risk description is required.";

        draft.items.forEach((it) => {
            const ie: Record<string, string> = {};
            if (!it.referralReasonId) ie.referralReasonId = "Required.";
            if (!it.coverSectionId) ie.coverSectionId = "Required.";
            if (!it.rationale.trim()) ie.rationale = "Required.";
            if (!it.requiredAuthorityLevelId) ie.requiredAuthorityLevelId = "Required.";
            if (Object.keys(ie).length) e.items[it.clientKey] = ie;
        });

        // Same reason + same cover twice on one referral is the duplicate rule the
        // server also enforces; catching it here saves a round trip.
        const seen = new Set<string>();
        draft.items.forEach((it) => {
            if (!it.referralReasonId || !it.coverSectionId) return;
            const key = `${it.referralReasonId}|${it.coverSectionId}`;
            if (seen.has(key)) {
                e.items[it.clientKey] = {
                    ...(e.items[it.clientKey] ?? {}),
                    referralReasonId: "This reason and cover combination is already on the referral.",
                };
            }
            seen.add(key);
        });
        return e;
    }, [draft]);

    const errorList = React.useMemo(() => {
        const list: string[] = Object.values(errors.context);
        draft.items.forEach((it, i) => {
            const ie = errors.items[it.clientKey];
            if (!ie) return;
            Object.values(ie).forEach((m) => list.push(`Referral item ${i + 1}: ${m.replace(/\.$/, "")}.`));
        });
        return list;
    }, [errors, draft.items]);

    const isValid = errorList.length === 0;

    /* ---------------- approver loading, per item ---------------- */
    const loadApprovers = React.useCallback(
        async (item: ReferralItemDraft) => {
            const levelId = item.requiredAuthorityLevelId;
            if (!levelId || !draft.productId) {
                setApproversByKey((m) => ({ ...m, [item.clientKey]: [] }));
                return;
            }
            const rank = levels.find((l) => l.id === levelId)?.rank ?? 0;
            setApproversLoading((m) => ({ ...m, [item.clientKey]: true }));
            try {
                const list = await services.ref.loadEligibleAuthorities(draft.productId, rank, levels);
                setApproversByKey((m) => ({ ...m, [item.clientKey]: list }));
            } catch {
                setApproversByKey((m) => ({ ...m, [item.clientKey]: [] }));
            } finally {
                setApproversLoading((m) => ({ ...m, [item.clientKey]: false }));
            }
        },
        [draft.productId, levels, services.ref]
    );

    React.useEffect(() => {
        draft.items.forEach((it) => {
            if (it.requiredAuthorityLevelId && draft.productId) void loadApprovers(it);
        });
    }, [draft.productId]);

    /* ---------------- mutations ---------------- */
    const patchItem = (key: string, patch: Partial<ReferralItemDraft>) => {
        setDraft((d) => ({ ...d, items: d.items.map((i) => (i.clientKey === key ? { ...i, ...patch } : i)) }));
        if (patch.requiredAuthorityLevelId !== undefined) {
            const item = draft.items.find((i) => i.clientKey === key);
            if (item) void loadApprovers({ ...item, ...patch });
        }
    };
    const addItem = () => setDraft((d) => ({ ...d, items: [...d.items, newItemDraft()] }));
    const removeItem = (key: string) =>
        setDraft((d) => (d.items.length > 1 ? { ...d, items: d.items.filter((i) => i.clientKey !== key) } : d));
    const duplicateItem = (key: string) =>
        setDraft((d) => {
            const i = d.items.findIndex((x) => x.clientKey === key);
            if (i < 0) return d;
            const copy = { ...d.items[i], ...newItemDraft(), rationale: d.items[i].rationale };
            copy.referralReasonId = d.items[i].referralReasonId;
            copy.coverSectionId = d.items[i].coverSectionId;
            copy.requiredAuthorityLevelId = d.items[i].requiredAuthorityLevelId;
            copy.underwriterAuthorityId = d.items[i].underwriterAuthorityId;
            return { ...d, items: [...d.items.slice(0, i + 1), copy, ...d.items.slice(i + 1)] };
        });

    const onOpportunity = async (id?: string) => {
        setDraft((d) => ({ ...d, opportunityId: id }));
        setCustomerName("");
        if (!id) return;
        try {
            const ctx = await services.ref.loadOpportunityContext(id);
            setCustomerName(ctx.customerName ?? "");
            setDraft((d) => ({ ...d, customerId: ctx.customerId }));
        } catch {
            /* context is a convenience; a failure here must not block the form */
        }
    };

    const onProduct = (id?: string) => {
        // Covers and approvers are product-scoped, so both are cleared with it.
        setDraft((d) => ({
            ...d,
            productId: id,
            items: d.items.map((i) => ({ ...i, coverSectionId: undefined, underwriterAuthorityId: undefined })),
        }));
        setApproversByKey({});
    };

    const save = async () => {
        setShowErrors(true);
        setSaveError("");
        if (!isValid) {
            document.querySelector("[data-scroll-top]")?.scrollIntoView({ behavior: "smooth", block: "start" });
            return;
        }
        setBusy("draft");
        try {
            const r = await services.referral.saveDraft(draft, currentUserId);
            setResult(r);
            setDraft(emptyDraft());
            setShowErrors(false);
            setApproversByKey({});
        } catch (e) {
            setSaveError((e as Error).message);
            // Keep the original for diagnostics without showing it to the user.
            console.error("Referral save failed", (e as Error & { cause?: unknown }).cause ?? e);
        } finally {
            setBusy("");
        }
    };

    const openReferral = () => {
        if (!result) return;
        void (context as unknown as {
            navigation: { openForm: (o: Record<string, unknown>) => void };
        }).navigation.openForm({ entityName: "slcrm_referralrequest", entityId: result.referralRequestId });
    };

    /* ---------------- render ---------------- */
    if (loading) {
        return (
            <FluentProvider theme={webLightTheme} style={{ height: "100%" }}>
                <div className={s.root}>
                    <div className={s.centre}>
                        <Spinner label="Loading referral dataâ€¦" />
                    </div>
                </div>
            </FluentProvider>
        );
    }

    const highestLevel = draft.items
        .map((i) => levels.find((l) => l.id === i.requiredAuthorityLevelId))
        .filter(Boolean)
        .sort((a, b) => (b?.rank ?? 0) - (a?.rank ?? 0))[0];

    const checklist: [string, boolean][] = [
        ["Opportunity selected", !!draft.opportunityId],
        ["Product selected", !!draft.productId],
        ["Risk description added", !!draft.description.trim()],
        [
            `All ${draft.items.length} item${draft.items.length > 1 ? "s" : ""} complete`,
            draft.items.every((i) => i.referralReasonId && i.coverSectionId && i.rationale.trim() && i.requiredAuthorityLevelId),
        ],
        ["Approvers chosen (optional)", draft.items.every((i) => !!i.underwriterAuthorityId)],
    ];

    return (
        <FluentProvider theme={webLightTheme} style={{ height: "100%" }}>
          <div className={s.root}>
            <div className={s.scroll}>
                <div className={s.shell}>
                    <div className={s.head} data-scroll-top>
                        <div>
                            <h1 className={s.title}>Create referral</h1>
                            <p className={s.subtitle}>
                                Raise a referral request for underwriting approval. Add one item per reason you need signed off.
                            </p>
                        </div>
                        <Badge appearance="outline" color="informative" size="large">
                            Draft â€” not yet submitted
                        </Badge>
                    </div>

                    {loadError && (
                        <MessageBar intent="error" className={s.banner}>
                            <MessageBarBody>
                                <MessageBarTitle>Could not load reference data</MessageBarTitle>
                                {loadError}
                            </MessageBarBody>
                        </MessageBar>
                    )}

                    {result && (
                        <MessageBar intent="success" className={s.banner}>
                            <MessageBarBody>
                                <MessageBarTitle>
                                    {result.referralNumber ? `Referral ${result.referralNumber} saved` : "Referral saved"}
                                </MessageBarTitle>
                                {result.itemCount} referral item{result.itemCount > 1 ? "s" : ""} created as Draft.{" "}
                                <Link onClick={openReferral}>Open the referral</Link> to review and submit it, or start another below.
                            </MessageBarBody>
                        </MessageBar>
                    )}

                    {saveError && (
                        <MessageBar intent="error" className={s.banner}>
                            <MessageBarBody>
                                <MessageBarTitle>The referral could not be saved</MessageBarTitle>
                                {saveError}
                            </MessageBarBody>
                        </MessageBar>
                    )}

                    {showErrors && !isValid && (
                        <MessageBar intent="warning" className={s.banner}>
                            <MessageBarBody>
                                <MessageBarTitle>
                                    {errorList.length} {errorList.length === 1 ? "item needs" : "items need"} your attention
                                </MessageBarTitle>
                                <ul className={s.errList}>
                                    {errorList.slice(0, 6).map((m, i) => (
                                        <li key={i}>{m}</li>
                                    ))}
                                </ul>
                                {errorList.length > 6 && <div>â€¦and {errorList.length - 6} more.</div>}
                            </MessageBarBody>
                        </MessageBar>
                    )}

                    <div className={s.grid}>
                        <div>
                            {/* ---------- Context ---------- */}
                            <section className={s.card}>
                                <div className={s.cardHead}>
                                    <div className={s.cardHeadLeft}>
                                        <span className={s.cardIcon}><BriefcaseRegular /></span>
                                        <div>
                                            <h2 className={s.cardTitle}>Context</h2>
                                            <p className={s.cardDesc}>Shared details that apply to every item on this referral</p>
                                        </div>
                                    </div>
                                </div>
                                <div className={s.cardBody}>
                                    <div className={s.row}>
                                        <div className={s.full}>
                                            <Field
                                                label="Opportunity"
                                                required
                                                validationMessage={showErrors ? errors.context.opportunityId : undefined}
                                                hint="The customer is taken from the opportunity."
                                            >
                                                <Dropdown
                                                    className={s.grow}
                                                    placeholder="Select an opportunity"
                                                    selectedOptions={draft.opportunityId ? [draft.opportunityId] : []}
                                                    value={opportunities.find((o) => o.id === draft.opportunityId)?.label ?? ""}
                                                    onOptionSelect={(_, d) => void onOpportunity(d.optionValue)}
                                                >
                                                    {opportunities.map((o) => (
                                                        <Option key={o.id} value={o.id} text={o.label}>{o.label}</Option>
                                                    ))}
                                                </Dropdown>
                                            </Field>
                                        </div>

                                        <Field label="Customer / insured">
                                            <div className={`${s.readOnly} ${customerName ? "" : s.readOnlyEmpty}`}>
                                                {customerName || "From opportunity"}
                                            </div>
                                        </Field>

                                        <Field
                                            label="Product / class of business"
                                            required
                                            validationMessage={showErrors ? errors.context.productId : undefined}
                                        >
                                            <Dropdown
                                                className={s.grow}
                                                placeholder="Select a product"
                                                selectedOptions={draft.productId ? [draft.productId] : []}
                                                value={products.find((p) => p.id === draft.productId)?.label ?? ""}
                                                onOptionSelect={(_, d) => onProduct(d.optionValue)}
                                            >
                                                {products.map((p) => (
                                                    <Option key={p.id} value={p.id} text={p.label}>{p.label}</Option>
                                                ))}
                                            </Dropdown>
                                        </Field>

                                        <Field label="Country of referral">
                                            <Dropdown
                                                className={s.grow}
                                                placeholder="Select a country"
                                                selectedOptions={draft.countryId ? [draft.countryId] : []}
                                                value={countries.find((c) => c.id === draft.countryId)?.label ?? ""}
                                                onOptionSelect={(_, d) => setDraft((x) => ({ ...x, countryId: d.optionValue }))}
                                            >
                                                {countries.map((c) => (
                                                    <Option key={c.id} value={c.id} text={c.label}>{c.label}</Option>
                                                ))}
                                            </Dropdown>
                                        </Field>

                                        <Field label="Priority">
                                            <Dropdown
                                                className={s.grow}
                                                selectedOptions={[String(draft.priority)]}
                                                value={PRIORITIES.find((p) => p.id === String(draft.priority))?.label ?? ""}
                                                onOptionSelect={(_, d) => setDraft((x) => ({ ...x, priority: Number(d.optionValue) }))}
                                            >
                                                {PRIORITIES.map((p) => (
                                                    <Option key={p.id} value={p.id} text={p.label}>{p.label}</Option>
                                                ))}
                                            </Dropdown>
                                        </Field>

                                        <Field label="Policy type">
                                            <Dropdown
                                                className={s.grow}
                                                selectedOptions={[String(draft.policyType)]}
                                                value={POLICY_TYPES.find((p) => p.id === String(draft.policyType))?.label ?? ""}
                                                onOptionSelect={(_, d) => setDraft((x) => ({ ...x, policyType: Number(d.optionValue) }))}
                                            >
                                                {POLICY_TYPES.map((p) => (
                                                    <Option key={p.id} value={p.id} text={p.label}>{p.label}</Option>
                                                ))}
                                            </Dropdown>
                                        </Field>

                                        <Field label="Inception / effective date">
                                            <Input
                                                className={s.grow}
                                                type="date"
                                                value={draft.inceptionDate ?? ""}
                                                onChange={(_, d) => setDraft((x) => ({ ...x, inceptionDate: d.value }))}
                                            />
                                        </Field>

                                        <div className={s.full}>
                                            <Field
                                                label="Business / risk description"
                                                required
                                                validationMessage={showErrors ? errors.context.description : undefined}
                                                hint="One short paragraph the approver reads first â€” what the risk is and why it is being referred."
                                            >
                                                <Textarea
                                                    className={s.grow}
                                                    resize="vertical"
                                                    rows={3}
                                                    value={draft.description}
                                                    placeholder="e.g. Renewal of a fleet of six coastal vessels trading UK and North Europe. Clean loss record. Referred for limit and duration."
                                                    onChange={(_, d) => setDraft((x) => ({ ...x, description: d.value }))}
                                                />
                                            </Field>
                                        </div>
                                    </div>
                                </div>
                            </section>

                            {/* ---------- Items ---------- */}
                            <section className={s.card}>
                                <div className={s.cardHead}>
                                    <div className={s.cardHeadLeft}>
                                        <span className={s.cardIcon}><ClipboardTaskListLtrRegular /></span>
                                        <div>
                                            <h2 className={s.cardTitle}>Referral items</h2>
                                            <p className={s.cardDesc}>One item per reason â€” each is approved or rejected independently</p>
                                        </div>
                                    </div>
                                    <Button appearance="secondary" icon={<AddRegular />} onClick={addItem}>Add item</Button>
                                </div>
                                <div className={s.cardBody}>
                                    <div className={s.items}>
                                        {draft.items.map((it, i) => (
                                            <ReferralItemCard
                                                key={it.clientKey}
                                                item={it}
                                                index={i}
                                                itemCount={draft.items.length}
                                                productSelected={!!draft.productId}
                                                reasons={reasons}
                                                covers={coversForProduct}
                                                levels={levels}
                                                approvers={approversByKey[it.clientKey] ?? []}
                                                approversLoading={!!approversLoading[it.clientKey]}
                                                errors={errors.items[it.clientKey] ?? {}}
                                                showErrors={showErrors}
                                                onChange={(p) => patchItem(it.clientKey, p)}
                                                onRemove={() => removeItem(it.clientKey)}
                                                onDuplicate={() => duplicateItem(it.clientKey)}
                                            />
                                        ))}
                                    </div>
                                </div>
                            </section>
                        </div>

                        {/* ---------- Rail ---------- */}
                        <aside className={s.rail}>
                            <div className={s.railCard}>
                                <h3 className={s.railTitle}><ShieldTaskRegular />Summary</h3>
                                <div className={s.stat}>
                                    <span className={s.statKey}>Referral items</span>
                                    <span className={s.statVal}>{draft.items.length}</span>
                                </div>
                                <div className={s.stat}>
                                    <span className={s.statKey}>Product</span>
                                    <span className={s.statVal}>
                                        {products.find((p) => p.id === draft.productId)?.label ?? "â€”"}
                                    </span>
                                </div>
                                <div className={s.stat}>
                                    <span className={s.statKey}>Priority</span>
                                    <span className={s.statVal}>
                                        {PRIORITIES.find((p) => p.id === String(draft.priority))?.label ?? "â€”"}
                                    </span>
                                </div>
                                <div className={s.stat}>
                                    <span className={s.statKey}>Highest authority</span>
                                    <span className={s.statVal}>{highestLevel?.label ?? "â€”"}</span>
                                </div>
                                <ul className={s.checklist}>
                                    {checklist.map(([label, ok], i) => (
                                        <li key={i} className={`${s.check} ${ok ? s.checkOk : s.checkTodo}`}>
                                            {ok ? <CheckmarkCircleRegular /> : <CircleRegular />}
                                            <span>{label}</span>
                                        </li>
                                    ))}
                                </ul>
                            </div>

                            <div className={s.infoCard}>
                                <h3 className={s.railTitle}><InfoRegular />How approval works</h3>
                                <p className={s.infoText}>
                                    Each item is routed to an approver who holds sufficient authority for the product.
                                    Items are decided independently â€” some may be authorised while others are rejected
                                    or sent back for more information.
                                </p>
                            </div>
                        </aside>
                    </div>
                </div>
            </div>

            {/* ---------- Command bar ---------- */}
            <div className={s.cmdBar}>
                <div className={s.cmdBarInner}>
                    <div className={s.cmdStatus}>
                        {isValid ? <CheckmarkCircleRegular /> : <CircleRegular />}
                        {isValid
                            ? `Ready to save â€” ${draft.items.length} item${draft.items.length > 1 ? "s" : ""}`
                            : `${errorList.length} field${errorList.length === 1 ? "" : "s"} still to complete`}
                    </div>
                    <div className={s.cmdButtons}>
                        <Button appearance="subtle" onClick={() => { setDraft(emptyDraft()); setShowErrors(false); setResult(null); setSaveError(""); }}>
                            Clear
                        </Button>
                        <Button
                            appearance="primary"
                            icon={busy === "draft" ? <Spinner size="tiny" /> : <SaveRegular />}
                            disabled={busy !== ""}
                            onClick={() => void save()}
                        >
                            Save referral
                        </Button>
                    </div>
                </div>
            </div>
          </div>
        </FluentProvider>
    );
};
