export type ClientStatus = 'interesat' | 'va_folosi_codul' | 'cod_folosit';
export type PaymentStatus = 'incasati' | 'de_incasat';

export interface Profile {
  id: string;
  name: string;
  role: string;
  percentage: number;
  color: string;
  created_at: string;
}

export interface Collaborator {
  id: string;
  name: string;
  role: string;
  phone?: string;
  email?: string;
  percentage: number;
  color: string;
  created_at: string;
}

export interface ExpenseCategory {
  id: string;
  name: string;
  color: string;
  created_at: string;
}

export interface CompanySettings {
  company_name: string;
  fiscal_code: string;
  registration_number: string;
  address: string;
  phone: string;
  email: string;
  website: string;
  bank_name: string;
  iban: string;
  stamp_image: string;
  updated_at?: string;
}

export interface PricePreset {
  id: string;
  label: string;
  price: number;
  is_active: boolean;
  created_at: string;
  updated_at?: string;
}

export interface ClientExpenseCost {
  id: string;
  expense_id: string | null;
  expense_name: string;
  expense_color: string;
  cost: number;
  created_at: string;
}

export interface WhatsAppPredefinedMessage {
  id: string;
  title: string;
  body: string;
  created_by: string | null;
  created_by_name?: string | null;
  created_at: string;
  updated_at: string;
}

export interface ClientCollaboratorCost {
  id: string;
  collaborator_id: string | null;
  collaborator_name: string;
  collaborator_role?: string;
  collaborator_color: string;
  cost_type: 'fixed' | 'percentage';
  percentage: number;
  net_base: number;
  cost: number;
  payment_status: PaymentStatus;
  created_at: string;
}

export interface ClientActivityChange {
  field: string;
  label: string;
  from: string | number | null;
  to: string | number | null;
}

export interface ClientActivityLog {
  id: string;
  client_id: string;
  actor_user_id: string | null;
  actor_name: string | null;
  actor_username: string | null;
  actor_role: string | null;
  action: 'created' | 'updated' | 'scanned' | 'finalized' | 'deleted';
  summary: string;
  details: {
    changes?: ClientActivityChange[];
    [key: string]: unknown;
  };
  created_at: string;
}

export interface ClientParticipant {
  id: string;
  username: string;
  display_name: string;
  role: string;
  sources: string[];
  first_at: string;
}

export interface Client {
  id: string;
  name: string;
  phone: string;
  email: string | null;
  status: ClientStatus;
  qr_code: string;
  qr_used: boolean;
  qr_used_at: string | null;
  discount_percentage: number;
  price: number;
  predefined_price: number;
  advance_amount: number;
  final_price?: number;
  gross_total?: number;
  amount_due: number;
  currency_code: string;
  payment_status: PaymentStatus;
  manopera_colaboratori: number | null;
  valoare_piese: number | null;
  service_parts_price: number;
  service_labor_price: number;
  alte_cheltuieli: number | null;
  collaborator_costs: ClientCollaboratorCost[];
  expense_costs: ClientExpenseCost[];
  price_edit_count: number;
  is_finalized: boolean;
  finalization_source?: 'manual' | 'service' | null;
  notes: string | null;
  profile_id: string | null;
  owner_user_id?: string | null;
  created_at: string;
  updated_at?: string;
  participant_count?: number;
  profiles?: Profile | null;
  financials_hidden?: boolean;
  participants?: ClientParticipant[];
  activity_logs?: ClientActivityLog[];
}

export type ServiceVehicleType = 'trotineta' | 'scuter' | 'altul';
export type ServiceProductPhoto = 'da' | 'nu' | '';

