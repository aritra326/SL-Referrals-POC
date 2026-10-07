#!/usr/bin/env python3
"""
Builds the next SL_Referrals unmanaged solution zip from an EXPORTED one, without a Dataverse connection.

It does what Build-SolutionZip.ps1 does (replace the web resource files and bump the version) and also applies the
form changes below, by editing customizations.xml as text so nothing else in the package is touched:

  1. Cover / Section main form: shows every column (it only had the name before).
  2. Cover / Section views (Active, Inactive, Advanced Find, Associated, Lookup, Quick Find): show Product, Cover Code,
     Parent, Display Order, validity dates and Status Reason, and Quick Find also searches Cover Code and External Code.
  3. Referral Item main form: Underwriter Rationale is now directly under Referral Details ("What needs approval").
     It used to sit in a row directly after a 4-row-high memo ("Requested Decision / Exception"), so the memo covered
     it and it never showed. Every tall memo now has the filler rows it needs.

Usage (from the repo root):
  python3 sl-referrals-app/build_solution_zip.py \
      --source solution-export/SL_Referrals_1_0_0_20.zip --version 1.0.0.21

Writes solution-export/SL_Referrals_1_0_0_21.zip. Only the UNMANAGED package can be built this way: a managed package
has to be exported from Dataverse (Solutions > SL Referrals > Export > Managed).
"""
import argparse
import re
import sys
import uuid
import zipfile
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
WEBRESOURCES = ROOT / "sl-referrals-app" / "webresources"
NAMESPACE = uuid.UUID("5e1d6c1a-0c8e-4b0e-9d52-5b6c3c1f7a10")  # fixed, so reruns give the same form ids

CLASS = {
    "text": "{4273EDBD-AC1D-40d3-9FB2-095C621B552D}",
    "memo": "{E0DECE4B-6FC8-4A8F-A065-082708572369}",
    "lookup": "{270BD3DB-D9AF-4782-9025-509E298DEC0A}",
    "datetime": "{5B773807-9FB2-42db-97C3-7A91EFF8ADFF}",
    "int": "{C6D124CA-7EDA-4A60-AEA9-7FB8D318B68F}",
    "bit": "{67FAC785-CD58-4F9F-ABB3-4B7DDC6ED5ED}",
    "status": "{5D68B988-0661-4db2-BC3E-17598AD3BE6C}",
}

COVER_FORM_ID = "{ff7d3d90-d424-4030-b2af-b301fcdb33e8}"
ITEM_FORM_ID = "{34d69ff4-7cd1-41bc-8d49-a7c2fd77b330}"
COVER_TAB_ID = "{9ff54295-831e-4c5c-95a4-7952ef879cb8}"  # the existing General tab, kept so the form keeps its identity


def gid(key):
    return "{" + str(uuid.uuid5(NAMESPACE, key)) + "}"


def cell(indent, key, label, field, kind, span=None, colspan=None):
    attrs = 'id="%s" showlabel="true" locklevel="0"' % gid(key)
    if span:
        attrs += ' rowspan="%d"' % span
    if colspan:
        attrs += ' colspan="%d"' % colspan
    pad = " " * indent
    return (
        f'{pad}<cell {attrs}>\n'
        f'{pad}  <labels>\n'
        f'{pad}    <label description="{label}" languagecode="1033" />\n'
        f'{pad}  </labels>\n'
        f'{pad}  <control id="{field}" classid="{CLASS[kind]}" datafieldname="{field}" disabled="false" />\n'
        f'{pad}</cell>\n'
    )


def row(indent, *cells):
    pad = " " * indent
    return f"{pad}<row>\n" + "".join(cells) + f"{pad}</row>\n"


def empty_rows(indent, count):
    return (" " * indent + "<row />\n") * count


def section(indent, key, name, label, rows_xml, columns):
    pad = " " * indent
    return (
        f'{pad}<section name="{name}" showlabel="true" showbar="true" locklevel="0" id="{gid(key)}" IsUserDefined="0" '
        f'layout="varwidth" columns="{columns}" labelwidth="115" celllabelalignment="Left" celllabelposition="Left">\n'
        f'{pad}  <labels>\n'
        f'{pad}    <label description="{label}" languagecode="1033" />\n'
        f'{pad}  </labels>\n'
        f'{pad}  <rows>\n'
        f'{rows_xml}'
        f'{pad}  </rows>\n'
        f'{pad}</section>\n'
    )


