export type UserRole = 'sales' | 'design' | 'costing' | 'admin';

export type RequestStatus = 
  | 'draft'
  | 'submitted'
  | 'edited'
  | 'design_result'
  | 'under_review'
  | 'clarification_needed'
  | 'feasibility_confirmed'
  | 'in_costing'
  | 'costing_complete'
  | 'sales_followup'
  | 'gm_approval_pending'
  | 'gm_approved'
  | 'gm_rejected'
  | 'cancelled'
  | 'closed';

export type BrakeType = 'drum' | 'disk' | 'na' | 'As Per ROC Standard';

export type StudsPcdMode = 'standard' | 'special';

export type AxleLocation = 'front' | 'rear' | 'other';
export type ArticulationType = 'straight_axle' | 'steering_axle' | 'other';
export type ConfigurationType = 'tandem' | 'tridem' | 'boggie' | 'other';

export interface User {
  id: string;
  email: string;
  name: string;
  role: UserRole;
  createdAt: Date;
}

export interface Attachment {
  id: string;
  type: 'rim_drawing' | 'picture' | 'spec' | 'other';
  filename: string;
  url: string;
  uploadedAt: Date;
  uploadedBy: string;
}

export interface RequestProduct {
  // Technical Information - Product Type (3 sub-fields)
  axleLocation: AxleLocation | string;
  axleLocationOther?: string;
  articulationType: ArticulationType | string;
  articulationTypeOther?: string;
  configurationType: ConfigurationType | string;
  configurationTypeOther?: string;

  quantity?: number | null;
  loadsKg: number | string | null;
  speedsKmh: number | string | null;
  tyreSize: string;
  trackMm: number | string | null;

  // Studs/PCD
  studsPcdMode: StudsPcdMode;
  studsPcdStandardSelections: string[];
  studsPcdSpecialText: string;

  // Other Technical
  wheelBase: string;
  finish: string;
  brakeType: BrakeType | null;
  brakeSize: string;
  brakePowerType?: string;
  brakeCertificate?: string;
  mainBodySectionType?: string;
  clientSealingRequest?: string;
  cupLogo?: string;
  suspension: string;

  // Product-specific comments
  productComments: string;

  // Attachments
  attachments: Attachment[];
}

export interface StatusHistoryEntry {
  id: string;
  status: RequestStatus;
  timestamp: Date;
  userId: string;
  userName: string;
  comment?: string;
}

export interface SalesPaymentTerm {
  paymentNumber: number;
  paymentName: string;
  paymentPercent: number | null;
  comments: string;
}

export interface CustomerRequest {
  id: string;
  // General Information
  clientName: string;
  clientContact: string;
  applicationVehicle: string;
  applicationVehicleOther?: string;
  country: string;
  countryOther?: string;
  city?: string;
  expectedQty: number | null;
  repeatability: string;
  expectedDeliverySelections: string[];
  clientExpectedDeliveryDate?: string;

  // Client Application
  workingCondition: string;
  workingConditionOther?: string;
  usageType: string;
  usageTypeOther?: string;
  environment: string;
  environmentOther?: string;

  // Product-specific data
  products?: RequestProduct[];

  // Legacy single-product fields (kept for backward compatibility)
  axleLocation?: AxleLocation | string;
  axleLocationOther?: string;
  articulationType?: ArticulationType | string;
  articulationTypeOther?: string;
  configurationType?: ConfigurationType | string;
  configurationTypeOther?: string;
  loadsKg?: number | string | null;
  speedsKmh?: number | string | null;
  tyreSize?: string;
  trackMm?: number | string | null;
  studsPcdMode?: StudsPcdMode;
  studsPcdStandardSelections?: string[];
  studsPcdSpecialText?: string;
  wheelBase?: string;
  finish?: string;
  brakeType?: BrakeType | null;
  brakeSize?: string;
  brakePowerType?: string;
  brakeCertificate?: string;
  mainBodySectionType?: string;
  clientSealingRequest?: string;
  cupLogo?: string;
  suspension?: string;
  otherRequirements?: string;
  attachments?: Attachment[];
  
  // Workflow
  status: RequestStatus;
  history: StatusHistoryEntry[];
  
  // Metadata
  createdBy: string;
  createdByName: string;
  createdAt: Date;
  updatedAt: Date;
  
  // Design Review
  designNotes?: string;
  acceptanceMessage?: string;
  expectedDesignReplyDate?: Date;
  designResultComments?: string;
  designResultAttachments?: Attachment[];
  
  // Clarification
  clarificationComment?: string;
  clarificationResponse?: string;
  
  // Costing
  costingNotes?: string;
  sellingPrice?: number;
  sellingCurrency?: 'USD' | 'EUR' | 'RMB';
  calculatedMargin?: number;
  incoterm?: string;
  incotermOther?: string;
  vatMode?: 'with' | 'without';
  vatRate?: number | null;
  deliveryLeadtime?: string;
  costingAttachments?: Attachment[];

