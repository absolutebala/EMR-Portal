export type UserRole = string

export type Module = 'field_management' | 'sales'

export interface Profile {
  id: string
  first_name: string
  last_name: string
  employee_id: string
  email: string
  phone: string | null
  department: string | null
  role: UserRole
  is_active: boolean
  invite_pending: boolean
  must_change_password: boolean
  created_at: string
  last_login_at: string | null
  manager_id: string | null
}

export interface UserModuleAccess {
  id: string
  user_id: string
  module: Module
  created_at: string
}

export type CustomerType = 'sold' | 'shipped' | 'both'
export type WarrantyStatus = 'under_warranty' | 'expired' | 'amc'

export interface Customer {
  id: string
  name: string
  type: CustomerType
  contact_person: string
  designation: string | null
  phone: string
  email: string | null
  whatsapp_number: string | null
  sap_customer_code: string | null
  created_at: string
}

export interface CustomerContact {
  id: string
  customer_id: string
  name: string
  designation: string | null
  phone: string | null
  email: string | null
  whatsapp_number: string | null
  is_primary: boolean
  created_at: string
}

export interface CustomerSite {
  id: string
  customer_id: string
  site_name: string
  site_address: string
  created_at: string
}

export interface Transformer {
  id: string
  customer_id: string
  site_id: string | null
  serial_number: string
  rating: string | null
  manufacturer: string | null
  year_of_manufacture: string | null
  warranty_status: WarrantyStatus
  created_at: string
}

export interface AppSettings {
  id: string
  org_name: string
  logo_url: string | null
  theme_color: string
  timezone: string
  date_format: string
  admin_email: string
  whatsapp_api_key: string | null
  sms_gateway: string | null
  sms_api_key: string | null
  sms_sender_id: string | null
  updated_at: string
}

export type WorkOrderStatus = 'unassigned' | 'assigned' | 'in_progress' | 'pending' | 'completed' | 'needs_reassignment'

export interface WorkOrder {
  id: string
  wo_number: string
  job_type: JobType
  customer_id: string
  engineer_id: string | null
  scheduled_date: string | null
  status: WorkOrderStatus
  notes: string | null
  created_by: string | null
  created_at: string
  updated_at: string
  // joined
  customer_name?: string
  engineer_name?: string
  serial_numbers?: string[]
  transformer_ids?: string[]
  site_name?: string | null
  has_warranty?: boolean
}

export interface WorkOrderActivity {
  id: string
  work_order_id: string
  action: string
  actor_name: string | null
  created_at: string
}

export type FormStatus = 'draft' | 'active'
export type JobType = 'site_inspection' | 'amc' | 'commissioning_activities' | 'supervision'
export type FieldType = 'text' | 'long_text' | 'number' | 'date' | 'dropdown' | 'photo' | 'signature' | 'checkbox'
export type StatusType = 'yes_no' | 'tested_not_tested' | 'checkbox_only' | 'two_party' | 'two_party_exclusive' | 'observation' | 'measurement'

export interface Form {
  id: string
  name: string
  job_type: JobType
  status: FormStatus
  field_count: number
  created_at: string
  updated_at: string
}

export interface FormSection {
  id: string
  form_id: string
  title: string
  order_index: number
}

export interface FormField {
  id: string
  section_id: string
  label: string
  field_type: FieldType
  is_required: boolean
  prefill_from_job: boolean
  read_only_on_mobile: boolean
  placeholder: string | null
  help_text: string | null
  order_index: number
}

export interface FormTable {
  id: string
  section_id: string
  status_type: StatusType
  has_subrows: boolean
  col1_label: string | null
  col2_label: string | null
  order_index: number
}

export interface FormTableRow {
  id: string
  table_id: string
  parent_row_id: string | null
  row_label: string
  sno_label: string | null
  order_index: number
}
