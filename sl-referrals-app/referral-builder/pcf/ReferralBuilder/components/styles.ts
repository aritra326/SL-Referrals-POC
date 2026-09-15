import { makeStyles, shorthands, tokens } from "@fluentui/react-components";

/**
 * Layout only — colour, type and elevation come from Fluent tokens so the page
 * inherits the host app's theme (including dark mode) rather than hard-coding it.
 */
export const useStyles = makeStyles({
    /**
     * Layout for the app shell. This must live one level INSIDE the
     * FluentProvider, never on it.
     *
     * Fluent v9 renders popup surfaces (the Dropdown listbox, menus, tooltips)
     * into a portal wrapped in a second FluentProvider that inherits the root
     * provider's className. Anything layout- or paint-related on the provider
     * therefore also lands on an absolutely-positioned, z-index 1000000 portal:
     * `height: 100%` made that portal fill the viewport, and FluentProvider's
     * own background colour turned it into an opaque sheet over the whole form.
     * Opening any dropdown blanked the page, with no error logged anywhere.
     *
     * The provider gets its height from an inline style instead — inline styles
     * are not copied onto the portal the way className is.
     */
    root: {
        display: "flex",
        flexDirection: "column",
        height: "100%",
        minHeight: "0",
        backgroundColor: tokens.colorNeutralBackground2,
        overflowY: "auto",
    },
    scroll: { flexGrow: 1, minHeight: "0", overflowY: "auto" },
    shell: {
        maxWidth: "1180px",
        width: "100%",
        marginLeft: "auto",
        marginRight: "auto",
        ...shorthands.padding("0", tokens.spacingHorizontalXXL, tokens.spacingVerticalXXL),
        boxSizing: "border-box",
    },

    head: {
        display: "flex",
        alignItems: "flex-start",
        justifyContent: "space-between",
        columnGap: tokens.spacingHorizontalXXL,
        rowGap: tokens.spacingVerticalM,
        flexWrap: "wrap",
        ...shorthands.padding(tokens.spacingVerticalXXL, "0", tokens.spacingVerticalL),
        ...shorthands.borderBottom("1px", "solid", tokens.colorNeutralStroke2),
        marginBottom: tokens.spacingVerticalXXL,
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

    grid: {
        display: "grid",
        gridTemplateColumns: "minmax(0, 1fr) 320px",
        columnGap: tokens.spacingHorizontalXXL,
        rowGap: tokens.spacingVerticalXXL,
        alignItems: "start",
        "@media (max-width: 1024px)": { gridTemplateColumns: "minmax(0, 1fr)" },
    },

    card: {
        backgroundColor: tokens.colorNeutralBackground1,
        ...shorthands.border("1px", "solid", tokens.colorNeutralStroke2),
        ...shorthands.borderRadius(tokens.borderRadiusLarge),
        boxShadow: tokens.shadow2,
        marginBottom: tokens.spacingVerticalXL,
        ...shorthands.overflow("hidden"),
    },
    cardHead: {
        display: "flex",
        alignItems: "center",
        justifyContent: "space-between",
        columnGap: tokens.spacingHorizontalL,
        ...shorthands.padding(tokens.spacingVerticalL, tokens.spacingHorizontalXL),
        ...shorthands.borderBottom("1px", "solid", tokens.colorNeutralStroke2),
    },
    cardHeadLeft: { display: "flex", alignItems: "center", columnGap: tokens.spacingHorizontalM, minWidth: "0" },
    cardIcon: {
        display: "grid",
        placeItems: "center",
        width: "28px",
        height: "28px",
        flexShrink: 0,
        ...shorthands.borderRadius(tokens.borderRadiusMedium),
        backgroundColor: tokens.colorBrandBackground2,
        color: tokens.colorBrandForeground2,
    },
    cardTitle: {
        ...shorthands.margin("0"),
        fontSize: tokens.fontSizeBase500,
        lineHeight: tokens.lineHeightBase500,
        fontWeight: tokens.fontWeightSemibold,
    },
    cardDesc: {
        ...shorthands.margin("2px", "0", "0"),
        fontSize: tokens.fontSizeBase200,
        color: tokens.colorNeutralForeground3,
    },
    cardBody: { ...shorthands.padding(tokens.spacingVerticalXL) },

    row: {
        display: "grid",
        gridTemplateColumns: "1fr 1fr",
        columnGap: tokens.spacingHorizontalXL,
        rowGap: tokens.spacingVerticalL,
        "@media (max-width: 680px)": { gridTemplateColumns: "1fr" },
    },
    full: { gridColumnStart: "1", gridColumnEnd: "-1" },
    grow: { width: "100%" },

    readOnly: {
        display: "flex",
        alignItems: "center",
        minHeight: "32px",
        ...shorthands.padding("0", tokens.spacingHorizontalS),
        ...shorthands.borderRadius(tokens.borderRadiusMedium),
        backgroundColor: tokens.colorNeutralBackground3,
        color: tokens.colorNeutralForeground2,
        fontSize: tokens.fontSizeBase300,
        ...shorthands.overflow("hidden"),
        whiteSpace: "nowrap",
        textOverflow: "ellipsis",
    },
    readOnlyEmpty: { color: tokens.colorNeutralForeground4, fontStyle: "italic" },

    items: { display: "flex", flexDirection: "column", rowGap: tokens.spacingVerticalL },
    item: {
        ...shorthands.border("1px", "solid", tokens.colorNeutralStroke2),
        ...shorthands.borderRadius(tokens.borderRadiusLarge),
        backgroundColor: tokens.colorNeutralBackground1,
        ...shorthands.overflow("hidden"),
    },
    itemInvalid: { ...shorthands.borderColor(tokens.colorPaletteRedBorder1) },
    itemHead: {
        display: "flex",
        alignItems: "center",
        justifyContent: "space-between",
        columnGap: tokens.spacingHorizontalM,
        ...shorthands.padding(tokens.spacingVerticalS, tokens.spacingHorizontalL),
        backgroundColor: tokens.colorNeutralBackground3,
        ...shorthands.borderBottom("1px", "solid", tokens.colorNeutralStroke2),
    },
    itemHeadLeft: { display: "flex", alignItems: "center", columnGap: tokens.spacingHorizontalS, minWidth: "0" },
    itemNum: {
        display: "grid",
        placeItems: "center",
        width: "24px",
        height: "24px",
        flexShrink: 0,
        ...shorthands.borderRadius(tokens.borderRadiusMedium),
        backgroundColor: tokens.colorBrandBackground,
        color: tokens.colorNeutralForegroundOnBrand,
        fontSize: tokens.fontSizeBase200,
        fontWeight: tokens.fontWeightBold,
    },
    itemName: {
        fontSize: tokens.fontSizeBase300,
        fontWeight: tokens.fontWeightSemibold,
        whiteSpace: "nowrap",
        ...shorthands.overflow("hidden"),
        textOverflow: "ellipsis",
    },
    itemBody: { ...shorthands.padding(tokens.spacingVerticalL) },

    rail: { display: "flex", flexDirection: "column", rowGap: tokens.spacingVerticalL, position: "sticky", top: "0" },
    railCard: {
        backgroundColor: tokens.colorNeutralBackground1,
        ...shorthands.border("1px", "solid", tokens.colorNeutralStroke2),
        ...shorthands.borderRadius(tokens.borderRadiusLarge),
        boxShadow: tokens.shadow2,
        ...shorthands.padding(tokens.spacingVerticalL),
    },
    railTitle: {
        ...shorthands.margin("0", "0", tokens.spacingVerticalM),
        display: "flex",
        alignItems: "center",
        columnGap: tokens.spacingHorizontalS,
        fontSize: tokens.fontSizeBase300,
        fontWeight: tokens.fontWeightSemibold,
    },
    stat: {
        display: "flex",
        alignItems: "baseline",
        justifyContent: "space-between",
        columnGap: tokens.spacingHorizontalM,
        ...shorthands.padding(tokens.spacingVerticalSNudge, "0"),
        ...shorthands.borderBottom("1px", "solid", tokens.colorNeutralStroke3),
    },
    statKey: { fontSize: tokens.fontSizeBase200, color: tokens.colorNeutralForeground3 },
    statVal: { fontSize: tokens.fontSizeBase200, fontWeight: tokens.fontWeightSemibold, textAlign: "right" },
    checklist: { ...shorthands.margin(tokens.spacingVerticalM, "0", "0"), ...shorthands.padding("0"), listStyleType: "none", display: "flex", flexDirection: "column", rowGap: tokens.spacingVerticalS },
    check: { display: "flex", alignItems: "flex-start", columnGap: tokens.spacingHorizontalS, fontSize: tokens.fontSizeBase200 },
    checkOk: { color: tokens.colorNeutralForeground2 },
    checkTodo: { color: tokens.colorNeutralForeground4 },

    infoCard: {
        backgroundColor: tokens.colorBrandBackground2,
        ...shorthands.border("1px", "solid", tokens.colorBrandStroke2),
        ...shorthands.borderRadius(tokens.borderRadiusLarge),
        ...shorthands.padding(tokens.spacingVerticalL),
        color: tokens.colorBrandForeground2,
    },
    infoText: { ...shorthands.margin("0"), fontSize: tokens.fontSizeBase200, lineHeight: tokens.lineHeightBase300 },

    cmdBar: {
        flexShrink: 0,
        position: "sticky",
        bottom: "0",
        backgroundColor: tokens.colorNeutralBackground1,
        ...shorthands.borderTop("1px", "solid", tokens.colorNeutralStroke2),
        boxShadow: tokens.shadow8,
        zIndex: 10,
    },
    cmdBarInner: {
        maxWidth: "1180px",
        marginLeft: "auto",
        marginRight: "auto",
        ...shorthands.padding(tokens.spacingVerticalM, tokens.spacingHorizontalXXL),
        display: "flex",
        alignItems: "center",
        justifyContent: "space-between",
        columnGap: tokens.spacingHorizontalL,
        rowGap: tokens.spacingVerticalS,
        flexWrap: "wrap",
        boxSizing: "border-box",
    },
    cmdStatus: {
        display: "flex",
        alignItems: "center",
        columnGap: tokens.spacingHorizontalS,
        fontSize: tokens.fontSizeBase200,
        color: tokens.colorNeutralForeground3,
    },
    cmdButtons: { display: "flex", alignItems: "center", columnGap: tokens.spacingHorizontalS },

    banner: { marginBottom: tokens.spacingVerticalXL },
    centre: { display: "grid", placeItems: "center", height: "100%", rowGap: tokens.spacingVerticalM },
    errList: { ...shorthands.margin(tokens.spacingVerticalXS, "0", "0"), paddingLeft: "18px" },
});