export interface ServiceSheet {
  id: string;
  sheet_number: string;
  client_id: string | null;
  qr_code: string;
  client_name: string;
  client_phone: string;
  client_email: string | null;
  client_address: string | null;
  company_name: string;
  company_fiscal_code: string;
  company_registration_number: string;
  company_address: string | null;
  company_phone: string | null;
  company_email: string | null;
  show_company_details: boolean;
  financials_hidden?: boolean;
  vehicle_type: ServiceVehicleType;
  vehicle_brand_model: string;
  vehicle_registration: string;
  vehicle_series: string;
  vehicle_km: string;
  vehicle_battery: string;
  issue_description: string | null;
  visible_damage: string | null;
  accessories_charger: boolean;
  accessories_keys: boolean;
  accessories_saddle: boolean;
  accessories_other: boolean;
  accessories_other_text: string;
  quick_powers_on: boolean;
  quick_water_traces: boolean;
  quick_impact: boolean;
  quick_battery_risk: boolean;
  product_photo: ServiceProductPhoto;
  diagnostic: string | null;
  work_performed: string | null;
  parts_used: string | null;
  observations: string | null;
  diagnostic_price: number;
  parts_price: number;
  labor_price: number;
  internal_parts_cost: number | null;
  internal_labor_cost: number | null;
  internal_other_costs: number | null;
  expense_costs: ClientExpenseCost[];
  effective_internal_parts_cost: number;
  effective_internal_labor_cost: number;
  effective_internal_other_costs: number;
  internal_total_cost: number;
  gtrots_remaining: number;
  total_price: number;
  advance_amount: number;
  amount_due: number;
  currency_code: string;
  payment_status: PaymentStatus;
  client_package_price: number;
  client_discount: number;
  final_price: number;
  deadline: string;
  deadline_unit: string;
  warranty: string;
  storage_fee_per_day: number;
  storage_after_days: number;
  old_parts_client: boolean;
  old_parts_recycle: boolean;
  approve_diagnostic_test: boolean;
  approve_repair_estimate: boolean;
  reject_repair: boolean;
  vehicle_delivered_checked: boolean;
  client_signature: string | null;
  client_signed_at: string | null;
  is_finalized: boolean;
  finalized_at: string | null;
  technician_name: string;
  mechanic_name: string;
  service_type: string;
  service_date: string;
  created_by: string | null;
  updated_by: string | null;
  created_at: string;
  updated_at: string;
}

export interface ServiceSheetFormData {
  client_id?: string | null;
  qr_code: string;
  client_name: string;
  client_phone: string;
  client_email: string;
  client_address: string;
  vehicle_type: ServiceVehicleType;
  vehicle_brand_model: string;
  vehicle_registration: string;
  vehicle_series: string;
  vehicle_km: string;
  vehicle_battery: string;
  issue_description: string;
  visible_damage: string;
  accessories_charger: boolean;
  accessories_keys: boolean;
  accessories_saddle: boolean;
  accessories_other: boolean;
  accessories_other_text: string;
  quick_powers_on: boolean;
  quick_water_traces: boolean;
  quick_impact: boolean;
  quick_battery_risk: boolean;
  product_photo: ServiceProductPhoto;
  diagnostic: string;
  work_performed: string;
  parts_used: string;
  observations: string;
  diagnostic_price: string;
  parts_price: string;
  labor_price: string;
  internal_parts_cost: string;
  internal_labor_cost: string;
  internal_other_costs: string;
  expense_costs: ClientExpenseFormData[];
  total_price: string;
  advance_amount: string;
  currency_code: string;
  payment_status: PaymentStatus;
  client_discount: string;
  deadline: string;
  deadline_unit: string;
  warranty: string;
  storage_fee_per_day: string;
  storage_after_days: string;
  old_parts_client: boolean;
  old_parts_recycle: boolean;
  approve_diagnostic_test: boolean;
  approve_repair_estimate: boolean;
  reject_repair: boolean;
  vehicle_delivered_checked: boolean;
  client_signature: string;
  client_signed_at: string | null;
  finalized_at: string | null;
  technician_name: string;
  service_type: string;
}

export type UserRole = 'admin' | 'manager' | 'user';
export type PlatformAccess = 'desktop' | 'mobile' | 'both';