def cover_tabs_xml():
    c = 28  # indent of a <cell> inside a <row> inside a section
    r = 26
    s = 22
    identity = (
        row(r, cell(c, "cs-name", "Cover / Section Name", "slcrm_name", "text"),
            cell(c, "cs-code", "Cover Code", "slcrm_covercode", "text")) +
        row(r, cell(c, "cs-product", "Product", "slcrm_product", "lookup"),
            cell(c, "cs-external", "External Code", "slcrm_externalcode", "text")) +
        row(r, cell(c, "cs-parent", "Parent Cover / Section", "slcrm_parentcoversection", "lookup"),
            cell(c, "cs-leaf", "Is leaf", "slcrm_isleaf", "bit"))
    )
    display = (
        row(r, cell(c, "cs-order", "Display Order", "slcrm_displayorder", "int"),
            cell(c, "cs-status", "Status Reason", "statuscode", "status")) +
        row(r, cell(c, "cs-from", "Effective From", "slcrm_effectivefrom", "datetime"),
            cell(c, "cs-to", "Effective To", "slcrm_effectiveto", "datetime"))
    )
    description = (
        row(r, cell(c, "cs-description", "Description", "slcrm_description", "memo", span=4, colspan=2)) +
        empty_rows(r, 3)
    )
    sections = (
        section(s, "cs-sec-identity", "section_identity", "Cover / Section", identity, 2) +
        section(s, "cs-sec-display", "section_display", "Display and validity", display, 2) +
        section(s, "cs-sec-description", "section_description", "Description", description, 2)
    )
    return (
        "<tabs>\n"
        f'                <tab name="general_tab" verticallayout="true" id="{COVER_TAB_ID}" IsUserDefined="1" expanded="true" showlabel="true">\n'
        "                  <labels>\n"
        '                    <label description="General" languagecode="1033" />\n'
        "                  </labels>\n"
        "                  <columns>\n"
        '                    <column width="100%">\n'
        "                      <sections>\n"
        f"{sections}"
        "                      </sections>\n"
        "                    </column>\n"
        "                  </columns>\n"
        "                </tab>\n"
        "              </tabs>"
    )


def item_approval_rows():
    c, r = 32, 30
    return (
        row(r, cell(c, "ri-reason", "Referral Reason", "slcrm_referralreason", "lookup")) +
        row(r, cell(c, "ri-cover", "Cover / Section", "slcrm_coversection", "lookup")) +
        row(r, cell(c, "ri-summary", "Item Summary", "slcrm_itemsummary", "text")) +
        row(r, cell(c, "ri-decision", "Requested Decision / Exception", "slcrm_requesteddecisionexception", "memo", span=4)) +
        empty_rows(r, 3)
    )


def item_details_rows():
    """Referral Details, then Underwriter Rationale straight under it. Each 4-row-high memo needs 3 filler rows."""
    c, r = 32, 30
    return (
        row(r, cell(c, "ri-details", "Referral Details", "slcrm_referraldetails", "memo", span=4)) +
        empty_rows(r, 3) +
        row(r, cell(c, "ri-rationale", "Underwriter Rationale", "slcrm_underwriterrationale", "memo", span=4)) +
        empty_rows(r, 3)
    )


def form_span(text, form_id):
    start = text.index("<formid>" + form_id + "</formid>")
    begin = text.rindex("<systemform>", 0, start)
    end = text.index("</systemform>", start) + len("</systemform>")
    return begin, end


def edit_cover_form(text):
    begin, end = form_span(text, COVER_FORM_ID)
    form = text[begin:end]
    tabs_begin = form.index("<tabs>")
    tabs_end = form.index("</tabs>") + len("</tabs>")
    form = form[:tabs_begin] + cover_tabs_xml() + form[tabs_end:]
    return text[:begin] + form + text[end:]


def replace_section_rows(form, section_name, rows_xml):
    marker = form.index('name="%s"' % section_name)
    rows_begin = form.index("<rows>", marker) + len("<rows>\n")
    rows_end = form.rindex("</rows>", marker, form.index("</section>", marker))
    rows_end = form.rindex("\n", 0, rows_end) + 1  # back to the start of the closing tag's line
    return form[:rows_begin] + rows_xml + form[rows_end:]


def edit_item_form(text):
    begin, end = form_span(text, ITEM_FORM_ID)
    form = text[begin:end]
    form = replace_section_rows(form, "tab_2_section_2", item_approval_rows())
    form = replace_section_rows(form, "tab_2_section_3", item_details_rows())
    return text[:begin] + form + text[end:]


def cover_view_columns(querytype):
    """(column, width) pairs for a Cover / Section view; the small lookup and associated views stay compact."""
    if querytype in ("2", "64"):
        return [("slcrm_name", 220), ("slcrm_product", 150), ("slcrm_covercode", 100)]
    return [("slcrm_name", 220), ("slcrm_product", 150), ("slcrm_covercode", 100), ("slcrm_parentcoversection", 170),
            ("slcrm_displayorder", 90), ("slcrm_effectivefrom", 110), ("slcrm_effectiveto", 110),
            ("statuscode", 110), ("createdon", 125)]


