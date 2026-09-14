const fs = require('fs');

function buildRibbon(entityLogical, prefix, buttons) {
  const customActions = buttons.map((b, i) => {
    const seq = (i + 1) * 10;
    return `        <CustomAction Id="${prefix}.${b.id}.customAction" Location="Mscrm.Form.${entityLogical}.MainTab.Actions.Controls._children" Sequence="${seq}">
          <CommandUIDefinition>
            <Button Id="${prefix}.${b.id}.button" Command="${prefix}.${b.id}.command" LabelText="${b.label}" ToolTipTitle="${b.label}" ToolTipDescription="${b.tooltip}" TemplateAlias="o1" Sequence="${seq}" />
          </CommandUIDefinition>
        </CustomAction>`;
  }).join('\n');

  const commandDefinitions = buttons.map((b) => {
    return `        <CommandDefinition Id="${prefix}.${b.id}.command">
          <EnableRules />
          <DisplayRules />
          <Actions>
            <JavaScriptFunction Library="$webresource:slcrm_ReferralCommands.js" FunctionName="SLCRM.ReferralCommands.${b.fn}">
              <CrmParameter Value="PrimaryControl" />
            </JavaScriptFunction>
          </Actions>
        </CommandDefinition>`;
  }).join('\n');

  const newBlock = `      <RibbonDiffXml>
        <CustomActions>
${customActions}
        </CustomActions>
        <Templates>
          <RibbonTemplates Id="Mscrm.Templates"></RibbonTemplates>
        </Templates>
        <CommandDefinitions>
${commandDefinitions}
        </CommandDefinitions>
        <RuleDefinitions>
          <TabDisplayRules />
          <DisplayRules />
          <EnableRules />
        </RuleDefinitions>
        <LocLabels />
      </RibbonDiffXml>`;

  return newBlock;
}

const itemButtons = [
  { id: 'startreview', label: 'Start Review', tooltip: 'Start reviewing this referral item', fn: 'startReview' },
  { id: 'requestinformation', label: 'Request Information', tooltip: 'Request more information from the underwriter', fn: 'requestInformation' },
  { id: 'resubmit', label: 'Resubmit', tooltip: 'Resubmit this item for review', fn: 'resubmitItem' },
  { id: 'onward', label: 'Onward for Approval', tooltip: 'Route onward to a higher authority', fn: 'onwardForApproval' },
  { id: 'authorise', label: 'Authorise', tooltip: 'Authorise this referral item', fn: 'authorise' },
  { id: 'authorisewithrecommendations', label: 'Authorise with Recommendations', tooltip: 'Authorise with advisory recommendations', fn: 'authoriseWithRecommendations' },
  { id: 'authorisewithconditions', label: 'Authorise with Conditions', tooltip: 'Authorise with binding conditions', fn: 'authoriseWithConditions' },
  { id: 'reject', label: 'Reject', tooltip: 'Reject this referral item', fn: 'reject' },
  { id: 'createrevision', label: 'Create Revision', tooltip: 'Create a new draft revision', fn: 'createRevision' },
  { id: 'cancelitem', label: 'Cancel Item', tooltip: 'Cancel this referral item', fn: 'cancelItem' },
];

const requestButtons = [
  { id: 'submit', label: 'Submit', tooltip: 'Save and submit all included draft items', fn: 'submitReferral' },
  { id: 'submitrevisions', label: 'Submit Revisions', tooltip: 'Save and submit the current revision draft items', fn: 'submitRevisions' },
  { id: 'completepartial', label: 'Complete Partial Outcome', tooltip: 'Accept a mixed authorised/rejected outcome', fn: 'completePartialOutcome' },
  { id: 'completerejected', label: 'Complete Rejected Outcome', tooltip: 'Accept an all-rejected outcome', fn: 'completeRejectedOutcome' },
  { id: 'cancel', label: 'Cancel Referral', tooltip: 'Cancel this referral', fn: 'cancelReferral' },
];

const itemRibbon = buildRibbon('slcrm_referralitem', 'slcrm.referralitem', itemButtons);
const requestRibbon = buildRibbon('slcrm_referralrequest', 'slcrm.referralrequest', requestButtons);

let xml = fs.readFileSync('C:\\slx\\customizations.xml', 'utf8');

function replaceRibbonAfterAnchor(text, uniqueAnchor, newRibbonBlock, label) {
  const anchorIdx = text.indexOf(uniqueAnchor);
  if (anchorIdx === -1) throw new Error(`Anchor not found for ${label}`);
  if (text.indexOf(uniqueAnchor, anchorIdx + 1) !== -1) throw new Error(`Anchor not unique for ${label}`);
  const ribbonStart = text.indexOf('<RibbonDiffXml>', anchorIdx);
  if (ribbonStart === -1) throw new Error(`No RibbonDiffXml after anchor for ${label}`);
  const ribbonEndTag = '</RibbonDiffXml>';
  const ribbonEnd = text.indexOf(ribbonEndTag, ribbonStart);
  if (ribbonEnd === -1) throw new Error(`No closing RibbonDiffXml for ${label}`);
  const gap = text.slice(ribbonStart, ribbonEnd);
  if (gap.length > 600) throw new Error(`RibbonDiffXml block for ${label} looks too large (${gap.length} chars) — likely wrong entity`);
  const before = text.slice(0, ribbonStart);
  const after = text.slice(ribbonEnd + ribbonEndTag.length);
  return before + newRibbonBlock + after;
}

xml = replaceRibbonAfterAnchor(xml, 'Referral Item Lookup View', itemRibbon, 'ReferralItem');
xml = replaceRibbonAfterAnchor(xml, 'Team Active Referrals', requestRibbon, 'ReferralRequest');

fs.writeFileSync('C:\\slx\\customizations.xml', xml, 'utf8');
console.log('Ribbon customizations written successfully.');
