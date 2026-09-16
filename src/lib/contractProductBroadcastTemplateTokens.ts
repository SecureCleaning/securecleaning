import {
  applyEmailMergeFields,
  BROADCAST_EMAIL_MERGE_FIELD_KEYS,
  BROADCAST_EMAIL_MERGE_FIELDS,
  findUnsupportedEmailMergeFields,
} from '@/lib/emailMergeFields'

export const CONTRACT_PRODUCT_BROADCAST_TEMPLATE_FIELDS = BROADCAST_EMAIL_MERGE_FIELDS

export type ContractProductBroadcastTemplateValues = Record<string, string>

function value(fields: ContractProductBroadcastTemplateValues, key: string) {
  return fields[key] ?? fields[`<<${key}>>`] ?? fields[`{{${key}}}`] ?? ''
}

export function applyContractProductBroadcastTemplateFields(
  template: string,
  fields: ContractProductBroadcastTemplateValues,
) {
  const name = value(fields, 'name') || value(fields, 'contact_name')
  const company = value(fields, 'company') || value(fields, 'business_name')
  const email = value(fields, 'email') || value(fields, 'cleaner_email')
  return applyEmailMergeFields(template, {
    first_name: value(fields, 'first_name'),
    last_name: value(fields, 'last_name'),
    name,
    contact_name: name,
    company,
    business_name: company,
    email,
    cleaner_email: email,
    phone: value(fields, 'phone'),
    address: value(fields, 'address'),
    city: value(fields, 'city'),
    suburb: value(fields, 'suburb'),
    postcode: value(fields, 'postcode'),
    state: value(fields, 'state'),
    abn: value(fields, 'abn'),
    services: value(fields, 'services'),
    product_count: value(fields, 'product_count'),
    product_codes: value(fields, 'product_codes'),
    jobs_link: value(fields, 'jobs_link'),
    sender_name: value(fields, 'sender_name'),
    sender_title: value(fields, 'sender_title'),
    sender_email: value(fields, 'sender_email'),
    sender_phone: value(fields, 'sender_phone'),
  })
}

export function findUnsupportedContractProductBroadcastTemplateFields(...values: string[]) {
  return findUnsupportedEmailMergeFields(BROADCAST_EMAIL_MERGE_FIELD_KEYS, ...values)
}