def edit_cover_views(text):
    entity = re.search(r"<Name[^>]*>slcrm_CoverSection</Name>", text)
    begin = text.index("<SavedQueries>", entity.start())
    end = text.index("</SavedQueries>", begin)
    block = text[begin:end]

    def edit_query(match):
        query = match.group(0)
        if "<layoutxml>" not in query:
            return query  # the app-level "Covers / Sections" view has no columns of its own
        querytype = re.search(r"<querytype>(\d+)</querytype>", query).group(1)
        columns = cover_view_columns(querytype)

        cells = "".join('                  <cell name="%s" width="%d" />\n' % c for c in columns)
        query = re.sub(r'(<row name="[^"]+" id="slcrm_coversectionid">\n).*?(                </row>)',
                       lambda m: m.group(1) + cells + m.group(2), query, count=1, flags=re.S)

        wanted = [name for name, _ in columns] + (["slcrm_externalcode"] if querytype == "4" else [])
        missing = [n for n in wanted if '<attribute name="%s" />' % n not in query]
        add = "".join('                  <attribute name="%s" />\n' % n for n in missing)
        query = query.replace('                  <attribute name="slcrm_name" />\n',
                              '                  <attribute name="slcrm_name" />\n' + add, 1)

        if querytype == "4":  # quick find also searches the codes
            like = '                    <condition attribute="slcrm_name" operator="like" value="{0}" />\n'
            more = "".join('                    <condition attribute="%s" operator="like" value="{0}" />\n' % n
                           for n in ("slcrm_covercode", "slcrm_externalcode"))
            query = query.replace(like, like + more, 1)
        return query

    block = re.sub(r"<savedquery>.*?</savedquery>", edit_query, block, flags=re.S)
    return text[:begin] + block + text[end:]


def web_resource_files():
    names = [
        "slcrm_common.js", "slcrm_common.css", "slcrm_referraldecision.html", "slcrm_referraldecision.js",
        "slcrm_copyrationale.html", "slcrm_copyrationale.js", "slcrm_referralbuilder.html",
        "slcrm_referralbuilder.js", "slcrm_ReferralCommands.js", "slcrm_OpportunityCommands.js",
    ]
    return {name: (WEBRESOURCES / name).read_bytes() for name in names}


def main():
    parser = argparse.ArgumentParser()
    parser.add_argument("--source", required=True)
    parser.add_argument("--version", required=True)
    parser.add_argument("--output-folder", default=str(ROOT / "solution-export"))
    args = parser.parse_args()

    out = Path(args.output_folder) / ("SL_Referrals_%s.zip" % args.version.replace(".", "_"))
    with zipfile.ZipFile(args.source) as src:
        entries = [(info, src.read(info.filename)) for info in src.infolist()]

    contents = {info.filename: data for info, data in entries}
    bom = b"\xef\xbb\xbf"

    def text_of(name):
        raw = contents[name]
        return raw[3:].decode("utf-8") if raw.startswith(bom) else raw.decode("utf-8"), raw.startswith(bom)

    customizations, c_bom = text_of("customizations.xml")
    crlf = "\r\n" in customizations
    customizations = customizations.replace("\r\n", "\n")  # edit with plain \n, restore the file's line endings below
    solution, s_bom = text_of("solution.xml")

    for name, data in web_resource_files().items():
        at = customizations.index("<Name>%s</Name>" % name)
        block = customizations[at:customizations.index("</WebResource>", at)]
        stored = re.search(r"<FileName>/(WebResources/[^<]+)</FileName>", block).group(1)
        contents[stored] = data
        print("Replaced  " + name)

    customizations = edit_cover_form(customizations)
    customizations = edit_cover_views(customizations)
    customizations = edit_item_form(customizations)
    solution, n = re.subn(r"<Version>[^<]+</Version>", "<Version>%s</Version>" % args.version, solution, count=1)
    assert n == 1, "no <Version> in solution.xml"

    if crlf:
        customizations = customizations.replace("\n", "\r\n")
    contents["customizations.xml"] = (bom if c_bom else b"") + customizations.encode("utf-8")
    contents["solution.xml"] = (bom if s_bom else b"") + solution.encode("utf-8")

    out.parent.mkdir(parents=True, exist_ok=True)
    with zipfile.ZipFile(out, "w", zipfile.ZIP_DEFLATED) as dst:
        for info, _ in entries:
            dst.writestr(info.filename, contents[info.filename])
    print("Wrote %s (version %s)" % (out, args.version))


if __name__ == "__main__":
    sys.exit(main())