  // Sales Follow-up
  salesFinalPrice?: number | null;
  salesCurrency?: 'USD' | 'EUR' | 'RMB';
  salesIncoterm?: string;
  salesIncotermOther?: string;
  salesVatMode?: 'with' | 'without';
  salesVatRate?: number | null;
  salesMargin?: number | null;
  salesWarrantyPeriod?: string;
  salesOfferValidityPeriod?: string;
  salesExpectedDeliveryDate?: string;
  salesPaymentTermCount?: number;
  salesPaymentTerms?: SalesPaymentTerm[];
  salesFeedbackComment?: string;
  salesAttachments?: Attachment[];
}

export interface ReferenceProduct {
  id: string;
  configurationType: string;
  articulationType: string;
  brakeType: string;
  brakeSize: string;
  studsPcdStandards: string[];
  createdAt: Date;
  updatedAt: Date;
}

export type FormMode = 'create' | 'draft_edit' | 'clarification_edit' | 'read_only';

interface StandardStudsPcdOption {
  id: string;
  label: string;
  description: string;
}

export const STANDARD_STUDS_PCD_OPTIONS: StandardStudsPcdOption[] = [
  { id: 'STD_4_M10_84_115', label: '4 × M10×1.25 — PCD 84/115', description: '4 studs M10x1.25' },
  { id: 'STD_4_M14_85_130', label: '4 × M14×1.5 — PCD 85/130', description: '4 studs M14x1.5' },
  { id: 'STD_5_M16_94_140', label: '5 × M16×1.5 — PCD 94/140', description: '5 studs M16x1.5' },
  { id: 'STD_6_M16_94_124', label: '6 × M16×1.5 — PCD 94/124', description: '6 studs M16x1.5' },
  { id: 'STD_6_M18_160_205', label: '6 × M18×1.5 — PCD 160/205', description: '6 studs M18x1.5' },
  { id: 'STD_8_M18_220_275', label: '8 × M18×1.5 — PCD 220/275', description: '8 studs M18x1.5' },
  { id: 'STD_10_M22_280_330', label: '10 × M22×1.5 — PCD 280/330', description: '10 studs M22x1.5' },
  { id: 'STD_ROC_STANDARD', label: 'As Per ROC Standard', description: 'As Per ROC Standard' },
];

export const AXLE_LOCATIONS: { value: AxleLocation; label: string }[] = [
  { value: 'front', label: 'Front' },
  { value: 'rear', label: 'Rear' },
  { value: 'other', label: 'Other' },
];

export const ARTICULATION_TYPES: { value: ArticulationType; label: string }[] = [
  { value: 'straight_axle', label: 'Straight Axle' },
  { value: 'steering_axle', label: 'Steering Axle' },
  { value: 'other', label: 'Other' },
];

export const CONFIGURATION_TYPES: { value: ConfigurationType; label: string }[] = [
  { value: 'tandem', label: 'Tandem' },
  { value: 'tridem', label: 'Tridem' },
  { value: 'boggie', label: 'Boggie' },
  { value: 'other', label: 'Other' },
];

const BRAKE_SIZES = ['180x32', '250x50', '300x60', '400x80'];

export const STATUS_CONFIG: Record<RequestStatus, { label: string; color: string; bgColor: string }> = {
  draft: { label: 'Draft', color: 'text-muted-foreground', bgColor: 'bg-muted' },
  submitted: { label: 'Submitted', color: 'text-info', bgColor: 'bg-info/10' },
  edited: { label: 'Edited', color: 'text-primary', bgColor: 'bg-primary/10' },
  design_result: { label: 'Design Result', color: 'text-primary', bgColor: 'bg-primary/10' },
  under_review: { label: 'Under Review', color: 'text-warning', bgColor: 'bg-warning/10' },
  clarification_needed: { label: 'Clarification Needed', color: 'text-destructive', bgColor: 'bg-destructive/10' },
  feasibility_confirmed: { label: 'Feasibility Confirmed', color: 'text-success', bgColor: 'bg-success/10' },
  in_costing: { label: 'In Costing', color: 'text-info', bgColor: 'bg-info/10' },
  costing_complete: { label: 'Costing Complete', color: 'text-success', bgColor: 'bg-success/10' },
  sales_followup: { label: 'Sales Follow-up', color: 'text-info', bgColor: 'bg-info/10' },
  gm_approval_pending: { label: 'GM Approval Pending', color: 'text-warning', bgColor: 'bg-warning/10' },
  gm_approved: { label: 'Approved', color: 'text-success', bgColor: 'bg-success/10' },
  gm_rejected: { label: 'Rejected by GM', color: 'text-destructive', bgColor: 'bg-destructive/10' },
  cancelled: { label: 'Cancelled', color: 'text-destructive', bgColor: 'bg-destructive/10' },
  closed: { label: 'Closed', color: 'text-muted-foreground', bgColor: 'bg-muted' },
};

export const ROLE_CONFIG: Record<UserRole, { label: string; color: string }> = {
  sales: { label: 'Sales', color: 'bg-info text-info-foreground' },
  design: { label: 'Design', color: 'bg-warning text-warning-foreground' },
  costing: { label: 'Costing', color: 'bg-success text-success-foreground' },
  admin: { label: 'Admin', color: 'bg-primary text-primary-foreground' },
};
