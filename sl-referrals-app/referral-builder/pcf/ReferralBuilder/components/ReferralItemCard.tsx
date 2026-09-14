import * as React from "react";
import {
    Button,
    Dropdown,
    Field,
    Option,
    Textarea,
    Tooltip,
} from "@fluentui/react-components";
import { CopyRegular, DeleteRegular } from "@fluentui/react-icons";
import { useStyles } from "./styles";
import { LookupOption, ReferralItemDraft } from "../models/ReferralModels";

export interface ReferralItemCardProps {
    item: ReferralItemDraft;
    index: number;
    itemCount: number;
    productSelected: boolean;
    reasons: LookupOption[];
    covers: LookupOption[];
    levels: LookupOption[];
    approvers: LookupOption[];
    approversLoading: boolean;
    errors: Record<string, string>;
    showErrors: boolean;
    onChange: (patch: Partial<ReferralItemDraft>) => void;
    onRemove: () => void;
    onDuplicate: () => void;
}

const labelOf = (options: LookupOption[], id?: string): string =>
    options.find((o) => o.id === id)?.label ?? "";

export const ReferralItemCard: React.FC<ReferralItemCardProps> = (props) => {
    const s = useStyles();
    const {
        item, index, itemCount, productSelected, reasons, covers, levels,
        approvers, approversLoading, errors, showErrors, onChange, onRemove, onDuplicate,
    } = props;

    const err = (k: string) => (showErrors ? errors[k] : undefined);
    const invalid = showErrors && Object.keys(errors).length > 0;
    const heading = labelOf(reasons, item.referralReasonId) || `Referral item ${index + 1}`;

    const approverHint = !item.requiredAuthorityLevelId
        ? "Select a required level first"
        : approversLoading
        ? "Checking who holds sufficient authority…"
        : approvers.length === 0
        ? "No one currently holds sufficient authority for this product and level"
        : `${approvers.length} eligible for this product`;

    return (
        <div className={`${s.item} ${invalid ? s.itemInvalid : ""}`}>
            <div className={s.itemHead}>
                <div className={s.itemHeadLeft}>
                    <span className={s.itemNum}>{index + 1}</span>
                    <span className={s.itemName}>{heading}</span>
                </div>
                <div>
                    <Tooltip content="Duplicate item" relationship="label">
                        <Button appearance="subtle" size="small" icon={<CopyRegular />} onClick={onDuplicate} />
                    </Tooltip>
                    <Tooltip
                        content={itemCount <= 1 ? "A referral needs at least one item" : "Remove item"}
                        relationship="label"
                    >
                        <Button
                            appearance="subtle"
                            size="small"
                            icon={<DeleteRegular />}
                            disabled={itemCount <= 1}
                            onClick={onRemove}
                        />
                    </Tooltip>
                </div>
            </div>

            <div className={s.itemBody}>
                <div className={s.row}>
                    <Field label="Referral reason" required validationMessage={err("referralReasonId")}>
                        <Dropdown
                            className={s.grow}
                            placeholder="Select a reason"
                            selectedOptions={item.referralReasonId ? [item.referralReasonId] : []}
                            value={labelOf(reasons, item.referralReasonId)}
                            onOptionSelect={(_, d) => onChange({ referralReasonId: d.optionValue })}
                        >
                            {reasons.map((r) => (
                                <Option key={r.id} value={r.id} text={r.label}>
                                    {r.label}
                                </Option>
                            ))}
                        </Dropdown>
                    </Field>

                    <Field
                        label="Cover / section"
                        required
                        validationMessage={err("coverSectionId")}
                        hint={!productSelected ? "Select a product in Context first" : undefined}
                    >
                        <Dropdown
                            className={s.grow}
                            disabled={!productSelected}
                            placeholder={productSelected ? "Select a cover" : "—"}
                            selectedOptions={item.coverSectionId ? [item.coverSectionId] : []}
                            value={labelOf(covers, item.coverSectionId)}
                            onOptionSelect={(_, d) => onChange({ coverSectionId: d.optionValue })}
                        >
                            {covers.map((c) => (
                                <Option key={c.id} value={c.id} text={c.label}>
                                    {c.label}
                                </Option>
                            ))}
                        </Dropdown>
                    </Field>

                    <div className={s.full}>
                        <Field
                            label="Underwriter rationale"
                            required
                            validationMessage={err("rationale")}
                            hint="Explain why this exceeds your authority and what you are asking the approver to accept."
                        >
                            <Textarea
                                className={s.grow}
                                resize="vertical"
                                rows={3}
                                value={item.rationale}
                                placeholder="e.g. Requested limit of GBP 2,000,000 exceeds my Level 4 authority of GBP 1,500,000. Loss record is clean for three years and the technical rate is met in full."
                                onChange={(_, d) => onChange({ rationale: d.value })}
                            />
                        </Field>
                    </div>

                    <Field label="Required authority level" required validationMessage={err("requiredAuthorityLevelId")}>
                        <Dropdown
                            className={s.grow}
                            placeholder="Select a level"
                            selectedOptions={item.requiredAuthorityLevelId ? [item.requiredAuthorityLevelId] : []}
                            value={labelOf(levels, item.requiredAuthorityLevelId)}
                            onOptionSelect={(_, d) =>
                                onChange({ requiredAuthorityLevelId: d.optionValue, underwriterAuthorityId: undefined })
                            }
                        >
                            {levels.map((l) => (
                                <Option key={l.id} value={l.id} text={l.label}>
                                    {l.label}
                                </Option>
                            ))}
                        </Dropdown>
                    </Field>

                    <Field label="Approver" hint={approverHint}>
                        <Dropdown
                            className={s.grow}
                            disabled={!item.requiredAuthorityLevelId || approvers.length === 0}
                            placeholder={approvers.length ? "Select an approver" : "—"}
                            selectedOptions={item.underwriterAuthorityId ? [item.underwriterAuthorityId] : []}
                            value={labelOf(approvers, item.underwriterAuthorityId)}
                            onOptionSelect={(_, d) => onChange({ underwriterAuthorityId: d.optionValue })}
                        >
                            {approvers.map((a) => (
                                <Option key={a.id} value={a.id} text={a.label}>
                                    {a.label}
                                </Option>
                            ))}
                        </Dropdown>
                    </Field>
                </div>
            </div>
        </div>
    );
};
