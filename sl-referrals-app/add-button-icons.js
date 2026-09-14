const fs = require('fs');
const path = 'C:\\slx\\customizations.xml';
let xml = fs.readFileSync(path, 'utf8');

const buttonIcons = {
  'slcrm.referralrequest.completepartial.button': 'slcrm_icon_completepartial',
  'slcrm.referralrequest.completerejected.button': 'slcrm_icon_completerejected',
  'slcrm.referralrequest.cancel.button': 'slcrm_icon_cancel',
  'slcrm.referralitem.startreview.button': 'slcrm_icon_startreview',
  'slcrm.referralitem.requestinformation.button': 'slcrm_icon_requestinformation',
  'slcrm.referralitem.resubmit.button': 'slcrm_icon_resubmit',
  'slcrm.referralitem.onward.button': 'slcrm_icon_onward',
  'slcrm.referralitem.authorise.button': 'slcrm_icon_authorise',
  'slcrm.referralitem.authorisewithrecommendations.button': 'slcrm_icon_authorisewithrecommendations',
  'slcrm.referralitem.authorisewithconditions.button': 'slcrm_icon_authorisewithconditions',
  'slcrm.referralitem.reject.button': 'slcrm_icon_reject',
  'slcrm.referralitem.createrevision.button': 'slcrm_icon_createrevision',
  'slcrm.referralitem.cancelitem.button': 'slcrm_icon_cancelitem',
};

let count = 0;
for (const [buttonId, iconName] of Object.entries(buttonIcons)) {
  // Match: <Button Id="X" ... TemplateAlias="o1" Sequence="N" />
  const re = new RegExp(`(<Button Id="${buttonId.replace(/\./g, '\\.')}"[^>]*?)( />)`, 'g');
  const before = xml;
  xml = xml.replace(re, (m, p1, p2) => {
    count++;
    return `${p1} Image16by16="$webresource:${iconName}" Image32by32="$webresource:${iconName}"${p2}`;
  });
  if (xml === before) console.log(`NOT FOUND / NOT REPLACED: ${buttonId}`);
}

fs.writeFileSync(path, xml, 'utf8');
console.log(`Done. ${count} button icons wired.`);
