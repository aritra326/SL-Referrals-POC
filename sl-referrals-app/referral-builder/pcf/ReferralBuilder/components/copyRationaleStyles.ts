import { makeStyles, shorthands, tokens } from "@fluentui/react-components";

/**
 * Same FluentProvider-wrapping rule as ReferralBuilder's styles.ts: the
 * provider itself gets its height from an inline style, never a className —
 * see that file for why (a Dropdown/Listbox portal inherits the provider's
 * className and any layout on it lands on that portal too).
 */
export const useCopyRationaleStyles = makeStyles({
    root: {
        display: "flex",
        flexDirection: "column",
        height: "100%",
        minHeight: "0",
        backgroundColor: tokens.colorNeutralBackground2,
        overflowY: "auto",
    },
    centre: { display: "grid", placeItems: "center", height: "100%", rowGap: tokens.spacingVerticalM },

    shell: {
        maxWidth: "920px",
        width: "100%",
        marginLeft: "auto",
        marginRight: "auto",
        ...shorthands.padding("0", tokens.spacingHorizontalXXL, tokens.spacingVerticalXXL),
        boxSizing: "border-box",
    },
    head: {
        ...shorthands.padding(tokens.spacingVerticalXXL, "0", tokens.spacingVerticalL),
        ...shorthands.borderBottom("1px", "solid", tokens.colorNeutralStroke2),
        marginBottom: tokens.spacingVerticalXL,
    },
    title: {
        ...shorthands.margin("0"),
        fontSize: tokens.fontSizeHero800,
        lineHeight: tokens.lineHeightHero800,
        fontWeight: tokens.fontWeightSemibold,
    },
    subtitle: {
        ...shorthands.margin(tokens.spacingVerticalXS, "0", "0"),
        color: tokens.colorNeutralForeground3,
        fontSize: tokens.fontSizeBase300,
    },
    policyLine: {
        ...shorthands.margin(tokens.spacingVerticalM, "0", "0"),
        display: "flex",
        alignItems: "center",
        columnGap: tokens.spacingHorizontalS,
        fontSize: tokens.fontSizeBase300,
        color: tokens.colorNeutralForeground2,
    },

    banner: { marginBottom: tokens.spacingVerticalXL },

    list: { display: "flex", flexDirection: "column", rowGap: tokens.spacingVerticalM, marginBottom: tokens.spacingVerticalXXL },
    card: {
        ...shorthands.border("1px", "solid", tokens.colorNeutralStroke2),
        ...shorthands.borderRadius(tokens.borderRadiusLarge),
        backgroundColor: tokens.colorNeutralBackground1,
        ...shorthands.overflow("hidden"),
    },
    cardSelected: {
        ...shorthands.borderColor(tokens.colorBrandStroke1),
        boxShadow: `0 0 0 1px ${tokens.colorBrandStroke1}`,
    },
    cardHead: {
        display: "flex",
        alignItems: "center",
        columnGap: tokens.spacingHorizontalM,
        ...shorthands.padding(tokens.spacingVerticalM, tokens.spacingHorizontalL),
        cursor: "pointer",
    },
    cardHeadInfo: { flexGrow: 1, minWidth: "0" },
    cardYear: {
        display: "grid",
        placeItems: "center",
        minWidth: "56px",
        height: "40px",
        ...shorthands.padding("0", tokens.spacingHorizontalS),
        ...shorthands.borderRadius(tokens.borderRadiusMedium),
        backgroundColor: tokens.colorBrandBackground2,
        color: tokens.colorBrandForeground2,
        fontSize: tokens.fontSizeBase400,
        fontWeight: tokens.fontWeightBold,
        flexShrink: 0,
    },
    cardTitle: {
        ...shorthands.margin("0"),
        fontSize: tokens.fontSizeBase400,
        fontWeight: tokens.fontWeightSemibold,
        whiteSpace: "nowrap",
        ...shorthands.overflow("hidden"),
        textOverflow: "ellipsis",
    },
    cardMeta: {
        ...shorthands.margin("2px", "0", "0"),
        fontSize: tokens.fontSizeBase200,
        color: tokens.colorNeutralForeground3,
    },
    cardBody: {
        ...shorthands.borderTop("1px", "solid", tokens.colorNeutralStroke2),
        ...shorthands.padding(tokens.spacingVerticalL),
        backgroundColor: tokens.colorNeutralBackground2,
        display: "flex",
        flexDirection: "column",
        rowGap: tokens.spacingVerticalM,
    },
    previewField: { fontSize: tokens.fontSizeBase200 },
    previewLabel: { fontWeight: tokens.fontWeightSemibold, color: tokens.colorNeutralForeground2 },
    previewValue: { ...shorthands.margin(tokens.spacingVerticalXXS, "0", "0"), color: tokens.colorNeutralForeground2, whiteSpace: "pre-wrap" },
    previewEmpty: { color: tokens.colorNeutralForeground4, fontStyle: "italic" },

    empty: {
        ...shorthands.border("1px", "dashed", tokens.colorNeutralStroke2),
        ...shorthands.borderRadius(tokens.borderRadiusLarge),
        ...shorthands.padding(tokens.spacingVerticalXXL),
        textAlign: "center",
        color: tokens.colorNeutralForeground3,
        marginBottom: tokens.spacingVerticalXXL,
    },

    cmdBar: {
        flexShrink: 0,
        position: "sticky",
        bottom: "0",
        backgroundColor: tokens.colorNeutralBackground1,
        ...shorthands.borderTop("1px", "solid", tokens.colorNeutralStroke2),
        boxShadow: tokens.shadow8,
    },
    cmdBarInner: {
        maxWidth: "920px",
        marginLeft: "auto",
        marginRight: "auto",
        ...shorthands.padding(tokens.spacingVerticalM, tokens.spacingHorizontalXXL),
        display: "flex",
        alignItems: "center",
        justifyContent: "space-between",
        columnGap: tokens.spacingHorizontalL,
        flexWrap: "wrap",
        boxSizing: "border-box",
    },
    cmdStatus: { fontSize: tokens.fontSizeBase200, color: tokens.colorNeutralForeground3 },
    cmdButtons: { display: "flex", alignItems: "center", columnGap: tokens.spacingHorizontalS },
});