export interface AppUser {
  id: string;
  username: string;
  display_name: string;
  role: UserRole;
  platform_access: PlatformAccess;
  support_chat_access?: boolean;
  client_panel_access?: boolean;
  client_edit_access?: boolean;
  service_sheet_access?: boolean;
  client_financial_access?: boolean;
  is_active: boolean;
  created_at: string;
  updated_at?: string;
}

export interface LoginResponse {
  success: boolean;
  token: string;
  user: AppUser;
}

export interface ClientFormData {
  name: string;
  phone: string;
  email: string;
  status: ClientStatus;
  price: string;
  predefined_price: string;
  advance_amount: string;
  currency_code: string;
  payment_status: PaymentStatus;
  discount_percentage: string;
  manopera_colaboratori: string;
  collaborator_costs: ClientCollaboratorFormData[];
  valoare_piese: string;
  service_parts_price: string;
  service_labor_price: string;
  expense_costs: ClientExpenseFormData[];
  notes: string;
  profile_id: string;
  is_finalized?: boolean;
}

export interface ClientCollaboratorFormData {
  collaborator_id: string;
  cost_type: 'fixed' | 'percentage';
  percentage: string;
  cost: string;
  payment_status: PaymentStatus;
}

export interface ClientExpenseFormData {
  expense_id: string;
  cost: string;
}

export interface ServiceFormData {
  price: string;
  predefined_price: string;
  advance_amount: string;
  currency_code: string;
  payment_status: PaymentStatus;
  discount_percentage: string;
  notes: string;
}

export interface StatsData {
  totalClients: number;
  totalRevenue: number;
  onHoldClients?: number;
  onHoldRevenue?: number;
  totalExpenses?: number;
  netProfit?: number;
  statusCounts: Record<ClientStatus, number>;
  profileStats: ProfileStat[];
  collaboratorStats: CollaboratorStat[];
  period: string;
}

export interface ProfileStat {
  profile: Profile;
  clientCount: number;
  totalRevenue: number;
  profileEarnings: number;
  gtrotsEarnings: number;
}

export interface CollaboratorStat {
  collaborator: Collaborator;
  clientCount: number;
  totalCost: number;
  paidCost: number;
  onHoldCost: number;
  paidClientCount: number;
  onHoldClientCount: number;
  daily: CollaboratorDailyStat[];
}

export interface CollaboratorDailyStat {
  date: string;
  totalCost: number;
  paidCost: number;
  onHoldCost: number;
  clientCount: number;
}

export type ChatRole = 'mobile' | 'admin';

export interface ChatMessage {
  id: string;
  conversation_id: string;
  sender_role: ChatRole;
  sender_id: string;
  recipient_role: ChatRole;
  recipient_id: string;
  body: string;
  read_by_mobile: boolean;
  read_by_admin: boolean;
  created_at: string;
}

export interface ChatConversation {
  id: string;
  mobile_account: string;
  admin_account: string;
  assigned_agent_id?: string | null;
  assigned_at?: string | null;
  assigned_agent_name?: string | null;
  assigned_agent_username?: string | null;
  assigned_agent_role?: string | null;
  status: 'active' | 'left' | 'closed';
  left_at?: string | null;
  closed_at?: string | null;
  title: string;
  last_message_at: string | null;
  created_at: string;
  updated_at: string;
}

export interface ChatContact {
  id: string;
  mobile_id?: string;
  name: string;
  username?: string;
  role: string;
  conversation_id: string;
  last_message_at: string | null;
  unread_count: number;
  latest_message: ChatMessage | null;
  assigned_agent_id?: string | null;
  assigned_agent_name?: string | null;
  assigned_agent_username?: string | null;
  assigned_agent_role?: string | null;
  status?: 'active' | 'left' | 'closed';
  left_at?: string | null;
  closed_at?: string | null;
  can_reply?: boolean;
}

export interface ChatMessagesResponse {
  conversation: ChatConversation;
  messages: ChatMessage[];
}

export interface ChatUnreadResponse {
  unread_count: number;
  latest_message: ChatMessage | null;
}
