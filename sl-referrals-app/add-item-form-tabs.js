const fs = require('fs');
const crypto = require('crypto');
const path = 'C:\\slx\\customizations.xml';
let xml = fs.readFileSync(path, 'utf8');

function guid() {
  const b = crypto.randomBytes(16);
  const h = b.toString('hex');
  return `${h.slice(0,8)}-${h.slice(8,12)}-${h.slice(12,16)}-${h.slice(16,20)}-${h.slice(20,32)}`;
}

const CLASSID = {
  generic: '4273EDBD-AC1D-40d3-9FB2-095C621B552D',
  memo: 'E0DECE4B-6FC8-4a8f-A065-082708572369',
  lookup: '270BD3DB-D9AF-4782-9025-509E298DEC0A',
};

function cell(label, field, kind) {
  const cid = guid();
  const classid = CLASSID[kind] || CLASSID.generic;
  return `                            <cell id="{${cid}}" showlabel="true" locklevel="0">
                              <labels>
                                <label description="${label}" languagecode="1033" />
                              </labels>
                              <control id="${field}" classid="{${classid}}" datafieldname="${field}" disabled="false" />
                            </cell>`;
}

function section(name, label, rows) {
  const sid = guid();
  const rowsXml = rows.map(r => `                          <row>\n${r}\n                          </row>`).join('\n');
  return `                        <section name="${name}" showlabel="true" showbar="true" locklevel="0" id="{${sid}}" IsUserDefined="0" layout="varwidth" columns="1" labelwidth="180" celllabelalignment="Left" celllabelposition="Left">
                          <labels>
                            <label description="${label}" languagecode="1033" />
                          </labels>
                          <rows>
${rowsXml}
                          </rows>
                        </section>`;
}

function tab(name, label, sections) {
  const tid = guid();
  return `                <tab name="${name}" id="{${tid}}" IsUserDefined="0" locklevel="0" showlabel="true" expanded="true">
                  <labels>
                    <label description="${label}" languagecode="1033" />
                  </labels>
                  <columns>
                    <column width="100%">
                      <sections>
${sections.join('\n')}
                      </sections>
                    </column>
                  </columns>
                </tab>`;
}

// --- Tab: Detail Fields (reason-specific) ---
const detailSections = [
  section('detail_duration', 'Duration', [
    cell('Proposed Duration', 'slcrm_proposedduration', 'generic'),
    cell('Max Duration', 'slcrm_maxduration', 'generic'),
  ]),
  section('detail_geography', 'Geography', [
    cell('Requested Geography', 'slcrm_requestedgeography', 'generic'),
    cell('Geography Exception', 'slcrm_geographyexception', 'memo'),
  ]),
  section('detail_limit', 'Limit', [
    cell('Requested Limit', 'slcrm_requestedlimit', 'generic'),
    cell('Current Authority Limit', 'slcrm_currentauthoritylimit', 'generic'),
  ]),
  section('detail_pricing', 'Pricing', [
    cell('Proposed Premium', 'slcrm_proposedpremium', 'generic'),
    cell('Technical Premium', 'slcrm_technicalpremium', 'generic'),
    cell('Pricing Deviation %', 'slcrm_pricingdeviation', 'generic'),
    cell('Pricing Rationale', 'slcrm_pricingrationale', 'memo'),
  ]),
  section('detail_reinsurance', 'Reinsurance', [
    cell('Reinsurance Type', 'slcrm_reinsurancetype', 'generic'),
    cell('Retention Amount', 'slcrm_retentionamount', 'generic'),
    cell('Placement Detail', 'slcrm_placementdetail', 'memo'),
  ]),
  section('detail_wording', 'Wording', [
    cell('Wording Title', 'slcrm_wordingtitle', 'generic'),
    cell('Current Wording', 'slcrm_currentwording', 'memo'),
    cell('Requested Wording', 'slcrm_requestedwording', 'memo'),
  ]),
];

// --- Tab: Revision & Lifecycle ---
const revisionSections = [
  section('revision_identity', 'Revision Identity', [
    cell('Logical Item ID', 'slcrm_logicalitemid', 'generic'),
    cell('Is Current Revision', 'slcrm_iscurrentrevision', 'generic'),
    cell('Revision Number', 'slcrm_revisionnumber', 'generic'),
    cell('Previous Referral Item', 'slcrm_previousreferralitem', 'lookup'),
    cell('Root Referral Item', 'slcrm_rootreferralitem', 'lookup'),
    cell('Superseded On', 'slcrm_supersededon', 'generic'),
  ]),
  section('revision_timeline', 'Timeline', [
    cell('Submitted By', 'slcrm_submittedby', 'lookup'),
    cell('Submitted On', 'slcrm_submittedon', 'generic'),
    cell('Sent On', 'slcrm_senton', 'generic'),
    cell('Review Started On', 'slcrm_reviewstartedon', 'generic'),
    cell('Responded On', 'slcrm_respondedon', 'generic'),
  ]),
  section('revision_information', 'Information Requests', [
    cell('Information Cycle Number', 'slcrm_informationcyclenumber', 'generic'),
    cell('Information Response', 'slcrm_informationresponse', 'memo'),
    cell('Change Summary', 'slcrm_changesummary', 'memo'),
  ]),
];

// --- Tab: Documents & Evidence ---
const documentsSections = [
  section('documents_evidence', 'Supporting Evidence', [
    cell('Supporting Document URL', 'slcrm_supportingdocumenturl', 'generic'),
    cell('Evidence Notes', 'slcrm_evidencenotes', 'memo'),
    cell('Requested Decision / Exception', 'slcrm_requesteddecisionexception', 'memo'),
  ]),
];

const newTabs = [
  tab('tab_detailfields', 'Detail Fields', detailSections),
  tab('tab_revisionlifecycle', 'Revision & Lifecycle', revisionSections),
  tab('tab_documentsevidence', 'Documents & Evidence', documentsSections),
].join('\n');

// Insert right before the specific </tabs> that closes the Referral Item main form (line ~17010,
// identified by the unique preceding "Authority" tab content just before it).
const headerMarker = '<header id="{f8611e22-d682-41bb-8ad9-d9b66f5f02a1}"';
const headerIdx = xml.indexOf(headerMarker);
if (headerIdx === -1) {
  console.error('HEADER MARKER NOT FOUND - aborting without changes.');
  process.exit(1);
}
// Find the </tabs> immediately preceding this header (walking back from headerIdx).
const tabsCloseTag = '</tabs>';
const tabsCloseIdx = xml.lastIndexOf(tabsCloseTag, headerIdx);
if (tabsCloseIdx === -1) {
  console.error('</tabs> NOT FOUND before header - aborting without changes.');
  process.exit(1);
}
const insertion = `${newTabs}\n              </tabs>`;
xml = xml.slice(0, tabsCloseIdx) + insertion + xml.slice(tabsCloseIdx + tabsCloseTag.length);

// Also rename tab_2 label "Referral Question" -> "Summary" (only the first, unique occurrence in this form's region).
const oldLabel = '<label description="Referral Question" languagecode="1033" />';
const newLabel = '<label description="Summary" languagecode="1033" />';
if (xml.includes(oldLabel)) {
  xml = xml.replace(oldLabel, newLabel);
  console.log('Renamed "Referral Question" tab to "Summary".');
} else {
  console.log('Tab label "Referral Question" not found (already renamed?).');
}

fs.writeFileSync(path, xml, 'utf8');
console.log('Done. 3 new tabs inserted into Referral Item main form.');
