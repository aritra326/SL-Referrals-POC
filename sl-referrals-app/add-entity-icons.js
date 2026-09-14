const fs = require('fs');
const path = 'C:\\slx\\customizations.xml';
let xml = fs.readFileSync(path, 'utf8');

const iconMap = {
  'slcrm_ReferralRequest': 'slcrm_table_referralrequest',
  'slcrm_ReferralItem': 'slcrm_table_referralitem',
  'slcrm_ReferralDecision': 'slcrm_table_referraldecision',
  'slcrm_ReferralParticipant': 'slcrm_table_referralparticipant',
  'slcrm_ReferralNotification': 'slcrm_table_referralnotification',
  'slcrm_Policy': 'slcrm_table_policy',
  'slcrm_Rational': 'slcrm_table_rational',
  'slcrm_AuthorityLevel': 'slcrm_table_authoritylevel',
  'slcrm_UnderwriterAuthority': 'slcrm_table_underwriterauthority',
  'slcrm_ReferralReason': 'slcrm_table_referralreason',
  'slcrm_Country': 'slcrm_table_country',
  'slcrm_Product': 'slcrm_table_product',
};

let count = 0;
for (const [entityName, iconName] of Object.entries(iconMap)) {
  // Find the <entity Name="X" ...> opening tag, then the CanEnableSyncToExternalSearchIndex line within
  // that entity's EntityInfo block (bounded before the next <entity Name= or </EntityInfo>).
  const entityTagRe = new RegExp(`<entity Name="${entityName}"[^>]*>`, 'g');
  const m = entityTagRe.exec(xml);
  if (!m) { console.log(`NOT FOUND: <entity Name="${entityName}">`); continue; }
  const startIdx = m.index;
  const endEntityInfoIdx = xml.indexOf('</EntityInfo>', startIdx);
  const searchRegion = xml.slice(startIdx, endEntityInfoIdx);
  const anchor = '<CanEnableSyncToExternalSearchIndex>';
  const anchorIdxInRegion = searchRegion.indexOf(anchor);
  if (anchorIdxInRegion === -1) { console.log(`NO ANCHOR for ${entityName}`); continue; }
  const anchorLineEnd = searchRegion.indexOf('\n', anchorIdxInRegion) + 1;
  const absoluteInsertPos = startIdx + anchorLineEnd;
  // Skip if already has an IconVectorName in this entity's region (avoid double-insert on rerun).
  if (searchRegion.includes('<IconVectorName>')) { console.log(`ALREADY HAS ICON: ${entityName}`); continue; }
  const insertion = `          <IconVectorName>${iconName}</IconVectorName>\n`;
  xml = xml.slice(0, absoluteInsertPos) + insertion + xml.slice(absoluteInsertPos);
  count++;
  console.log(`Inserted icon for ${entityName} -> ${iconName}`);
}

fs.writeFileSync(path, xml, 'utf8');
console.log(`Done. ${count} entity icons inserted.`);
